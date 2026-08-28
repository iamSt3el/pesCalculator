import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';
import { createApp } from '../src/app.ts';

const app = createApp();
let server: ReturnType<typeof app.listen>;
let base = '';

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
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

test('a second account cannot be created anonymously', async () => {
  const res = await agent()('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'sneak@example.com', password: 'correct horse battery' }),
  });
  assert.equal(res.status, 401);
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

test('a non-admin cannot create accounts', async () => {
  const a = agent();
  await a('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'clerk@example.com', password: 'another good phrase' }),
  });
  const res = await a('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'nope@example.com', password: 'yet another phrase' }),
  });
  assert.equal(res.status, 403);
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
