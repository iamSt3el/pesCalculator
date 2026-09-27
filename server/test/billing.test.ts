import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { getBilling, setBilling } from '../src/billing/state.ts';
import { forgetRefreshes } from '../src/billing/sync.ts';
import { fakeRazorpay, signCheckout, testBilling } from './fakes.ts';
import { resetDatabase, signedIn, startApp, type Agent } from './helpers.ts';

const rz = fakeRazorpay();
let app: Awaited<ReturnType<typeof startApp>>;

test.before(async () => {
  await resetDatabase();
  app = await startApp({ billing: testBilling(rz) });
});
test.after(async () => { await app.close(); await pool.end(); });
test.beforeEach(() => { rz.failing = false; forgetRefreshes(); });

const post = (as: Agent, path: string, body: unknown = {}) =>
  as(path, { method: 'POST', body: JSON.stringify(body) });
const subscribe = (as: Agent, period: string) => post(as, '/api/billing/subscriptions', { period });

async function activate(as: Agent, subscriptionId: string, paymentId: string) {
  rz.set(subscriptionId, { status: 'active', current_start: 1_790_000_000, current_end: 1_821_536_000 });
  rz.payments.set(paymentId, { id: paymentId, amount: 500_000, status: 'captured', created_at: 1_790_000_100, invoice_id: null });
  return post(as, '/api/billing/subscriptions/verify', {
    razorpay_payment_id: paymentId,
    razorpay_subscription_id: subscriptionId,
    razorpay_signature: signCheckout(paymentId, subscriptionId),
  });
}

test('a new account is on the free plan', async () => {
  const { as } = await signedIn(app.base, 'a@test.invalid');
  const view = await (await as('/api/billing')).json();
  assert.equal(view.configured, true);
  assert.equal(view.keyId, 'rzp_test_key');
  assert.equal(view.entitlement.source, 'free');
  assert.equal(view.subscription, null);
  assert.deepEqual(view.charges, []);
});

test('the plans come from Razorpay', async () => {
  const { as } = await signedIn(app.base, 'plans@test.invalid');
  const plans = await (await as('/api/billing/plans')).json();
  assert.deepEqual(plans, [
    { period: 'monthly', amountPaise: 50_000, currency: 'INR' },
    { period: 'half_yearly', amountPaise: 270_000, currency: 'INR' },
    { period: 'yearly', amountPaise: 500_000, currency: 'INR' },
  ]);
});

test('an unknown period is refused', async () => {
  const { as } = await signedIn(app.base, 'weekly@test.invalid');
  assert.equal((await subscribe(as, 'weekly')).status, 400);
});

test('subscribing, abandoning and retrying reuses one subscription per period', async () => {
  const { as } = await signedIn(app.base, 'b@test.invalid');
  const before = rz.created;
  const first = await subscribe(as, 'yearly');
  assert.equal(first.status, 201);
  const made = await first.json();
  assert.equal(made.keyId, 'rzp_test_key');
  assert.equal(made.email, 'b@test.invalid');

  const again = await (await subscribe(as, 'yearly')).json();
  assert.equal(again.subscriptionId, made.subscriptionId);
  assert.equal(rz.created, before + 1);

  const monthly = await (await subscribe(as, 'monthly')).json();
  assert.notEqual(monthly.subscriptionId, made.subscriptionId);
  assert.equal(rz.subs.get(made.subscriptionId)!.status, 'cancelled', 'the abandoned yearly one is cancelled');
});

test('a double click on Pay makes one Razorpay subscription', async () => {
  const { as } = await signedIn(app.base, 'double@test.invalid');
  const before = rz.created;
  const [x, y] = await Promise.all([subscribe(as, 'yearly'), subscribe(as, 'yearly')]);
  assert.equal((await x.json()).subscriptionId, (await y.json()).subscriptionId);
  assert.equal(rz.created, before + 1);
});

test('a verified payment turns the plan on and records the charge', async () => {
  const { as } = await signedIn(app.base, 'c@test.invalid');
  const { subscriptionId } = await (await subscribe(as, 'yearly')).json();
  const res = await activate(as, subscriptionId, 'pay_c');
  assert.equal(res.status, 200);
  const view = await res.json();
  assert.equal(view.entitlement.source, 'subscription');
  assert.equal(view.subscription.status, 'active');
  assert.equal(view.subscription.period, 'yearly');
  assert.equal(view.charges.length, 1);
  assert.equal(view.charges[0].amountPaise, 500_000);

  const conflict = await subscribe(as, 'monthly');
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, 'subscribed');
});

test('a tampered signature is refused', async () => {
  const { as } = await signedIn(app.base, 'd@test.invalid');
  const { subscriptionId } = await (await subscribe(as, 'monthly')).json();
  const res = await post(as, '/api/billing/subscriptions/verify', {
    razorpay_payment_id: 'pay_d', razorpay_subscription_id: subscriptionId,
    razorpay_signature: signCheckout('pay_other', subscriptionId),
  });
  assert.equal(res.status, 400);
});

test("verifying someone else's subscription finds nothing", async () => {
  const owner = await signedIn(app.base, 'e@test.invalid');
  const thief = await signedIn(app.base, 'f@test.invalid');
  const { subscriptionId } = await (await subscribe(owner.as, 'monthly')).json();
  const res = await activate(thief.as, subscriptionId, 'pay_f');
  assert.equal(res.status, 404);
});

test('when Razorpay cannot be reached, verify still answers and the plan waits', async () => {
  const { as } = await signedIn(app.base, 'g@test.invalid');
  const { subscriptionId } = await (await subscribe(as, 'monthly')).json();
  rz.failing = true;
  const res = await post(as, '/api/billing/subscriptions/verify', {
    razorpay_payment_id: 'pay_g', razorpay_subscription_id: subscriptionId,
    razorpay_signature: signCheckout('pay_g', subscriptionId),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).entitlement.source, 'free');
});

test('the lazy refresh activates a plan when the callback and webhook were both lost', async () => {
  const { as } = await signedIn(app.base, 'h@test.invalid');
  const { subscriptionId } = await (await subscribe(as, 'yearly')).json();
  rz.set(subscriptionId, { status: 'active', current_start: 1_790_000_000, current_end: 1_821_536_000 });
  const view = await (await as('/api/billing')).json();
  assert.equal(view.entitlement.source, 'subscription');
});

test('GET /api/billing answers from stored state when Razorpay is down', async () => {
  const { as } = await signedIn(app.base, 'i@test.invalid');
  await subscribe(as, 'yearly');
  rz.failing = true;
  const res = await as('/api/billing');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).entitlement.source, 'free');
});

test('cancelling stops renewal but keeps the plan to the end of the cycle', async () => {
  const { as } = await signedIn(app.base, 'j@test.invalid');
  assert.equal((await post(as, '/api/billing/subscription/cancel')).status, 404);
  const { subscriptionId } = await (await subscribe(as, 'yearly')).json();
  await activate(as, subscriptionId, 'pay_j');
  const res = await post(as, '/api/billing/subscription/cancel');
  assert.equal(res.status, 200);
  const view = await res.json();
  assert.equal(view.subscription.cancelAtCycleEnd, true);
  assert.equal(view.entitlement.paid, true);
});

test('with billing unconfigured the billing routes say so', async () => {
  const held = getBilling();
  setBilling(null);
  try {
    const { as } = await signedIn(app.base, 'k@test.invalid');
    const view = await (await as('/api/billing')).json();
    assert.equal(view.configured, false);
    assert.equal(view.entitlement.paid, true);
    assert.equal((await subscribe(as, 'yearly')).status, 503);
    assert.equal((await as('/api/billing/plans')).status, 503);
  } finally {
    setBilling(held);
  }
});

test('billing needs a session', async () => {
  assert.equal((await fetch(`${app.base}/api/billing`)).status, 401);
});
