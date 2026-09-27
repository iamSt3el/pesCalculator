import test from 'node:test';
import assert from 'node:assert/strict';
import { httpRazorpay, RazorpayError } from '../src/billing/razorpay.ts';

interface Seen { url: string; method: string; auth: string | null; body: unknown }

function stub(status: number, reply: unknown) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    seen.push({
      url, method: init.method ?? 'GET', auth: headers.get('authorization'),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify(reply), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { seen, fetchImpl };
}

const keys = { keyId: 'rzp_test_1', keySecret: 's3cret' };
const basic = 'Basic ' + Buffer.from('rzp_test_1:s3cret').toString('base64');

test('creating a subscription posts the plan, the count and asks Razorpay to notify the customer', async () => {
  const { seen, fetchImpl } = stub(200, { id: 'sub_1', plan_id: 'plan_y', status: 'created', current_start: null, current_end: null });
  const client = httpRazorpay(keys, fetchImpl);
  const sub = await client.createSubscription({ planId: 'plan_y', totalCount: 10, notes: { user_id: '7' } });
  assert.equal(sub.id, 'sub_1');
  assert.deepEqual(seen[0], {
    url: 'https://api.razorpay.com/v1/subscriptions', method: 'POST', auth: basic,
    body: { plan_id: 'plan_y', total_count: 10, customer_notify: 1, notes: { user_id: '7' } },
  });
});

test('cancelling at the end of the cycle says so', async () => {
  const { seen, fetchImpl } = stub(200, { id: 'sub_1', status: 'active' });
  await httpRazorpay(keys, fetchImpl).cancelSubscription('sub_1', true);
  assert.equal(seen[0]!.url, 'https://api.razorpay.com/v1/subscriptions/sub_1/cancel');
  assert.deepEqual(seen[0]!.body, { cancel_at_cycle_end: 1 });
});

test('fetches are GETs on the entity path', async () => {
  const { seen, fetchImpl } = stub(200, {});
  const client = httpRazorpay(keys, fetchImpl);
  await client.fetchSubscription('sub_1');
  await client.fetchPayment('pay_1');
  await client.fetchPlan('plan_y');
  assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), [
    'GET https://api.razorpay.com/v1/subscriptions/sub_1',
    'GET https://api.razorpay.com/v1/payments/pay_1',
    'GET https://api.razorpay.com/v1/plans/plan_y',
  ]);
});

test('a Razorpay error carries its status and description', async () => {
  const { fetchImpl } = stub(400, { error: { description: 'The id provided does not exist' } });
  await assert.rejects(
    httpRazorpay(keys, fetchImpl).fetchSubscription('sub_nope'),
    (err: unknown) => err instanceof RazorpayError && err.status === 400
      && err.message === 'The id provided does not exist',
  );
});
