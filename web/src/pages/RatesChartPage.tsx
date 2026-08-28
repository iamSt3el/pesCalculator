import { useState } from 'react';
import { api, type RateRow } from '../api.ts';
import { PasteBox } from '../components/PasteBox.tsx';
import { useContract } from '../ContractLayout.tsx';
import { formatMonth } from '../format.ts';
import { useDebouncedSave } from '../hooks.ts';

type NumericField = 'labour' | 'material' | 'cement' | 'steel' | 'pol' | 'bitumenG' | 'bitumenH';

const COLUMNS: Array<{ field: NumericField; label: string }> = [
  { field: 'labour', label: 'Labour' },
  { field: 'material', label: 'Material' },
  { field: 'cement', label: 'Cement' },
  { field: 'steel', label: 'Steel' },
  { field: 'pol', label: 'POL' },
  { field: 'bitumenG', label: 'Bitumen VG-10' },
  { field: 'bitumenH', label: 'Bitumen 2nd' },
];

const BLANK: RateRow = {
  month: '', labour: null, material: null, cement: null,
  steel: null, pol: null, bitumenG: null, bitumenH: null,
};

export function RatesChartPage() {
  const { rates, calculation, reload } = useContract();
  const [rows, setRows] = useState<RateRow[]>(rates);
  const [newMonth, setNewMonth] = useState('');

  const saver = useDebouncedSave<RateRow[]>(async (next) => {
    await api.putRates(next.filter((r) => /^\d{4}-\d{2}$/.test(r.month)));
    await reload();
  });

  const update = (month: string, field: NumericField, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw);
    const next = rows.map((r) => (r.month === month ? { ...r, [field]: value } : r));
    setRows(next);
    saver.schedule(next);
  };

  const addMonth = () => {
    if (!/^\d{4}-\d{2}$/.test(newMonth) || rows.some((r) => r.month === newMonth)) return;
    const next = [...rows, { ...BLANK, month: newMonth }].sort((a, b) => a.month.localeCompare(b.month));
    setRows(next);
    setNewMonth('');
    saver.schedule(next);
  };

  const missing = calculation?.problems.find((p) => p.code === 'missing_rates')?.months ?? [];

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontFamily: 'var(--serif)' }}>Rates Chart</h1>
        <span className="hint">{saver.saving ? 'Saving…' : 'Saved'}</span>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Shared across every contract. Published index figures — fill a month once.
      </p>

      {missing.length > 0 && (
        <p className="notice">
          This contract needs {missing.map(formatMonth).join(', ')}, which the chart does not have yet.
        </p>
      )}

      <PasteBox onDone={() => void reload().then(() => setRows(rates))} />

      <div className="card scroller" style={{ padding: 0 }}>
        <table className="grid">
          <thead>
            <tr>
              <th>Month</th>
              {COLUMNS.map((c) => <th key={c.field} style={{ textAlign: 'right' }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}
                  style={missing.includes(row.month) ? { background: 'rgba(160,34,24,0.06)' } : undefined}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatMonth(row.month)}</td>
                {COLUMNS.map((c) => (
                  <td key={c.field}>
                    <input className="num" type="number" step="0.01"
                           value={row[c.field] ?? ''} placeholder="—"
                           onChange={(e) => update(row.month, c.field, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={COLUMNS.length + 1} style={{ fontWeight: 400 }}>
                <div className="row">
                  <input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
                  <button className="ghost" onClick={addMonth} disabled={!/^\d{4}-\d{2}$/.test(newMonth)}>
                    Add month
                  </button>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {saver.error && <p className="notice">{saver.error}</p>}
    </>
  );
}
