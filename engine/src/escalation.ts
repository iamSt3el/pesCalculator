import { availableDays, monthsOfPeriod, roundHalfAwayFromZero } from './dates.ts';
import {
  baseQuarterOf, buildRateIndex, monthValue, quarterMean,
  quartersUnderConsideration, resolveBaseRates, type ResolvedBase,
} from './indices.ts';
import {
  buildSchedule, computeSpans, emptySpanTable, type PaymentSchedule, type SpanTable,
} from './spans.ts';
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
  code: 'missing_rates' | 'percent_total' | 'zero_base' | 'invalid_period'
    | 'schedule_drift' | 'unbilled_days' | 'impossible_days' | 'expenditure_drift';
  message: string;
  months?: Month[];
}

export interface CalculationInput {
  contract: ContractInput;
  components: ComponentConfig[];
  rates: RateRow[];
  progress: ProgressRow[];
  adjustments: Map<Month, number>;
  /** Expenditure entered by hand per month, billed when the basis is execution. */
  expenditure?: Map<Month, number>;
}

export interface CalculationResult {
  spans: SpanTable;
  /** Days each month has inside the period - what its recorded days are measured against. */
  monthDays: Map<Month, number>;
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
  const amount = (factor * (percent / 100) * value * (current - base)) / base;
  // A period carrying no value against a falling index yields -0, which prints
  // as a signed zero and compares unequal to 0. A zero amount has no sign.
  return amount === 0 ? 0 : amount;
}

export function calculate(input: CalculationInput): CalculationResult {
  const { contract, components, progress, adjustments } = input;
  const problems: Problem[] = [];
  const rates = buildRateIndex(input.rates);

  // A contract is created before its dates are known. Spreading the work over a
  // period that has no ends produced a NaN date and threw, so the whole
  // calculation endpoint failed for every contract until both dates were filled.
  const hasPeriod = Boolean(contract.commencement && contract.actualCompletion);
  if (!hasPeriod) {
    problems.push({
      code: 'invalid_period',
      message: 'The date of commencement and the actual date of completion are both needed.',
    });
  } else if (contract.actualCompletion < contract.commencement) {
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

  const spans = hasPeriod
    ? computeSpans(contract.commencement, contract.actualCompletion, contract.workDoneAmount)
    : emptySpanTable();
  // Every month of the period is listed on the schedule, an idle one at zero,
  // so the schedule and its quarters cover the whole period the bill is for.
  const periodMonths = monthsOfPeriod(contract.commencement, contract.actualCompletion);
  const basis = contract.scheduleBasis ?? 'spanwise';
  const expenditure = input.expenditure ?? new Map<Month, number>();
  const schedule = buildSchedule(progress, spans, adjustments, {
    basis, expenditure, months: periodMonths,
  });
  // A span bills its own rate for every day recorded against it, so days never
  // recorded are days nobody bills, and days recorded beyond a span's length are
  // days billed twice. Either way the schedule misses the work done amount.
  const misrecorded = [0, 1, 2, 3].filter((i) => schedule.workedDays[i] !== spans.days[i]);

  if (basis === 'execution') {
    // The expenditure is typed to the paise and billed as it stands, so it is
    // held to the work done amount to the paise. Like the span-wise case, the
    // two causes of a miss are fixed on different stages: the expenditure on
    // Main Data, the adjustments on Base Rate.
    const workDone = roundHalfAwayFromZero(contract.workDoneAmount, 2);
    const spent = roundHalfAwayFromZero(
      [...expenditure.values()].reduce((a, b) => a + b, 0), 2);
    if (spent !== workDone) {
      problems.push({
        code: 'expenditure_drift',
        message: `The execution-wise expenditure totals ${spent.toFixed(2)}, but the work done amount is ${workDone.toFixed(2)}.`,
      });
    } else if (schedule.total !== workDone) {
      problems.push({
        code: 'schedule_drift',
        message: `Schedule totals ${schedule.total.toFixed(2)}, but the work done amount is ${contract.workDoneAmount.toFixed(2)}.`,
      });
    }
  } else if (schedule.total !== roundHalfAwayFromZero(contract.workDoneAmount)) {
    // The monthly figures are allocated in whole rupees (spec 3.5), so the
    // schedule can only ever reach the work done amount rounded. Comparing
    // against the unrounded figure reported a drift that no edit could clear,
    // which left every contract whose amount carried paise permanently
    // provisional.
    //
    // The two causes are fixed on different stages: the days are entered on Main
    // Data, while the schedule's adjustments are edited on Base Rate. Reporting
    // both alike sent an operator with unrecorded days to Base Rate, where there
    // is nothing to fix.
    if (misrecorded.length > 0) {
      const named = misrecorded.map((i) => `span ${i + 1}`).join(', ');
      const unbilled = misrecorded.reduce(
        (a, i) => a + (spans.days[i]! - schedule.workedDays[i]!) * schedule.perDay[i]!, 0);
      problems.push({
        code: 'unbilled_days',
        message: unbilled >= 0
          ? `The days recorded do not fill ${named}, so ${unbilled.toFixed(2)} of the work done amount has no day to be billed on.`
          : `More days are recorded against ${named} than ${misrecorded.length === 1 ? 'it holds' : 'they hold'}, so the schedule bills ${(-unbilled).toFixed(2)} over the work done amount.`,
      });
    } else {
      problems.push({
        code: 'schedule_drift',
        message: `Schedule totals ${schedule.total.toFixed(2)}, but the work done amount is ${contract.workDoneAmount.toFixed(2)}.`,
      });
    }
  }

  // Days recorded beyond what a month holds inside the period bill more of the
  // span than the month can have earned. Nothing checked this: `max=31` on the
  // input is a hint the browser does not enforce, and the API takes any
  // non-negative integer.
  const monthDays = hasPeriod
    ? availableDays(contract.commencement, contract.actualCompletion)
    : new Map<Month, number>();
  // On the execution basis the spanwise grid bills nothing, so a slip in it
  // cannot touch the bill and must not hold it provisional.
  if (hasPeriod && basis === 'spanwise') {
    const impossible = progress
      .filter((p) => p.spanDays.reduce((a, b) => a + b, 0) > (monthDays.get(p.month) ?? 0))
      .map((p) => p.month)
      .sort();
    if (impossible.length > 0) {
      problems.push({
        code: 'impossible_days',
        message: `More days are recorded than the contract period leaves in ${impossible.length} month(s): ${impossible.join(', ')}.`,
        months: impossible,
      });
    }
  }

  const baseQuarter = baseQuarterOf(contract.bidDate);
  const { bases, missing } = resolveBaseRates(rates, contract, components);
  const missingMonths = new Set<Month>(missing);

  const quarters = quartersUnderConsideration(
    schedule, contract.commencement, contract.actualCompletion);
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
      // Bitumen is billed monthly, so every month of the period gets a line of
      // its own, an idle one at zero. Listing only the months that pay left the
      // bill disagreeing with its own quarterly half about the period covered.
      const paid = new Map(schedule.rows.map((r) => [r.month, r.payment]));
      const months = [...new Set([...periodMonths, ...paid.keys()])].sort();
      for (const month of months) {
        const value = paid.get(month) ?? 0;
        const current = monthValue(rates, month, c.key);
        // A period carrying nothing contributes nothing whatever its index, so a
        // gap in the chart there cannot change the bill and is not reported.
        if (current === null && value !== 0) missingMonths.add(month);
        const amount = lineAmount(c.factor, c.percent, value, current, base.value);
        total += amount;
        lines.push({
          component: c.key, period: month, periodKind: 'month',
          factor: c.factor, percent: c.percent, value,
          currentIndex: current, baseIndex: base.value, amount,
        });
      }
    } else {
      for (const q of quarters) {
        const mean = quarterMean(rates, q, c.key);
        const value = schedule.byQuarter.get(q) ?? 0;
        if (value !== 0) for (const m of mean.missing) missingMonths.add(m);
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
    spans, monthDays, schedule, baseQuarter, bases, quarters, lines, componentTotals,
    grandTotal,
    alreadyPaid: contract.alreadyPaid,
    payable: roundHalfAwayFromZero(grandTotal - contract.alreadyPaid, 2),
    problems,
  };
}
