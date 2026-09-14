import { useState } from 'react';
import { api, SCHEDULE_BASIS_LABELS, type AdjustmentRow, type ScheduleBasis } from '../api.ts';
import { useContract, useReportSave } from '../ContractLayout.tsx';
import { useGridKeys } from '../grid.ts';
import { formatMonth, formatQuarter, formatRupees } from '../format.ts';
import { useDebouncedSave, useSettle } from '../hooks.ts';

/** The adjustment column stores two decimals, so the field cannot go finer. */
const toPaise = (raw: string): number => Math.round(Number(raw) * 100) / 100 || 0;

function Computed({ value }: { value: number }) {
  const settle = useSettle(value);
  return <span className={`num ${settle}`}>{formatRupees(value)}</span>;
}

export function ScheduleTable() {
  const { bundle, calculation, reload } = useContract();
  const [rows, setRows] = useState<AdjustmentRow[]>(bundle.adjustments);
  const [basis, setBasis] = useState<ScheduleBasis>(bundle.contract.scheduleBasis);

  const saver = useDebouncedSave<AdjustmentRow[]>(async (next) => {
    await api.putPayments(bundle.contract.id, next.filter((r) => r.adjustment !== 0));
    await reload();
  });
  const basisSaver = useDebouncedSave<ScheduleBasis>(async (next) => {
    await api.putContract(bundle.contract.id, { scheduleBasis: next });
    await reload();
  });

  useReportSave('schedule', saver.saving, saver.error);
  useReportSave('scheduleBasis', basisSaver.saving, basisSaver.error);

  const { grid, onKeyDown } = useGridKeys(calculation?.schedule.rows.length ?? 0, 1);

  if (!calculation) return null;

  const adjustmentFor = (month: string) =>
    rows.find((r) => r.month === month)?.adjustment ?? 0;

  const setAdjustment = (month: string, value: number) => {
    const next = [...rows.filter((r) => r.month !== month), { month, adjustment: value }]
      .sort((a, b) => a.month.localeCompare(b.month));
    setRows(next);
    saver.schedule(next);
  };

  const chooseBasis = (next: ScheduleBasis) => {
    setBasis(next);
    basisSaver.schedule(next);
  };

  // The engine owns the rule for what counts as drift — the schedule is allocated
  // in whole rupees, so it cannot match an amount carrying paise exactly. Render
  // its finding rather than recomputing a second, subtly different one here.
  const drifted = calculation.problems.some(
    (p) => p.code === 'schedule_drift' || p.code === 'unbilled_days' || p.code === 'expenditure_drift');
  const drift = calculation.schedule.total - bundle.contract.workDoneAmount;
  // What the rows show is what the engine billed, which is the saved basis; the
  // selector may be a keystroke ahead of it while the save is in flight.
  const billedFrom = calculation.schedule.basis;

  return (
    <section className="section">
      <div className="section-head"><h2>Schedule of payment</h2></div>
      <label className="field basis-field no-print">
        Select option
        <select value={basis} onChange={(e) => chooseBasis(e.target.value as ScheduleBasis)}>
          <option value="spanwise">{SCHEDULE_BASIS_LABELS.spanwise}</option>
          <option value="execution">{SCHEDULE_BASIS_LABELS.execution}</option>
        </select>
      </label>
      <p className="subtitle">
        <span className="print-only">{SCHEDULE_BASIS_LABELS[billedFrom]}. </span>
        {billedFrom === 'execution'
          ? 'Taken from the execution-wise expenditure entered on Main Data, month by month, exactly as entered.'
          : 'Computed from the days entered on Main Data, allocated in whole rupees so the months total exactly what those days earn.'}
        {/* Provenance belongs on the filed bill; an instruction for whoever is
            editing it does not, and on paper it cost a line of the sheet. */}
        <span className="no-print"> Adjust any month to match the bill actually paid.</span>
      </p>

      <div className="panel panel--flush scroller">
        <table className="grid">
          <thead>
            <tr>
              <th>Month</th>
              <th className="r">{billedFrom === 'execution' ? 'Expenditure' : 'Computed'}</th>
              <th className="r col-md">Adjustment</th>
              <th className="r">Payment</th>
            </tr>
          </thead>
          <tbody ref={grid}>
            {calculation.schedule.rows.map((row, i) => (
              <tr key={row.month}>
                <td className="nowrap">{formatMonth(row.month)}</td>
                <td className="r"><Computed value={row.computed} /></td>
                {/* `r` for the printed span: the cell's own text-align is what
                    positions it, and left in the default it printed its figure
                    hard against the left edge of a column of right-aligned
                    ones. The input right-aligns itself and is unaffected. */}
                <td className="r">
                  <input className="cell no-print" type="number" step="0.01"
                         data-r={i} data-c={0} onKeyDown={onKeyDown}
                         value={adjustmentFor(row.month) || ''} placeholder="0"
                         onChange={(e) => setAdjustment(row.month, toPaise(e.target.value))} />
                  {/* Paper records the figure, not the means of changing it —
                      and records it grouped, like every other column. */}
                  <span className="print-only num">{formatRupees(adjustmentFor(row.month))}</span>
                </td>
                <td className={`num${row.payment < 0 ? ' num--negative' : ''}`}>{formatRupees(row.payment)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td />
              <td />
              <td className="num">{formatRupees(calculation.schedule.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {drifted && (
        <p className="notice">
          The schedule totals {formatRupees(calculation.schedule.total)}, but the work done amount is{' '}
          {formatRupees(bundle.contract.workDoneAmount)} — a difference of {formatRupees(drift)}.
        </p>
      )}

      <div className="panel stack-sm">
        <p className="eyebrow">By quarter</p>
        <div className="row">
          {Object.entries(calculation.schedule.byQuarter).sort().map(([q, v]) => (
            <div key={q} className="quarter-cell">
              <div className="hint">{formatQuarter(q)}</div>
              <div className="num">{formatRupees(v)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
