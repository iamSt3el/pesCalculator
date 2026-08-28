import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReadiness } from '../src/readiness.ts';

const complete = {
  contract: {
    agreementNo: '168 of 2023-24', workDoneAmount: 21_717_359,
    bidDate: '2023-09-12', commencement: '2023-09-24', actualCompletion: '2024-02-23',
  },
  components: [{ percent: 100 }],
  progress: [{ month: '2023-09' }],
};

test('main data is ready only once dates, amount and percentages are all in', () => {
  assert.equal(computeReadiness(complete, [], null).mainData, true);
  assert.equal(computeReadiness({ ...complete, components: [{ percent: 90 }] }, [], null).mainData, false);
  assert.equal(computeReadiness({ ...complete, contract: { ...complete.contract, commencement: '' } }, [], null).mainData, false);
});

test('a stage is not ready while the calculation still reports a problem', () => {
  const withProblem = { problems: [{ code: 'missing_rates' }], payable: 0 };
  assert.equal(computeReadiness(complete, [{ month: '2023-09' }], withProblem).calculation, false);
  const clean = { problems: [], payable: 172_604 };
  assert.equal(computeReadiness(complete, [{ month: '2023-09' }], clean).calculation, true);
});

test('the rates stage is not ready while the chart is empty', () => {
  assert.equal(computeReadiness(complete, [], null).rates, false);
  assert.equal(computeReadiness(complete, [{ month: '2023-09' }], null).rates, true);
});

test('the print stage fills in only once the bill is free of problems', () => {
  const clean = { problems: [], payable: 172_604 };
  const withProblem = { problems: [{ code: 'missing_rates' }], payable: 0 };
  assert.equal(computeReadiness(complete, [{ month: '2023-09' }], null).print, false);
  assert.equal(computeReadiness(complete, [{ month: '2023-09' }], withProblem).print, false);
  assert.equal(computeReadiness(complete, [{ month: '2023-09' }], clean).print, true);
});
