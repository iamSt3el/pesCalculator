import { COMPONENT_KEYS, type ComponentConfig, type ContractInput, type ProgressRow } from '@pes/engine';
import { pool, withTransaction } from '../db.ts';

export interface ContractRecord extends ContractInput { id: number }
export interface AdjustmentRow { month: string; adjustment: number }

export interface ContractBundle {
  contract: ContractRecord;
  components: ComponentConfig[];
  progress: ProgressRow[];
  adjustments: AdjustmentRow[];
}

const CONTRACT_COLUMNS = `
  id, agreement_no, contractor, work_name, wo_no_date, wo_amount, work_done_amount,
  bid_date::text, commencement::text, stipulated_completion::text, actual_completion::text,
  bitumen_offset_days, already_paid`;

interface ContractDbRow {
  id: number; agreement_no: string; contractor: string; work_name: string; wo_no_date: string;
  wo_amount: number; work_done_amount: number; bid_date: string | null; commencement: string | null;
  stipulated_completion: string | null; actual_completion: string | null;
  bitumen_offset_days: number; already_paid: number;
}

const toRecord = (r: ContractDbRow): ContractRecord => ({
  id: r.id,
  agreementNo: r.agreement_no,
  contractor: r.contractor,
  workName: r.work_name,
  woNoDate: r.wo_no_date,
  woAmount: r.wo_amount,
  workDoneAmount: r.work_done_amount,
  bidDate: r.bid_date ?? '',
  commencement: r.commencement ?? '',
  stipulatedCompletion: r.stipulated_completion ?? '',
  actualCompletion: r.actual_completion ?? '',
  bitumenOffsetDays: r.bitumen_offset_days,
  alreadyPaid: r.already_paid,
});

/** Spec 3.2 defaults: POL keys off the bid month, bitumen off the offset month. */
function defaultComponent(key: ComponentConfig['key']): ComponentConfig {
  if (key === 'pol') return { key, percent: 0, factor: 0.75, baseRule: 'bid_month', baseOverride: null };
  if (key === 'bitumen') return { key, percent: 0, factor: 0.85, baseRule: 'offset_month', baseOverride: null };
  return { key, percent: 0, factor: 0.75, baseRule: 'quarter_average', baseOverride: null };
}

export async function listContracts(): Promise<Array<{ id: number; agreementNo: string; contractor: string; workName: string }>> {
  const { rows } = await pool.query<{ id: number; agreement_no: string; contractor: string; work_name: string }>(
    'SELECT id, agreement_no, contractor, work_name FROM contracts ORDER BY id DESC',
  );
  return rows.map((r) => ({
    id: r.id, agreementNo: r.agreement_no, contractor: r.contractor, workName: r.work_name,
  }));
}

export async function createContract(agreementNo: string): Promise<ContractRecord> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<ContractDbRow>(
      `INSERT INTO contracts (agreement_no) VALUES ($1) RETURNING ${CONTRACT_COLUMNS}`,
      [agreementNo],
    );
    const record = toRecord(rows[0]!);
    for (const key of COMPONENT_KEYS) {
      const c = defaultComponent(key);
      await client.query(
        'INSERT INTO components (contract_id, key, percent, factor, base_rule, base_override) VALUES ($1,$2,$3,$4,$5,$6)',
        [record.id, c.key, c.percent, c.factor, c.baseRule, c.baseOverride],
      );
    }
    return record;
  });
}

export async function getContract(id: number): Promise<ContractBundle | null> {
  const { rows } = await pool.query<ContractDbRow>(
    `SELECT ${CONTRACT_COLUMNS} FROM contracts WHERE id = $1`, [id],
  );
  if (rows.length === 0) return null;

  const components = await pool.query<{ key: ComponentConfig['key']; percent: number; factor: number; base_rule: ComponentConfig['baseRule']; base_override: number | null }>(
    `SELECT key, percent, factor, base_rule, base_override FROM components
     WHERE contract_id = $1
     ORDER BY array_position(ARRAY['labour','material','cement','steel','pol','bitumen']::text[], key)`,
    [id],
  );
  const progress = await pool.query<{ month: string; span1_days: number; span2_days: number; span3_days: number; span4_days: number }>(
    'SELECT month::text, span1_days, span2_days, span3_days, span4_days FROM progress WHERE contract_id = $1 ORDER BY month',
    [id],
  );
  const adjustments = await pool.query<{ month: string; adjustment: number }>(
    'SELECT month::text, adjustment FROM payments WHERE contract_id = $1 ORDER BY month', [id],
  );

  return {
    contract: toRecord(rows[0]!),
    components: components.rows.map((c) => ({
      key: c.key, percent: c.percent, factor: c.factor,
      baseRule: c.base_rule, baseOverride: c.base_override,
    })),
    progress: progress.rows.map((p) => ({
      month: p.month.slice(0, 7),
      spanDays: [p.span1_days, p.span2_days, p.span3_days, p.span4_days] as [number, number, number, number],
    })),
    adjustments: adjustments.rows.map((a) => ({ month: a.month.slice(0, 7), adjustment: a.adjustment })),
  };
}

export async function updateContract(id: number, patch: Partial<ContractInput>): Promise<void> {
  const columns: Record<keyof ContractInput, string> = {
    agreementNo: 'agreement_no', contractor: 'contractor', workName: 'work_name',
    woNoDate: 'wo_no_date', woAmount: 'wo_amount', workDoneAmount: 'work_done_amount',
    bidDate: 'bid_date', commencement: 'commencement',
    stipulatedCompletion: 'stipulated_completion', actualCompletion: 'actual_completion',
    bitumenOffsetDays: 'bitumen_offset_days', alreadyPaid: 'already_paid',
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(columns) as Array<[keyof ContractInput, string]>) {
    if (!(key in patch)) continue;
    const value = patch[key];
    values.push(value === '' ? null : value);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length === 0) return;
  values.push(id);
  await pool.query(
    `UPDATE contracts SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
    values,
  );
}

export async function replaceComponents(id: number, components: ComponentConfig[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM components WHERE contract_id = $1', [id]);
    for (const c of components) {
      await client.query(
        'INSERT INTO components (contract_id, key, percent, factor, base_rule, base_override) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, c.key, c.percent, c.factor, c.baseRule, c.baseOverride],
      );
    }
  });
}

export async function replaceProgress(id: number, rows: ProgressRow[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM progress WHERE contract_id = $1', [id]);
    for (const r of rows) {
      await client.query(
        'INSERT INTO progress (contract_id, month, span1_days, span2_days, span3_days, span4_days) VALUES ($1,$2::date,$3,$4,$5,$6)',
        [id, `${r.month}-01`, r.spanDays[0], r.spanDays[1], r.spanDays[2], r.spanDays[3]],
      );
    }
  });
}

export async function replaceAdjustments(id: number, rows: AdjustmentRow[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM payments WHERE contract_id = $1', [id]);
    for (const r of rows) {
      await client.query(
        'INSERT INTO payments (contract_id, month, adjustment) VALUES ($1, $2::date, $3)',
        [id, `${r.month}-01`, r.adjustment],
      );
    }
  });
}

export async function deleteContract(id: number): Promise<void> {
  await pool.query('DELETE FROM contracts WHERE id = $1', [id]);
}
