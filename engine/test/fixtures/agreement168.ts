import type { ComponentConfig, ContractInput, ProgressRow, RateRow } from '../../src/types.ts';

const r = (
  month: string, labour: number, material: number, cement: number,
  steel: number, pol: number, bitumenG: number | null,
): RateRow => ({ month, labour, material, cement, steel, pol, bitumenG, bitumenH: null });

/** Rows from 'Rates Chart ok' covering the base quarter and every quarter under consideration. */
export const RATES_2023_24: RateRow[] = [
  r('2023-07', 130.0, 99.1, 98.1, 91.5, 89.1, 38472),
  r('2023-08', 125.2, 99.5, 98.3, 92.2, 89.8, 38882),
  r('2023-09', 123.4, 99.6, 99.4, 94.6, 90.8, 42072),
  r('2023-10', 124.2, 100.1, 102.4, 92.1, 91.4, 42542),
  r('2023-11', 124.4, 100.1, 102.3, 89.5, 90.9, 42202),
  r('2023-12', 124.2, 99.4, 100.0, 88.2, 89.8, 40582),
  r('2024-01', 125.3, 99.3, 98.1, 87.5, 89.6, 37452),
  r('2024-02', 125.5, 99.3, 97.6, 86.3, 89.9, 37292),
  r('2024-03', 125.3, 99.4, 96.1, 86.3, 89.3, 38312),
];

export const CONTRACT_168: ContractInput = {
  agreementNo: '168 of 2023-24',
  contractor: 'M/s. Pradeep Kumar Contractor',
  workName: 'Const. of various Roads under Pkg No RJ-20-06/ML/2023-24 Distt Jhunjhunu',
  woNoDate: 'No. 1504-12 Date 14.09.2024',
  woAmount: 23_977_779,
  workDoneAmount: 21_717_359,
  bidDate: '2023-09-12',
  commencement: '2023-09-24',
  stipulatedCompletion: '2024-02-23',
  actualCompletion: '2024-02-23',
  bitumenOffsetDays: 28,
  alreadyPaid: 0,
};

export const COMPONENTS_168: ComponentConfig[] = [
  { key: 'labour',   percent: 9.28,  factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
  { key: 'material', percent: 53.12, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
  { key: 'cement',   percent: 0,     factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
  { key: 'steel',    percent: 0.65,  factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
  { key: 'pol',      percent: 8.11,  factor: 0.75, baseRule: 'bid_month',       baseOverride: null },
  { key: 'bitumen',  percent: 28.84, factor: 0.85, baseRule: 'offset_month',    baseOverride: null },
];

export const PROGRESS_168: ProgressRow[] = [
  { month: '2023-09', spanDays: [6, 0, 0, 0] },
  { month: '2023-10', spanDays: [31, 0, 0, 0] },
  { month: '2023-11', spanDays: [1, 29, 0, 0] },
  { month: '2023-12', spanDays: [0, 9, 22, 0] },
  { month: '2024-01', spanDays: [0, 0, 16, 15] },
  { month: '2024-02', spanDays: [0, 0, 0, 23] },
];

export const ADJUSTMENTS_168 = new Map<string, number>([
  ['2023-10', 500_000], ['2023-11', 800_000], ['2023-12', 400_000],
  ['2024-01', -900_000], ['2024-02', -800_000],
]);
