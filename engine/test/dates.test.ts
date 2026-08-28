import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monthOfDate, addDays, daysBetween, quarterOfMonth,
  monthsOfQuarter, roundHalfAwayFromZero,
} from '../src/dates.ts';

test('monthOfDate truncates a date to its month', () => {
  assert.equal(monthOfDate('2023-09-12'), '2023-09');
  assert.equal(monthOfDate('2024-01-01'), '2024-01');
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2023-09-12', -28), '2023-08-15');
  assert.equal(addDays('2023-12-31', 1), '2024-01-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29'); // leap year
});

test('daysBetween counts the work period', () => {
  assert.equal(daysBetween('2023-09-24', '2024-02-23'), 152);
  assert.equal(daysBetween('2024-02-23', '2023-09-24'), -152);
});

test('quarterOfMonth groups into calendar quarters', () => {
  assert.equal(quarterOfMonth('2023-09'), '2023-Q3');
  assert.equal(quarterOfMonth('2023-10'), '2023-Q4');
  assert.equal(quarterOfMonth('2024-01'), '2024-Q1');
});

test('monthsOfQuarter expands a quarter, including across a year boundary', () => {
  assert.deepEqual(monthsOfQuarter('2023-Q3'), ['2023-07', '2023-08', '2023-09']);
  assert.deepEqual(monthsOfQuarter('2024-Q1'), ['2024-01', '2024-02', '2024-03']);
});

test('roundHalfAwayFromZero matches Excel ROUND, including negatives', () => {
  assert.equal(roundHalfAwayFromZero(38), 38);
  assert.equal(roundHalfAwayFromZero(0.5), 1);
  assert.equal(roundHalfAwayFromZero(-0.5), -1);   // Math.round gives -0 here
  assert.equal(roundHalfAwayFromZero(-1.5), -2);   // Math.round gives -1 here
  assert.equal(roundHalfAwayFromZero(172603.9973), 172604);
  assert.equal(roundHalfAwayFromZero(-18356.293429, 2), -18356.29);
});
