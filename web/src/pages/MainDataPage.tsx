import { useState } from 'react';
import { api, type Contract } from '../api.ts';
import { ComponentTable } from '../components/ComponentTable.tsx';
import { SpanwiseGrid } from '../components/SpanwiseGrid.tsx';
import { useContract } from '../ContractLayout.tsx';
import { formatDate } from '../format.ts';
import { useDebouncedSave } from '../hooks.ts';

type TextKey = 'agreementNo' | 'contractor' | 'workName' | 'woNoDate';
type DateKey = 'bidDate' | 'commencement' | 'stipulatedCompletion' | 'actualCompletion';
type NumKey = 'woAmount' | 'workDoneAmount' | 'bitumenOffsetDays' | 'alreadyPaid';

export function MainDataPage() {
  const { bundle, calculation, reload } = useContract();
  const [form, setForm] = useState<Contract>(bundle.contract);

  const saver = useDebouncedSave<Contract>(async (next) => {
    const { id, ...patch } = next;
    await api.putContract(id, patch);
    await reload();
  });

  const set = (patch: Partial<Contract>) => {
    const next = { ...form, ...patch };
    setForm(next);
    saver.schedule(next);
  };

  const text = (key: TextKey, label: string, wide = false) => (
    <label className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      {label}
      <input value={form[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<Contract>)} />
    </label>
  );

  const date = (key: DateKey, label: string) => (
    <label className="field">
      {label}
      <input type="date" value={form[key] || ''}
             onChange={(e) => set({ [key]: e.target.value } as Partial<Contract>)} />
    </label>
  );

  const number = (key: NumKey, label: string, step = '1') => (
    <label className="field">
      {label}
      <input className="num" type="number" step={step} value={form[key]}
             onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<Contract>)} />
    </label>
  );

  return (
    <>
      <div className="spread">
        <h1 className="title">Main Data</h1>
        <span className="saving">{saver.saving ? 'Saving…' : 'All changes saved'}</span>
      </div>
      <p className="subtitle">
        The particulars of the agreement. Everything downstream is derived from these.
      </p>

      <section className="panel">
        <p className="eyebrow">Summary of agreement and work</p>
        <div className="grid-fields">
          {text('agreementNo', 'Agreement no.')}
          {text('contractor', 'Name of contractor')}
          {text('workName', 'Name of work', true)}
          {text('woNoDate', 'Work order no. and date')}
          {number('woAmount', 'Work order amount')}
          {number('workDoneAmount', 'Work done amount')}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <p className="eyebrow">Dates</p>
        <div className="grid-fields">
          {date('bidDate', 'Last date of bid submission')}
          {date('commencement', 'Date of commencement')}
          {date('stipulatedCompletion', 'Stipulated date of completion')}
          {date('actualCompletion', 'Actual date of completion')}
          {number('bitumenOffsetDays', 'Bitumen base offset (days before bid)')}
          {number('alreadyPaid', 'Escalation already paid')}
        </div>
        {calculation && (
          <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
            Work period <strong>{calculation.spans.totalDays} days</strong>, in four spans ending{' '}
            {calculation.spans.endDates.map(formatDate).join(', ')}. Base quarter{' '}
            <strong>{calculation.baseQuarter}</strong>, from the bid date.
          </p>
        )}
      </section>

      {saver.error && <p className="notice">{saver.error}</p>}

      <ComponentTable />
      <SpanwiseGrid />
    </>
  );
}
