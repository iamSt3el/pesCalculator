import { COMPONENT_KEYS, COMPONENT_LABELS, type ComponentKey } from '../api.ts';
import { FormulaStrip } from '../components/FormulaStrip.tsx';
import { useContract } from '../ContractLayout.tsx';
import {
  formatDate, formatIndex, formatMonth, formatQuarter, formatRupees, rupeesInWords,
} from '../format.ts';
import '../print.css';

export function CalculationPage() {
  const { bundle, calculation } = useContract();
  const { contract } = bundle;

  if (!calculation) {
    return <>
      <h1 style={{ fontFamily: 'var(--serif)' }}>Calculation</h1>
      <p className="hint">Fill in Main Data and the rates chart to produce the bill.</p>
    </>;
  }

  const provisional = calculation.problems.length > 0;

  const baseText = (key: ComponentKey) => {
    const base = calculation.bases[key];
    if (!base) return '—';
    if (base.rule === 'quarter_average') return `average of ${formatQuarter(calculation.baseQuarter)}`;
    const m = base.sourceMonths[0];
    return m ? formatMonth(m) : '—';
  };

  return (
    <div className="report" style={{ fontFamily: 'var(--serif)' }}>
      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontFamily: 'var(--serif)' }}>Calculation</h1>
        <button onClick={() => window.print()}>Print</button>
      </div>

      {provisional && (
        <div className="no-print">
          {calculation.problems.map((p) => <p key={p.code} className="notice">{p.message}</p>)}
        </div>
      )}

      <section className="card" style={{ marginBottom: 20 }}>
        <p style={{ marginTop: 0, fontSize: 15 }}>
          Calculation of price escalation for the period on which escalation is payable,
          under Clause-45 of the agreement.
        </p>
        <div className="grid-fields" style={{ fontSize: 14 }}>
          <div><div className="hint">Agreement no.</div>{contract.agreementNo || '—'}</div>
          <div><div className="hint">Contractor</div>{contract.contractor || '—'}</div>
          <div style={{ gridColumn: '1 / -1' }}><div className="hint">Work</div>{contract.workName || '—'}</div>
          <div><div className="hint">Work order</div>{contract.woNoDate || '—'}</div>
          <div><div className="hint">Bid submitted</div>{formatDate(contract.bidDate)}</div>
          <div><div className="hint">Commencement</div>{formatDate(contract.commencement)}</div>
          <div><div className="hint">Stipulated completion</div>{formatDate(contract.stipulatedCompletion)}</div>
          <div><div className="hint">Actual completion</div>{formatDate(contract.actualCompletion)}</div>
          <div><div className="hint">Work done amount</div>
            <span className="num" style={{ textAlign: 'left' }}>₹{formatRupees(contract.workDoneAmount)}</span>
          </div>
        </div>
      </section>

      {COMPONENT_KEYS.map((key) => {
        const lines = calculation.lines.filter((l) => l.component === key);
        if (lines.length === 0) return null;
        const total = calculation.componentTotals[key] ?? 0;
        const config = bundle.components.find((c) => c.key === key);
        return (
          <section key={key} className="card" style={{ marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{ fontFamily: 'var(--serif)', margin: 0 }}>{COMPONENT_LABELS[key]}</h2>
              <span className="hint">
                share {config?.percent ?? 0}% · factor {config?.factor ?? 0} · base{' '}
                {formatIndex(calculation.bases[key]?.value ?? null, key === 'bitumen' ? 0 : 4)}
                {' '}({baseText(key)})
              </span>
            </div>
            <div style={{ marginTop: 10 }}>
              {lines.map((l) => <FormulaStrip key={`${l.component}-${l.period}`} line={l} />)}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', paddingTop: 8 }}>
              <span style={{ fontWeight: 600 }}>Total, {COMPONENT_LABELS[key]}</span>
              <span className={`num${total < 0 ? ' num--negative' : ''}`} style={{ fontWeight: 600 }}>
                {formatRupees(total, 2)}
              </span>
            </div>
          </section>
        );
      })}

      <section className="card" style={{ marginBottom: 24 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>Grand total (Labour + Material + Cement + Steel + POL + Bitumen)</span>
          <span className={`num${calculation.grandTotal < 0 ? ' num--negative' : ''}`}>
            {formatRupees(calculation.grandTotal, 2)}
          </span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>Less escalation already paid</span>
          <span className="num">{formatRupees(calculation.alreadyPaid, 2)}</span>
        </div>
        <div className="row"
             style={{ justifyContent: 'space-between', alignItems: 'baseline',
                      borderTop: '2px solid var(--ink)', marginTop: 10, paddingTop: 10 }}>
          <span style={{ fontWeight: 600 }}>
            {provisional ? 'Provisional amount of this bill' : 'Amount of this price escalation bill'}
          </span>
          <span className="num" style={{ fontSize: 26, fontWeight: 600, color: 'var(--stamp)' }}>
            ₹{formatRupees(calculation.payable)}
          </span>
        </div>
        <p style={{ margin: '6px 0 0', textAlign: 'right', fontStyle: 'italic' }}>
          {rupeesInWords(calculation.payable)}
        </p>
      </section>

      <section style={{ marginTop: 48, textAlign: 'right' }}>
        <div style={{ display: 'inline-block', textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid var(--ink)', paddingTop: 6, minWidth: 240 }}>
            {contract.contractor || '—'}
          </div>
          <div className="hint">Contractor</div>
        </div>
      </section>
    </div>
  );
}
