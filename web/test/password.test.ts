import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePasswordChange } from '../src/password.ts';

const valid = { current: 'correct horse battery', next: 'a brand new passphrase', confirm: 'a brand new passphrase' };

test('a well-formed change has nothing to complain about', () => {
  assert.equal(validatePasswordChange(valid), null);
});

test('the current password is required', () => {
  assert.equal(
    validatePasswordChange({ ...valid, current: '' }),
    'Enter your current password.',
  );
});

test('a new password under twelve characters is refused', () => {
  assert.equal(
    validatePasswordChange({ ...valid, next: 'short pass', confirm: 'short pass' }),
    'The new password must be at least 12 characters.',
  );
});

test('a new password beyond two hundred characters is refused', () => {
  const long = 'x'.repeat(201);
  assert.equal(
    validatePasswordChange({ ...valid, next: long, confirm: long }),
    'The new password must be at most 200 characters.',
  );
});

test('the confirmation must match the new password', () => {
  assert.equal(
    validatePasswordChange({ ...valid, confirm: 'a brand new passphras' }),
    'The new passwords do not match.',
  );
});

test('the new password must actually be a change', () => {
  assert.equal(
    validatePasswordChange({ current: valid.current, next: valid.current, confirm: valid.current }),
    'The new password must be different from your current one.',
  );
});

test('length is reported before the confirmation mismatch', () => {
  assert.equal(
    validatePasswordChange({ ...valid, next: 'too short', confirm: 'mismatched too' }),
    'The new password must be at least 12 characters.',
  );
});
