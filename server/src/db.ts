import pg from 'pg';

const { Pool } = pg;

// NUMERIC arrives as a string by default so precision is not silently lost in
// transit. The engine wants numbers, so parse at this single boundary.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v: string) => Number(v));
// DATE must not become a local-midnight Date; keep the wire format.
pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

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
