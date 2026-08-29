import type { ReactNode } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import type { Calculation } from '../api.ts';
import { formatRupees } from '../format.ts';
import type { StageReadiness } from '../readiness.ts';

const STAGES = [
  { to: '', label: 'Main Data', key: 'mainData' },
  { to: 'rates', label: 'Rates Chart', key: 'rates' },
  { to: 'index-average', label: 'Index Average', key: 'indexAverage' },
  { to: 'base-rate', label: 'Base Rate', key: 'baseRate' },
  { to: 'calculation', label: 'Calculation', key: 'calculation' },
  { to: 'print', label: 'Print bill', key: 'print' },
] as const;

interface Props {
  readiness: StageReadiness;
  agreementNo: string;
  contractor: string;
  calculation: Calculation | null;
  onSignOut: () => void;
  children: ReactNode;
}

/** The payable, kept in view from every stage so an edit's effect is never hidden. */
function RunningTotal({ calculation }: { calculation: Calculation | null }) {
  const settled = calculation && calculation.problems.length === 0;
  if (!calculation) {
    return (
      <div className="rail-total rail-total--pending">
        <div className="rail-total__label">This bill</div>
        <div className="rail-total__value">—</div>
        <div className="rail-total__note">Awaiting Main Data</div>
      </div>
    );
  }
  return (
    <div className={`rail-total${settled ? '' : ' rail-total--pending'}`}>
      <div className="rail-total__label">{settled ? 'This bill' : 'Provisional'}</div>
      <div className="rail-total__value">₹{formatRupees(calculation.payable)}</div>
      <div className="rail-total__note">
        {settled
          ? `${calculation.quarters.length} quarters · base ${calculation.baseQuarter}`
          : `${calculation.problems.length} thing${calculation.problems.length === 1 ? '' : 's'} to fix`}
      </div>
    </div>
  );
}

export function Shell({ readiness, agreementNo, contractor, calculation, onSignOut, children }: Props) {
  const { id } = useParams();
  return (
    <div className="shell">
      <nav className="shell__nav">
        <div>
          <NavLink to="/" className="rail-back">← All contracts</NavLink>
          <div className="rail-title" style={{ marginTop: 12 }}>{agreementNo || 'Untitled contract'}</div>
          {contractor && <div className="rail-sub">{contractor}</div>}
        </div>

        <RunningTotal calculation={calculation} />

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

        <div className="stack no-print" style={{ marginTop: 'auto', gap: 6 }}>
          <NavLink to="/profile" className="rail-back">Your account</NavLink>
          <button className="ghost small" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>
      <main className="shell__main">{children}</main>
    </div>
  );
}
