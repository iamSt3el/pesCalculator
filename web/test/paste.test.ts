import test from 'node:test';
import assert from 'node:assert/strict';
import { submitPaste } from '../src/paste.ts';

test('a paste that succeeds carries the count written and any unreadable lines', async () => {
  const outcome = await submitPaste('2023-07\t130',
    async () => ({ written: 2, errors: ['Could not read a month from "x"'] }));
  assert.equal(outcome.failure, null);
  assert.equal(outcome.written, 2);
  assert.deepEqual(outcome.errors, ['Could not read a month from "x"']);
});

test('a paste that fails is reported instead of vanishing', async () => {
  const outcome = await submitPaste('2023-07\t130',
    () => Promise.reject(new Error('Internal server error')));
  assert.equal(outcome.failure, 'Internal server error');
  assert.equal(outcome.written, 0);
  assert.deepEqual(outcome.errors, []);
});
