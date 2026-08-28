import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleCalculation, serialiseResult } from '../src/assemble.ts';
import {
  createContract, replaceAdjustments, replaceComponents, replaceProgress, updateContract,
} from '../src/repo/contracts.ts';
import { upsertRates } from '../src/repo/rates.ts';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

let contractId = 0;

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);

  await upsertRates([
    { month: '2023-07', labour: 130.0, material: 99.1, cement: 98.1, steel: 91.5, pol: 89.1, bitumenG: 38472, bitumenH: null },
    { month: '2023-08', labour: 125.2, material: 99.5, cement: 98.3, steel: 92.2, pol: 89.8, bitumenG: 38882, bitumenH: null },
    { month: '2023-09', labour: 123.4, material: 99.6, cement: 99.4, steel: 94.6, pol: 90.8, bitumenG: 42072, bitumenH: null },
    { month: '2023-10', labour: 124.2, material: 100.1, cement: 102.4, steel: 92.1, pol: 91.4, bitumenG: 42542, bitumenH: null },
    { month: '2023-11', labour: 124.4, material: 100.1, cement: 102.3, steel: 89.5, pol: 90.9, bitumenG: 42202, bitumenH: null },
    { month: '2023-12', labour: 124.2, material: 99.4, cement: 100.0, steel: 88.2, pol: 89.8, bitumenG: 40582, bitumenH: null },
    { month: '2024-01', labour: 125.3, material: 99.3, cement: 98.1, steel: 87.5, pol: 89.6, bitumenG: 37452, bitumenH: null },
    { month: '2024-02', labour: 125.5, material: 99.3, cement: 97.6, steel: 86.3, pol: 89.9, bitumenG: 37292, bitumenH: null },
    { month: '2024-03', labour: 125.3, material: 99.4, cement: 96.1, steel: 86.3, pol: 89.3, bitumenG: 38312, bitumenH: null },
  ]);

  const c = await createContract('168 of 2023-24');
  contractId = c.id;
  await updateContract(contractId, {
    contractor: 'M/s. Pradeep Kumar Contractor',
    woAmount: 23_977_779, workDoneAmount: 21_717_359,
    bidDate: '2023-09-12', commencement: '2023-09-24',
    stipulatedCompletion: '2024-02-23', actualCompletion: '2024-02-23',
    bitumenOffsetDays: 28, alreadyPaid: 0,
  });
  await replaceComponents(contractId, [
    { key: 'labour', percent: 9.28, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'material', percent: 53.12, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'cement', percent: 0, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'steel', percent: 0.65, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'pol', percent: 8.11, factor: 0.75, baseRule: 'bid_month', baseOverride: null },
    { key: 'bitumen', percent: 28.84, factor: 0.85, baseRule: 'offset_month', baseOverride: null },
  ]);
  await replaceProgress(contractId, [
    { month: '2023-09', spanDays: [6, 0, 0, 0] },
    { month: '2023-10', spanDays: [31, 0, 0, 0] },
    { month: '2023-11', spanDays: [1, 29, 0, 0] },
    { month: '2023-12', spanDays: [0, 9, 22, 0] },
    { month: '2024-01', spanDays: [0, 0, 16, 15] },
    { month: '2024-02', spanDays: [0, 0, 0, 23] },
  ]);
  await replaceAdjustments(contractId, [
    { month: '2023-10', adjustment: 500_000 }, { month: '2023-11', adjustment: 800_000 },
    { month: '2023-12', adjustment: 400_000 }, { month: '2024-01', adjustment: -900_000 },
    { month: '2024-02', adjustment: -800_000 },
  ]);
});
test.after(async () => { await pool.end(); });

test('the stored contract reproduces the workbook payable end to end', async () => {
  const result = await assembleCalculation(contractId);
  assert.ok(result);
  assert.deepEqual(result.problems, []);
  assert.equal(result.payable, 172_604);
  assert.equal(result.baseQuarter, '2023-Q3');
  assert.equal(result.schedule.total, 21_717_359);
});

test('serialiseResult converts every Map so the response survives JSON', async () => {
  const result = await assembleCalculation(contractId);
  const wire = JSON.parse(JSON.stringify(serialiseResult(result!)));
  assert.equal(wire.payable, 172_604);
  assert.equal(wire.bases.labour.value, 126.2);
  assert.equal(wire.componentTotals.cement, 0);
  assert.equal(wire.schedule.byQuarter['2023-Q4'], 14_130_330);
  assert.equal(Array.isArray(wire.lines), true);
});

test('editing a day count changes the schedule rather than leaving a stale amount', async () => {
  await replaceProgress(contractId, [
    { month: '2023-09', spanDays: [7, 0, 0, 0] },
    { month: '2023-10', spanDays: [30, 0, 0, 0] },
    { month: '2023-11', spanDays: [1, 29, 0, 0] },
    { month: '2023-12', spanDays: [0, 9, 22, 0] },
    { month: '2024-01', spanDays: [0, 0, 16, 15] },
    { month: '2024-02', spanDays: [0, 0, 0, 23] },
  ]);
  const result = await assembleCalculation(contractId);
  assert.equal(result!.schedule.rows.find((r) => r.month === '2023-09')!.computed, 500_071);
  assert.equal(result!.schedule.total, 21_717_359);
});

test('an unknown contract yields null rather than throwing', async () => {
  assert.equal(await assembleCalculation(999_999), null);
});
