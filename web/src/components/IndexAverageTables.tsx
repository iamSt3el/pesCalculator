import { COMPONENT_KEYS, COMPONENT_LABELS, type ComponentKey } from '../api.ts';
import { useContract } from '../ContractLayout.tsx';
import { formatComponentIndex, formatMonth, formatQuarter } from '../format.ts';
import { monthsOfQuarter } from '../months.ts';

/**
 * One table per quarter: its three months, then their mean. Shared by the
 * Index Average stage and the printed bill, so the figures a clerk checks on
 * screen are the same ones that reach the paper.
 */
export function IndexAverageTables() {
  const { rates, calculation } = useContract();
  if (!calculation) return null;

  const rateFor = (month: string, key: ComponentKey): number | null => {
    const row = rates.find((r) => r.month === month);
    if (!row) return null;
    return key === 'bitumen' ? row.bitumenG : row[key];
  };

  const quarters = [...new Set([calculation.baseQuarter, ...calculation.quarters])].sort();

  return (
    <>
      {quarters.map((q) => (
        <section key={q} className="panel panel--flush scroller--short component"
                 style={{ marginBottom: 16 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>
                  {formatQuarter(q)}
                  {q === calculation.baseQuarter && (
                    <span style={{ color: 'var(--stamp)', marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
                      Base quarter
                    </span>
                  )}
                </th>
                {COMPONENT_KEYS.map((k) => (
                  <th key={k} className="r">{COMPONENT_LABELS[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthsOfQuarter(q).map((m) => (
                <tr key={m}>
                  <td>{formatMonth(m)}</td>
                  {COMPONENT_KEYS.map((k) => (
                    <td key={k} className="num">
                      {formatComponentIndex(rateFor(m, k), k, 2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ color: 'var(--stamp)' }}>Average</td>
                {COMPONENT_KEYS.map((k) => {
                  const values = monthsOfQuarter(q).map((m) => rateFor(m, k));
                  const complete = values.every((v) => v !== null);
                  const mean = complete
                    ? (values as number[]).reduce((a, b) => a + b, 0) / 3
                    : null;
                  return (
                    <td key={k} className="num" style={{ color: 'var(--stamp)' }}>
                      {formatComponentIndex(mean, k)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </section>
      ))}
    </>
  );
}
