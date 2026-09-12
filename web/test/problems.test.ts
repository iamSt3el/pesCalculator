import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedStages, routeProblems } from '../src/problems.ts';

test('every problem names the stage that can actually fix it', () => {
  const routed = routeProblems([
    { code: 'missing_rates', message: 'two months missing', months: ['2023-08', '2023-09'] },
    { code: 'percent_total', message: 'shares total 90' },
    { code: 'zero_base', message: 'base is zero' },
    { code: 'invalid_period', message: 'no dates' },
    { code: 'schedule_drift', message: 'schedule drifted' },
  ]);
  assert.deepEqual(routed.map((p) => p.stage),
    ['rates', 'mainData', 'baseRate', 'mainData', 'baseRate']);
  assert.deepEqual(routed.map((p) => p.path),
    ['rates', '', 'base-rate', '', 'base-rate']);
});

test('a missing-rates problem carries the months so the grid can be reached', () => {
  const [routed] = routeProblems([
    { code: 'missing_rates', message: 'two months missing', months: ['2023-08', '2023-09'] },
  ]);
  assert.deepEqual(routed!.months, ['2023-08', '2023-09']);
  // The schedule adjustments are edited on Base Rate, not Main Data.
  const [drift] = routeProblems([{ code: 'schedule_drift', message: 'drifted' }]);
  assert.deepEqual(drift!.months, []);
});

test('an unrecognised code still routes somewhere rather than vanishing', () => {
  const routed = routeProblems([{ code: 'something_new', message: 'unknown' }]);
  assert.equal(routed.length, 1);
  assert.equal(routed[0]!.stage, 'calculation');
});

test('blockedStages names only the stages a problem actually invalidates', () => {
  // Percentages are used by the formula alone - the quarter means and the base
  // indices are unaffected, so those two stages stay trustworthy.
  const percent = blockedStages([{ code: 'percent_total' }]);
  assert.equal(percent.has('mainData'), true);
  assert.equal(percent.has('calculation'), true);
  assert.equal(percent.has('indexAverage'), false);
  assert.equal(percent.has('baseRate'), false);

  // A gap in the chart poisons every figure read from it.
  const rates = blockedStages([{ code: 'missing_rates' }]);
  assert.equal(rates.has('rates'), true);
  assert.equal(rates.has('indexAverage'), true);
  assert.equal(rates.has('print'), true);
  assert.equal(rates.has('mainData'), false);
});

test('blockedStages unions every problem present', () => {
  const both = blockedStages([{ code: 'percent_total' }, { code: 'missing_rates' }]);
  assert.equal(both.has('mainData'), true);
  assert.equal(both.has('rates'), true);
  assert.equal(both.has('indexAverage'), true);
});

test('no problems blocks nothing', () => {
  assert.equal(blockedStages([]).size, 0);
});

test('days that do not fill their span point at Main Data, where they are entered', () => {
  const [routed] = routeProblems([{ code: 'unbilled_days', message: 'span 4 is short of days' }]);
  // The spanwise grid lives on Main Data; only the adjustments are on Base Rate.
  assert.equal(routed!.stage, 'mainData');
  assert.equal(routed!.path, '');

  const blocked = blockedStages([{ code: 'unbilled_days' }]);
  assert.equal(blocked.has('mainData'), true);
  assert.equal(blocked.has('baseRate'), true);
  assert.equal(blocked.has('print'), true);
  // The quarter means come from the rates chart alone and stay trustworthy.
  assert.equal(blocked.has('indexAverage'), false);
});

test('impossible days point at Main Data, where the grid is', () => {
  const [routed] = routeProblems([
    { code: 'impossible_days', message: 'too many days', months: ['2024-02'] },
  ]);
  assert.equal(routed!.stage, 'mainData');
  assert.deepEqual(routed!.months, ['2024-02']);
  const blocked = blockedStages([{ code: 'impossible_days' }]);
  assert.equal(blocked.has('mainData'), true);
  assert.equal(blocked.has('print'), true);
  assert.equal(blocked.has('indexAverage'), false);
});
