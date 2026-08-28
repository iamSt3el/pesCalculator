import { COMPONENT_KEYS, COMPONENT_LABELS, type ComponentKey } from '../api.ts';
import { FormulaStrip } from './FormulaStrip.tsx';
import { useContract } from '../ContractLayout.tsx';
import {
  formatDate, formatIndex, formatMonth, formatQuarter, formatRupees, rupeesInWords,
} from '../format.ts';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="stack">
      <span className="label">{label}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * The bill itself — every line in full, so the figure can be checked by hand.
 * Rendered both as the Calculation stage and as the last page of the print set.
 */
export function BillPaper() {
  const { bundle, calculation } = useContract();
  const { contract } = bundle;
  if (!calculation) return null;

  const provisional = calculation.problems.length > 0;

  const baseText = (key: ComponentKey) => {
    const base = calculation.bases[key];
    if (!base) return '—';
    if (base.rule === 'quarter_average') return `average of ${formatQuarter(calculation.baseQuarter)}`;
    const m = base.sourceMonths[0];
    if (!m) return '—';
    return base.rule === 'bid_month'
      ? `${formatMonth(m)}, the bid month`
      : `${formatMonth(m)}, ${contract.bitumenOffsetDays} days before the bid`;
  };

  return (
    <div className="paper">
      <header style={{ borderBottom: '2px solid var(--ink)', paddingBottom: 16, marginBottom: 4 }}>
        <h2 style={{ fontSize: 20 }}>Price escalation under Clause-45</h2>
        <p className="meta" style={{ margin: '4px 0 18px' }}>
          Calculation for the period on which escalation is payable.
        </p>
        <div className="grid-fields" style={{ fontSize: 14 }}>
          <Field label="Agreement no.">{contract.agreementNo || '—'}</Field>
          <Field label="Contractor">{contract.contractor || '—'}</Field>
          <Field label="Work order">{contract.woNoDate || '—'}</Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Work">{contract.workName || '—'}</Field>
          </div>
          <Field label="Bid submitted">{formatDate(contract.bidDate)}</Field>
          <Field label="Commencement">{formatDate(contract.commencement)}</Field>
          <Field label="Stipulated completion">{formatDate(contract.stipulatedCompletion)}</Field>
          <Field label="Actual completion">{formatDate(contract.actualCompletion)}</Field>
          <Field label="Work done amount">
            <span className="num" style={{ textAlign: 'left' }}>₹{formatRupees(contract.workDoneAmount)}</span>
          </Field>
        </div>
      </header>

      {COMPONENT_KEYS.map((key) => {
        const lines = calculation.lines.filter((l) => l.component === key);
        if (lines.length === 0) return null;
        const total = calculation.componentTotals[key] ?? 0;
        const config = bundle.components.find((c) => c.key === key);
        return (
          <section key={key} className="component">
            <div className="spread">
              <h2>{COMPONENT_LABELS[key]}</h2>
              <span className="meta">
                share {config?.percent ?? 0}% · factor {config?.factor ?? 0} · base{' '}
                {formatIndex(calculation.bases[key]?.value ?? null, key === 'bitumen' ? 0 : 4)}
                {' '}({baseText(key)})
              </span>
            </div>
            <div className="formula-block" style={{ marginTop: 10 }}>
              {lines.map((l) => <FormulaStrip key={`${l.component}-${l.period}`} line={l} />)}
            </div>
            <div className="spread" style={{ paddingTop: 10 }}>
              <span style={{ fontWeight: 600 }}>Total, {COMPONENT_LABELS[key]}</span>
              <span className={`num${total < 0 ? ' num--negative' : ''}`}
                    style={{ fontWeight: 600, fontSize: 15 }}>
                {formatRupees(total, 2)}
              </span>
            </div>
          </section>
        );
      })}

      <section style={{ marginTop: 26, borderTop: '2px solid var(--ink)', paddingTop: 16 }}
               className="component">
        <div className="spread">
          <span>Grand total — Labour + Material + Cement + Steel + POL + Bitumen</span>
          <span className={`num${calculation.grandTotal < 0 ? ' num--negative' : ''}`}>
            {formatRupees(calculation.grandTotal, 2)}
          </span>
        </div>
        <div className="spread" style={{ marginTop: 6 }}>
          <span>Less escalation already paid</span>
          <span className="num">{formatRupees(calculation.alreadyPaid, 2)}</span>
        </div>
        <div className="spread"
             style={{ borderTop: '1px solid var(--rule-strong)', marginTop: 14, paddingTop: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>
            {provisional ? 'Provisional amount of this bill' : 'Amount of this price escalation bill'}
          </span>
          <span className="payable">₹{formatRupees(calculation.payable)}</span>
        </div>
        <p style={{ margin: '4px 0 0', textAlign: 'right', fontStyle: 'italic', fontSize: 14 }}>
          {rupeesInWords(calculation.payable)}
        </p>
      </section>

      <section style={{ marginTop: 64, textAlign: 'right' }} className="component">
        <div style={{ display: 'inline-block', textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid var(--ink)', paddingTop: 6, minWidth: 250 }}>
            {contract.contractor || '—'}
          </div>
          <div className="label" style={{ marginTop: 2 }}>Contractor</div>
        </div>
      </section>
    </div>
  );
}
