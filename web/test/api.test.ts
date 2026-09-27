import test from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, onEntitlementStale } from '../src/api.ts';

function answer(status: number, body: unknown) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
}

test('a 402 carries its code and tells the entitlement listeners', async () => {
  let told = 0;
  const stop = onEntitlementStale(() => { told += 1; });
  answer(402, { error: 'read-only', code: 'read_only' });
  await assert.rejects(api.putContract(1, { contractor: 'X' }),
    (err: unknown) => err instanceof ApiError && err.status === 402 && err.code === 'read_only');
  assert.equal(told, 1);
  stop();
  await assert.rejects(api.putContract(1, { contractor: 'X' }));
  assert.equal(told, 1, 'an unsubscribed listener hears nothing');
});

test('other failures do not touch the entitlement', async () => {
  let told = 0;
  const stop = onEntitlementStale(() => { told += 1; });
  answer(404, { error: 'No such contract' });
  await assert.rejects(api.getContract(1),
    (err: unknown) => err instanceof ApiError && err.status === 404 && err.code === undefined);
  assert.equal(told, 0);
  stop();
});
