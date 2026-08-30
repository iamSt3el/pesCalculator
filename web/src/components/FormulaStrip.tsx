import type { EscalationLine } from '../api.ts';
import { formatComponentIndex, formatMonth, formatQuarter, formatRupees } from '../format.ts';

/**
 * One escalation line laid out on the shared grid of its parent .formula-block.
 * Operands AND operators each get their own column, so a block of lines reads
 * as a matrix: every factor, every value, every base sits directly under its
 * neighbour. That is what lets an engineer check the bill by scanning down.
 */
export function FormulaStrip({ line }: { line: EscalationLine }) {
  const label = line.periodKind === 'month' ? formatMonth(line.period) : formatQuarter(line.period);
  const index = (n: number | null) => formatComponentIndex(n, line.component);

  return (
    <>
      <span className="f-period">{label}</span>
      <span className="f-n">{line.factor}</span>
      <span className="f-op">×</span>
      <span className="f-n">{line.percent}/100</span>
      <span className="f-op">×</span>
      <span className="f-n">₹{formatRupees(line.value)}</span>
      <span className="f-op">×</span>
      <span className="f-paren">(</span>
      <span className="f-n">{index(line.currentIndex)}</span>
      <span className="f-op">−</span>
      <span className="f-n">{index(line.baseIndex)}</span>
      <span className="f-paren">)</span>
      <span className="f-op">/</span>
      <span className="f-n">{index(line.baseIndex)}</span>
      <span className={`f-amount${line.amount < 0 ? ' num--negative' : ''}`}>
        {formatRupees(line.amount)}
      </span>
    </>
  );
}
