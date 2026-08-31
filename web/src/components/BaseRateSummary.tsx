import {
  COMPONENT_KEYS, COMPONENT_LABELS,
  type ComponentConfig, type ComponentKey,
} from '../api.ts';
import { useContract } from '../ContractLayout.tsx';
import { formatComponentIndex, formatDate, formatMonth, formatQuarter, formatRupees } from '../format.ts';

interface Props {
  /** Local, possibly-unsaved rows on the editable stage; the saved ones in print. */
  rows: ComponentConfig[];
  /** Omitted in print, which drops the Override column with it. */
  onOverride?: (key: ComponentKey, raw: string) => void;
}

/**
 * The contract's particulars and where each component takes its base index
 * from. The printed bill shows the same table without the override input, so
 * the paper records the figure used rather than the means of changing it.
 */
export function BaseRateSummary({ rows, onOverride }: Props) {
  const { bundle, calculation } = useContract();
  const { contract } = bundle;

  /** The rule in plain words, naming the months it actually used. */
  const ruleText = (key: ComponentKey): string => {
    const base = calculation?.bases[key];
    if (!base) return '—';
    if (base.rule === 'quarter_average') return `Average of ${formatQuarter(calculation!.baseQuarter)}`;
    const month = base.sourceMonths[0];
    if (base.rule === 'bid_month') return `${month ? formatMonth(month) : '—'}, the bid month`;
    const series = base.bitumenSeries === 'second' ? 'Bitumen 2nd' : 'Bitumen 1st';
    return `${month ? formatMonth(month) : '—'} ${series}, `
      + `${contract.bitumenOffsetDays} days before the bid`;
  };

  return (
    <>
      <section className="panel component">
        <p className="eyebrow">Contract</p>
        <div className="grid-fields">
          <div><div className="hint">Agreement no.</div>{contract.agreementNo || '—'}</div>
          <div><div className="hint">Contractor</div>{contract.contractor || '—'}</div>
          <div><div className="hint">Bid submitted</div>{formatDate(contract.bidDate)}</div>
          <div><div className="hint">Work done amount</div>
            <span className="num num--left">{formatRupees(contract.workDoneAmount)}</span>
          </div>
        </div>
      </section>

      <section className="component section">
        <h2>Base index per component</h2>
        <p className="subtitle">
          {onOverride
            ? 'Each component takes its base from a different place. Type a value to override one.'
            : 'Each component takes its base from a different place.'}
        </p>

        <div className="panel panel--flush scroller--short">
          <table className="grid">
            <thead>
              <tr>
                <th>Component</th>
                <th className="r">Share %</th>
                <th>Base index from</th>
                <th className="r">Value</th>
                {onOverride && <th className="r col-md">Override</th>}
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
                    <td>{ruleText(key)}</td>
                    <td className={`num${base?.overridden ? ' overridden' : ''}`}>
                      {formatComponentIndex(base?.value ?? null, key)}
                    </td>
                    {onOverride && (
                      <td>
                        <input className="cell" type="number" step="0.0001"
                               aria-label={`Base index override, ${COMPONENT_LABELS[key]}`}
                               value={row?.baseOverride ?? ''} placeholder="auto"
                               onChange={(e) => onOverride(key, e.target.value)} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {COMPONENT_KEYS.some((k) => calculation?.bases[k]?.overridden) && (
          <p className="footnote">
            † Base index set by hand, not taken from the rates chart.
          </p>
        )}
      </section>
    </>
  );
}
