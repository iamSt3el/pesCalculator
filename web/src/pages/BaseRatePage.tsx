import { useState } from 'react';
import { api, type ComponentConfig, type ComponentKey } from '../api.ts';
import { BaseRateSummary } from '../components/BaseRateSummary.tsx';
import { ScheduleTable } from '../components/ScheduleTable.tsx';
import { PrintButton } from '../components/PrintButton.tsx';
import { useContract } from '../ContractLayout.tsx';
import { useDebouncedSave } from '../hooks.ts';

export function BaseRatePage() {
  const { bundle, reload } = useContract();
  const [rows, setRows] = useState<ComponentConfig[]>(bundle.components);

  const saver = useDebouncedSave<ComponentConfig[]>(async (next) => {
    await api.putComponents(bundle.contract.id, next);
    await reload();
  });

  const setOverride = (key: ComponentKey, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw);
    const next = rows.map((r) => (r.key === key ? { ...r, baseOverride: value } : r));
    setRows(next);
    saver.schedule(next);
  };

  return (
    <>
      <div className="spread">
        <h1 className="title">Base Rate</h1>
        <div className="row">
          <span className="saving">{saver.saving ? 'Saving…' : 'All changes saved'}</span>
          <PrintButton />
        </div>
      </div>

      <BaseRateSummary rows={rows} onOverride={setOverride} />
      {saver.error && <p className="notice">{saver.error}</p>}

      <ScheduleTable />
    </>
  );
}
