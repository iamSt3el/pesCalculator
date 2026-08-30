import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePastedRates } from '../src/routes/rates.ts';
import { deleteRate, listRates, upsertRates } from '../src/repo/rates.ts';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
});
test.after(async () => { await pool.end(); });

test('upsertRates inserts, then updates the same month rather than duplicating', async () => {
  await upsertRates([
    { month: '2023-07', labour: 130, material: 99.1, cement: 98.1, steel: 91.5, pol: 89.1, bitumenG: 38472, bitumenH: null },
  ]);
  await upsertRates([
    { month: '2023-07', labour: 131, material: 99.1, cement: 98.1, steel: 91.5, pol: 89.1, bitumenG: 38472, bitumenH: null },
  ]);
  const rows = await listRates();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.labour, 131);
  assert.equal(rows[0]!.month, '2023-07');
});

test('listRates returns months in ascending order', async () => {
  await upsertRates([
    { month: '2023-09', labour: 123.4, material: null, cement: null, steel: null, pol: 90.8, bitumenG: 42072, bitumenH: null },
    { month: '2023-08', labour: 125.2, material: null, cement: null, steel: null, pol: 89.8, bitumenG: 38882, bitumenH: null },
  ]);
  const months = (await listRates()).map((r) => r.month);
  assert.deepEqual(months, ['2023-07', '2023-08', '2023-09']);
});

test('parsePastedRates reads a tab-separated block copied from Excel', () => {
  const text = [
    '2023-07\t130.0\t99.1\t98.1\t91.5\t89.1\t38472\t36972',
    '2023-08\t125.2\t99.5\t98.3\t92.2\t89.8\t38882\t40922',
  ].join('\n');
  const { rows, errors } = parsePastedRates(text);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.month, '2023-07');
  assert.equal(rows[0]!.labour, 130);
  assert.equal(rows[1]!.bitumenH, 40922);
});

test('parsePastedRates accepts blank cells as null and skips a header row', () => {
  const text = 'Month\tLabour\tMaterial\tCement\tSteel\tPOL\tBitumen\n2024-01\t125.3\t\t98.1\t87.5\t89.6\t37452';
  const { rows, errors } = parsePastedRates(text);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.material, null);
  assert.equal(rows[0]!.bitumenH, null);
});

test('parsePastedRates reports an unreadable month instead of silently dropping it', () => {
  const { rows, errors } = parsePastedRates('not-a-month\t130\n2023-07\t130');
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 1);
  assert.ok(errors[0]!.includes('not-a-month'));
});

test('deleteRate removes one month and leaves the rest alone', async () => {
  await upsertRates([
    { month: '2030-01', labour: 1, material: null, cement: null, steel: null, pol: null, bitumenG: null, bitumenH: null },
    { month: '2030-02', labour: 2, material: null, cement: null, steel: null, pol: null, bitumenG: null, bitumenH: null },
  ]);
  const removed = await deleteRate('2030-01');
  assert.equal(removed, true);
  const months = (await listRates()).map((r) => r.month);
  assert.equal(months.includes('2030-01'), false);
  assert.equal(months.includes('2030-02'), true);
});

test('deleting a month that is not there reports false rather than throwing', async () => {
  assert.equal(await deleteRate('1999-01'), false);
});

test('upsertRates keeps the last row when one month appears twice in a payload', async () => {
  await upsertRates([
    { month: '2031-03', labour: 100, material: null, cement: null, steel: null, pol: null, bitumenG: null, bitumenH: null },
    { month: '2031-03', labour: 101, material: null, cement: null, steel: null, pol: null, bitumenG: null, bitumenH: null },
  ]);
  const rows = (await listRates()).filter((r) => r.month === '2031-03');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.labour, 101);
});

test('a pasted block that repeats a month is written rather than rejected', async () => {
  const { rows } = parsePastedRates('2031-04\t120\n2031-04\t121\n');
  const written = await upsertRates(rows);
  assert.equal(written, 1);
  assert.equal((await listRates()).find((r) => r.month === '2031-04')!.labour, 121);
});
