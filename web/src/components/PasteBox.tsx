import { useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { submitPaste, type PasteOutcome } from '../paste.ts';

export function PasteBox({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PasteOutcome | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const outcome = await submitPaste(text, (t) => api.pasteRates(t));
    setResult(outcome);
    setBusy(false);
    if (outcome.written > 0) { setText(''); onDone(); }
  }

  return (
    <details className="panel" style={{ marginBottom: 16 }}>
      <summary style={{ cursor: 'pointer', fontSize: 14 }}>
        Paste rows copied from Excel
      </summary>
      <form onSubmit={submit} style={{ marginTop: 14 }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
                style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 13 }}
                placeholder={'2023-07\t130.0\t99.1\t98.1\t91.5\t89.1\t38472\t36972'} />
      <p className="hint" style={{ margin: '6px 0 10px' }}>
        Column order: Month · Labour · Material · Cement · Steel · POL · Bitumen 1st · Bitumen 2nd
      </p>
      <button type="submit" disabled={busy || !text.trim()}>
        {busy ? 'Adding…' : 'Add months'}
      </button>

      {result && (
        <>
          {result.failure && (
            <p className="notice">
              <strong>Those months could not be added.</strong> {result.failure}
            </p>
          )}
          {result.written > 0 && (
            <p className="notice notice--ok">Added {result.written} month{result.written === 1 ? '' : 's'}.</p>
          )}
          {result.errors.length > 0 && (
            <div className="notice">
              <strong>{result.errors.length} line{result.errors.length === 1 ? '' : 's'} could not be read.</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {result.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
      </form>
    </details>
  );
}
