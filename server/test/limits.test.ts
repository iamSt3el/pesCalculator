import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { getBilling, setBilling } from '../src/billing/state.ts';
import { fakeRazorpay, testBilling } from './fakes.ts';
import { resetDatabase, signedIn, startApp, type Agent } from './helpers.ts';

let app: Awaited<ReturnType<typeof startApp>>;

test.before(async () => {
  await resetDatabase();
  app = await startApp({ billing: testBilling(fakeRazorpay()) });
});
test.after(async () => { await app.close(); await pool.end(); });

const create = (as: Agent, agreementNo: string) =>
  as('/api/contracts', { method: 'POST', body: JSON.stringify({ agreementNo }) });

async function contractFor(userId: number, agreementNo: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO contracts (agreement_no, user_id) VALUES ($1, $2) RETURNING id', [agreementNo, userId],
  );
  return rows[0]!.id;
}

test('a free account creates one contract and is refused a second', async () => {
  const { as } = await signedIn(app.base, 'free@test.invalid');
  assert.equal((await create(as, '1 of 2026-27')).status, 201);
  const second = await create(as, '2 of 2026-27');
  assert.equal(second.status, 402);
  assert.equal((await second.json()).code, 'limit');
});

test('two tabs creating the second contract at once: exactly one succeeds', async () => {
  const { as } = await signedIn(app.base, 'race@test.invalid');
  const statuses = (await Promise.all([create(as, 'A'), create(as, 'B')])).map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 402]);
});

test('an administrator is never limited', async () => {
  const { as } = await signedIn(app.base, 'boss@test.invalid', 'admin');
  for (const n of ['1', '2', '3']) assert.equal((await create(as, n)).status, 201);
});

test('an account over the limit reads, prints and deletes, but cannot write', async () => {
  const { as, id } = await signedIn(app.base, 'lapsed@test.invalid');
  const first = await contractFor(id, 'kept');
  const second = await contractFor(id, 'extra');

  for (const [path, body] of [
    [`/api/contracts/${first}`, { contractor: 'M/s. X' }],
    [`/api/contracts/${first}/components`, []],
    [`/api/contracts/${first}/progress`, []],
    [`/api/contracts/${first}/payments`, []],
    [`/api/contracts/${first}/expenditure`, []],
  ] as const) {
    const res = await as(path, { method: 'PUT', body: JSON.stringify(body) });
    assert.equal(res.status, 402, path);
    assert.equal((await res.json()).code, 'read_only', path);
  }

  assert.equal((await as(`/api/contracts/${first}`)).status, 200);
  // An empty contract may not calculate; what matters is that billing does not refuse it.
  assert.notEqual((await as(`/api/contracts/${first}/calculation`)).status, 402);
  assert.equal((await as(`/api/contracts/${second}`, { method: 'DELETE' })).status, 204);

  // Down to one contract: that one is editable again, for free.
  const res = await as(`/api/contracts/${first}`, { method: 'PUT', body: JSON.stringify({ contractor: 'M/s. X' }) });
  assert.equal(res.status, 200);
});

test('a live grant lifts both limits', async () => {
  const { as, id } = await signedIn(app.base, 'granted@test.invalid');
  const { rows } = await pool.query<{ id: number }>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  await pool.query(
    "INSERT INTO access_grants (user_id, until, granted_by) VALUES ($1, '2099-12-31', $2)", [id, rows[0]!.id],
  );
  await contractFor(id, 'one');
  const two = await contractFor(id, 'two');
  assert.equal((await create(as, 'three')).status, 201);
  const res = await as(`/api/contracts/${two}`, { method: 'PUT', body: JSON.stringify({ contractor: 'Y' }) });
  assert.equal(res.status, 200);
});

test('an active subscription lifts both limits', async () => {
  const { as, id } = await signedIn(app.base, 'subscriber@test.invalid');
  await pool.query(
    `INSERT INTO subscriptions (user_id, razorpay_subscription_id, period, status, current_end)
     VALUES ($1, 'sub_active', 'yearly', 'active', now() + interval '1 year')`, [id],
  );
  await contractFor(id, 'one');
  assert.equal((await create(as, 'two')).status, 201);
});

test('with billing unconfigured nobody is limited', async () => {
  const held = getBilling();
  setBilling(null);
  try {
    const { as, id } = await signedIn(app.base, 'nobilling@test.invalid');
    const first = await contractFor(id, 'one');
    await contractFor(id, 'two');
    assert.equal((await create(as, 'three')).status, 201);
    const res = await as(`/api/contracts/${first}`, { method: 'PUT', body: JSON.stringify({ contractor: 'Z' }) });
    assert.equal(res.status, 200);
  } finally {
    setBilling(held);
  }
});
