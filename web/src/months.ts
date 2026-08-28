/**
 * Month keys are 'YYYY-MM' strings throughout. They sort correctly as text,
 * so the only arithmetic needed is stepping forwards, which is done on an
 * ordinal — year * 12 + month — rather than through Date, whose timezone
 * handling can slide a bare month into the one before it.
 */

/** How far past today the chart is worth offering. */
const HORIZON = 6;
/** Most quick-add chips to show at once, however far behind the chart is. */
const MOST_OFFERED = 12;

const toOrdinal = (month: string): number => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return y * 12 + (m - 1);
};

const fromOrdinal = (n: number): string =>
  `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;

/** The month we are in, as a month key. */
export const thisMonth = (): string => new Date().toISOString().slice(0, 7);

/** Every month from `first` to `last`, both ends included. */
export function monthsBetween(first: string, last: string): string[] {
  const from = toOrdinal(first);
  const to = toOrdinal(last);
  if (to < from) return [];
  return Array.from({ length: to - from + 1 }, (_, i) => fromOrdinal(from + i));
}

/**
 * The month after the last one in the chart — the one you almost always want
 * next. An empty chart falls back to `today`.
 */
export function nextMonthAfter(months: string[], today = thisMonth()): string {
  const last = [...months].sort().at(-1);
  return last ? fromOrdinal(toOrdinal(last) + 1) : today;
}

/**
 * The months the chart does not reach yet: from where it leaves off through
 * six past today, so the next figures to publish are always one click away.
 */
export function furtherMonths(months: string[], today = thisMonth()): string[] {
  const start = nextMonthAfter(months, today);
  const horizon = fromOrdinal(toOrdinal(today) + HORIZON);
  return monthsBetween(start, horizon).slice(0, MOST_OFFERED);
}

/** '2023-Q3' -> the three month keys it covers. */
export function monthsOfQuarter(quarter: string): string[] {
  const [y, n] = quarter.split('-Q');
  const first = (Number(n) - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${y}-${String(first + i).padStart(2, '0')}`);
}
