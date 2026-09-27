import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { verifyWebhookSignature } from '../billing/signature.ts';
import { getBilling } from '../billing/state.ts';
import { syncSubscription } from '../billing/sync.ts';
import type { RzPayment } from '../billing/razorpay.ts';
import { eventSeen, recordCharge, recordEvent, subscriptionByRazorpayId } from '../repo/subscriptions.ts';

interface WebhookEvent {
  event?: string;
  payload?: {
    subscription?: { entity?: { id?: string } };
    payment?: { entity?: RzPayment };
  };
}

/**
 * Razorpay's notification that a subscription changed. Unauthenticated — the
 * signature is the authentication — and fed the raw body, because the
 * signature is over the exact bytes sent.
 *
 * The event is only a prompt: the subscription is re-fetched from Razorpay, so
 * a stale or out-of-order payload cannot put an old status back. The event is
 * recorded only after it has been applied, so a failure answers 500, Razorpay
 * retries, and the retry is not mistaken for a duplicate. Applying is
 * idempotent, so a duplicate that slips through does no harm either.
 */
export async function razorpayWebhook(req: Request, res: Response): Promise<void> {
  const billing = getBilling();
  if (!billing) { res.status(503).json({ error: 'Billing is not available yet' }); return; }

  const raw = req.body as unknown;
  if (!Buffer.isBuffer(raw)) { res.status(400).json({ error: 'Expected a JSON body' }); return; }
  if (!verifyWebhookSignature(raw, req.get('x-razorpay-signature') ?? '', billing.config.webhookSecret)) {
    res.status(401).json({ error: 'Bad signature' });
    return;
  }

  let event: WebhookEvent;
  try { event = JSON.parse(raw.toString('utf8')) as WebhookEvent; } catch {
    res.status(400).json({ error: 'Expected a JSON body' });
    return;
  }

  const eventId = req.get('x-razorpay-event-id') ?? createHash('sha256').update(raw).digest('hex');
  if (await eventSeen(eventId)) { res.json({ ok: true, duplicate: true }); return; }

  const type = typeof event.event === 'string' ? event.event : 'unknown';
  const subscriptionId = event.payload?.subscription?.entity?.id;
  if (type.startsWith('subscription.') && typeof subscriptionId === 'string') {
    const row = await subscriptionByRazorpayId(subscriptionId);
    if (row) {
      await syncSubscription(billing.client, subscriptionId);
      const payment = event.payload?.payment?.entity;
      if (type === 'subscription.charged' && payment?.status === 'captured') {
        await recordCharge({
          paymentId: payment.id,
          subscriptionId: row.id,
          amountPaise: payment.amount,
          paidAt: new Date(payment.created_at * 1000),
          invoiceId: payment.invoice_id ?? null,
        });
      }
    }
  }

  await recordEvent(eventId, type, event);
  res.json({ ok: true });
}
