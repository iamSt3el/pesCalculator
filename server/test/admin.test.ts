import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { fakeRazorpay, testBilling } from './fakes.ts';
import { resetDatabase, signedIn, startApp, type Agent } from './helpers.ts';

let app: Awaited<ReturnType<typeof startApp>>;
let admin: { as: Agent; id: number };
let user: { as: Agent; id: number };

test.before(async () => {
  await resetDatabase();
  app = await startApp({ billing: testBilling(fakeRazorpay()) });
  admin = await signedIn(app.base, 'admin@test.invalid', 'admin');
  user = await signedIn(app.base, 'user@test.invalid');
});
test.after(async () => { await app.close(); await pool.end(); });

const grant = (until: string, note = 'Paid by UPI, ref 123') =>
  admin.as(`/api/admin/users/${user.id}/grants`, { method: 'POST', body: JSON.stringify({ until, note }) });

test('only an administrator sees the subscribers', async () => {
  assert.equal((await user.as('/api/admin/subscribers')).status, 403);
  const list = await (await admin.as('/api/admin/subscribers')).json();
  const row = list.find((r: { id: number }) => r.id === user.id);
  assert.equal(row.email, 'user@test.invalid');
  assert.equal(row.entitlement.source, 'free');
  assert.equal(row.subscription, null);
  assert.equal(row.grant, null);
});

test('a grant must run until today or later, and be a real date', async () => {
  assert.equal((await grant('2020-01-01')).status, 400);
  assert.equal((await grant('2027-02-30')).status, 400);
  assert.equal((await grant('soon')).status, 400);
});

test('a grant to an account that does not exist finds nothing', async () => {
  const res = await admin.as('/api/admin/users/999999/grants', {
    method: 'POST', body: JSON.stringify({ until: '2099-01-01' }),
  });
  assert.equal(res.status, 404);
});

test('granting, re-granting and revoking', async () => {
  const first = await grant('2027-01-31');
  assert.equal(first.status, 201);
  const second = await (await grant('2027-03-31', 'renewed')).json();

  const list = await (await admin.as('/api/admin/subscribers')).json();
  const row = list.find((r: { id: number }) => r.id === user.id);
  assert.equal(row.entitlement.source, 'grant');
  assert.deepEqual(row.grant, { id: second.id, until: '2027-03-31', note: 'renewed' });

  assert.equal((await admin.as(`/api/admin/grants/${second.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await admin.as(`/api/admin/grants/${second.id}`, { method: 'DELETE' })).status, 404);
  const after = await (await user.as('/api/billing')).json();
  assert.equal(after.entitlement.source, 'free');
});

test('a user cannot grant themselves anything', async () => {
  const res = await user.as(`/api/admin/users/${user.id}/grants`, {
    method: 'POST', body: JSON.stringify({ until: '2099-01-01' }),
  });
  assert.equal(res.status, 403);
});
