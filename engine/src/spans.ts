import { addDays, daysBetween, quarterOfMonth, roundHalfAwayFromZero } from './dates.ts';
import type { IsoDate, Month, ProgressRow, Quarter } from './types.ts';

export interface SpanTable {
  totalDays: number;
  days: [number, number, number, number];
  values: [number, number, number, number];
  perDay: [number, number, number, number];
  endDates: [IsoDate, IsoDate, IsoDate, IsoDate];
}

/**
 * Spec 3.1. The period is cut at 1/4, 1/2, 3/4 and full; the work value follows
 * the standard S-curve, cumulative 1/8, 3/8, 3/4, 1 - so each span carries
 * 1/8, 1/4, 3/8, 1/4 of the total.
 */
export function computeSpans(
  commencement: IsoDate,
  actualCompletion: IsoDate,
  workDoneAmount: number,
): SpanTable {
  const P = daysBetween(commencement, actualCompletion);
  const b = [
    roundHalfAwayFromZero(P / 4),
    roundHalfAwayFromZero(P / 2),
    roundHalfAwayFromZero((P * 3) / 4),
    P,
  ] as const;
  const days: [number, number, number, number] =
    [b[0], b[1] - b[0], b[2] - b[1], b[3] - b[2]];

  const W = workDoneAmount;
  const cumulative = [W / 8, (W * 3) / 8, (W * 3) / 4, W] as const;
  const values: [number, number, number, number] = [
    cumulative[0],
    cumulative[1] - cumulative[0],
    cumulative[2] - cumulative[1],
    cumulative[3] - cumulative[2],
  ];

  const perDay: [number, number, number, number] = [
    days[0] === 0 ? 0 : values[0] / days[0],
    days[1] === 0 ? 0 : values[1] / days[1],
    days[2] === 0 ? 0 : values[2] / days[2],
    days[3] === 0 ? 0 : values[3] / days[3],
  ];

  let cursor = commencement;
  const endDates = days.map((d) => (cursor = addDays(cursor, d))) as
    [IsoDate, IsoDate, IsoDate, IsoDate];

  return { totalDays: P, days, values, perDay, endDates };
}

/** Exact, unrounded amount earned in each month across all four spans. */
export function monthlyExact(progress: ProgressRow[], spans: SpanTable): Map<Month, number> {
  const out = new Map<Month, number>();
  for (const row of progress) {
    let amount = 0;
    for (let i = 0; i < 4; i++) amount += (row.spanDays[i] ?? 0) * (spans.perDay[i] ?? 0);
    out.set(row.month, (out.get(row.month) ?? 0) + amount);
  }
  return out;
}

/**
 * Largest-remainder allocation. Rounding each month independently loses money:
 * the source contract's six months round to one rupee under the work done amount.
 * Floor everything, then hand the shortfall to the largest discarded fractions.
 */
export function allocateRupees(exact: Map<Month, number>, total: number): Map<Month, number> {
  const entries = [...exact.entries()];
  const floors = entries.map(([m, v]) => ({ month: m, floor: Math.floor(v), frac: v - Math.floor(v) }));
  const allocated = floors.reduce((a, f) => a + f.floor, 0);
  let shortfall = Math.round(total - allocated);

  const byFraction = [...floors].sort((a, b) => b.frac - a.frac || a.month.localeCompare(b.month));
  const bump = new Map<Month, number>();
  for (const f of byFraction) {
    if (shortfall <= 0) break;
    bump.set(f.month, 1);
    shortfall--;
  }

  return new Map(floors.map((f) => [f.month, f.floor + (bump.get(f.month) ?? 0)]));
}

export interface ScheduleRow {
  month: Month;
  computed: number;
  adjustment: number;
  payment: number;
}

export interface PaymentSchedule {
  rows: ScheduleRow[];
  total: number;
  byQuarter: Map<Quarter, number>;
}

/**
 * Spec 3.5. Lists every month with a non-zero computed amount, plus any month
 * carrying an operator adjustment.
 */
export function buildSchedule(
  progress: ProgressRow[],
  spans: SpanTable,
  workDoneAmount: number,
  adjustments: Map<Month, number>,
): PaymentSchedule {
  const exact = monthlyExact(progress, spans);
  for (const [m, v] of exact) if (v === 0) exact.delete(m);
  const allocated = allocateRupees(exact, workDoneAmount);

  const months = new Set<Month>([...allocated.keys(), ...adjustments.keys()]);
  const rows: ScheduleRow[] = [...months].sort().map((month) => {
    const computed = allocated.get(month) ?? 0;
    const adjustment = adjustments.get(month) ?? 0;
    return { month, computed, adjustment, payment: computed + adjustment };
  });

  const byQuarter = new Map<Quarter, number>();
  for (const r of rows) {
    const q = quarterOfMonth(r.month);
    byQuarter.set(q, (byQuarter.get(q) ?? 0) + r.payment);
  }

  const total = roundHalfAwayFromZero(rows.reduce((a, r) => a + r.payment, 0), 2);
  return { rows, total, byQuarter };
}
