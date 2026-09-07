import type { IsoDate, Month, Quarter } from './types.ts';

/** Parse 'YYYY-MM-DD' as a UTC timestamp. Local time would shift months. */
function utc(d: IsoDate): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

function iso(ts: number): IsoDate {
  return new Date(ts).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

export function monthOfDate(d: IsoDate): Month {
  return d.slice(0, 7);
}

export function dayOfMonth(d: IsoDate): number {
  return Number(d.slice(8, 10));
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return iso(utc(d) + n * DAY_MS);
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

export function quarterOfMonth(m: Month): Quarter {
  const [y, mm] = m.split('-').map(Number) as [number, number];
  return `${y}-Q${Math.floor((mm - 1) / 3) + 1}`;
}

export function monthsOfQuarter(q: Quarter): [Month, Month, Month] {
  const [ys, qs] = q.split('-Q') as [string, string];
  const first = (Number(qs) - 1) * 3 + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return [`${ys}-${pad(first)}`, `${ys}-${pad(first + 1)}`, `${ys}-${pad(first + 2)}`];
}

/**
 * Excel ROUND semantics: ties go away from zero.
 * Math.round is half-up, which rounds -1.5 to -1 instead of -2.
 */
export function roundHalfAwayFromZero(x: number, dp = 0): number {
  const f = 10 ** dp;
  const scaled = x * f;
  // Nudge past float representation error (e.g. 1.005*100 === 100.49999999999999)
  const corrected = Number(scaled.toPrecision(12));
  return (corrected < 0 ? -Math.round(-corrected) : Math.round(corrected)) / f;
}

/** The month after this one, stepped on an ordinal so no Date is involved. */
function nextMonth(m: Month): Month {
  const [y, n] = m.split('-').map(Number) as [number, number];
  return n === 12 ? `${y + 1}-01` : `${y}-${String(n + 1).padStart(2, '0')}`;
}

/**
 * The days of each month that fall inside the period, in order.
 *
 * `daysBetween` is a difference, so the commencement day is day zero and the
 * first day worked is the one after it: a contract commencing on 24-Sep offers
 * six days of September, not thirty. These counts partition the period exactly,
 * which is what lets the days recorded in a month be measured against them.
 */
export function availableDays(
  commencement: IsoDate, actualCompletion: IsoDate,
): Map<Month, number> {
  const out = new Map<Month, number>();
  if (!commencement || !actualCompletion || actualCompletion < commencement) return out;

  const last = monthOfDate(actualCompletion);
  for (let m = monthOfDate(commencement); m <= last; m = nextMonth(m)) {
    const dayBeforeFirst = addDays(`${m}-01`, -1);
    const lastOfMonth = addDays(`${nextMonth(m)}-01`, -1);
    const lo = commencement > dayBeforeFirst ? commencement : dayBeforeFirst;
    const hi = actualCompletion < lastOfMonth ? actualCompletion : lastOfMonth;
    out.set(m, Math.max(0, daysBetween(lo, hi)));
  }
  return out;
}
