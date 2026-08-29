import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type ContractSummary } from '../api.ts';
import { Spinner } from '../components/Spinner.tsx';

export function ContractsPage({ onSignOut }: { onSignOut: () => void }) {
  const [rows, setRows] = useState<ContractSummary[] | null>(null);
  const [agreementNo, setAgreementNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => { api.listContracts().then(setRows).catch((e: Error) => setError(e.message)); };
  useEffect(load, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await api.createContract(agreementNo.trim());
      window.location.href = `/c/${id}`;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function remove(row: ContractSummary) {
    if (!confirm(`Delete agreement ${row.agreementNo}? This removes its dates, days and adjustments.`)) return;
    await api.deleteContract(row.id);
    load();
  }

  return (
    <main style={{ maxWidth: 940, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 className="title">Price Escalation</h1>
          <p className="subtitle">Clause-45 billing</p>
        </div>
        <div className="row">
          <Link to="/profile" className="ghost no-print">Your account</Link>
          <button className="ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      {error && <p className="notice">{error}</p>}

      <form onSubmit={create} className="panel row" style={{ marginBottom: 20 }}>
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
            <p style={{ margin: 0 }}>No contracts yet. Add an agreement number above to start one.</p>
          </div>
        ) : (
          <div className="panel panel--flush scroller">
            <table className="grid">
              <thead>
                <tr><th>Agreement</th><th>Contractor</th><th>Work</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/c/${r.id}`} style={{ fontWeight: 500 }}>{r.agreementNo}</Link></td>
                    <td>{r.contractor || <span className="hint">—</span>}</td>
                    <td style={{ maxWidth: 380 }}>{r.workName || <span className="hint">—</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="danger" onClick={() => void remove(r)}>Delete</button>
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
