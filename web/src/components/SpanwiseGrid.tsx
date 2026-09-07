import { useState } from 'react';
import { api, type ProgressRow } from '../api.ts';
import { useContract, useReportSave } from '../ContractLayout.tsx';
import { useGridKeys } from '../grid.ts';
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
  return <span className={`num ${settle}`}>{formatRupees(value)}</span>;
}

export function SpanwiseGrid() {
  const { bundle, calculation, reload } = useContract();
  const { contract } = bundle;
  const [rows, setRows] = useState<ProgressRow[]>(bundle.progress);

  const saver = useDebouncedSave<ProgressRow[]>(async (next) => {
    await api.putProgress(contract.id, next.filter((r) => r.spanDays.some((d) => d > 0)));
    await reload();
  });

  useReportSave('progress', saver.saving, saver.error);

  const months = monthsBetween(contract.commencement, contract.actualCompletion);
  const { grid, onKeyDown } = useGridKeys(months.length, 4);
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
  // Days each month has inside the period, so a gap in the record is visible
  // rather than silently reshaping the bill. September of a contract commencing
  // on the 24th offers six days, not thirty.
  const availableFor = (month: string) => calculation?.monthDays[month] ?? 0;
  const recordedFor = (month: string) => daysFor(month).reduce((a, b) => a + b, 0);
  const totalAvailable = months.reduce((a, m) => a + availableFor(m), 0);
  const totalRecorded = months.reduce((a, m) => a + recordedFor(m), 0);
  const unaccounted = totalAvailable - totalRecorded;
  // A contract nobody has started has four empty spans, which is not a mistake.
  // Only once some days exist does an empty span mean one was missed.
  const started = spanTotals.some((t) => t > 0);

  if (months.length === 0) {
    return (
      <section className="section">
        <div className="section-head"><h2>Work done, month by month</h2></div>
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
      <div className="section-head"><h2>Work done, month by month</h2></div>
      <p className="subtitle">
        Enter the days worked in each span. Per day is the span's value spread over
        all of its days. A month with no work done bills nothing, and the months
        that were worked carry its share of the span.
      </p>

      {spans && (
        <div className="panel panel--flush scroller--short bar">
          <table className="grid">
            <thead>
              <tr>
                <th>Span</th><th className="r">Days</th>
                <th className="r">Value</th><th className="r">Per day</th><th>Ends</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((i) => {
                // The span's value spread over all of its days. This is what the
                // span is worth per day if every day of it is worked; the rate a
                // month is actually billed at rises above it when days in the
                // span carry no work, because their share passes to the months
                // that do. The month grid below shows what each month bills.
                const days = spans.days[i]!;
                return (
                  <tr key={i}>
                    <td>Span {i + 1}</td>
                    <td className="num">{days}</td>
                    <td className="num">{formatRupees(spans.values[i]!)}</td>
                    <td className="num">
                      {days === 0 ? '—' : formatRupees(spans.values[i]! / days)}
                    </td>
                    <td>{formatDate(spans.endDates[i]!)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel panel--flush scroller">
        <table className="grid">
          <thead>
            <tr>
              <th>Month</th>
              <th className="r col-xs">Span 1</th>
              <th className="r col-xs">Span 2</th>
              <th className="r col-xs">Span 3</th>
              <th className="r col-xs">Span 4</th>
              <th className="r col-xs">Days</th>
              <th className="r">Amount</th>
            </tr>
          </thead>
          <tbody ref={grid}>
            {months.map((month, r) => {
              const days = daysFor(month);
              return (
                <tr key={month}>
                  <td className="nowrap">{formatMonth(month)}</td>
                  {[0, 1, 2, 3].map((i) => (
                    <td key={i}>
                      <input className="cell" type="number" min="0" max={availableFor(month) || undefined}
                             data-r={r} data-c={i} onKeyDown={onKeyDown}
                             value={days[i] || ''}
                             placeholder="0"
                             onChange={(e) => setDay(month, i, Number(e.target.value))} />
                    </td>
                  ))}
                  <td className={`num${calculation && recordedFor(month) > availableFor(month) ? ' num--negative' : ''}`}>
                    {recordedFor(month)}/{calculation ? availableFor(month) : '—'}
                  </td>
                  <td className="r"><MonthAmount value={amountFor(month)} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Days allocated</td>
              {[0, 1, 2, 3].map((i) => {
                const target = spans?.days[i];
                const wrong = target !== undefined
                  && (spanTotals[i]! > target
                      || (started && target > 0 && spanTotals[i] === 0));
                return (
                  <td key={i} className={`num${wrong ? ' num--negative' : ''}`}>
                    {spanTotals[i]}{target !== undefined ? ` / ${target}` : ''}
                  </td>
                );
              })}
              <td className="num">{totalRecorded}/{totalAvailable}</td>
              <td className="num">{calculation ? formatRupees(calculation.schedule.total) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {unaccounted > 0 && (
        <p className="subtitle">
          {unaccounted} day{unaccounted === 1 ? '' : 's'} of the period carry no work.
          That is how an idle month is recorded — check it is deliberate, because
          those days are shared out among the months that were worked.
        </p>
      )}
    </section>
  );
}
