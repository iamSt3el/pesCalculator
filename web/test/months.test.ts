import test from 'node:test';
import assert from 'node:assert/strict';
import { furtherMonths, monthsBetween, monthsOfQuarter, neededMonths, nextMonthAfter } from '../src/months.ts';

test('nextMonthAfter takes the month following the last one in the chart', () => {
  assert.equal(nextMonthAfter(['2023-04', '2026-05', '2026-06']), '2026-07');
});

test('nextMonthAfter rolls over the year end', () => {
  assert.equal(nextMonthAfter(['2026-12']), '2027-01');
});

test('nextMonthAfter falls back to the given month for an empty chart', () => {
  assert.equal(nextMonthAfter([], '2026-08'), '2026-08');
});

test('furtherMonths offers every month from the chart end through six past today', () => {
  assert.deepEqual(
    furtherMonths(['2026-05', '2026-06'], '2026-08'),
    ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'],
  );
});

test('furtherMonths still offers the six ahead when the chart is already current', () => {
  assert.deepEqual(
    furtherMonths(['2026-08'], '2026-08'),
    ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'],
  );
});

test('furtherMonths caps a chart left far behind at twelve months', () => {
  const offered = furtherMonths(['2020-01'], '2026-08');
  assert.equal(offered.length, 12);
  assert.equal(offered[0], '2020-02');
});

test('furtherMonths offers nothing beyond the horizon when the chart runs ahead of it', () => {
  assert.deepEqual(furtherMonths(['2027-06'], '2026-08'), []);
});

test('furtherMonths starts from today when the chart is empty', () => {
  assert.equal(furtherMonths([], '2026-08')[0], '2026-08');
});

test('monthsBetween fills the months a chart is missing in the middle of its range', () => {
  assert.deepEqual(monthsBetween('2026-05', '2026-08'), ['2026-05', '2026-06', '2026-07', '2026-08']);
});

test('monthsBetween returns the single month when both ends are the same', () => {
  assert.deepEqual(monthsBetween('2026-05', '2026-05'), ['2026-05']);
});

test('monthsOfQuarter names the three months of a financial quarter', () => {
  assert.deepEqual(monthsOfQuarter('2023-Q3'), ['2023-07', '2023-08', '2023-09']);
  assert.deepEqual(monthsOfQuarter('2024-Q1'), ['2024-01', '2024-02', '2024-03']);
  assert.deepEqual(monthsOfQuarter('2024-Q4'), ['2024-10', '2024-11', '2024-12']);
});

test('neededMonths gathers every month the bill reads, from all three sources', () => {
  const needed = neededMonths({
    quarters: ['2023-Q3'],
    schedule: { rows: [{ month: '2023-11' }, { month: '2023-12' }] },
    bases: {
      labour: { sourceMonths: ['2023-07', '2023-08', '2023-09'] },
      bitumen: { sourceMonths: ['2023-08'] },
    },
  });
  assert.deepEqual([...needed].sort(),
    ['2023-07', '2023-08', '2023-09', '2023-11', '2023-12']);
});

test('neededMonths is empty when there is no calculation to read', () => {
  assert.equal(neededMonths(null).size, 0);
});
