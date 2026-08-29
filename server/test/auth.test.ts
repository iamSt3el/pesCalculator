import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';
import { createApp } from '../src/app.ts';

const app = createApp();
let server: ReturnType<typeof app.listen>;
let base = '';

let orphanId = 0;

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
  // A contract that predates every account, as the seeder leaves one.
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO contracts (agreement_no) VALUES ('predates sign-up') RETURNING id",
  );
  orphanId = rows[0]!.id;
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

test.after(async () => { server.close(); await pool.end(); });

/** Minimal cookie-jar fetch: keeps the connect.sid cookie between calls. */
function agent() {
  let cookie = '';
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(base + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...init.headers },
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0]!;
    return res;
  };
}

test('the first account created becomes an admin', async () => {
  const a = agent();
  const res = await a('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'first@example.com', password: 'correct horse battery' }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).role, 'admin');
});

test('the founding admin adopts contracts that predate sign-up', async () => {
  const { rows } = await pool.query<{ user_id: number | null }>(
    'SELECT user_id FROM contracts WHERE id = $1', [orphanId],
  );
  const { rows: admin } = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1",
  );
  assert.equal(rows[0]!.user_id, admin[0]!.id);
});

test('a later account adopts nothing', async () => {
  const before = await pool.query("SELECT count(*)::int AS n FROM contracts WHERE user_id IS NULL");
  assert.equal(before.rows[0].n, 0);
});

test('sign-up is open: a second account needs no session and defaults to user', async () => {
  const res = await agent()('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'selfserve@example.com', password: 'correct horse battery' }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).role, 'user');
});

test('an account made by open sign-up can sign in, and starts with no contracts', async () => {
  const a = agent();
  const ok = await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'selfserve@example.com', password: 'correct horse battery' }),
  });
  assert.equal(ok.status, 200);

  const list = await a('/api/contracts');
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), []);
});

test('login establishes a session and logout ends it', async () => {
  const a = agent();
  const bad = await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'first@example.com', password: 'wrong' }),
  });
  assert.equal(bad.status, 401);

  const ok = await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'first@example.com', password: 'correct horse battery' }),
  });
  assert.equal(ok.status, 200);

  const me = await a('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal((await me.json()).email, 'first@example.com');

  await a('/api/auth/logout', { method: 'POST' });
  assert.equal((await a('/api/auth/me')).status, 401);
});

test('an admin can create further accounts, which default to the user role', async () => {
  const a = agent();
  await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'first@example.com', password: 'correct horse battery' }),
  });
  const res = await a('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'clerk@example.com', password: 'another good phrase' }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).role, 'user');
});

test('a signed-in non-admin can create accounts too', async () => {
  const a = agent();
  await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'clerk@example.com', password: 'another good phrase' }),
  });
  const res = await a('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'made-by-clerk@example.com', password: 'yet another phrase' }),
  });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).role, 'user');
});

/** Signs a fresh account in and hands back its cookie-carrying fetch. */
async function signedUp(email: string) {
  const a = agent();
  const made = await a('/api/users', {
    method: 'POST', body: JSON.stringify({ email, password: 'a long enough phrase' }),
  });
  assert.equal(made.status, 201);
  await a('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password: 'a long enough phrase' }),
  });
  return a;
}

test('a contract is visible only to the account that created it', async () => {
  const mine = await signedUp('owner@example.com');
  const theirs = await signedUp('stranger@example.com');

  const created = await mine('/api/contracts', {
    method: 'POST', body: JSON.stringify({ agreementNo: '999 of 2025-26' }),
  });
  assert.equal(created.status, 201);
  const id = (await created.json()).id;

  assert.deepEqual((await (await mine('/api/contracts')).json()).map((c: { id: number }) => c.id), [id]);
  assert.deepEqual(await (await theirs('/api/contracts')).json(), []);
});

test("another account cannot read, edit, calculate or delete a contract it does not own", async () => {
  const mine = await signedUp('owner2@example.com');
  const theirs = await signedUp('stranger2@example.com');

  const created = await mine('/api/contracts', {
    method: 'POST', body: JSON.stringify({ agreementNo: '1000 of 2025-26' }),
  });
  const id = (await created.json()).id;

  // 404 rather than 403 throughout: the id must not be confirmable.
  assert.equal((await theirs(`/api/contracts/${id}`)).status, 404);
  assert.equal((await theirs(`/api/contracts/${id}/calculation`)).status, 404);
  assert.equal((await theirs(`/api/contracts/${id}`, {
    method: 'PUT', body: JSON.stringify({ contractor: 'hijacked' }),
  })).status, 404);
  assert.equal((await theirs(`/api/contracts/${id}`, { method: 'DELETE' })).status, 404);

  // ...and the owner's contract is untouched by any of it.
  const still = await (await mine(`/api/contracts/${id}`)).json();
  assert.equal(still.contract.contractor, '');
});

test('the password hash is never returned', async () => {
  const a = agent();
  await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'first@example.com', password: 'correct horse battery' }),
  });
  const body = await (await a('/api/auth/me')).json();
  assert.equal('password_hash' in body, false);
  assert.equal('passwordHash' in body, false);
});
