import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRupees, formatComponentIndex, formatIndex, formatMonth, rupeesInWords,
} from '../src/format.ts';

test('formatRupees groups digits the Indian way', () => {
  assert.equal(formatRupees(21_717_359), '2,17,17,359.00');
  assert.equal(formatRupees(172_604), '1,72,604.00');
  assert.equal(formatRupees(0), '0.00');
});

test('formatRupees marks a negative amount with a true minus sign', () => {
  assert.equal(formatRupees(-18_356), '−18,356.00');
});

test('formatRupees writes money to the paise and no finer', () => {
  assert.equal(formatRupees(-18_356.293), '−18,356.29');
  assert.equal(formatRupees(1234.5), '1,234.50');
  assert.equal(formatRupees(1234.567), '1,234.57');
});

test('formatRupees still takes an explicit precision', () => {
  assert.equal(formatRupees(1234.56, 0), '1,235');
});

test('formatComponentIndex writes bitumen as money and the rest as indices', () => {
  assert.equal(formatComponentIndex(39_808.666666, 'bitumen'), '39,808.67');
  assert.equal(formatComponentIndex(92.766666666, 'steel'), '92.77');
  assert.equal(formatComponentIndex(99.1, 'labour'), '99.10');
  assert.equal(formatComponentIndex(126.2, 'labour'), '126.20');
  assert.equal(formatComponentIndex(null, 'bitumen'), '—');
});

test('formatComponentIndex still takes an explicit precision', () => {
  assert.equal(formatComponentIndex(92.766666666, 'steel', 4), '92.7667');
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

test('rupeesInWords writes the rupees and the paise on the Indian scale', () => {
  assert.equal(rupeesInWords(172_604), 'One lakh seventy-two thousand six hundred four rupees only');
  assert.equal(
    rupeesInWords(72_603.63),
    'Seventy-two thousand six hundred three rupees and sixty-three paise only',
  );
  assert.equal(rupeesInWords(0.5), 'Fifty paise only');
  assert.equal(rupeesInWords(0), 'zero rupees only');
  assert.equal(rupeesInWords(-18_356.05), 'minus Eighteen thousand three hundred fifty-six rupees and five paise only');
});
