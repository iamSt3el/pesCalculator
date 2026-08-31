const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Indian digit grouping, with a typographic minus rather than a hyphen.
 * Money always carries its paise: two decimals, never more, never fewer.
 */
export function formatRupees(n: number, dp = 2): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  }).format(Math.abs(n));
  return (n < 0 ? '−' : '') + formatted;
}

export function formatIndex(n: number | null | undefined, dp = 4): string {
  return n === null || n === undefined ? '—' : n.toFixed(dp);
}

/**
 * Five of the six components are dimensionless indices, written to `dp`.
 * Bitumen is not an index at all — it is a rupee rate per tonne, so it is
 * written as money: grouped the Indian way, to the paise.
 *
 * Two decimals throughout. The engine averages a quarter as an exact `sum / 3`
 * and never rounds it, so every printed index is an approximation of a figure
 * the calculation holds in full — four decimals were no more the true mean
 * than two are, only longer.
 */
export function formatComponentIndex(
  n: number | null | undefined, key: string, dp = 2,
): string {
  if (n === null || n === undefined) return '—';
  return key === 'bitumen' ? formatRupees(n) : formatIndex(n, dp);
}

export function formatMonth(m: string): string {
  const [y, mm] = m.split('-');
  return `${MONTHS[Number(mm) - 1]} ${y}`;
}

/** '2023-Q3' -> 'Jul-Sep 2023' */
export function formatQuarter(q: string): string {
  const [y, n] = q.split('-Q');
  const first = (Number(n) - 1) * 3;
  return `${MONTHS[first]}–${MONTHS[first + 2]} ${y}`;
}

export function formatDate(d: string): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y}`;
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function under1000(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n]!;
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`;
  return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${under1000(n % 100)}` : ''}`;
}

/** A whole number on the Indian scale: crore, lakh, thousand, then the rest. */
function indianScale(v: number): string {
  const parts: string[] = [];
  const scales: Array<[number, string]> = [[10_000_000, 'crore'], [100_000, 'lakh'], [1000, 'thousand']];
  for (const [size, name] of scales) {
    const count = Math.floor(v / size);
    if (count > 0) { parts.push(`${under1000(count)} ${name}`); v -= count * size; }
  }
  if (v > 0) parts.push(under1000(v));
  return parts.join(' ');
}

/**
 * Rupees in words on the Indian scale, for the report's "Say in Rs." line.
 * Money is held to the paise, so the words carry the paise too — a bill whose
 * figure reads 72,603.63 and whose words read "…four rupees only" is a bill an
 * auditor will send back.
 */
export function rupeesInWords(n: number): string {
  const sign = n < 0 ? 'minus ' : '';
  const paise = Math.round(Math.abs(n) * 100);
  const rupees = Math.floor(paise / 100);
  const fraction = paise % 100;

  if (rupees === 0 && fraction === 0) return 'zero rupees only';
  const words = [
    rupees > 0 ? `${indianScale(rupees)} rupees` : '',
    fraction > 0 ? `${indianScale(fraction)} paise` : '',
  ].filter(Boolean).join(' and ');
  return `${sign}${words.charAt(0).toUpperCase()}${words.slice(1)} only`;
}
