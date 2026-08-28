import { COMPONENT_KEYS, COMPONENT_LABELS, type ComponentKey } from '../api.ts';
import { useContract } from '../ContractLayout.tsx';
import { formatIndex, formatMonth, formatQuarter } from '../format.ts';

/** '2023-Q3' -> its three month keys. */
function monthsOfQuarter(q: string): string[] {
  const [y, n] = q.split('-Q');
  const first = (Number(n) - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${y}-${String(first + i).padStart(2, '0')}`);
}

export function IndexAveragePage() {
  const { rates, calculation } = useContract();

  if (!calculation) {
    return <>
      <h1 style={{ fontFamily: 'var(--serif)' }}>Index Average</h1>
      <p className="hint">Fill in Main Data and the rates chart, and the quarter averages appear here.</p>
    </>;
  }

  const rateFor = (month: string, key: ComponentKey): number | null => {
    const row = rates.find((r) => r.month === month);
    if (!row) return null;
    return key === 'bitumen' ? row.bitumenG : row[key];
  };

  const quarters = [...new Set([calculation.baseQuarter, ...calculation.quarters])].sort();

  return (
    <>
      <h1 style={{ fontFamily: 'var(--serif)' }}>Index Average</h1>
      <p className="hint" style={{ marginTop: 0 }}>
        Derived from the rates chart. Nothing here is entered by hand.
      </p>

      {quarters.map((q) => (
        <section key={q} className="card scroller" style={{ padding: 0, marginBottom: 16 }}>
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
                  <th key={k} style={{ textAlign: 'right' }}>{COMPONENT_LABELS[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthsOfQuarter(q).map((m) => (
                <tr key={m}>
                  <td>{formatMonth(m)}</td>
                  {COMPONENT_KEYS.map((k) => (
                    <td key={k} className="num">
                      {formatIndex(rateFor(m, k), k === 'bitumen' ? 0 : 2)}
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
                      {formatIndex(mean, k === 'bitumen' ? 0 : 4)}
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
