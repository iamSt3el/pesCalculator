import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/index.ts';
import {
  RATES_2023_24, CONTRACT_168, COMPONENTS_168, PROGRESS_168, ADJUSTMENTS_168,
} from './fixtures/agreement168.ts';

/**
 * Reproduces 'Pradeep Kumar 168.xlsx' end to end. Every value below was read
 * from the workbook itself; none may change without a deliberate spec change.
 */
const result = calculate({
  contract: CONTRACT_168, components: COMPONENTS_168,
  rates: RATES_2023_24, progress: PROGRESS_168, adjustments: ADJUSTMENTS_168,
});

const near = (a: number, b: number, tol = 0.005) =>
  assert.ok(Math.abs(a - b) < tol, `expected ${b}, got ${a}`);

test('golden: no problems are reported for a complete contract', () => {
  assert.deepEqual(result.problems, []);
});

test('golden: spanwise time and value distribution', () => {
  assert.equal(result.spans.totalDays, 152);
  assert.deepEqual(result.spans.days, [38, 38, 38, 38]);
  near(result.spans.values[0]!, 2_714_669.875, 1e-6);
  near(result.spans.values[1]!, 5_429_339.75, 1e-6);
  near(result.spans.values[2]!, 8_144_009.625, 1e-6);
  near(result.spans.values[3]!, 5_429_339.75, 1e-6);
  assert.deepEqual(result.spans.endDates,
    ['2023-11-01', '2023-12-09', '2024-01-16', '2024-02-23']);
});

test('golden: schedule of payment totals the work done amount', () => {
  assert.equal(result.schedule.total, 21_717_359);
  assert.equal(result.schedule.byQuarter.get('2023-Q3'), 428_632);
  assert.equal(result.schedule.byQuarter.get('2023-Q4'), 14_130_330);
  assert.equal(result.schedule.byQuarter.get('2024-Q1'), 7_158_397);
});

test('golden: base quarter and base indices', () => {
  assert.equal(result.baseQuarter, '2023-Q3');
  near(result.bases.get('labour')!.value!, 126.2, 1e-9);
  near(result.bases.get('material')!.value!, 99.4, 1e-9);
  near(result.bases.get('cement')!.value!, 98.6, 1e-9);
  near(result.bases.get('steel')!.value!, 92.766667, 1e-6);
  near(result.bases.get('pol')!.value!, 90.8, 1e-9);
  near(result.bases.get('bitumen')!.value!, 38882, 1e-9);
});

test('golden: quarters under consideration', () => {
  assert.deepEqual(result.quarters, ['2023-Q3', '2023-Q4', '2024-Q1']);
});

test('golden: component totals', () => {
  near(result.componentTotals.get('labour')!, -18356.29);
  near(result.componentTotals.get('material')!, 24516.94);
  near(result.componentTotals.get('cement')!, 0);
  near(result.componentTotals.get('steel')!, -4386.11);
  near(result.componentTotals.get('pol')!, -6959.29);
  near(result.componentTotals.get('bitumen')!, 177788.75);
});

test('golden: the payable amount is Rs. 1,72,604', () => {
  near(result.grandTotal, 172604.0, 0.01);
  assert.equal(result.payable, 172604);
});
