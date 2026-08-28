import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRateIndex, quarterMean, monthValue, baseQuarterOf,
  resolveBaseRates, quartersUnderConsideration, rateFieldFor,
} from '../src/indices.ts';
import { computeSpans, buildSchedule } from '../src/spans.ts';
import { RATES_2023_24, CONTRACT_168, COMPONENTS_168, PROGRESS_168 } from './fixtures/agreement168.ts';

const rates = buildRateIndex(RATES_2023_24);

test('rateFieldFor maps the bitumen component to the G series', () => {
  assert.equal(rateFieldFor('bitumen'), 'bitumenG');
  assert.equal(rateFieldFor('labour'), 'labour');
});

test('quarterMean averages the three months of a quarter', () => {
  assert.equal(quarterMean(rates, '2023-Q3', 'labour').value, 126.2);
  const steel = quarterMean(rates, '2023-Q3', 'steel').value!;
  assert.ok(Math.abs(steel - 92.76666666666667) < 1e-9);
});

test('quarterMean reports missing months instead of guessing', () => {
  const sparse = buildRateIndex(RATES_2023_24.filter((r) => r.month !== '2023-08'));
  const result = quarterMean(sparse, '2023-Q3', 'labour');
  assert.equal(result.value, null);
  assert.deepEqual(result.missing, ['2023-08']);
});

test('monthValue reads a single month', () => {
  assert.equal(monthValue(rates, '2023-09', 'pol'), 90.8);
  assert.equal(monthValue(rates, '2023-08', 'bitumen'), 38882);
  assert.equal(monthValue(rates, '2019-01', 'pol'), null);
});

test('baseQuarterOf is the calendar quarter containing the bid date', () => {
  assert.equal(baseQuarterOf('2023-09-12'), '2023-Q3');
  assert.equal(baseQuarterOf('2024-01-05'), '2024-Q1');
});

test('resolveBaseRates applies a different rule per component', () => {
  const { bases, missing } = resolveBaseRates(rates, CONTRACT_168, COMPONENTS_168);
  assert.deepEqual(missing, []);
  // Averaging three floats leaves artefacts (99.39999999999999), exactly as the
  // source workbook does, so these compare with a tolerance rather than strictly.
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  near(bases.get('labour')!.value!, 126.2);
  near(bases.get('material')!.value!, 99.4);
  near(bases.get('cement')!.value!, 98.6);
  near(bases.get('steel')!.value!, 92.76666666666667);
  // POL's base is the bid month alone, not the quarter average of 89.9.
  assert.equal(bases.get('pol')!.value, 90.8);
  assert.deepEqual(bases.get('pol')!.sourceMonths, ['2023-09']);
  // Bitumen's base is the month of (bid date - 28 days) = Aug 2023.
  assert.equal(bases.get('bitumen')!.value, 38882);
  assert.deepEqual(bases.get('bitumen')!.sourceMonths, ['2023-08']);
});

test('resolveBaseRates honours an operator override', () => {
  const overridden = COMPONENTS_168.map((c) =>
    c.key === 'pol' ? { ...c, baseOverride: 91.5 } : c);
  const { bases } = resolveBaseRates(rates, CONTRACT_168, overridden);
  assert.equal(bases.get('pol')!.value, 91.5);
  assert.equal(bases.get('pol')!.overridden, true);
  assert.equal(bases.get('labour')!.overridden, false);
});

test('quartersUnderConsideration comes from the months that carry payments', () => {
  const spans = computeSpans(CONTRACT_168.commencement, CONTRACT_168.actualCompletion, CONTRACT_168.workDoneAmount);
  const sched = buildSchedule(PROGRESS_168, spans, CONTRACT_168.workDoneAmount, new Map());
  assert.deepEqual(quartersUnderConsideration(sched), ['2023-Q3', '2023-Q4', '2024-Q1']);
});
