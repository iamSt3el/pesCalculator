import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';
import { setBilling } from '../src/billing/state.ts';
import { entitlementFor } from '../src/billing/access.ts';
import { forgetRefreshes, recordPayment, refreshStale, syncSubscription } from '../src/billing/sync.ts';
import {
  chargesOf, insertSubscription, subscriptionsOf,
} from '../src/repo/subscriptions.ts';
import { createGrant, liveGrantOf, revokeGrant } from '../src/repo/grants.ts';
import { fakeRazorpay, testBilling } from './fakes.ts';

const rz = fakeRazorpay();
let user = 0;
let admin = 0;

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('admin@test.invalid', 'x', 'admin'), ('user@test.invalid', 'x', 'user') RETURNING id`,
  );
  [admin, user] = [rows[0]!.id, rows[1]!.id];
  setBilling(testBilling(rz));
});
test.after(async () => { await pool.end(); });
test.beforeEach(() => { rz.failing = false; forgetRefreshes(); });

test('syncing stores what Razorpay now says, times included', async () => {
  const made = await rz.createSubscription({ planId: 'plan_yearly', totalCount: 10, notes: {} });
  await insertSubscription(pool, { userId: user, razorpayId: made.id, period: 'yearly', status: 'created' });
  rz.set(made.id, { status: 'active', current_start: 1_790_000_000, current_end: 1_821_536_000 });

  const row = await syncSubscription(rz, made.id);
  assert.equal(row?.status, 'active');
  assert.equal(row?.currentEnd?.getTime(), 1_821_536_000 * 1000);
  assert.equal((await entitlementFor(user))?.source, 'subscription');
});

test('a captured payment is recorded once however often it is seen', async () => {
  const [sub] = await subscriptionsOf(user);
  rz.payments.set('pay_1', { id: 'pay_1', amount: 500_000, status: 'captured', created_at: 1_790_000_100, invoice_id: 'inv_1' });
  await recordPayment(rz, 'pay_1', sub!.id);
  await recordPayment(rz, 'pay_1', sub!.id);
  const charges = await chargesOf(user);
  assert.equal(charges.length, 1);
  assert.deepEqual({ ...charges[0], paidAt: charges[0]!.paidAt.getTime() },
    { paymentId: 'pay_1', amountPaise: 500_000, paidAt: 1_790_000_100_000, period: 'yearly' });
});

test('a payment that is not captured is not a charge', async () => {
  const [sub] = await subscriptionsOf(user);
  rz.payments.set('pay_2', { id: 'pay_2', amount: 500_000, status: 'failed', created_at: 1_790_000_200, invoice_id: null });
  await recordPayment(rz, 'pay_2', sub!.id);
  assert.equal((await chargesOf(user)).length, 1);
});

test('the lazy refresh picks up an activation nobody told us about, once a minute at most', async () => {
  const made = await rz.createSubscription({ planId: 'plan_monthly', totalCount: 120, notes: {} });
  await insertSubscription(pool, { userId: admin, razorpayId: made.id, period: 'monthly', status: 'created' });
  rz.set(made.id, { status: 'authenticated' });

  const now = new Date();
  await refreshStale(rz, await subscriptionsOf(admin), now);
  assert.equal((await subscriptionsOf(admin))[0]!.status, 'authenticated');

  rz.set(made.id, { status: 'active' });
  await refreshStale(rz, await subscriptionsOf(admin), new Date(now.getTime() + 30_000));
  assert.equal((await subscriptionsOf(admin))[0]!.status, 'authenticated', 'throttled within the minute');

  await refreshStale(rz, await subscriptionsOf(admin), new Date(now.getTime() + 61_000));
  assert.equal((await subscriptionsOf(admin))[0]!.status, 'active');
});

test('the lazy refresh survives Razorpay being down', async () => {
  const made = await rz.createSubscription({ planId: 'plan_monthly', totalCount: 120, notes: {} });
  await insertSubscription(pool, { userId: admin, razorpayId: made.id, period: 'monthly', status: 'created' });
  rz.failing = true;
  await refreshStale(rz, await subscriptionsOf(admin));   // must not throw
});

test('a new grant revokes the previous one; revoking twice finds nothing', async () => {
  const first = await createGrant({ userId: user, until: '2027-01-31', note: 'UPI ref 1', grantedBy: admin });
  const second = await createGrant({ userId: user, until: '2027-03-31', note: 'UPI ref 2', grantedBy: admin });
  const live = await liveGrantOf(user, '2026-09-27');
  assert.equal(live?.id, second.id);
  const { rows } = await pool.query('SELECT revoked_at FROM access_grants WHERE id = $1', [first.id]);
  assert.notEqual(rows[0].revoked_at, null);
  assert.equal(await revokeGrant(second.id), true);
  assert.equal(await revokeGrant(second.id), false);
  assert.equal(await liveGrantOf(user, '2026-09-27'), null);
});

test('entitlementFor reports nothing for an account that does not exist', async () => {
  assert.equal(await entitlementFor(999_999), null);
});
