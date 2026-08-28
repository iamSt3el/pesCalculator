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
