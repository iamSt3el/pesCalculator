import type { ReactNode } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import type { StageReadiness } from '../readiness.ts';

const STAGES = [
  { to: '', label: 'Main Data', key: 'mainData' },
  { to: 'rates', label: 'Rates Chart', key: 'rates' },
  { to: 'index-average', label: 'Index Average', key: 'indexAverage' },
  { to: 'base-rate', label: 'Base Rate', key: 'baseRate' },
  { to: 'calculation', label: 'Calculation', key: 'calculation' },
] as const;

interface Props {
  readiness: StageReadiness;
  agreementNo: string;
  onSignOut: () => void;
  children: ReactNode;
}

export function Shell({ readiness, agreementNo, onSignOut, children }: Props) {
  const { id } = useParams();
  return (
    <div className="shell">
      <nav className="shell__nav">
        <NavLink to="/" style={{ display: 'block', marginBottom: 14, fontSize: 13, textDecoration: 'none' }}>
          ← All contracts
        </NavLink>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 15, marginBottom: 14, lineHeight: 1.3 }}>
          {agreementNo || 'Untitled contract'}
        </div>
        <div className="stage-rail">
          {STAGES.map((s, i) => (
            <NavLink
              key={s.key}
              end={s.to === ''}
              to={`/c/${id}${s.to ? `/${s.to}` : ''}`}
              className={`stage${readiness[s.key] ? ' stage--ready' : ''}`}
            >
              <span className="stage__number">{i + 1}</span>
              <span>{s.label}</span>
            </NavLink>
          ))}
        </div>
        <button className="ghost no-print" onClick={onSignOut} style={{ marginTop: 24, fontSize: 13 }}>
          Sign out
        </button>
      </nav>
      <main className="shell__main">{children}</main>
    </div>
  );
}
