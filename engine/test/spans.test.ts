import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateRupees, buildSchedule, computeSpans, monthlyExact, spanPerDay, workedDays,
} from '../src/spans.ts';
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

test('a fully allocated period bills at value over the days of the span', () => {
  const rates = spanPerDay(spans);
  assert.equal(rates[0], W / 8 / 38);
  assert.ok(Math.abs(rates[2]! - 214316.0427631579) < 1e-6);
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
  const alloc = allocateRupees(monthly);
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
  const alloc = allocateRupees(monthlyExact(progress, spans));
  for (const v of alloc.values()) assert.equal(Number.isInteger(v), true);
});

test('buildSchedule applies adjustments and groups by calendar quarter', () => {
  const adjustments = new Map<string, number>([
    ['2023-10', 500_000], ['2023-11', 800_000], ['2023-12', 400_000],
    ['2024-01', -900_000], ['2024-02', -800_000],
  ]);
  const sched = buildSchedule(progress, spans, adjustments);
  assert.equal(sched.total, W);
  assert.equal(sched.rows.find((r) => r.month === '2023-10')!.payment, 2_714_599);
  assert.equal(sched.byQuarter.get('2023-Q3'), 428_632);
  assert.equal(sched.byQuarter.get('2023-Q4'), 14_130_330);
  assert.equal(sched.byQuarter.get('2024-Q1'), 7_158_397);
});

test('buildSchedule includes a month that has only an adjustment', () => {
  const sched = buildSchedule(progress, spans, new Map([['2024-03', 1000]]));
  const march = sched.rows.find((r) => r.month === '2024-03');
  assert.equal(march?.computed, 0);
  assert.equal(march?.payment, 1000);
});

// A period whose spans are easy to read: 46/45/46/45 days carrying
// 7,50,000 / 15,00,000 / 22,50,000 / 15,00,000 of a 60,00,000 work done amount.
const WG = 6_000_000;
const gapSpans = computeSpans('2023-04-01', '2023-09-30', WG);

/** July idle. It sits wholly inside span 3, which also covers half of August. */
const julyIdle: ProgressRow[] = [
  { month: '2023-04', spanDays: [30, 0, 0, 0] },
  { month: '2023-05', spanDays: [16, 15, 0, 0] },
  { month: '2023-06', spanDays: [0, 30, 0, 0] },
  { month: '2023-07', spanDays: [0, 0, 0, 0] },
  { month: '2023-08', spanDays: [0, 0, 15, 16] },
  { month: '2023-09', spanDays: [0, 0, 0, 29] },
];

test('workedDays totals the days recorded against each span', () => {
  assert.deepEqual(workedDays(julyIdle), [46, 45, 15, 45]);
});

test('spanPerDay divides a span value by the days the span itself holds', () => {
  const rates = spanPerDay(gapSpans);
  // Span 3 lost July, but its rate is unmoved: 22,50,000 over the 46 days it spans.
  assert.equal(rates[2], 2_250_000 / 46);
  assert.equal(rates[0], 750_000 / 46);
});

test('a month bills its own days alone, whatever the other months record', () => {
  const sched = buildSchedule(julyIdle, gapSpans, new Map());
  assert.equal(sched.rows.find((r) => r.month === '2023-07'), undefined);
  // August's 15 days of span 3 and 16 of span 4 at each span's own rate.
  const august = 15 * (2_250_000 / 46) + 16 * (1_500_000 / 45);
  // Whole rupees, allocated by largest remainder, so it lands within one of the exact figure.
  assert.ok(Math.abs(sched.rows.find((r) => r.month === '2023-08')!.computed - august) <= 1);
  // July's 31 unrecorded days of span 3 are simply not billed.
  assert.ok(sched.total < WG);
});

test('a day entered in one month leaves the other months alone', () => {
  const before = buildSchedule(julyIdle, gapSpans, new Map());
  const after = buildSchedule(
    julyIdle.map((r) => (r.month === '2023-07' ? { month: r.month, spanDays: [0, 0, 1, 0] as [number, number, number, number] } : r)),
    gapSpans, new Map(),
  );
  for (const month of ['2023-04', '2023-05', '2023-06', '2023-08', '2023-09']) {
    assert.equal(
      after.rows.find((r) => r.month === month)!.computed,
      before.rows.find((r) => r.month === month)!.computed,
      `${month} moved`,
    );
  }
});

test('a span with no worked days at all leaves the schedule short', () => {
  const spanIdle: ProgressRow[] = [
    { month: '2023-04', spanDays: [30, 0, 0, 0] },
    { month: '2023-05', spanDays: [16, 15, 0, 0] },
    { month: '2023-06', spanDays: [0, 30, 0, 0] },
    { month: '2023-07', spanDays: [0, 0, 31, 0] },
    { month: '2023-08', spanDays: [0, 0, 15, 0] },
  ];
  // Span 4's 15,00,000 has nowhere to go, and the operator has to be told.
  assert.equal(buildSchedule(spanIdle, gapSpans, new Map()).total, 4_500_000);
});

test('the schedule reports the days recorded and the rate each span bills at', () => {
  const sched = buildSchedule(julyIdle, gapSpans, new Map());
  assert.deepEqual(sched.workedDays, [46, 45, 15, 45]);
  assert.equal(sched.perDay[2], 2_250_000 / 46);
});
