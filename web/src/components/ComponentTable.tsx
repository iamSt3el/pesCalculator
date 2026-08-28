import { useState } from 'react';
import {
  api, COMPONENT_KEYS, COMPONENT_LABELS,
  type BaseRule, type ComponentConfig,
} from '../api.ts';
import { useDebouncedSave } from '../hooks.ts';
import { useContract } from '../ContractLayout.tsx';

const RULE_LABELS: Record<BaseRule, string> = {
  quarter_average: 'Average of the base quarter',
  bid_month: 'Month of the bid date',
  offset_month: 'Month before the bid, by the offset',
};

export function ComponentTable() {
  const { bundle, reload } = useContract();
  const [rows, setRows] = useState<ComponentConfig[]>(bundle.components);
  const saver = useDebouncedSave<ComponentConfig[]>(async (next) => {
    await api.putComponents(bundle.contract.id, next);
    await reload();
  });

  const update = (key: string, patch: Partial<ComponentConfig>) => {
    const next = rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
    setRows(next);
    saver.schedule(next);
  };

  const total = rows.reduce((a, r) => a + (Number.isFinite(r.percent) ? r.percent : 0), 0);
  const balanced = Math.abs(total - 100) < 1e-9;

  return (
    <section style={{ marginTop: 28 }}>
      <div className="section-head"><h2>Component shares</h2></div>
      <p className="subtitle">
        The share of the work each component represents, and the factor from the agreement.
      </p>

      <div className="panel panel--flush scroller">
        <table className="grid">
          <thead>
            <tr>
              <th>Component</th>
              <th style={{ width: 110 }}>Share %</th>
              <th style={{ width: 90 }}>Factor</th>
              <th style={{ width: 230 }}>Base index from</th>
              <th style={{ width: 130 }}>Override</th>
            </tr>
          </thead>
          <tbody>
            {COMPONENT_KEYS.map((key) => {
              const row = rows.find((r) => r.key === key);
              if (!row) return null;
              return (
                <tr key={key}>
                  <td>{COMPONENT_LABELS[key]}</td>
                  <td>
                    <input className="cell" type="number" step="0.01" min="0" max="100"
                           value={row.percent}
                           onChange={(e) => update(key, { percent: Number(e.target.value) })} />
                  </td>
                  <td>
                    <input className="cell" type="number" step="0.05" min="0" max="2"
                           value={row.factor}
                           onChange={(e) => update(key, { factor: Number(e.target.value) })} />
                  </td>
                  <td>
                    <select className="cell" value={row.baseRule}
                            onChange={(e) => update(key, { baseRule: e.target.value as BaseRule })}>
                      {(Object.keys(RULE_LABELS) as BaseRule[]).map((r) => (
                        <option key={r} value={r}>{RULE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className="cell" type="number" step="0.0001"
                           value={row.baseOverride ?? ''}
                           placeholder="auto"
                           onChange={(e) => update(key, {
                             baseOverride: e.target.value === '' ? null : Number(e.target.value),
                           })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className={`num${balanced ? '' : ' num--negative'}`}>{total.toFixed(2)}</td>
              <td colSpan={3} className="hint" style={{ fontWeight: 400 }}>
                {balanced ? 'Shares total 100%.' : `Shares total ${total.toFixed(2)}%. They must total 100%.`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {saver.error && <p className="notice">{saver.error}</p>}
    </section>
  );
}
