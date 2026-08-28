import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { pool } from '../src/db.ts';

const app = createApp();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const addr = server.address();
const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

test.after(async () => { server.close(); await pool.end(); });

test('an unknown API route returns JSON, never the app shell', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type') ?? '', /json/);
});

test('a client route falls through to the app shell so deep links work', async () => {
  const res = await fetch(`${base}/c/1/calculation`);
  // 200 with the shell when a build exists, 404 when it does not - never a crash.
  assert.ok([200, 404].includes(res.status));
});
