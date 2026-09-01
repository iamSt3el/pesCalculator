import type { ReactNode } from 'react';
import { formatDate } from '../format.ts';
import { provisionalNotice, sheetLabel, todayIso } from '../sheets.ts';

/**
 * One sheet of the printed set, with the page furniture `@page { margin: 0 }`
 * takes away: who this bill belongs to at the top, and which sheet of how many
 * — with the date it was prepared — at the foot.
 *
 * It is a table, and that is not decoration. A sheet longer than one page used
 * to carry its head and foot on the first page only, and every page after it
 * began at the very edge of the paper, inside the band a laser printer cannot
 * reach — the Steel and POL blocks of Agreement 168 printed 2mm from the top
 * edge. `thead` and `tfoot` are the one mechanism Chrome repeats on every page
 * of a fragmented box, so the head, the foot, and the 14mm of clear paper they
 * carry with them are now on every page of the sheet.
 *
 * `position: fixed` was tried and measured: Chrome repeats it, but places it
 * against the document rather than the page, so on page two the foot printed
 * near the top and the head near the bottom. It is not an option.
 *
 * Because each sheet is its own table, `Sheet n of m` stays true — the count
 * names the section, not the page.
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
    <table className={`sheet${last ? ' sheet--last' : ''}`}>
      <thead>
        <tr>
          <th>
            <div className="sheet-head">
              <span>
                <strong>{name}</strong>
                {contractor && <> · {contractor}</>}
              </span>
              <span>Price escalation · Clause-45</span>
            </div>
          </th>
        </tr>
      </thead>

      <tfoot>
        <tr>
          <td>
            <div className="sheet-foot">
              <span>{notice ?? name}</span>
              <span>{sheetLabel(index, total)} · prepared {formatDate(todayIso())}</span>
            </div>
          </td>
        </tr>
      </tfoot>

      <tbody>
        <tr><td className="sheet__body">{children}</td></tr>
      </tbody>
    </table>
  );
}
