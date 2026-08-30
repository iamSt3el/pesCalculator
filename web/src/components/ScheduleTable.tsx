import { useState } from 'react';
import { api, type AdjustmentRow } from '../api.ts';
import { useContract } from '../ContractLayout.tsx';
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

  const saver = useDebouncedSave<AdjustmentRow[]>(async (next) => {
    await api.putPayments(bundle.contract.id, next.filter((r) => r.adjustment !== 0));
    await reload();
  });

  if (!calculation) return null;

  const adjustmentFor = (month: string) =>
    rows.find((r) => r.month === month)?.adjustment ?? 0;

  const setAdjustment = (month: string, value: number) => {
    const next = [...rows.filter((r) => r.month !== month), { month, adjustment: value }]
      .sort((a, b) => a.month.localeCompare(b.month));
    setRows(next);
    saver.schedule(next);
  };

  // The engine owns the rule for what counts as drift — the schedule is allocated
  // in whole rupees, so it cannot match an amount carrying paise exactly. Render
  // its finding rather than recomputing a second, subtly different one here.
  const drifted = calculation.problems.some((p) => p.code === 'schedule_drift');
  const drift = calculation.schedule.total - bundle.contract.workDoneAmount;

  return (
    <section style={{ marginTop: 28 }}>
      <div className="section-head"><h2>Schedule of payment</h2></div>
      <p className="subtitle">
        Computed from the days entered on Main Data, allocated so the months total the work done
        amount exactly. Adjust any month to match the bill actually paid.
      </p>

      <div className="panel panel--flush scroller">
        <table className="grid">
          <thead>
            <tr>
              <th>Month</th>
              <th className="r">Computed</th>
              <th className="r" style={{ width: 150 }}>Adjustment</th>
              <th className="r">Payment</th>
            </tr>
          </thead>
          <tbody>
            {calculation.schedule.rows.map((r) => (
              <tr key={r.month}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatMonth(r.month)}</td>
                <td className="r"><Computed value={r.computed} /></td>
                <td>
                  <input className="cell" type="number" step="0.01"
                         value={adjustmentFor(r.month) || ''} placeholder="0"
                         onChange={(e) => setAdjustment(r.month, toPaise(e.target.value))} />
                </td>
                <td className={`num${r.payment < 0 ? ' num--negative' : ''}`}>{formatRupees(r.payment)}</td>
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

      <div className="panel" style={{ marginTop: 12 }}>
        <p className="eyebrow">By quarter</p>
        <div className="row">
          {Object.entries(calculation.schedule.byQuarter).sort().map(([q, v]) => (
            <div key={q} style={{ minWidth: 150 }}>
              <div className="hint">{formatQuarter(q)}</div>
              <div className="num" style={{ textAlign: 'left', fontSize: 16 }}>{formatRupees(v)}</div>
            </div>
          ))}
        </div>
      </div>
      {saver.error && <p className="notice">{saver.error}</p>}
    </section>
  );
}
