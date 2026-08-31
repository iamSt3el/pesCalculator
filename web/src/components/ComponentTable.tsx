import { useState } from 'react';
import {
  api, COMPONENT_KEYS, COMPONENT_LABELS,
  type BaseRule, type ComponentConfig,
} from '../api.ts';
import { useDebouncedSave } from '../hooks.ts';
import { useContract, useReportSave } from '../ContractLayout.tsx';
import { useGridKeys } from '../grid.ts';

const RULE_LABELS: Record<BaseRule, string> = {
  quarter_average: 'Average of the base quarter',
  bid_month: 'Month of the bid date',
  offset_month: 'Offset month before the bid',
};

export function ComponentTable() {
  const { bundle, reload } = useContract();
  const [rows, setRows] = useState<ComponentConfig[]>(bundle.components);
  const saver = useDebouncedSave<ComponentConfig[]>(async (next) => {
    await api.putComponents(bundle.contract.id, next);
    await reload();
  });

  useReportSave('components', saver.saving, saver.error);

  const update = (key: string, patch: Partial<ComponentConfig>) => {
    const next = rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
    setRows(next);
    saver.schedule(next);
  };

  // Four editable columns: share, factor, base rule (a select), override.
  const { grid, onKeyDown } = useGridKeys(COMPONENT_KEYS.length, 4);

  const total = rows.reduce((a, r) => a + (Number.isFinite(r.percent) ? r.percent : 0), 0);
  const balanced = Math.abs(total - 100) < 1e-9;

  return (
    <section className="section">
      <div className="section-head"><h2>Component shares</h2></div>
      <p className="subtitle">
        The share of the work each component represents, and the factor from the agreement.
      </p>

      <div className="panel panel--flush scroller">
        <table className="grid">
          <thead>
            <tr>
              <th>Component</th>
              <th className="r col-sm">Share %</th>
              <th className="r col-xs">Factor</th>
              <th className="col-lg">Base index from</th>
              <th className="r col-md">Override</th>
            </tr>
          </thead>
          <tbody ref={grid}>
            {COMPONENT_KEYS.map((key, r) => {
              const row = rows.find((r) => r.key === key);
              if (!row) return null;
              return (
                <tr key={key}>
                  <td>{COMPONENT_LABELS[key]}</td>
                  <td>
                    <input className="cell" type="number" step="0.01" min="0" max="100"
                           data-r={r} data-c={0} onKeyDown={onKeyDown}
                           value={row.percent}
                           onChange={(e) => update(key, { percent: Number(e.target.value) })} />
                  </td>
                  <td>
                    <input className="cell" type="number" step="0.05" min="0" max="2"
                           data-r={r} data-c={1} onKeyDown={onKeyDown}
                           value={row.factor}
                           onChange={(e) => update(key, { factor: Number(e.target.value) })} />
                  </td>
                  <td>
                    <select className="cell" value={row.baseRule}
                            data-r={r} data-c={2} onKeyDown={onKeyDown}
                            onChange={(e) => update(key, { baseRule: e.target.value as BaseRule })}>
                      {(Object.keys(RULE_LABELS) as BaseRule[]).map((r) => (
                        <option key={r} value={r}>{RULE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className="cell" type="number" step="0.0001"
                           data-r={r} data-c={3} onKeyDown={onKeyDown}
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
              <td colSpan={3} className="hint tight">
                {balanced ? 'Shares total 100%.' : `Shares total ${total.toFixed(2)}%. They must total 100%.`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
