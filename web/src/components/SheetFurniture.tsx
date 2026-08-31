import type { ReactNode } from 'react';
import { formatDate } from '../format.ts';
import { provisionalNotice, sheetLabel, todayIso } from '../sheets.ts';

/**
 * One sheet of the printed set, with the page furniture `@page { margin: 0 }`
 * takes away: who this bill belongs to at the top, and which sheet of how many
 * — with the date it was prepared — at the foot.
 *
 * It wraps its content rather than sitting beside it, because the foot has to
 * fall below the body and a fragment of two siblings cannot do that.
 *
 * Known limitation: the furniture is per-sheet, so a sheet that overflows onto
 * a second physical page carries it on the first page only. Chrome does not
 * support @page margin boxes, and a position:fixed element repeats identical
 * content on every page — which would print the wrong sheet number. If a sheet
 * starts overflowing, reduce that sheet's density; do not reach for fixed.
 */
export function SheetFurniture({
  index, total, agreementNo, contractor, problemCount, last = false, children,
}: {
  index: number;
  total: number;
  agreementNo: string;
  contractor: string;
  problemCount: number;
  last?: boolean;
  children: ReactNode;
}) {
  const name = agreementNo || 'Untitled contract';
  const notice = provisionalNotice(problemCount);
  return (
    <section className={`sheet${last ? ' sheet--last' : ''}`}>
      <div className="sheet-head">
        <span>
          <strong>{name}</strong>
          {contractor && <> · {contractor}</>}
        </span>
        <span>Price escalation · Clause-45</span>
      </div>

      <div className="sheet__body">{children}</div>

      <div className="sheet-foot">
        <span>{notice ?? name}</span>
        <span>{sheetLabel(index, total)} · prepared {formatDate(todayIso())}</span>
      </div>
    </section>
  );
}
