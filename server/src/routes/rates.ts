import type { RateRow } from '@pes/engine';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.ts';
import { listRates, upsertRates } from '../repo/rates.ts';

const rateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
  labour: z.number().nullable(), material: z.number().nullable(),
  cement: z.number().nullable(), steel: z.number().nullable(),
  pol: z.number().nullable(), bitumenG: z.number().nullable(),
  bitumenH: z.number().nullable(),
});

const num = (cell: string | undefined): number | null => {
  const t = (cell ?? '').trim().replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Reads a tab-separated block copied out of Excel. Columns, in order:
 * Month, Labour, Material, Cement, Steel, POL, Bitumen G, Bitumen H.
 * A leading header row is skipped; unreadable months are reported, not dropped.
 */
export function parsePastedRates(text: string): { rows: RateRow[]; errors: string[] } {
  const rows: RateRow[] = [];
  const errors: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const cells = line.split('\t');
    const rawMonth = (cells[0] ?? '').trim();
    if (/^month$/i.test(rawMonth)) continue;

    const match = /^(\d{4})-(\d{1,2})/.exec(rawMonth);
    if (!match) { errors.push(`Could not read a month from "${rawMonth}"`); continue; }
    const month = `${match[1]}-${match[2]!.padStart(2, '0')}`;

    rows.push({
      month,
      labour: num(cells[1]), material: num(cells[2]), cement: num(cells[3]),
      steel: num(cells[4]), pol: num(cells[5]),
      bitumenG: num(cells[6]), bitumenH: num(cells[7]),
    });
  }
  return { rows, errors };
}

export const ratesRouter: Router = Router();
ratesRouter.use(requireAuth);

ratesRouter.get('/', async (_req, res) => { res.json(await listRates()); });

ratesRouter.put('/', async (req, res) => {
  const parsed = z.array(rateSchema).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const written = await upsertRates(parsed.data);
  res.json({ written, rates: await listRates() });
});

ratesRouter.post('/paste', async (req, res) => {
  const parsed = z.object({ text: z.string().max(200_000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'A text block is required' }); return; }
  const { rows, errors } = parsePastedRates(parsed.data.text);
  const written = await upsertRates(rows);
  res.json({ written, errors, rates: await listRates() });
});
