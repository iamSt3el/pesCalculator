import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contractOwnerId, createContract, getContract, listContracts, replaceComponents,
  replaceProgress, replaceAdjustments, updateContract, deleteContract,
} from '../src/repo/contracts.ts';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

/** Contracts are owner-scoped, so these repo tests need accounts to own them. */
let owner = 0;
let other = 0;

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ('owner@test.invalid', 'x', 'admin'), ('other@test.invalid', 'x', 'user')
     RETURNING id`,
  );
  [owner, other] = [rows[0]!.id, rows[1]!.id];
});
test.after(async () => { await pool.end(); });

test('a new contract arrives with six components carrying the default rules', async () => {
  const created = await createContract('168 of 2023-24', owner);
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
  const c = await createContract('drift check', owner);
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
  const c = await createContract('progress check', owner);
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
  const c = await createContract('components check', owner);
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
  const c = await createContract('adjustments check', owner);
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
  const c = await createContract('cascade check', owner);
  await replaceProgress(c.id, [{ month: '2023-09', spanDays: [1, 0, 0, 0] }]);
  await deleteContract(c.id);
  assert.equal(await getContract(c.id), null);
  const { rows } = await pool.query('SELECT * FROM progress WHERE contract_id = $1', [c.id]);
  assert.equal(rows.length, 0);
});

test('listContracts returns a summary of the owner\'s contracts only', async () => {
  const theirs = await createContract('somebody else', other);

  const mine = await listContracts(owner);
  assert.ok(mine.length >= 1);
  assert.ok('agreementNo' in mine[0]!);
  assert.equal(mine.some((c) => c.id === theirs.id), false);

  assert.deepEqual((await listContracts(other)).map((c) => c.id), [theirs.id]);
});

test('an unowned contract belongs to nobody and appears in no list', async () => {
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO contracts (agreement_no) VALUES ('orphan') RETURNING id",
  );
  const orphan = rows[0]!.id;
  assert.equal((await listContracts(owner)).some((c) => c.id === orphan), false);
  assert.equal((await listContracts(other)).some((c) => c.id === orphan), false);
  assert.equal(await contractOwnerId(orphan), null);
});
