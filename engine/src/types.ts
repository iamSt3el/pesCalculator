export type ComponentKey = 'labour' | 'material' | 'cement' | 'steel' | 'pol' | 'bitumen';

export const COMPONENT_KEYS: readonly ComponentKey[] = [
  'labour', 'material', 'cement', 'steel', 'pol', 'bitumen',
] as const;

/** How a component's base index is derived from the rates chart. */
export type BaseRule = 'quarter_average' | 'bid_month' | 'offset_month';

export type Month = string;    // 'YYYY-MM'
export type Quarter = string;  // 'YYYY-Qn'
export type IsoDate = string;  // 'YYYY-MM-DD'

export interface RateRow {
  month: Month;
  labour: number | null;
  material: number | null;
  cement: number | null;
  steel: number | null;
  pol: number | null;
  bitumenG: number | null;
  /** Second bitumen series, recorded but unused in any calculation. */
  bitumenH: number | null;
}

export interface ComponentConfig {
  key: ComponentKey;
  percent: number;
  factor: number;
  baseRule: BaseRule;
  /** When set, overrides the rule-derived base index. */
  baseOverride: number | null;
}

export interface ContractInput {
  agreementNo: string;
  contractor: string;
  workName: string;
  woNoDate: string;
  woAmount: number;
  workDoneAmount: number;
  bidDate: IsoDate;
  commencement: IsoDate;
  stipulatedCompletion: IsoDate;
  actualCompletion: IsoDate;
  bitumenOffsetDays: number;
  alreadyPaid: number;
}

export interface ProgressRow {
  month: Month;
  spanDays: [number, number, number, number];
}
