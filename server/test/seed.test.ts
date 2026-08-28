import test from 'node:test';
import assert from 'node:assert/strict';
import { seedDatabase } from '../seed/seed.ts';
import { assembleCalculation } from '../src/assemble.ts';
import { listRates } from '../src/repo/rates.ts';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

test.before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await runMigrations(pool);
});
test.after(async () => { await pool.end(); });

test('seeding loads the full rates chart and Agreement 168, which still totals 172604', async () => {
  const { rates, contractId } = await seedDatabase();
  assert.equal(rates, 39);
  assert.equal((await listRates()).length, 39);

  const result = await assembleCalculation(contractId);
  assert.ok(result);
  assert.deepEqual(result.problems, []);
  assert.equal(result.payable, 172_604);
});

test('seeding twice does not duplicate the rates chart', async () => {
  await seedDatabase();
  assert.equal((await listRates()).length, 39);
});
