import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createContract, getContract, listContracts, replaceComponents,
  replaceProgress, replaceAdjustments, updateContract, deleteContract,
} from '../src/repo/contracts.ts';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
});
test.after(async () => { await pool.end(); });

test('a new contract arrives with six components carrying the default rules', async () => {
  const created = await createContract('168 of 2023-24');
  const loaded = await getContract(created.id);
  assert.ok(loaded);
  assert.equal(loaded.components.length, 6);
  assert.deepEqual(loaded.components.map((c) => c.key),
    ['labour', 'material', 'cement', 'steel', 'pol', 'bitumen']);
  assert.equal(loaded.components.find((c) => c.key === 'pol')!.baseRule, 'bid_month');
  assert.equal(loaded.components.find((c) => c.key === 'bitumen')!.baseRule, 'offset_month');
  assert.equal(loaded.components.find((c) => c.key === 'bitumen')!.factor, 0.85);
  assert.equal(loaded.components.find((c) => c.key === 'labour')!.factor, 0.75);
  assert.equal(loaded.contract.bitumenOffsetDays, 28);
});

test('dates round-trip as YYYY-MM-DD strings without timezone drift', async () => {
  const c = await createContract('drift check');
  await updateContract(c.id, {
    bidDate: '2023-09-12', commencement: '2023-09-24',
    stipulatedCompletion: '2024-02-23', actualCompletion: '2024-02-23',
    workDoneAmount: 21_717_359, woAmount: 23_977_779,
  });
  const loaded = await getContract(c.id);
  assert.equal(loaded!.contract.bidDate, '2023-09-12');
  assert.equal(loaded!.contract.actualCompletion, '2024-02-23');
  assert.equal(loaded!.contract.workDoneAmount, 21_717_359);
});

test('replaceProgress stores span days per month and replaces the whole set', async () => {
  const c = await createContract('progress check');
  await replaceProgress(c.id, [
    { month: '2023-09', spanDays: [6, 0, 0, 0] },
    { month: '2023-10', spanDays: [31, 0, 0, 0] },
  ]);
  await replaceProgress(c.id, [{ month: '2023-09', spanDays: [7, 0, 0, 0] }]);
  const loaded = await getContract(c.id);
  assert.equal(loaded!.progress.length, 1);
  assert.deepEqual(loaded!.progress[0], { month: '2023-09', spanDays: [7, 0, 0, 0] });
});

test('replaceComponents persists percentages, factors, rules and overrides', async () => {
  const c = await createContract('components check');
  await replaceComponents(c.id, [
    { key: 'labour', percent: 9.28, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'material', percent: 53.12, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'cement', percent: 0, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'steel', percent: 0.65, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'pol', percent: 8.11, factor: 0.75, baseRule: 'bid_month', baseOverride: 90.8 },
    { key: 'bitumen', percent: 28.84, factor: 0.85, baseRule: 'offset_month', baseOverride: null },
  ]);
  const loaded = await getContract(c.id);
  const pol = loaded!.components.find((x) => x.key === 'pol')!;
  assert.equal(pol.percent, 8.11);
  assert.equal(pol.baseOverride, 90.8);
  assert.equal(loaded!.components.find((x) => x.key === 'material')!.percent, 53.12);
});

test('replaceAdjustments stores only the operator adjustment', async () => {
  const c = await createContract('adjustments check');
  await replaceAdjustments(c.id, [
    { month: '2023-10', adjustment: 500_000 },
    { month: '2024-01', adjustment: -900_000 },
  ]);
  const loaded = await getContract(c.id);
  assert.deepEqual(loaded!.adjustments, [
    { month: '2023-10', adjustment: 500_000 },
    { month: '2024-01', adjustment: -900_000 },
  ]);
});

test('deleting a contract removes its children', async () => {
  const c = await createContract('cascade check');
  await replaceProgress(c.id, [{ month: '2023-09', spanDays: [1, 0, 0, 0] }]);
  await deleteContract(c.id);
  assert.equal(await getContract(c.id), null);
  const { rows } = await pool.query('SELECT * FROM progress WHERE contract_id = $1', [c.id]);
  assert.equal(rows.length, 0);
});

test('listContracts returns a summary of every contract', async () => {
  const all = await listContracts();
  assert.ok(all.length >= 1);
  assert.ok('agreementNo' in all[0]!);
});
