import { useRef, type KeyboardEvent, type RefObject } from 'react';

export interface CaretEdges {
  atStart: boolean;
  atEnd: boolean;
}

/**
 * Where the caret sits inside a control, as the grid needs to know it.
 *
 * `selectionStart` applies only to text, search, url, tel and password inputs.
 * On `type="number"` Chrome hands back null and Firefox throws, so the caller
 * passes null for both. Null means "this control has no caret to move through",
 * and the grid must then treat every horizontal press as a move between cells —
 * reading null as a caret parked mid-value is what silently disabled left and
 * right on the rates chart.
 */
export function caretEdges(value: string, start: number | null, end: number | null): CaretEdges {
  if (start === null || end === null) return { atStart: true, atEnd: true };
  return { atStart: start === 0, atEnd: end === value.length };
}

export interface CellMove {
  r: number;
  c: number;
}

/**
 * The cell a key press should move focus to, or null to let the key do its
 * ordinary work. Bounds are the caller's business — see `useGridKeys`.
 *
 * `hasCaret` is false for a <select>, which owns the vertical arrows: they are
 * how it picks an option, and stealing them would break the control.
 */
export function nextCell(
  key: string,
  r: number,
  c: number,
  edges: CaretEdges,
  hasCaret: boolean,
): CellMove | null {
  if (key === 'Enter') return { r: r + 1, c };
  if (hasCaret && key === 'ArrowDown') return { r: r + 1, c };
  if (hasCaret && key === 'ArrowUp') return { r: r - 1, c };
  if (key === 'ArrowLeft' && edges.atStart) return { r, c: c - 1 };
  if (key === 'ArrowRight' && edges.atEnd) return { r, c: c + 1 };
  return null;
}

type Cell = HTMLInputElement | HTMLSelectElement;

/**
 * Arrow keys and Enter move between cells, because this is a grid of figures
 * and every other grid of figures behaves this way. Without it, entering a
 * month of published indices means seven reaches for the mouse, or a tab route
 * that runs off the end of the row into the delete button.
 *
 * Mark each control with `data-r` and `data-c` and hand it this `onKeyDown`;
 * put the `grid` ref on the <tbody>.
 */
export function useGridKeys(rowCount: number, colCount: number): {
  grid: RefObject<HTMLTableSectionElement | null>;
  onKeyDown: (e: KeyboardEvent<Cell>) => void;
} {
  const grid = useRef<HTMLTableSectionElement>(null);

  const focusCell = (r: number, c: number): boolean => {
    if (r < 0 || r >= rowCount || c < 0 || c >= colCount) return false;
    const el = grid.current?.querySelector<Cell>(`[data-r="${r}"][data-c="${c}"]`);
    if (!el) return false;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<Cell>) => {
    const el = e.currentTarget;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return;

    const isInput = el instanceof HTMLInputElement;
    let edges: CaretEdges = { atStart: true, atEnd: true };
    if (isInput) {
      // Firefox throws outright rather than returning null for a number input.
      try {
        edges = caretEdges(el.value, el.selectionStart, el.selectionEnd);
      } catch {
        edges = { atStart: true, atEnd: true };
      }
    }

    /**
     * Consuming the key and landing on a cell are two different questions, and
     * this used to prevent the default only when the move succeeded. At the
     * edge of the grid there is nowhere to land, so the press fell through to
     * the browser — and `input type=number` answers ArrowUp by stepping its
     * value. Pressing up on the top row of the payment schedule wrote 0.01
     * into an empty rupee cell, pressing down on the last row turned
     * −8,00,000 into −8,00,000.01, and the debounced saver wrote both to the
     * database. The operator's report was that navigation "sometimes changes
     * the value"; sometimes meant at the first and last row.
     *
     * A key the grid claims is the grid's, whether or not there is a cell to
     * move to. Off the end, the right answer is to stay put and do nothing.
     */
    const move = nextCell(e.key, r, c, edges, isInput);
    if (!move) return;
    focusCell(move.r, move.c);
    e.preventDefault();
  };

  return { grid, onKeyDown };
}
