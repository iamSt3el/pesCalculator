import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/escalation.ts';
import {
  RATES_2023_24, CONTRACT_168, COMPONENTS_168, PROGRESS_168, ADJUSTMENTS_168,
} from './fixtures/agreement168.ts';

const input = {
  contract: CONTRACT_168, components: COMPONENTS_168,
  rates: RATES_2023_24, progress: PROGRESS_168, adjustments: ADJUSTMENTS_168,
};

test('the five index components are billed quarterly, bitumen monthly', () => {
  const result = calculate(input);
  const labour = result.lines.filter((l) => l.component === 'labour');
  assert.equal(labour.length, 3);
  assert.equal(labour[0]!.periodKind, 'quarter');
  const bitumen = result.lines.filter((l) => l.component === 'bitumen');
  assert.equal(bitumen.length, 6);
  assert.equal(bitumen[0]!.periodKind, 'month');
});

test('the first quarter under consideration is the base quarter, so it nets to zero', () => {
  const result = calculate(input);
  const q1 = result.lines.find((l) => l.component === 'labour' && l.period === '2023-Q3')!;
  assert.equal(q1.currentIndex, q1.baseIndex);
  assert.equal(q1.amount, 0);
});

test('a zero-percent component contributes nothing', () => {
  const result = calculate(input);
  assert.equal(result.componentTotals.get('cement'), 0);
});

test('POL uses a single-month base against quarter-average current values', () => {
  const result = calculate(input);
  const q1 = result.lines.find((l) => l.component === 'pol' && l.period === '2023-Q3')!;
  assert.equal(q1.baseIndex, 90.8);                         // Sep 2023 alone
  assert.ok(Math.abs(q1.currentIndex! - 89.9) < 1e-9);       // Jul-Sep mean
});

test('component totals match the source workbook to the paisa', () => {
  const t = calculate(input).componentTotals;
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.005, `${a} != ${b}`);
  near(t.get('labour')!, -18356.29);
  near(t.get('material')!, 24516.94);
  near(t.get('cement')!, 0);
  near(t.get('steel')!, -4386.11);
  near(t.get('pol')!, -6959.29);
  near(t.get('bitumen')!, 177788.75);
});

test('payable is the rounded grand total less what has already been paid', () => {
  assert.equal(calculate(input).payable, 172604);
  const withPaid = calculate({ ...input, contract: { ...CONTRACT_168, alreadyPaid: 100000 } });
  assert.equal(withPaid.payable, 72604);
});

test('payable is carried to the paise, so the bill subtracts exactly', () => {
  const withPaise = calculate({
    ...input, contract: { ...CONTRACT_168, alreadyPaid: 100000.37 },
  });
  assert.equal(withPaise.payable, 72603.63);
});

test('missing rate months are reported by name rather than throwing', () => {
  const result = calculate({ ...input, rates: RATES_2023_24.filter((r) => r.month !== '2024-03') });
  const problem = result.problems.find((p) => p.code === 'missing_rates');
  assert.ok(problem, 'expected a missing_rates problem');
  assert.deepEqual(problem!.months, ['2024-03']);
});

test('percentages not totalling 100 are flagged but do not stop the calculation', () => {
  const bad = COMPONENTS_168.map((c) => (c.key === 'labour' ? { ...c, percent: 10 } : c));
  const result = calculate({ ...input, components: bad });
  assert.ok(result.problems.some((p) => p.code === 'percent_total'));
  assert.ok(Number.isFinite(result.payable));
});

test('a zero base index is reported instead of producing Infinity', () => {
  const bad = COMPONENTS_168.map((c) => (c.key === 'labour' ? { ...c, baseOverride: 0 } : c));
  const result = calculate({ ...input, components: bad });
  assert.ok(result.problems.some((p) => p.code === 'zero_base'));
  assert.equal(result.componentTotals.get('labour'), 0);
});
