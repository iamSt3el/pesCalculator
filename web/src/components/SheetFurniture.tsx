import type { ReactNode } from 'react';
import { formatDate } from '../format.ts';
import { provisionalNotice, todayIso } from '../sheets.ts';

/**
 * One sheet of paper's worth of page furniture: who this bill belongs to at
 * the top, and what the sheet is — with the date it was prepared — at the
 * foot. `@page { margin: 0 }` takes all of that away, deliberately, so that
 * Chrome cannot draw a URL strip across the sheet; this puts it back.
 *
 * It is a table, and that is not decoration. A sheet longer than one page used
 * to carry its head and foot on the first page only, and every page after it
 * began at the very edge of the paper, inside the band a laser printer cannot
 * reach — the Steel and POL blocks of Agreement 168 printed 2mm from the top
 * edge. `thead` and `tfoot` are the one mechanism Chrome repeats on every page
 * of a fragmented box, so the head, the foot, and the 14mm of clear paper they
 * carry with them are now on every page.
 *
 * `position: fixed` was tried and measured: Chrome repeats it, but places it
 * against the document rather than the page, so on page two the foot printed
 * near the top and the head near the bottom. It is not an option.
 *
 * Used twice over. The filed set gives each of its three sheets one of these,
 * labelled `Sheet 2 of 3` — the count names the section, not the page, which
 * is why it stays true when a section runs to two pages. Every working stage
 * is wrapped in one too, labelled with the stage's own name, so that a page
 * printed from Index Average or the Rates Chart carries margins and says which
 * contract it belongs to. On screen the stage's furniture is hidden: the
 * running head already names the contract there.
 */
export function SheetFurniture({
  label, agreementNo, contractor, problemCount, last = false, stage = false, children,
}: {
  /** 'Sheet 2 of 3' in the filed set; the stage's name on a working page. */
  label: string;
  agreementNo: string;
  contractor: string;
  problemCount: number;
  last?: boolean;
  /** A working stage rather than a sheet of the filed set: hidden on screen. */
  stage?: boolean;
  children: ReactNode;
}) {
  const name = agreementNo || 'Untitled contract';
  const notice = provisionalNotice(problemCount);
  return (
    <table className={`sheet${last ? ' sheet--last' : ''}${stage ? ' sheet--stage' : ''}`}>
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
              <span>{label} · prepared {formatDate(todayIso())}</span>
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
