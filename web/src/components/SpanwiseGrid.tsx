import { useState } from 'react';
import { api, type ProgressRow } from '../api.ts';
import { useContract } from '../ContractLayout.tsx';
import { formatDate, formatMonth, formatRupees } from '../format.ts';
import { useDebouncedSave, useSettle } from '../hooks.ts';

/** Every month from commencement to actual completion, inclusive. */
function monthsBetween(from: string, to: string): string[] {
  if (!from || !to || to < from) return [];
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number) as [number, number];
  const end = to.slice(0, 7);
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function MonthAmount({ value }: { value: number }) {
  const settle = useSettle(value);
  return <span className={`num ${settle}`}>{value ? formatRupees(value) : '—'}</span>;
}

export function SpanwiseGrid() {
  const { bundle, calculation, reload } = useContract();
  const { contract } = bundle;
  const [rows, setRows] = useState<ProgressRow[]>(bundle.progress);

  const saver = useDebouncedSave<ProgressRow[]>(async (next) => {
    await api.putProgress(contract.id, next.filter((r) => r.spanDays.some((d) => d > 0)));
    await reload();
  });

  const months = monthsBetween(contract.commencement, contract.actualCompletion);
  const spans = calculation?.spans;

  const daysFor = (month: string): [number, number, number, number] =>
    rows.find((r) => r.month === month)?.spanDays ?? [0, 0, 0, 0];

  const setDay = (month: string, index: number, value: number) => {
    const current = daysFor(month);
    const spanDays = [...current] as [number, number, number, number];
    spanDays[index] = Number.isFinite(value) && value >= 0 ? value : 0;
    const next = [...rows.filter((r) => r.month !== month), { month, spanDays }]
      .sort((a, b) => a.month.localeCompare(b.month));
    setRows(next);
    saver.schedule(next);
  };

  const amountFor = (month: string) =>
    calculation?.schedule.rows.find((r) => r.month === month)?.computed ?? 0;

  const spanTotals = [0, 1, 2, 3].map((i) => rows.reduce((a, r) => a + (r.spanDays[i] ?? 0), 0));

  if (months.length === 0) {
    return (
      <section style={{ marginTop: 28 }}>
        <h2>Work done, month by month</h2>
        <div className="card">
          <p style={{ margin: 0 }}>
            Set the date of commencement and the actual date of completion above, and the months appear here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 28 }}>
      <h2>Work done, month by month</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Enter the days worked in each span. Amounts follow from the span rates.
      </p>

      {spans && (
        <div className="card scroller" style={{ padding: 0, marginBottom: 12 }}>
          <table className="grid">
            <thead>
              <tr><th>Span</th><th>Days</th><th>Value</th><th>Per day</th><th>Ends</th></tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((i) => (
                <tr key={i}>
                  <td>Span {i + 1}</td>
                  <td className="num">{spans.days[i]}</td>
                  <td className="num">{formatRupees(spans.values[i]!)}</td>
                  <td className="num">{formatRupees(spans.perDay[i]!, 2)}</td>
                  <td>{formatDate(spans.endDates[i]!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card scroller" style={{ padding: 0 }}>
        <table className="grid">
          <thead>
            <tr>
              <th>Month</th>
              <th style={{ width: 86 }}>Span 1</th>
              <th style={{ width: 86 }}>Span 2</th>
              <th style={{ width: 86 }}>Span 3</th>
              <th style={{ width: 86 }}>Span 4</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => {
              const days = daysFor(month);
              return (
                <tr key={month}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatMonth(month)}</td>
                  {[0, 1, 2, 3].map((i) => (
                    <td key={i}>
                      <input className="num" type="number" min="0" max="31"
                             value={days[i] || ''}
                             placeholder="0"
                             onChange={(e) => setDay(month, i, Number(e.target.value))} />
                    </td>
                  ))}
                  <td style={{ textAlign: 'right' }}><MonthAmount value={amountFor(month)} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Days allocated</td>
              {[0, 1, 2, 3].map((i) => {
                const target = spans?.days[i];
                const over = target !== undefined && spanTotals[i]! > target;
                return (
                  <td key={i} className={`num${over ? ' num--negative' : ''}`}>
                    {spanTotals[i]}{target !== undefined ? ` / ${target}` : ''}
                  </td>
                );
              })}
              <td className="num">{calculation ? formatRupees(calculation.schedule.total) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {saver.error && <p className="notice">{saver.error}</p>}
    </section>
  );
}
