import { roundHalfAwayFromZero } from './dates.ts';
import {
  baseQuarterOf, buildRateIndex, monthValue, quarterMean,
  quartersUnderConsideration, resolveBaseRates, type ResolvedBase,
} from './indices.ts';
import { buildSchedule, computeSpans, type PaymentSchedule, type SpanTable } from './spans.ts';
import type {
  ComponentConfig, ComponentKey, ContractInput, Month,
  ProgressRow, Quarter, RateRow,
} from './types.ts';

export interface EscalationLine {
  component: ComponentKey;
  period: Quarter | Month;
  periodKind: 'quarter' | 'month';
  factor: number;
  percent: number;
  value: number;
  currentIndex: number | null;
  baseIndex: number | null;
  amount: number;
}

export interface Problem {
  code: 'missing_rates' | 'percent_total' | 'zero_base' | 'invalid_period' | 'schedule_drift';
  message: string;
  months?: Month[];
}

export interface CalculationInput {
  contract: ContractInput;
  components: ComponentConfig[];
  rates: RateRow[];
  progress: ProgressRow[];
  adjustments: Map<Month, number>;
}

export interface CalculationResult {
  spans: SpanTable;
  schedule: PaymentSchedule;
  baseQuarter: Quarter;
  bases: Map<ComponentKey, ResolvedBase>;
  quarters: Quarter[];
  lines: EscalationLine[];
  componentTotals: Map<ComponentKey, number>;
  grandTotal: number;
  alreadyPaid: number;
  payable: number;
  problems: Problem[];
}

/** Spec 3.4: factor x percent/100 x value x (current - base) / base */
function lineAmount(
  factor: number, percent: number, value: number,
  current: number | null, base: number | null,
): number {
  if (current === null || base === null || base === 0) return 0;
  return (factor * (percent / 100) * value * (current - base)) / base;
}

export function calculate(input: CalculationInput): CalculationResult {
  const { contract, components, progress, adjustments } = input;
  const problems: Problem[] = [];
  const rates = buildRateIndex(input.rates);

  if (contract.actualCompletion < contract.commencement) {
    problems.push({
      code: 'invalid_period',
      message: 'Actual completion is earlier than the date of commencement.',
    });
  }

  const percentTotal = components.reduce((a, c) => a + c.percent, 0);
  if (Math.abs(percentTotal - 100) > 1e-9) {
    problems.push({
      code: 'percent_total',
      message: `Component percentages total ${percentTotal}, not 100.`,
    });
  }

  const spans = computeSpans(contract.commencement, contract.actualCompletion, contract.workDoneAmount);
  const schedule = buildSchedule(progress, spans, contract.workDoneAmount, adjustments);
  if (schedule.total !== contract.workDoneAmount) {
    problems.push({
      code: 'schedule_drift',
      message: `Schedule totals ${schedule.total}, but the work done amount is ${contract.workDoneAmount}.`,
    });
  }

  const baseQuarter = baseQuarterOf(contract.bidDate);
  const { bases, missing } = resolveBaseRates(rates, contract, components);
  const missingMonths = new Set<Month>(missing);

  const quarters = quartersUnderConsideration(schedule);
  const lines: EscalationLine[] = [];
  const componentTotals = new Map<ComponentKey, number>();

  for (const c of components) {
    const base = bases.get(c.key)!;
    if (base.value === 0) {
      problems.push({
        code: 'zero_base',
        message: `The base index for ${c.key} is zero, so its escalation cannot be computed.`,
      });
    }

    let total = 0;
    if (c.key === 'bitumen') {
      for (const row of schedule.rows) {
        const current = monthValue(rates, row.month, c.key);
        if (current === null) missingMonths.add(row.month);
        const amount = lineAmount(c.factor, c.percent, row.payment, current, base.value);
        total += amount;
        lines.push({
          component: c.key, period: row.month, periodKind: 'month',
          factor: c.factor, percent: c.percent, value: row.payment,
          currentIndex: current, baseIndex: base.value, amount,
        });
      }
    } else {
      for (const q of quarters) {
        const mean = quarterMean(rates, q, c.key);
        for (const m of mean.missing) missingMonths.add(m);
        const value = schedule.byQuarter.get(q) ?? 0;
        const amount = lineAmount(c.factor, c.percent, value, mean.value, base.value);
        total += amount;
        lines.push({
          component: c.key, period: q, periodKind: 'quarter',
          factor: c.factor, percent: c.percent, value,
          currentIndex: mean.value, baseIndex: base.value, amount,
        });
      }
    }
    componentTotals.set(c.key, total);
  }

  if (missingMonths.size > 0) {
    const months = [...missingMonths].sort();
    problems.push({
      code: 'missing_rates',
      message: `The rates chart is missing ${months.length} month(s) needed by this calculation: ${months.join(', ')}.`,
      months,
    });
  }

  const grandTotal = [...componentTotals.values()].reduce((a, b) => a + b, 0);
  return {
    spans, schedule, baseQuarter, bases, quarters, lines, componentTotals,
    grandTotal,
    alreadyPaid: contract.alreadyPaid,
    payable: roundHalfAwayFromZero(grandTotal - contract.alreadyPaid),
    problems,
  };
}
