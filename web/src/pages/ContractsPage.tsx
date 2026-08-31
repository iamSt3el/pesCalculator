import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type ContractSummary } from '../api.ts';
import { Spinner } from '../components/Spinner.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { formatRupees, formatWhen } from '../format.ts';

const STATUS: Record<ContractSummary['status'], { pill: string; label: string }> = {
  ready: { pill: 'pill pill--ok', label: 'Ready' },
  provisional: { pill: 'pill pill--warn', label: 'Provisional' },
  blank: { pill: 'pill pill--idle', label: 'Not started' },
};

function Status({ row }: { row: ContractSummary }) {
  const { pill, label } = STATUS[row.status];
  const detail = row.status === 'provisional'
    ? `${row.problemCount} thing${row.problemCount === 1 ? '' : 's'} to fix`
    : null;
  return (
    <>
      <span className={pill}>{label}</span>
      {detail && <span className="cell-sub">{detail}</span>}
    </>
  );
}

export function ContractsPage({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ContractSummary[] | null>(null);
  const [agreementNo, setAgreementNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => { api.listContracts().then(setRows).catch((e: Error) => setError(e.message)); };
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await api.createContract(agreementNo.trim());
      navigate(`/c/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function remove(row: ContractSummary) {
    setConfirming(null);
    try {
      await api.deleteContract(row.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 className="title">Price Escalation</h1>
          <p className="subtitle">Clause-45 billing</p>
        </div>
        <div className="row">
          <ThemeToggle />
          <Link to="/profile" className="ghost no-print">Your account</Link>
          <button className="ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      {error && <p className="notice">{error}</p>}

      <form onSubmit={create} className="panel row" style={{ marginBottom: 18 }}>
        <label className="field" style={{ flex: 1, minWidth: 220 }}>
          Agreement number
          <input value={agreementNo} onChange={(e) => setAgreementNo(e.target.value)}
                 placeholder="168 of 2023-24" required />
        </label>
        <button type="submit" disabled={busy || !agreementNo.trim()} style={{ alignSelf: 'end' }}>
          Start contract
        </button>
      </form>

      {rows === null ? <Spinner />
        : rows.length === 0 ? (
          <div className="panel">
            <div className="empty">
              <p className="empty__title">Start your first contract</p>
              <p className="empty__body">
                Give it an agreement number above. You can fill in the particulars,
                the days worked and the rates chart afterwards — the bill builds up
                as you go, and tells you what it still needs.
              </p>
            </div>
          </div>
        ) : (
          <div className="panel panel--flush scroller">
            <table className="grid">
              <thead>
                <tr>
                  <th>Agreement</th>
                  <th>Work</th>
                  <th>Status</th>
                  <th className="r">Payable</th>
                  <th>Last edited</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/c/${r.id}`} style={{ fontWeight: 500 }}>{r.agreementNo}</Link>
                      {r.contractor && <span className="cell-sub">{r.contractor}</span>}
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      {r.workName || <span className="hint">—</span>}
                    </td>
                    <td><Status row={r} /></td>
                    <td className="num">
                      {r.payable === null
                        ? <span className="num--muted">—</span>
                        : <span className={r.payable < 0 ? 'num--negative' : undefined}>
                            ₹{formatRupees(r.payable)}
                          </span>}
                    </td>
                    <td className="hint">{formatWhen(r.updatedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {confirming === r.id ? (
                        <span className="confirm">
                          <span className="confirm__text">Delete this agreement and its figures?</span>
                          <button className="danger small" onClick={() => void remove(r)}>Delete</button>
                          <button className="ghost small" onClick={() => setConfirming(null)}>Keep</button>
                        </span>
                      ) : (
                        <button className="erase" aria-label={`Delete agreement ${r.agreementNo}`}
                                onClick={() => setConfirming(r.id)}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </main>
  );
}
