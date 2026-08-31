/**
 * Page furniture for the printed set. `@page { margin: 0 }` suppresses the
 * browser's own header strip — deliberately, so Chrome cannot draw a URL
 * across the sheet — and nothing replaced it, so three sheets came off the
 * printer with no page numbers and no date of preparation.
 */

/** 'Sheet 2 of 3'. The total is passed in, never assumed. */
export function sheetLabel(index: number, total: number): string {
  return `Sheet ${index + 1} of ${total}`;
}

/**
 * The line every sheet of a provisional bill carries in its foot, so a page
 * that gets separated from the set still declares itself.
 */
export function provisionalNotice(problemCount: number): string | null {
  if (problemCount <= 0) return null;
  return `Provisional — ${problemCount} item${problemCount === 1 ? '' : 's'} outstanding`;
}

/**
 * Today as the app writes dates, in local time. `toISOString` would be wrong:
 * it converts to UTC, so a bill prepared after half past five in the evening
 * in Asia/Kolkata would print the previous day.
 */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
