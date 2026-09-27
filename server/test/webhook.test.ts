import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { fakeRazorpay, signWebhook, testBilling } from './fakes.ts';
import { resetDatabase, startApp } from './helpers.ts';

const rz = fakeRazorpay();
let app: Awaited<ReturnType<typeof startApp>>;
let userId = 0;

test.before(async () => {
  await resetDatabase();
  app = await startApp({ billing: testBilling(rz) });
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('w@test.invalid', 'x', 'user') RETURNING id",
  );
  userId = rows[0]!.id;
  const made = await rz.createSubscription({ planId: 'plan_yearly', totalCount: 10, notes: {} });
  await pool.query(
    `INSERT INTO subscriptions (user_id, razorpay_subscription_id, period, status) VALUES ($1, $2, 'yearly', 'created')`,
    [userId, made.id],
  );
});
test.after(async () => { await app.close(); await pool.end(); });

function deliver(body: unknown, { eventId = crypto.randomUUID(), signature }: { eventId?: string; signature?: string } = {}) {
  const raw = JSON.stringify(body);
  return fetch(`${app.base}/api/billing/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-event-id': eventId,
      'x-razorpay-signature': signature ?? signWebhook(raw),
    },
    body: raw,
  });
}

const statusOf = async (id: string) =>
  (await pool.query('SELECT status FROM subscriptions WHERE razorpay_subscription_id = $1', [id])).rows[0]?.status;
const chargeCount = async () => Number((await pool.query('SELECT count(*) FROM subscription_charges')).rows[0].count);

test('a delivery with a bad signature is refused', async () => {
  const res = await deliver({ event: 'subscription.activated' }, { signature: 'nope' });
  assert.equal(res.status, 401);
});

test('an event is a prompt to ask Razorpay, not the data itself', async () => {
  rz.set('sub_1', { status: 'active', current_start: 1_790_000_000, current_end: 1_821_536_000 });
  // The payload claims `pending`; Razorpay, asked, says `active`. Razorpay wins.
  const res = await deliver({
    event: 'subscription.pending',
    payload: { subscription: { entity: { id: 'sub_1', status: 'pending' } } },
  });
  assert.equal(res.status, 200);
  assert.equal(await statusOf('sub_1'), 'active');
});

test('a charge delivered twice is recorded once', async () => {
  const body = {
    event: 'subscription.charged',
    payload: {
      subscription: { entity: { id: 'sub_1' } },
      payment: { entity: { id: 'pay_w', amount: 500_000, status: 'captured', created_at: 1_790_000_100, invoice_id: 'inv_w' } },
    },
  };
  assert.equal((await deliver(body, { eventId: 'evt_same' })).status, 200);
  const again = await deliver(body, { eventId: 'evt_same' });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  assert.equal(await deliver(body, { eventId: 'evt_other' }).then((r) => r.status), 200);
  assert.equal(await chargeCount(), 1);
});

test('a subscription this database does not hold is acknowledged and ignored', async () => {
  const res = await deliver({
    event: 'subscription.activated',
    payload: { subscription: { entity: { id: 'sub_stranger' } } },
  });
  assert.equal(res.status, 200);
  assert.equal(await statusOf('sub_stranger'), undefined);
});

test('an event that is not about a subscription is acknowledged', async () => {
  assert.equal((await deliver({ event: 'payment.captured', payload: {} })).status, 200);
});
