import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpans, monthlyExact, allocateRupees, buildSchedule } from '../src/spans.ts';
import type { ProgressRow } from '../src/types.ts';

const W = 21_717_359;
const spans = computeSpans('2023-09-24', '2024-02-23', W);

const progress: ProgressRow[] = [
  { month: '2023-09', spanDays: [6, 0, 0, 0] },
  { month: '2023-10', spanDays: [31, 0, 0, 0] },
  { month: '2023-11', spanDays: [1, 29, 0, 0] },
  { month: '2023-12', spanDays: [0, 9, 22, 0] },
  { month: '2024-01', spanDays: [0, 0, 16, 15] },
  { month: '2024-02', spanDays: [0, 0, 0, 23] },
];

test('computeSpans splits the period into four quarters of time', () => {
  assert.equal(spans.totalDays, 152);
  assert.deepEqual(spans.days, [38, 38, 38, 38]);
});

test('computeSpans splits value 1/8, 1/4, 3/8, 1/4 and they sum to the whole', () => {
  assert.deepEqual(spans.values, [W / 8, W / 4, (W * 3) / 8, W / 4]);
  assert.equal(spans.values.reduce((a, b) => a + b, 0), W);
});

test('computeSpans dates each span end from the commencement date', () => {
  assert.deepEqual(spans.endDates, ['2023-11-01', '2023-12-09', '2024-01-16', '2024-02-23']);
});

test('computeSpans derives per-day rates from value over days', () => {
  assert.equal(spans.perDay[0], W / 8 / 38);
  assert.ok(Math.abs(spans.perDay[2]! - 214316.0427631579) < 1e-6);
});

test('monthlyExact multiplies days by the rate of their own span', () => {
  const monthly = monthlyExact(progress, spans);
  assert.ok(Math.abs(monthly.get('2023-09')! - 428632.0855263158) < 1e-6);
  assert.ok(Math.abs(monthly.get('2023-12')! - 6000849.197368421) < 1e-6);
  const sum = [...monthly.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - W) < 1e-6);
});

test('allocateRupees preserves the total instead of rounding each month down', () => {
  const monthly = monthlyExact(progress, spans);
  const alloc = allocateRupees(monthly, W);
  // Independent rounding would total 21717358 - one rupee short.
  assert.equal([...alloc.values()].reduce((a, b) => a + b, 0), W);
  assert.equal(alloc.get('2023-09'), 428_632);
  assert.equal(alloc.get('2023-10'), 2_214_599);
  assert.equal(alloc.get('2023-11'), 4_214_882);
  assert.equal(alloc.get('2023-12'), 6_000_849);
  assert.equal(alloc.get('2024-01'), 5_572_217);
  // Feb carries the largest discarded fraction (.32) so it takes the spare rupee.
  assert.equal(alloc.get('2024-02'), 3_286_180);
});

test('allocateRupees gives every month a whole number of rupees', () => {
  const alloc = allocateRupees(monthlyExact(progress, spans), W);
  for (const v of alloc.values()) assert.equal(Number.isInteger(v), true);
});

test('buildSchedule applies adjustments and groups by calendar quarter', () => {
  const adjustments = new Map<string, number>([
    ['2023-10', 500_000], ['2023-11', 800_000], ['2023-12', 400_000],
    ['2024-01', -900_000], ['2024-02', -800_000],
  ]);
  const sched = buildSchedule(progress, spans, W, adjustments);
  assert.equal(sched.total, W);
  assert.equal(sched.rows.find((r) => r.month === '2023-10')!.payment, 2_714_599);
  assert.equal(sched.byQuarter.get('2023-Q3'), 428_632);
  assert.equal(sched.byQuarter.get('2023-Q4'), 14_130_330);
  assert.equal(sched.byQuarter.get('2024-Q1'), 7_158_397);
});

test('buildSchedule includes a month that has only an adjustment', () => {
  const sched = buildSchedule(progress, spans, W, new Map([['2024-03', 1000]]));
  const march = sched.rows.find((r) => r.month === '2024-03');
  assert.equal(march?.computed, 0);
  assert.equal(march?.payment, 1000);
});
