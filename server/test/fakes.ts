import { createHmac } from 'node:crypto';
import type { BillingConfig } from '../src/billing/config.ts';
import type { RazorpayClient, RzPayment, RzPlan, RzSubscription } from '../src/billing/razorpay.ts';

export const TEST_CONFIG: BillingConfig = {
  keyId: 'rzp_test_key',
  keySecret: 'key_secret',
  webhookSecret: 'hook_secret',
  plans: { monthly: 'plan_monthly', half_yearly: 'plan_half', yearly: 'plan_yearly' },
};

export interface FakeRazorpay extends RazorpayClient {
  subs: Map<string, RzSubscription>;
  payments: Map<string, RzPayment>;
  plans: Map<string, RzPlan>;
  /** How many subscriptions createSubscription has made. */
  created: number;
  /** While true every call rejects, as if Razorpay were unreachable. */
  failing: boolean;
  /** Changes what Razorpay would now report for a subscription. */
  set(id: string, patch: Partial<RzSubscription>): void;
}

export function fakeRazorpay(): FakeRazorpay {
  const subs = new Map<string, RzSubscription>();
  const payments = new Map<string, RzPayment>();
  const plans = new Map<string, RzPlan>([
    ['plan_monthly', { id: 'plan_monthly', item: { amount: 50_000, currency: 'INR' } }],
    ['plan_half', { id: 'plan_half', item: { amount: 270_000, currency: 'INR' } }],
    ['plan_yearly', { id: 'plan_yearly', item: { amount: 500_000, currency: 'INR' } }],
  ]);

  const fake: FakeRazorpay = {
    subs, payments, plans, created: 0, failing: false,
    set(id, patch) { subs.set(id, { ...subs.get(id)!, ...patch }); },
    async createSubscription({ planId }) {
      guard();
      fake.created += 1;
      const sub: RzSubscription = {
        id: `sub_${fake.created}`, plan_id: planId, status: 'created', current_start: null, current_end: null,
      };
      subs.set(sub.id, sub);
      return { ...sub };
    },
    async fetchSubscription(id) { guard(); return { ...found(subs, id) }; },
    async cancelSubscription(id, atCycleEnd) {
      guard();
      const sub = found(subs, id);
      // At the end of a cycle Razorpay leaves an active subscription active.
      if (!(atCycleEnd && sub.status === 'active')) sub.status = 'cancelled';
      return { ...sub };
    },
    async fetchPayment(id) { guard(); return { ...found(payments, id) }; },
    async fetchPlan(id) { guard(); return { ...found(plans, id) }; },
  };

  function guard() { if (fake.failing) throw new Error('Razorpay is unreachable'); }
  return fake;
}

function found<T>(map: Map<string, T>, id: string): T {
  const hit = map.get(id);
  if (!hit) throw new Error(`fake Razorpay has no ${id}`);
  return hit;
}

export function testBilling(client: RazorpayClient) {
  return { config: TEST_CONFIG, client };
}

export const signCheckout = (paymentId: string, subscriptionId: string) =>
  createHmac('sha256', TEST_CONFIG.keySecret).update(`${paymentId}|${subscriptionId}`).digest('hex');

export const signWebhook = (body: string) =>
  createHmac('sha256', TEST_CONFIG.webhookSecret).update(body).digest('hex');
