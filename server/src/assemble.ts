import { calculate, type CalculationResult } from '@pes/engine';
import { getContract, listBundles } from './repo/contracts.ts';
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

export interface ContractSummary {
  id: number;
  agreementNo: string;
  contractor: string;
  workName: string;
  updatedAt: string;
  /** null while the contract has not been given enough to compute anything. */
  payable: number | null;
  problemCount: number;
  status: 'ready' | 'provisional' | 'blank';
}

/**
 * The contracts list, with what each bill is worth and whether it is finished.
 * The rates chart is shared, so it is read once and handed to every contract
 * rather than fetched per row.
 */
export async function listContractSummaries(ownerId: number): Promise<ContractSummary[]> {
  const bundles = await listBundles(ownerId);
  if (bundles.length === 0) return [];
  const rates = await listRates();

  return bundles.map((b) => {
    const { contract } = b;
    // A contract created a moment ago has no dates and no amount. Reporting it
    // as provisional would put it in the same state as a bill with a real fault.
    const started = Boolean(contract.commencement || contract.workDoneAmount > 0);
    const result = calculate({
      contract, components: b.components, rates, progress: b.progress,
      adjustments: new Map(b.adjustments.map((a) => [a.month, a.adjustment])),
    });

    return {
      id: contract.id,
      agreementNo: contract.agreementNo,
      contractor: contract.contractor,
      workName: contract.workName,
      updatedAt: b.updatedAt,
      payable: started ? result.payable : null,
      problemCount: result.problems.length,
      status: !started ? 'blank' : result.problems.length === 0 ? 'ready' : 'provisional',
    };
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
