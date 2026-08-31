import { COMPONENT_KEYS, COMPONENT_LABELS, type ComponentKey } from '../api.ts';
import { FormulaStrip } from './FormulaStrip.tsx';
import { ProvisionalBand } from './ProvisionalBand.tsx';
import { useContract } from '../ContractLayout.tsx';
import {
  formatComponentIndex, formatDate, formatMonth, formatQuarter, formatRupees, rupeesInWords,
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
/**
 * `showBand` is false only on the last sheet of the printed set, where the
 * set's own band already sits on sheet 1 and a second would be noise.
 */
export function BillPaper({ showBand = true }: { showBand?: boolean } = {}) {
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
    if (base.rule === 'bid_month') return `${formatMonth(m)}, the bid month`;
    const series = base.bitumenSeries === 'second' ? 'Bitumen 2nd' : 'Bitumen 1st';
    return `${formatMonth(m)} ${series}, ${contract.bitumenOffsetDays} days before the bid`;
  };

  return (
    <div className="paper">
      {showBand && <ProvisionalBand count={calculation.problems.length} />}
      <header className="bill-head">
        <h2>Price escalation under Clause-45</h2>
        <p className="meta">
          Calculation for the period on which escalation is payable.
        </p>
        <div className="bill-fields">
          <Field label="Agreement no.">{contract.agreementNo || '—'}</Field>
          <Field label="Contractor">{contract.contractor || '—'}</Field>
          <Field label="Work order">{contract.woNoDate || '—'}</Field>
          <div className="wide">
            <Field label="Work">{contract.workName || '—'}</Field>
          </div>
          <Field label="Bid submitted">{formatDate(contract.bidDate)}</Field>
          <Field label="Commencement">{formatDate(contract.commencement)}</Field>
          <Field label="Stipulated completion">{formatDate(contract.stipulatedCompletion)}</Field>
          <Field label="Actual completion">{formatDate(contract.actualCompletion)}</Field>
          <Field label="Work done amount">
            <span className="num num--left">₹{formatRupees(contract.workDoneAmount)}</span>
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
                {formatComponentIndex(calculation.bases[key]?.value ?? null, key)}
                {' '}({baseText(key)})
              </span>
            </div>
            <div className="formula-block stack-sm">
              {lines.map((l) => <FormulaStrip key={`${l.component}-${l.period}`} line={l} />)}
            </div>
            <div className="spread stack-sm">
              <span className="strong">Total, {COMPONENT_LABELS[key]}</span>
              <span className={`num strong${total < 0 ? ' num--negative' : ''}`}>
                {formatRupees(total)}
              </span>
            </div>
          </section>
        );
      })}

      <section className="component bill-total">
        <div className="bill-total__line">
          <span>Grand total — Labour + Material + Cement + Steel + POL + Bitumen</span>
          <span className={`num${calculation.grandTotal < 0 ? ' num--negative' : ''}`}>
            {formatRupees(calculation.grandTotal)}
          </span>
        </div>
        <div className="bill-total__line">
          <span>Less escalation already paid</span>
          <span className="num">{formatRupees(calculation.alreadyPaid)}</span>
        </div>
        <div className="bill-total__final">
          <span>
            {provisional ? 'Provisional amount of this bill' : 'Amount of this price escalation bill'}
          </span>
          <span className="payable">₹{formatRupees(calculation.payable)}</span>
        </div>
        <p className="bill-words">{rupeesInWords(calculation.payable)}</p>
      </section>

      <section className="component sign">
        <div className="sign__block">
          <div className="sign__rule">{contract.contractor || '—'}</div>
          <div className="label">Contractor</div>
        </div>
      </section>
    </div>
  );
}
