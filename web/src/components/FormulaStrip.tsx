import type { ReactNode } from 'react';
import type { EscalationLine } from '../api.ts';
import { formatIndex, formatMonth, formatQuarter, formatRupees } from '../format.ts';

const Op = ({ children }: { children: ReactNode }) => (
  <span style={{ color: 'var(--ink-muted)', fontWeight: 400, padding: '0 5px' }}>{children}</span>
);

/**
 * One escalation line as a typeset equation, readable left to right so the
 * figure can be audited rather than taken on trust.
 */
export function FormulaStrip({ line }: { line: EscalationLine }) {
  const label = line.periodKind === 'month' ? formatMonth(line.period) : formatQuarter(line.period);
  const dp = line.component === 'bitumen' ? 0 : 4;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(80px, auto) 1fr minmax(110px, auto)',
        gap: 12,
        alignItems: 'baseline',
        padding: '7px 0',
        borderBottom: '1px solid var(--rule)',
        fontFamily: 'var(--mono)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{label}</span>
      <span className="scroller" style={{ whiteSpace: 'nowrap' }}>
        {line.factor}
        <Op>×</Op>{line.percent}/100
        <Op>×</Op>₹{formatRupees(line.value)}
        <Op>×</Op>({formatIndex(line.currentIndex, dp)}<Op>−</Op>{formatIndex(line.baseIndex, dp)})
        <Op>/</Op>{formatIndex(line.baseIndex, dp)}
      </span>
      <span className={`num${line.amount < 0 ? ' num--negative' : ''}`} style={{ fontWeight: 600 }}>
        {formatRupees(line.amount, 2)}
      </span>
    </div>
  );
}
