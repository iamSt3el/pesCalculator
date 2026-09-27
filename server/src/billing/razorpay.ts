import type { BillingConfig } from './config.ts';

/** Only the fields this app reads. Times are unix seconds, as Razorpay sends them. */
export interface RzSubscription {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
}

export interface RzPayment {
  id: string;
  amount: number;          // paise
  status: string;          // 'captured' once the money is ours
  created_at: number;
  invoice_id: string | null;
}

export interface RzPlan {
  id: string;
  item: { amount: number; currency: string };
}

/**
 * Everything the app asks of Razorpay. An interface so the tests hand the app
 * a fake and never touch the network.
 */
export interface RazorpayClient {
  createSubscription(input: { planId: string; totalCount: number; notes: Record<string, string> }): Promise<RzSubscription>;
  fetchSubscription(id: string): Promise<RzSubscription>;
  cancelSubscription(id: string, atCycleEnd: boolean): Promise<RzSubscription>;
  fetchPayment(id: string): Promise<RzPayment>;
  fetchPlan(id: string): Promise<RzPlan>;
}

export class RazorpayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const API = 'https://api.razorpay.com/v1';

/** A few REST calls do not justify the SDK; basic auth over fetch is all it is. */
export function httpRazorpay(
  config: Pick<BillingConfig, 'keyId' | 'keySecret'>,
  fetchImpl: typeof fetch = fetch,
): RazorpayClient {
  const auth = 'Basic ' + Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(API + path, {
      method,
      headers: {
        authorization: auth,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({})) as { error?: { description?: string } };
    if (!res.ok) {
      throw new RazorpayError(res.status, json.error?.description ?? `Razorpay answered ${res.status}`);
    }
    return json as T;
  }

  const at = (id: string) => encodeURIComponent(id);

  return {
    createSubscription: ({ planId, totalCount, notes }) => call('POST', '/subscriptions', {
      plan_id: planId, total_count: totalCount, customer_notify: 1, notes,
    }),
    fetchSubscription: (id) => call('GET', `/subscriptions/${at(id)}`),
    cancelSubscription: (id, atCycleEnd) =>
      call('POST', `/subscriptions/${at(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
    fetchPayment: (id) => call('GET', `/payments/${at(id)}`),
    fetchPlan: (id) => call('GET', `/plans/${at(id)}`),
  };
}
