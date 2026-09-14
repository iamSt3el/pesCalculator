import { useState } from 'react';
import { api, type ExpenditureRow } from '../api.ts';
import { useContract, useReportSave } from '../ContractLayout.tsx';
import { useGridKeys } from '../grid.ts';
import { formatMonth, formatRupees } from '../format.ts';
import { useDebouncedSave } from '../hooks.ts';
import { monthsBetween } from '../months.ts';

/** The amount column stores two decimals, so the field cannot go finer. */
const toPaise = (raw: string): number => Math.round(Number(raw) * 100) / 100 || 0;

/**
 * B. What was spent in each month as the work was executed, typed by hand.
 * Nothing here is calculated: when the schedule of payment on Base Rate is set
 * to execution wise, it bills these figures exactly as they stand.
 */
export function ExecutionGrid() {
  const { bundle, reload } = useContract();
  const { contract } = bundle;
  const [rows, setRows] = useState<ExpenditureRow[]>(bundle.expenditure);

  const saver = useDebouncedSave<ExpenditureRow[]>(async (next) => {
    await api.putExpenditure(contract.id, next.filter((r) => r.amount !== 0));
    await reload();
  });

  useReportSave('expenditure', saver.saving, saver.error);

  // The same months as the spanwise grid, plus any month still holding a figure
  // outside the period: the schedule bills it, so it has to be seen here.
  const period = contract.commencement && contract.actualCompletion
    && contract.actualCompletion >= contract.commencement
    ? monthsBetween(contract.commencement.slice(0, 7), contract.actualCompletion.slice(0, 7))
    : [];
  const months = [...new Set([
    ...period, ...rows.filter((r) => r.amount !== 0).map((r) => r.month),
  ])].sort();
  const { grid, onKeyDown } = useGridKeys(months.length, 1);

  const amountFor = (month: string) => rows.find((r) => r.month === month)?.amount ?? 0;

  const setAmount = (month: string, amount: number) => {
    const next = [...rows.filter((r) => r.month !== month), { month, amount }]
      .sort((a, b) => a.month.localeCompare(b.month));
    setRows(next);
    saver.schedule(next);
  };

  const total = Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100) / 100;
  const gap = Math.round((contract.workDoneAmount - total) * 100) / 100;

  if (months.length === 0) {
    return (
      <section className="section">
        <div className="section-head"><h2>B · Expenditure execution wise</h2></div>
        <div className="panel">
          <p className="flush">
            Set the date of commencement and the actual date of completion above, and the months appear here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="section-head"><h2>B · Expenditure execution wise</h2></div>
      <p className="subtitle">
        Enter what was spent in each month as the work was executed. Nothing here is
        calculated — when the schedule of payment on Base Rate is set to execution wise,
        it bills these figures as they stand.
        {contract.scheduleBasis === 'spanwise' && (
          <span className="no-print"> It is set to span wise at present, so these are not billed.</span>
        )}
      </p>

      <div className="panel panel--flush scroller">
        <table className="grid">
          <thead>
            <tr>
              <th>Month</th>
              <th className="r">Expenditure</th>
            </tr>
          </thead>
          <tbody ref={grid}>
            {months.map((month, r) => (
              <tr key={month}>
                <td className="nowrap">{formatMonth(month)}</td>
                <td className="r">
                  <input className="cell no-print" type="number" step="0.01"
                         data-r={r} data-c={0} onKeyDown={onKeyDown}
                         value={amountFor(month) || ''} placeholder="0"
                         onChange={(e) => setAmount(month, toPaise(e.target.value))} />
                  <span className="print-only num">{formatRupees(amountFor(month))}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num">{formatRupees(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {total !== 0 && gap !== 0 && (
        <p className="subtitle">
          The expenditure totals {formatRupees(total)}, {gap > 0 ? 'short of' : 'over'} the
          work done amount of {formatRupees(contract.workDoneAmount)} by {formatRupees(Math.abs(gap))}.
        </p>
      )}
    </section>
  );
}
