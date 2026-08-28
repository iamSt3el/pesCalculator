const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Indian digit grouping, with a typographic minus rather than a hyphen. */
export function formatRupees(n: number, dp = 0): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  }).format(Math.abs(n));
  return (n < 0 ? '−' : '') + formatted;
}

export function formatIndex(n: number | null | undefined, dp = 4): string {
  return n === null || n === undefined ? '—' : n.toFixed(dp);
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

/** Rupees in words on the Indian scale, for the report's "Say in Rs." line. */
export function rupeesInWords(n: number): string {
  const sign = n < 0 ? 'minus ' : '';
  let v = Math.abs(Math.round(n));
  if (v === 0) return 'zero rupees only';
  const parts: string[] = [];
  const scales: Array<[number, string]> = [[10_000_000, 'crore'], [100_000, 'lakh'], [1000, 'thousand']];
  for (const [size, name] of scales) {
    const count = Math.floor(v / size);
    if (count > 0) { parts.push(`${under1000(count)} ${name}`); v -= count * size; }
  }
  if (v > 0) parts.push(under1000(v));
  const words = parts.join(' ');
  return `${sign}${words.charAt(0).toUpperCase()}${words.slice(1)} rupees only`;
}
