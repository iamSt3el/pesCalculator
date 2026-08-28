import { useCallback, useEffect, useState } from 'react';
import { Outlet, useOutletContext, useParams } from 'react-router-dom';
import { api, type Calculation, type ContractBundle, type RateRow } from './api.ts';
import { Shell } from './components/Shell.tsx';
import { computeReadiness } from './readiness.ts';

export interface ContractContext {
  bundle: ContractBundle;
  rates: RateRow[];
  calculation: Calculation | null;
  /** Refetch everything downstream after a save, so derived figures stay true. */
  reload: () => Promise<void>;
  setBundle: (b: ContractBundle) => void;
}

export function useContract(): ContractContext {
  return useOutletContext<ContractContext>();
}

export function ContractLayout({ onSignOut }: { onSignOut: () => void }) {
  const { id } = useParams();
  const contractId = Number(id);
  const [bundle, setBundle] = useState<ContractBundle | null>(null);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [calculation, setCalculation] = useState<Calculation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [b, r, c] = await Promise.all([
        api.getContract(contractId),
        api.listRates(),
        api.getCalculation(contractId).catch(() => null),
      ]);
      setBundle(b);
      setRates(r);
      setCalculation(c);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [contractId]);

  useEffect(() => { void reload(); }, [reload]);

  if (error) return <main className="shell__main"><p className="notice">{error}</p></main>;
  if (!bundle) return <main className="shell__main"><p className="hint">Loading…</p></main>;

  const readiness = computeReadiness(bundle, rates, calculation);
  const context: ContractContext = { bundle, rates, calculation, reload, setBundle };

  return (
    <Shell readiness={readiness} agreementNo={bundle.contract.agreementNo} onSignOut={onSignOut}>
      <Outlet context={context} />
    </Shell>
  );
}
