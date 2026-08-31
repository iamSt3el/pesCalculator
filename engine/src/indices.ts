import { addDays, dayOfMonth, monthOfDate, monthsOfQuarter, quarterOfMonth } from './dates.ts';
import type { PaymentSchedule } from './spans.ts';
import type {
  BaseRule, ComponentConfig, ComponentKey, ContractInput,
  IsoDate, Month, Quarter, RateRow,
} from './types.ts';

export type RateField =
  'labour' | 'material' | 'cement' | 'steel' | 'pol' | 'bitumenG' | 'bitumenH';

/** Which half of the month a bitumen rate belongs to. */
export type BitumenSeries = 'first' | 'second';

/** Everywhere but the base rate, bitumen reads the 1st series. */
export function rateFieldFor(key: ComponentKey): RateField {
  return key === 'bitumen' ? 'bitumenG' : key;
}

/**
 * Bitumen is published twice a month, so the base rate follows the half of the
 * month the offset date lands in: days 1-15 take Bitumen 1st, 16 onward take
 * Bitumen 2nd.
 */
export function bitumenSeriesOf(d: IsoDate): BitumenSeries {
  return dayOfMonth(d) <= 15 ? 'first' : 'second';
}

export function bitumenFieldOf(series: BitumenSeries): RateField {
  return series === 'first' ? 'bitumenG' : 'bitumenH';
}

export function buildRateIndex(rows: RateRow[]): Map<Month, RateRow> {
  return new Map(rows.map((r) => [r.month, r]));
}

export interface MeanResult {
  value: number | null;
  missing: Month[];
}

export function quarterMean(
  rates: Map<Month, RateRow>, q: Quarter, key: ComponentKey,
): MeanResult {
  const field = rateFieldFor(key);
  const months = monthsOfQuarter(q);
  const missing: Month[] = [];
  let sum = 0;
  for (const m of months) {
    const v = rates.get(m)?.[field];
    if (v === undefined || v === null) missing.push(m);
    else sum += v;
  }
  return missing.length > 0 ? { value: null, missing } : { value: sum / 3, missing: [] };
}

export function monthValue(
  rates: Map<Month, RateRow>, m: Month, key: ComponentKey,
): number | null {
  return rates.get(m)?.[rateFieldFor(key)] ?? null;
}

/** Spec 3.2 - the calendar quarter containing the bid submission date. */
export function baseQuarterOf(bidDate: IsoDate): Quarter {
  return quarterOfMonth(monthOfDate(bidDate));
}

export interface ResolvedBase {
  key: ComponentKey;
  rule: BaseRule;
  sourceMonths: Month[];
  /** Which bitumen series the base was read from; null for every other component. */
  bitumenSeries: BitumenSeries | null;
  value: number | null;
  overridden: boolean;
}

/**
 * Spec 3.2. Each component's base index follows its own rule:
 *   quarter_average - mean of the base quarter's three months
 *   bid_month       - the month containing the bid date (POL)
 *   offset_month    - the month containing (bid date - offset days) (Bitumen),
 *                     read from Bitumen 1st or 2nd per bitumenSeriesOf
 * An operator override, when present, wins over the rule.
 */
export function resolveBaseRates(
  rates: Map<Month, RateRow>,
  contract: ContractInput,
  components: ComponentConfig[],
): { bases: Map<ComponentKey, ResolvedBase>; missing: Month[] } {
  const baseQuarter = baseQuarterOf(contract.bidDate);
  const bidMonth = monthOfDate(contract.bidDate);
  // Stepping back from a bid date that is not set yet gives an unrepresentable
  // date, which used to throw. With no bid date there is no offset month, and
  // the missing rate is reported like any other.
  const offsetDate = contract.bidDate
    ? addDays(contract.bidDate, -contract.bitumenOffsetDays)
    : '';
  const offsetMonth = offsetDate ? monthOfDate(offsetDate) : '';
  const offsetSeries = offsetDate ? bitumenSeriesOf(offsetDate) : null;

  const bases = new Map<ComponentKey, ResolvedBase>();
  const missing = new Set<Month>();

  for (const c of components) {
    if (c.baseOverride !== null) {
      bases.set(c.key, {
        key: c.key, rule: c.baseRule, sourceMonths: [],
        bitumenSeries: null, value: c.baseOverride, overridden: true,
      });
      continue;
    }

    // Only bitumen's own offset_month base picks between the two series.
    const series = c.key === 'bitumen' && c.baseRule === 'offset_month' ? offsetSeries : null;

    let value: number | null;
    let sourceMonths: Month[];
    if (c.baseRule === 'quarter_average') {
      const mean = quarterMean(rates, baseQuarter, c.key);
      value = mean.value;
      sourceMonths = monthsOfQuarter(baseQuarter);
      for (const m of mean.missing) missing.add(m);
    } else {
      const m = c.baseRule === 'bid_month' ? bidMonth : offsetMonth;
      const field = series ? bitumenFieldOf(series) : rateFieldFor(c.key);
      value = rates.get(m)?.[field] ?? null;
      sourceMonths = [m];
      if (value === null) missing.add(m);
    }

    bases.set(c.key, {
      key: c.key, rule: c.baseRule, sourceMonths, bitumenSeries: series, value, overridden: false,
    });
  }

  return { bases, missing: [...missing].sort() };
}

/** Spec 3.3 - every calendar quarter that carries a payment, in order. */
export function quartersUnderConsideration(schedule: PaymentSchedule): Quarter[] {
  return [...schedule.byQuarter.keys()].sort();
}
