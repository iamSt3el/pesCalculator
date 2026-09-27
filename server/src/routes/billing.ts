import { Router, type Response } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db.ts';
import { requireAuth } from '../auth/middleware.ts';
import { entitlementFor } from '../billing/access.ts';
import { PERIODS, TOTAL_COUNT, type Period } from '../billing/config.ts';
import { indiaDate, type Entitlement } from '../billing/entitlement.ts';
import { verifyCheckoutSignature } from '../billing/signature.ts';
import { getBilling, type Billing } from '../billing/state.ts';
import { recordPayment, refreshStale, syncSubscription } from '../billing/sync.ts';
import { liveGrantOf } from '../repo/grants.ts';
import {
  applyRazorpaySubscription, chargesOf, CLOSED_STATUSES, insertSubscription, markCancelAtCycleEnd,
  subscriptionByRazorpayId, subscriptionsOf,
} from '../repo/subscriptions.ts';

export interface BillingView {
  configured: boolean;
  keyId: string | null;
  entitlement: Entitlement;
  subscription: { period: Period; status: string; currentEnd: string | null; cancelAtCycleEnd: boolean } | null;
  grant: { until: string } | null;
  charges: Array<{ paymentId: string; amountPaise: number; paidAt: string; period: Period }>;
}

/** An open subscription in one of these makes a second one a double charge. */
const BLOCKING = new Set(['active', 'pending', 'authenticated']);

export const billingRouter: Router = Router();

function need(res: Response): Billing | null {
  const billing = getBilling();
  if (!billing) res.status(503).json({ error: 'Billing is not available yet' });
  return billing;
}

/** What the account screen, the banners and the checkout page all read. */
export async function viewFor(userId: number): Promise<BillingView | null> {
  const billing = getBilling();
  if (billing) await refreshStale(billing.client, await subscriptionsOf(userId));
  const entitlement = await entitlementFor(userId);
  if (!entitlement) return null;

  // An abandoned checkout is not the account's subscription.
  const current = (await subscriptionsOf(userId)).find((s) => s.status !== 'created') ?? null;
  const grant = await liveGrantOf(userId, indiaDate(new Date()));
  return {
    configured: billing !== null,
    keyId: billing?.config.keyId ?? null,
    entitlement,
    subscription: current && {
      period: current.period,
      status: current.status,
      currentEnd: current.currentEnd?.toISOString() ?? null,
      cancelAtCycleEnd: current.cancelAtCycleEnd,
    },
    // The note is the administrator's own record, not the account holder's.
    grant: grant && { until: grant.until },
    charges: (await chargesOf(userId)).map((c) => ({
      paymentId: c.paymentId, amountPaise: c.amountPaise, paidAt: c.paidAt.toISOString(), period: c.period,
    })),
  };
}

const PLAN_CACHE_MS = 60 * 60_000;
let planCache: { at: number; plans: Array<{ period: Period; amountPaise: number; currency: string }> } | null = null;

/** Tests only. */
export function forgetPlanCache(): void { planCache = null; }

/**
 * Prices live on the Razorpay plans, so changing one needs no deploy. Public,
 * and so mounted before the session check: the landing page shows them to
 * visitors, and Razorpay's review wants pricing visible without an account.
 */
billingRouter.get('/plans', async (_req, res) => {
  const billing = need(res);
  if (!billing) return;
  if (!planCache || Date.now() - planCache.at > PLAN_CACHE_MS) {
    const plans = await Promise.all(PERIODS.map(async (period) => {
      const plan = await billing.client.fetchPlan(billing.config.plans[period]);
      return { period, amountPaise: plan.item.amount, currency: plan.item.currency };
    }));
    planCache = { at: Date.now(), plans };
  }
  res.json(planCache.plans);
});

// Everything below is the signed-in account's own billing.
billingRouter.use(requireAuth);

billingRouter.get('/', async (req, res) => {
  const view = await viewFor(req.session.user!.id);
  if (!view) { res.status(401).json({ error: 'Not signed in' }); return; }
  res.json(view);
});

billingRouter.post('/subscriptions', async (req, res) => {
  const billing = need(res);
  if (!billing) return;
  const parsed = z.object({ period: z.enum(['monthly', 'half_yearly', 'yearly']) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Choose monthly, 6 months or yearly' }); return; }
  const { period } = parsed.data;
  const user = req.session.user!;

  // Serialised on the account's row, so a double click cannot make two mandates.
  const outcome = await withTransaction(async (client) => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    const open = (await subscriptionsOf(user.id, client)).filter((s) => !CLOSED_STATUSES.includes(s.status));
    if (open.some((s) => BLOCKING.has(s.status))) return { conflict: true as const };

    const reusable = open.find((s) => s.status === 'created' && s.period === period);
    for (const stale of open) {
      if (stale === reusable) continue;
      await applyRazorpaySubscription(await billing.client.cancelSubscription(stale.razorpayId, false), client);
    }
    if (reusable) return { subscriptionId: reusable.razorpayId };

    const made = await billing.client.createSubscription({
      planId: billing.config.plans[period],
      totalCount: TOTAL_COUNT[period],
      notes: { user_id: String(user.id) },
    });
    await insertSubscription(client, { userId: user.id, razorpayId: made.id, period, status: made.status });
    return { subscriptionId: made.id };
  });

  if ('conflict' in outcome) {
    res.status(409).json({ error: 'This account already has a subscription', code: 'subscribed' });
    return;
  }
  res.status(201).json({ subscriptionId: outcome.subscriptionId, keyId: billing.config.keyId, email: user.email });
});

const checkoutResult = z.object({
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_subscription_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});

billingRouter.post('/subscriptions/verify', async (req, res) => {
  const billing = need(res);
  if (!billing) return;
  const parsed = checkoutResult.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'The payment could not be verified' }); return; }
  const { razorpay_payment_id: paymentId, razorpay_subscription_id: subscriptionId, razorpay_signature: signature } = parsed.data;

  if (!verifyCheckoutSignature(paymentId, subscriptionId, signature, billing.config.keySecret)) {
    res.status(400).json({ error: 'The payment could not be verified' });
    return;
  }
  const userId = req.session.user!.id;
  const row = await subscriptionByRazorpayId(subscriptionId);
  if (!row || row.userId !== userId) { res.status(404).json({ error: 'No such subscription' }); return; }

  // Razorpay unreachable is not the payer's problem: the webhook or the lazy
  // refresh will land it, and the page shows Confirming meanwhile.
  try {
    await syncSubscription(billing.client, subscriptionId);
    await recordPayment(billing.client, paymentId, row.id);
  } catch (err) {
    console.error(`Could not confirm ${subscriptionId} with Razorpay: ${(err as Error).message}`);
  }
  res.json(await viewFor(userId));
});

billingRouter.post('/subscription/cancel', async (req, res) => {
  const billing = need(res);
  if (!billing) return;
  const userId = req.session.user!.id;
  const target = (await subscriptionsOf(userId)).find((s) => BLOCKING.has(s.status));
  if (!target) { res.status(404).json({ error: 'There is no subscription to cancel' }); return; }

  await applyRazorpaySubscription(await billing.client.cancelSubscription(target.razorpayId, true));
  await markCancelAtCycleEnd(target.id);
  res.json(await viewFor(userId));
});
