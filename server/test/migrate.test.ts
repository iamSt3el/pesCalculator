import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { runMigrations } from '../src/migrate.ts';

test('runMigrations creates the schema and is idempotent', async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

  const first = await runMigrations(pool);
  assert.deepEqual(first, ['001_init.sql', '002_contract_owner.sql']);

  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
  );
  const tables = rows.map((r: { table_name: string }) => r.table_name);
  for (const t of ['components', 'contracts', 'payments', 'progress', 'rates', 'schema_migrations', 'session', 'users']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }

  const owner = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'contracts' AND column_name = 'user_id'`,
  );
  assert.equal(owner.rowCount, 1, 'contracts should carry its owner');

  const second = await runMigrations(pool);
  assert.deepEqual(second, [], 'a second run should apply nothing');
});

test.after(async () => { await pool.end(); });
