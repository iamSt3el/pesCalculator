import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRupees, formatIndex, formatMonth } from '../src/format.ts';

test('formatRupees groups digits the Indian way', () => {
  assert.equal(formatRupees(21_717_359), '2,17,17,359');
  assert.equal(formatRupees(172_604), '1,72,604');
  assert.equal(formatRupees(0), '0');
});

test('formatRupees marks a negative amount with a true minus sign', () => {
  assert.equal(formatRupees(-18_356), '−18,356');
});

test('formatRupees keeps paise when asked', () => {
  assert.equal(formatRupees(-18_356.293, 2), '−18,356.29');
});

test('formatIndex shows a fixed number of decimals and an em dash for nothing', () => {
  assert.equal(formatIndex(92.766666666, 4), '92.7667');
  assert.equal(formatIndex(126.2, 4), '126.2000');
  assert.equal(formatIndex(null), '—');
});

test('formatMonth renders a month key for a person', () => {
  assert.equal(formatMonth('2023-09'), 'Sep 2023');
  assert.equal(formatMonth('2024-01'), 'Jan 2024');
});
