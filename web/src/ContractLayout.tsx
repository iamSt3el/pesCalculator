import { useCallback, useEffect, useState } from 'react';
import { Outlet, useOutletContext, useParams } from 'react-router-dom';
import { api, type Calculation, type ContractBundle, type RateRow } from './api.ts';
import { Shell } from './components/Shell.tsx';
import { Spinner } from './components/Spinner.tsx';
import { computeReadiness } from './readiness.ts';

export interface ContractContext {
  bundle: ContractBundle;
  rates: RateRow[];
  calculation: Calculation | null;
  /** Refetch everything downstream after a save, so derived figures stay true. */
  reload: () => Promise<void>;
  setBundle: (b: ContractBundle) => void;
  /**
   * Savers report here and the running head shows the aggregate. Six components
   * own a saver and three can be mounted at once, so this is keyed rather than
   * last-write-wins: one grid finishing must not clear another's "Saving…".
   */
  reportSave: (key: string, saving: boolean, error: string | null) => void;
}

/** Keeps one saver's state in the contract's running head, and tidies up after itself. */
export function useReportSave(key: string, saving: boolean, error: string | null) {
  const { reportSave } = useContract();
  useEffect(() => { reportSave(key, saving, error); }, [key, saving, error, reportSave]);
  // A stage left behind must not leave its error hanging in the head.
  useEffect(() => () => reportSave(key, false, null), [key, reportSave]);
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
  const [saves, setSaves] = useState<Record<string, { saving: boolean; error: string | null }>>({});

  const reportSave = useCallback((key: string, saving: boolean, err: string | null) => {
    setSaves((prev) => {
      const held = prev[key];
      // Bail on an unchanged report, or the effect that sends it loops forever.
      if (held && held.saving === saving && held.error === err) return prev;
      return { ...prev, [key]: { saving, error: err } };
    });
  }, []);

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
  if (!bundle) return <Spinner page />;

  const readiness = computeReadiness(bundle, rates, calculation);
  const context: ContractContext = { bundle, rates, calculation, reload, setBundle, reportSave };
  const pending = Object.values(saves);
  const saving = pending.some((v) => v.saving);
  const saveError = pending.map((v) => v.error).find(Boolean) ?? null;

  return (
    <Shell
      readiness={readiness}
      agreementNo={bundle.contract.agreementNo}
      contractor={bundle.contract.contractor}
      calculation={calculation}
      saving={saving}
      error={saveError}
      onSignOut={onSignOut}
    >
      <Outlet context={context} />
    </Shell>
  );
}
