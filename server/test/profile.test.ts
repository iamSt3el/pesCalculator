import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';
import { createApp } from '../src/app.ts';

const app = createApp();
let server: ReturnType<typeof app.listen>;
let base = '';

const EMAIL = 'owner@example.com';
const FIRST = 'correct horse battery';
const SECOND = 'a different long passphrase';

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  const created = await agent()('/api/users', {
    method: 'POST', body: JSON.stringify({ email: EMAIL, password: FIRST }),
  });
  assert.equal(created.status, 201);
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

async function signedIn(password: string) {
  const a = agent();
  const res = await a('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password }) });
  assert.equal(res.status, 200);
  return a;
}

const changeTo = (a: ReturnType<typeof agent>, currentPassword: string, newPassword: string) =>
  a('/api/users/me/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });

test('the profile is not readable while signed out', async () => {
  const res = await agent()('/api/users/me');
  assert.equal(res.status, 401);
});

test('a signed-out caller cannot change a password', async () => {
  const res = await changeTo(agent(), FIRST, SECOND);
  assert.equal(res.status, 401);
});

test('the profile reports the account details and how many contracts it owns', async () => {
  const a = await signedIn(FIRST);
  const created = await a('/api/contracts', { method: 'POST', body: JSON.stringify({ agreementNo: '168 of 2023-24' }) });
  assert.equal(created.status, 201);

  const body = await (await a('/api/users/me')).json();
  assert.equal(body.email, EMAIL);
  assert.equal(body.role, 'admin');
  assert.equal(body.contractCount, 1);
  assert.ok(!Number.isNaN(Date.parse(body.createdAt)), 'createdAt should be a timestamp');
  assert.equal(body.passwordHash, undefined, 'the hash must never leave the server');
});

test('a wrong current password is refused', async () => {
  const a = await signedIn(FIRST);
  const res = await changeTo(a, 'not the right password', SECOND);
  assert.equal(res.status, 403);
  // The account is untouched: the original password still signs in.
  await signedIn(FIRST);
});

test('a new password under twelve characters is refused', async () => {
  const a = await signedIn(FIRST);
  const res = await changeTo(a, FIRST, 'short');
  assert.equal(res.status, 400);
});

test('a new password identical to the current one is refused', async () => {
  const a = await signedIn(FIRST);
  const res = await changeTo(a, FIRST, FIRST);
  assert.equal(res.status, 400);
});

test('changing the password retires the old one and accepts the new', async () => {
  const a = await signedIn(FIRST);
  const res = await changeTo(a, FIRST, SECOND);
  assert.equal(res.status, 204);

  // The session that made the change stays signed in.
  assert.equal((await a('/api/auth/me')).status, 200);

  const stale = await agent()('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: EMAIL, password: FIRST }),
  });
  assert.equal(stale.status, 401);

  await signedIn(SECOND);
});

test('changing the password signs the account out everywhere else', async () => {
  const changer = await signedIn(SECOND);
  const elsewhere = await signedIn(SECOND);
  assert.equal((await elsewhere('/api/auth/me')).status, 200);

  assert.equal((await changeTo(changer, SECOND, FIRST)).status, 204);

  assert.equal((await elsewhere('/api/auth/me')).status, 401);
  assert.equal((await changer('/api/auth/me')).status, 200);
});
