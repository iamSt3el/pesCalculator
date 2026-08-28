import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RateRow } from '@pes/engine';
import { pool } from '../src/db.ts';
import { upsertRates } from '../src/repo/rates.ts';
import {
  createContract, replaceAdjustments, replaceComponents, replaceProgress, updateContract,
} from '../src/repo/contracts.ts';

type RateTuple = [string, ...(number | null)[]];

async function loadRates(): Promise<RateRow[]> {
  const path = join(dirname(fileURLToPath(import.meta.url)), 'rates.json');
  const tuples = JSON.parse(await readFile(path, 'utf8')) as RateTuple[];
  return tuples.map(([month, labour, material, cement, steel, pol, bitumenG, bitumenH]) => ({
    month,
    labour: labour ?? null, material: material ?? null, cement: cement ?? null,
    steel: steel ?? null, pol: pol ?? null,
    bitumenG: bitumenG ?? null, bitumenH: bitumenH ?? null,
  }));
}

/** Loads the shared rates chart and the source contract, idempotently. */
export async function seedDatabase(): Promise<{ rates: number; contractId: number }> {
  const rates = await loadRates();
  await upsertRates(rates);

  const agreementNo = '168 of 2023-24';
  const existing = await pool.query<{ id: number }>(
    'SELECT id FROM contracts WHERE agreement_no = $1', [agreementNo],
  );
  const contract = existing.rows[0] ?? (await createContract(agreementNo));
  const contractId = contract.id;

  await updateContract(contractId, {
    contractor: 'M/s. Pradeep Kumar Contractor',
    workName: 'Const. of various Roads under Pkg No RJ-20-06/ML/2023-24 Distt Jhunjhunu',
    woNoDate: 'No. 1504-12 Date 14.09.2024',
    woAmount: 23_977_779, workDoneAmount: 21_717_359,
    bidDate: '2023-09-12', commencement: '2023-09-24',
    stipulatedCompletion: '2024-02-23', actualCompletion: '2024-02-23',
    bitumenOffsetDays: 28, alreadyPaid: 0,
  });

  await replaceComponents(contractId, [
    { key: 'labour', percent: 9.28, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'material', percent: 53.12, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'cement', percent: 0, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'steel', percent: 0.65, factor: 0.75, baseRule: 'quarter_average', baseOverride: null },
    { key: 'pol', percent: 8.11, factor: 0.75, baseRule: 'bid_month', baseOverride: null },
    { key: 'bitumen', percent: 28.84, factor: 0.85, baseRule: 'offset_month', baseOverride: null },
  ]);

  await replaceProgress(contractId, [
    { month: '2023-09', spanDays: [6, 0, 0, 0] },
    { month: '2023-10', spanDays: [31, 0, 0, 0] },
    { month: '2023-11', spanDays: [1, 29, 0, 0] },
    { month: '2023-12', spanDays: [0, 9, 22, 0] },
    { month: '2024-01', spanDays: [0, 0, 16, 15] },
    { month: '2024-02', spanDays: [0, 0, 0, 23] },
  ]);

  await replaceAdjustments(contractId, [
    { month: '2023-10', adjustment: 500_000 }, { month: '2023-11', adjustment: 800_000 },
    { month: '2023-12', adjustment: 400_000 }, { month: '2024-01', adjustment: -900_000 },
    { month: '2024-02', adjustment: -800_000 },
  ]);

  return { rates: rates.length, contractId };
}

// Allow `npm run seed -w @pes/server`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { rates, contractId } = await seedDatabase();
  console.log(`Seeded ${rates} rate months and contract #${contractId}.`);
  await pool.end();
}
