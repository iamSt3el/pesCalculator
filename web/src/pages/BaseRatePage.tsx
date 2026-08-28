import { useState } from 'react';
import {
  api, COMPONENT_KEYS, COMPONENT_LABELS,
  type ComponentConfig, type ComponentKey,
} from '../api.ts';
import { ScheduleTable } from '../components/ScheduleTable.tsx';
import { useContract } from '../ContractLayout.tsx';
import { formatDate, formatIndex, formatMonth, formatQuarter, formatRupees } from '../format.ts';
import { useDebouncedSave } from '../hooks.ts';

export function BaseRatePage() {
  const { bundle, calculation, reload } = useContract();
  const [rows, setRows] = useState<ComponentConfig[]>(bundle.components);

  const saver = useDebouncedSave<ComponentConfig[]>(async (next) => {
    await api.putComponents(bundle.contract.id, next);
    await reload();
  });

  const setOverride = (key: ComponentKey, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw);
    const next = rows.map((r) => (r.key === key ? { ...r, baseOverride: value } : r));
    setRows(next);
    saver.schedule(next);
  };

  const { contract } = bundle;

  /** The rule in plain words, naming the months it actually used. */
  const ruleText = (key: ComponentKey): string => {
    const base = calculation?.bases[key];
    if (!base) return '—';
    if (base.rule === 'quarter_average') return `Average of ${formatQuarter(calculation!.baseQuarter)}`;
    const month = base.sourceMonths[0];
    if (base.rule === 'bid_month') return `${month ? formatMonth(month) : '—'}, the bid month`;
    return `${month ? formatMonth(month) : '—'}, ${contract.bitumenOffsetDays} days before the bid`;
  };

  return (
    <>
      <div className="spread">
        <h1 className="title">Base Rate</h1>
        <span className="saving">{saver.saving ? 'Saving…' : 'All changes saved'}</span>
      </div>

      <section className="panel">
        <p className="eyebrow">Contract</p>
        <div className="grid-fields">
          <div><div className="hint">Agreement no.</div>{contract.agreementNo || '—'}</div>
          <div><div className="hint">Contractor</div>{contract.contractor || '—'}</div>
          <div><div className="hint">Bid submitted</div>{formatDate(contract.bidDate)}</div>
          <div><div className="hint">Work done amount</div>
            <span className="num" style={{ textAlign: 'left' }}>{formatRupees(contract.workDoneAmount)}</span>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Base index per component</h2>
        <p className="subtitle">
          Each component takes its base from a different place. Type a value to override one.
        </p>

        <div className="panel panel--flush scroller">
          <table className="grid">
            <thead>
              <tr>
                <th>Component</th>
                <th style={{ textAlign: 'right' }}>Share %</th>
                <th>Base index from</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th style={{ width: 140, textAlign: 'right' }}>Override</th>
              </tr>
            </thead>
            <tbody>
              {COMPONENT_KEYS.map((key) => {
                const row = rows.find((r) => r.key === key);
                const base = calculation?.bases[key];
                return (
                  <tr key={key}>
                    <td>{COMPONENT_LABELS[key]}</td>
                    <td className="num">{row ? row.percent.toFixed(2) : '—'}</td>
                    <td>
                      {ruleText(key)}
                      {base?.overridden && (
                        <span style={{ color: 'var(--stamp)', marginLeft: 8, fontSize: 12 }}>Overridden</span>
                      )}
                    </td>
                    <td className="num" style={base?.overridden ? { color: 'var(--stamp)' } : undefined}>
                      {formatIndex(base?.value ?? null, key === 'bitumen' ? 0 : 4)}
                    </td>
                    <td>
                      <input className="cell" type="number" step="0.0001"
                             value={row?.baseOverride ?? ''} placeholder="auto"
                             onChange={(e) => setOverride(key, e.target.value)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {saver.error && <p className="notice">{saver.error}</p>}
      </section>

      <ScheduleTable />
    </>
  );
}
