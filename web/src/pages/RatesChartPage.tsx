import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type RateRow } from '../api.ts';
import { PasteBox } from '../components/PasteBox.tsx';
import { PrintButton } from '../components/PrintButton.tsx';
import { useContract } from '../ContractLayout.tsx';
import { formatMonth } from '../format.ts';
import { useGridKeys } from '../grid.ts';
import { useDebouncedSave } from '../hooks.ts';
import { furtherMonths, neededMonths, nextMonthAfter } from '../months.ts';

type NumericField = Exclude<keyof RateRow, 'month'>;

const COLUMNS: Array<{ field: NumericField; label: string }> = [
  { field: 'labour', label: 'Labour' },
  { field: 'material', label: 'Material' },
  { field: 'cement', label: 'Cement' },
  { field: 'steel', label: 'Steel' },
  { field: 'pol', label: 'POL' },
  { field: 'bitumenG', label: 'Bitumen 1st' },
  { field: 'bitumenH', label: 'Bitumen 2nd' },
];

const BLANK: Omit<RateRow, 'month'> = {
  labour: null, material: null, cement: null,
  steel: null, pol: null, bitumenG: null, bitumenH: null,
};

const isMonthKey = (m: string) => /^\d{4}-\d{2}$/.test(m);

export function RatesChartPage() {
  const { rates, calculation, reload } = useContract();
  const [params, setParams] = useSearchParams();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [rows, setRows] = useState<RateRow[]>(rates);
  const [newMonth, setNewMonth] = useState(() => nextMonthAfter(rates.map((r) => r.month)));
  const [justAdded, setJustAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saver = useDebouncedSave<RateRow[]>(async (next) => {
    await api.putRates(next.filter((r) => isMonthKey(r.month)));
    await reload();
  });

  // Server truth wins whenever it arrives, so the grid never shows stale figures
  // after a save, a paste, or an edit made on another screen.
  useEffect(() => { setRows(rates); }, [rates]);

  const update = (month: string, field: NumericField, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw);
    const next = rows.map((r) => (r.month === month ? { ...r, [field]: value } : r));
    setRows(next);
    saver.schedule(next);
  };

  const addMonths = (months: string[]) => {
    const wanted = months.filter((m) => isMonthKey(m) && !rows.some((r) => r.month === m));
    if (wanted.length === 0) return;
    const next = [...rows, ...wanted.map((month) => ({ month, ...BLANK }))]
      .sort((a, b) => a.month.localeCompare(b.month));
    setRows(next);
    setJustAdded(wanted);
    setNewMonth(nextMonthAfter(next.map((r) => r.month)));
    saver.schedule(next);
  };

  const removeMonth = async (month: string) => {
    setConfirming(null);
    setBusy(month);
    setError(null);
    try {
      // Land any half-typed edit first: the queued save writes every row, and
      // would otherwise put this month straight back.
      await saver.flush();
      await api.deleteRate(month);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const missing = calculation?.problems.find((p) => p.code === 'missing_rates')?.months ?? [];
  const absent = missing.filter((m) => !rows.some((r) => r.month === m));
  const ahead = furtherMonths(rows.map((r) => r.month));
  const canAdd = isMonthKey(newMonth) && !rows.some((r) => r.month === newMonth);

  // Months this contract's bill actually reads, so the shared chart shows which
  // of its rows are load-bearing for the contract currently open.
  const needed = neededMonths(calculation);
  const gaps = new Set(missing);
  const { grid, onKeyDown } = useGridKeys(rows.length, COLUMNS.length);

  /**
   * A problem in the rail links here with the months it named. Scroll the first
   * of them into view once, then drop the parameter so a later reload of the
   * page does not jump the reader somewhere they did not ask to go.
   */
  const focus = params.get('focus');
  useEffect(() => {
    if (!focus) return;
    const first = focus.split(',')[0];
    const el = first && document.getElementById(`rate-${first}`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setParams({}, { replace: true });
  }, [focus, setParams]);
  const flagged = new Set((focus ?? '').split(',').filter(Boolean));

  return (
    <>
      <div className="spread">
        <div>
          <h1 className="title">Rates Chart</h1>
          <p className="subtitle">
            Shared across every contract. Published index figures — fill a month once.
          </p>
        </div>
        <div className="row">
          <span className="saving">{saver.saving ? 'Saving…' : 'All changes saved'}</span>
          <PrintButton />
        </div>
      </div>

      {absent.length > 0 && (
        <div className="notice">
          <div className="spread" style={{ alignItems: 'center' }}>
            <span>
              This contract needs {absent.map(formatMonth).join(', ')}, which the chart does not have yet.
            </span>
            <button className="small" onClick={() => addMonths(absent)}>
              Add {absent.length === 1 ? 'it' : `all ${absent.length}`}
            </button>
          </div>
        </div>
      )}

      {/* Above the grid, not buried under 39 rows of it. */}
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="spread" style={{ alignItems: 'baseline' }}>
          <p className="eyebrow" style={{ margin: 0 }}>Months not in the chart yet</p>
          <span className="hint">
            {rows.length} month{rows.length === 1 ? '' : 's'}
            {rows[0] ? `, ${formatMonth(rows[0].month)} to ${formatMonth(rows.at(-1)!.month)}` : ''}
          </span>
        </div>

        {ahead.length > 0 ? (
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            {ahead.map((m) => (
              <button key={m} className="chip" onClick={() => addMonths([m])}>+ {formatMonth(m)}</button>
            ))}
            {ahead.length > 1 && (
              <button className="small" onClick={() => addMonths(ahead)}>
                Add all {ahead.length}
              </button>
            )}
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 10 }}>
            The chart is up to date — every month through the next six is already here.
          </p>
        )}

        <div className="row" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
          <label className="field">
            Or any other month
            <input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
          </label>
          <button className="ghost" onClick={() => addMonths([newMonth])} disabled={!canAdd}
                  style={{ alignSelf: 'end' }}>
            {rows.some((r) => r.month === newMonth) ? 'Already in the chart' : 'Add month'}
          </button>
        </div>
      </div>

      <PasteBox onDone={reload} />

      <div className="panel panel--flush scroller--short">
        <table className="grid">
          <thead>
            <tr>
              <th>Month</th>
              {COLUMNS.map((c) => <th key={c.field} className="r">{c.label}</th>)}
              <th className="r no-print"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody ref={grid}>
            {rows.map((row, r) => (
              <tr key={row.month} id={`rate-${row.month}`}
                  className={justAdded.includes(row.month) || flagged.has(row.month)
                    ? 'settled' : undefined}>
                <td className={needed.has(row.month) ? 'month--needed' : undefined}
                    style={{ whiteSpace: 'nowrap' }}>
                  {formatMonth(row.month)}
                  {gaps.has(row.month) && <span className="cell-sub">this bill needs it</span>}
                </td>
                {COLUMNS.map((c, i) => (
                  <td key={c.field}
                      className={gaps.has(row.month) && row[c.field] === null
                        ? 'cell--missing' : undefined}>
                    <input className="cell" type="number" step="0.01"
                           data-r={r} data-c={i} onKeyDown={onKeyDown}
                           value={row[c.field] ?? ''} placeholder="—"
                           aria-label={`${c.label}, ${formatMonth(row.month)}`}
                           onChange={(e) => update(row.month, c.field, e.target.value)} />
                  </td>
                ))}
                <td className="r no-print">
                  {confirming === row.month ? (
                    <span className="confirm">
                      <span className="confirm__text">
                        The chart is shared — every contract loses these figures.
                      </span>
                      <button className="danger small" onClick={() => void removeMonth(row.month)}>
                        Remove
                      </button>
                      <button className="ghost small" onClick={() => setConfirming(null)}>Keep</button>
                    </span>
                  ) : (
                    <button className="erase" disabled={busy === row.month}
                            title={`Remove ${formatMonth(row.month)}`}
                            aria-label={`Remove ${formatMonth(row.month)}`}
                            onClick={() => setConfirming(row.month)}>
                      {busy === row.month ? '…' : '✕'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(saver.error || error) && <p className="notice">{saver.error ?? error}</p>}
    </>
  );
}
