import type { RateRow } from '@pes/engine';
import { pool } from '../db.ts';

interface RateDbRow {
  month: string; labour: number | null; material: number | null; cement: number | null;
  steel: number | null; pol: number | null; bitumen_g: number | null; bitumen_h: number | null;
}

const toRateRow = (r: RateDbRow): RateRow => ({
  month: r.month.slice(0, 7),
  labour: r.labour, material: r.material, cement: r.cement,
  steel: r.steel, pol: r.pol, bitumenG: r.bitumen_g, bitumenH: r.bitumen_h,
});

export async function listRates(): Promise<RateRow[]> {
  const { rows } = await pool.query<RateDbRow>(
    'SELECT month::text, labour, material, cement, steel, pol, bitumen_g, bitumen_h FROM rates ORDER BY month',
  );
  return rows.map(toRateRow);
}

/** Upsert by month. Months are stored as the first day of the month. */
export async function upsertRates(rows: RateRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: unknown[] = [];
  const tuples = rows.map((r, i) => {
    const o = i * 8;
    values.push(`${r.month}-01`, r.labour, r.material, r.cement, r.steel, r.pol, r.bitumenG, r.bitumenH);
    return `($${o + 1}::date, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
  });
  const { rowCount } = await pool.query(
    `INSERT INTO rates (month, labour, material, cement, steel, pol, bitumen_g, bitumen_h)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (month) DO UPDATE SET
       labour = EXCLUDED.labour, material = EXCLUDED.material, cement = EXCLUDED.cement,
       steel = EXCLUDED.steel, pol = EXCLUDED.pol,
       bitumen_g = EXCLUDED.bitumen_g, bitumen_h = EXCLUDED.bitumen_h`,
    values,
  );
  return rowCount ?? 0;
}

/** Removes one month from the shared chart. Returns false if it was not there. */
export async function deleteRate(month: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM rates WHERE month = $1::date', [`${month}-01`]);
  return (rowCount ?? 0) > 0;
}
