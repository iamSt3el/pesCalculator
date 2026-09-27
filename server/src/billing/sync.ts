import {
  applyRazorpaySubscription, recordCharge, type SubscriptionRow,
} from '../repo/subscriptions.ts';
import type { RazorpayClient } from './razorpay.ts';

/**
 * Asks Razorpay for the subscription and stores the answer. Every route that
 * learns something changed — the checkout callback, a webhook, the lazy
 * refresh — goes through here, so none of them trusts a payload's copy and
 * the order events arrive in stops mattering.
 */
export async function syncSubscription(client: RazorpayClient, razorpayId: string): Promise<SubscriptionRow | null> {
  return applyRazorpaySubscription(await client.fetchSubscription(razorpayId));
}

/** Records a charge only once the money is captured. */
export async function recordPayment(client: RazorpayClient, paymentId: string, subscriptionRowId: number): Promise<void> {
  const payment = await client.fetchPayment(paymentId);
  if (payment.status !== 'captured') return;
  await recordCharge({
    paymentId: payment.id,
    subscriptionId: subscriptionRowId,
    amountPaise: payment.amount,
    paidAt: new Date(payment.created_at * 1000),
    invoiceId: payment.invoice_id ?? null,
  });
}

/**
 * A subscription whose state is still settling, or whose paid cycle has run
 * out without our hearing of the renewal. The free Render instance sleeps at
 * night and misses webhooks, so this is how a payment made then lands.
 */
export function needsRefresh(s: SubscriptionRow, now: Date): boolean {
  if (s.status === 'created' || s.status === 'authenticated' || s.status === 'pending') return true;
  return s.status === 'active' && s.currentEnd !== null && s.currentEnd < now;
}

const REFRESH_EVERY_MS = 60_000;
const lastRefresh = new Map<string, number>();

/** Never throws: an unreachable Razorpay leaves the stored state as it was. */
export async function refreshStale(client: RazorpayClient, subs: SubscriptionRow[], now = new Date()): Promise<void> {
  for (const s of subs) {
    if (!needsRefresh(s, now)) continue;
    const last = lastRefresh.get(s.razorpayId);
    if (last !== undefined && now.getTime() - last < REFRESH_EVERY_MS) continue;
    lastRefresh.set(s.razorpayId, now.getTime());
    try {
      await syncSubscription(client, s.razorpayId);
    } catch (err) {
      console.error(`Could not refresh ${s.razorpayId}: ${(err as Error).message}`);
    }
  }
}

/** Tests only: forget the throttle so each test starts fresh. */
export function forgetRefreshes(): void { lastRefresh.clear(); }
