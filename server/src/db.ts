import pg from 'pg';

const { Pool } = pg;

// NUMERIC arrives as a string by default so precision is not silently lost in
// transit. The engine wants numbers, so parse at this single boundary.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v: string) => Number(v));
// DATE must not become a local-midnight Date; keep the wire format.
pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);

/**
 * The test suite calls DROP SCHEMA, so it must never reach a working database.
 * Under NODE_ENV=test we require TEST_DATABASE_URL and refuse anything whose
 * database name does not end in _test.
 */
function resolveConnectionString(): string {
  if (process.env.NODE_ENV === 'test') {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl) {
      throw new Error(
        'TEST_DATABASE_URL is not set. Tests drop the schema, so they need their own database.',
      );
    }
    const name = new URL(testUrl).pathname.replace(/^\//, '');
    if (!name.endsWith('_test')) {
      throw new Error(
        `Refusing to run tests against "${name}": the database name must end in _test.`,
      );
    }
    return testUrl;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

const connectionString = resolveConnectionString();

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

export async function withTransaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
