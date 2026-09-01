import { useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { submitPaste, type PasteOutcome } from '../paste.ts';

/**
 * This application replaces a workbook, so pasting rows straight out of Excel
 * is the main way the rates chart gets filled — not a footnote. It used to be
 * folded inside a collapsed <details> that most operators never opened.
 */
export function PasteBox({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
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
    // A way of getting figures in, not a record of them: screen only.
    <div className="panel bar no-print">
      <button type="button" className="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Close paste box' : 'Paste rows copied from Excel'}
      </button>

      {open && (
        <form onSubmit={submit} className="stack-md">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
                    className="paste-area"
                    placeholder={'2023-07\t130.0\t99.1\t98.1\t91.5\t89.1\t38472\t36972'} />
          <p className="hint stack-sm">
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
                <p className="notice notice--ok">
                  Added {result.written} month{result.written === 1 ? '' : 's'}.
                </p>
              )}
              {result.errors.length > 0 && (
                <div className="notice">
                  <strong>
                    {result.errors.length} line{result.errors.length === 1 ? '' : 's'} could not be read.
                  </strong>
                  <ul className="errors">
                    {result.errors.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </form>
      )}
    </div>
  );
}
