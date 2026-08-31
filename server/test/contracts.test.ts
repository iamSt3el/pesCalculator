import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contractOwnerId, createContract, getContract, listContracts, replaceComponents,
  replaceProgress, replaceAdjustments, updateContract, deleteContract,
} from '../src/repo/contracts.ts';
import { listBundles } from '../src/repo/contracts.ts';
import { listContractSummaries } from '../src/assemble.ts';
import { adjustmentsBody, progressBody } from '../src/routes/contracts.ts';
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

test('clearing a text field stores an empty string, not a null', async () => {
  const c = await createContract('to be emptied', owner);
  await updateContract(c.id, {
    contractor: 'M/s. Pradeep Kumar', workName: 'Widening', woNoDate: 'WO/12',
  });
  await updateContract(c.id, { contractor: '', workName: '', woNoDate: '' });

  const loaded = await getContract(c.id);
  assert.equal(loaded!.contract.contractor, '');
  assert.equal(loaded!.contract.workName, '');
  assert.equal(loaded!.contract.woNoDate, '');
});

test('clearing a date stores a null, so the field reads back as empty', async () => {
  const c = await createContract('date clearing', owner);
  await updateContract(c.id, { bidDate: '2023-09-12' });
  await updateContract(c.id, { bidDate: '' });
  assert.equal((await getContract(c.id))!.contract.bidDate, '');
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

test('listBundles carries each contract\'s components, progress and adjustments', async () => {
  const c = await createContract('bundled', owner);
  await replaceProgress(c.id, [{ month: '2023-09', spanDays: [6, 0, 0, 0] }]);
  await replaceAdjustments(c.id, [{ month: '2023-09', adjustment: 500 }]);

  const found = (await listBundles(owner)).find((b) => b.contract.id === c.id);
  assert.ok(found);
  assert.equal(found.components.length, 6);
  assert.deepEqual(found.progress.map((p) => p.month), ['2023-09']);
  assert.deepEqual(found.adjustments, [{ month: '2023-09', adjustment: 500 }]);
  assert.ok(found.updatedAt, 'carries a timestamp for the contracts list');

  // A contract with no children still appears, with empty collections rather
  // than missing keys - the list renders every contract, finished or not.
  const bare = await createContract('bare', owner);
  const empty = (await listBundles(owner)).find((b) => b.contract.id === bare.id);
  assert.deepEqual(empty!.progress, []);
  assert.deepEqual(empty!.adjustments, []);
});

test('a contract with nothing in it yet is blank, not provisional', async () => {
  const fresh = await createContract('untouched', owner);
  const row = (await listContractSummaries(owner)).find((r) => r.id === fresh.id);
  assert.ok(row);
  assert.equal(row.status, 'blank');
  // No payable is honest here; zero would read as a bill that came to nothing.
  assert.equal(row.payable, null);
  assert.equal(row.agreementNo, 'untouched');
});

test('a contract that has been started reports its payable and what is outstanding', async () => {
  const started = await createContract('started', owner);
  await updateContract(started.id, {
    workDoneAmount: 1_000_000, commencement: '2023-09-24', actualCompletion: '2024-02-23',
    bidDate: '2023-09-12',
  });

  const row = (await listContractSummaries(owner)).find((r) => r.id === started.id);
  assert.ok(row);
  // The rates chart is empty in these tests and the shares total zero, so the
  // bill cannot settle - which is exactly the state the list must show.
  assert.equal(row.status, 'provisional');
  assert.ok(row.problemCount > 0);
  assert.equal(typeof row.payable, 'number');
});

test('summaries stay owner-scoped', async () => {
  const theirs = await createContract('not yours either', other);
  const mine = await listContractSummaries(owner);
  assert.equal(mine.some((r) => r.id === theirs.id), false);
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

test('a progress payload naming the same month twice is refused', () => {
  const twice = progressBody.safeParse([
    { month: '2023-07', spanDays: [1, 0, 0, 0] },
    { month: '2023-07', spanDays: [2, 0, 0, 0] },
  ]);
  assert.equal(twice.success, false);

  const once = progressBody.safeParse([{ month: '2023-07', spanDays: [1, 0, 0, 0] }]);
  assert.equal(once.success, true);
});

test('an adjustments payload naming the same month twice is refused', () => {
  const twice = adjustmentsBody.safeParse([
    { month: '2023-07', adjustment: 5 },
    { month: '2023-07', adjustment: 6 },
  ]);
  assert.equal(twice.success, false);

  const distinct = adjustmentsBody.safeParse([
    { month: '2023-07', adjustment: 5 },
    { month: '2023-08', adjustment: 6 },
  ]);
  assert.equal(distinct.success, true);
});
