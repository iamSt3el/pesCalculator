import { calculate, type CalculationResult } from '@pes/engine';
import { getContract } from './repo/contracts.ts';
import { listRates } from './repo/rates.ts';

/** The single place that knows both the database shape and the engine shape. */
export async function assembleCalculation(contractId: number): Promise<CalculationResult | null> {
  const bundle = await getContract(contractId);
  if (!bundle) return null;

  return calculate({
    contract: bundle.contract,
    components: bundle.components,
    rates: await listRates(),
    progress: bundle.progress,
    adjustments: new Map(bundle.adjustments.map((a) => [a.month, a.adjustment])),
  });
}

const fromMap = <V>(m: Map<string, V>): Record<string, V> => Object.fromEntries(m);

export interface SerialisedResult extends Omit<
  CalculationResult, 'bases' | 'componentTotals' | 'schedule'
> {
  bases: Record<string, unknown>;
  componentTotals: Record<string, number>;
  schedule: Omit<CalculationResult['schedule'], 'byQuarter'> & { byQuarter: Record<string, number> };
}

/** JSON.stringify renders a Map as {}. Flatten every Map before responding. */
export function serialiseResult(r: CalculationResult): SerialisedResult {
  return {
    ...r,
    bases: fromMap(r.bases),
    componentTotals: fromMap(r.componentTotals),
    schedule: { ...r.schedule, byQuarter: fromMap(r.schedule.byQuarter) },
  };
}
