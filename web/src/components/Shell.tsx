import type { ReactNode } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import type { Calculation } from '../api.ts';
import { formatRupees } from '../format.ts';
import { blockedStages, type StageKey } from '../problems.ts';
import type { StageReadiness } from '../readiness.ts';
import { ProblemList } from './ProblemList.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

const STAGES: ReadonlyArray<{ to: string; label: string; key: StageKey }> = [
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
  if (!calculation) {
    return (
      <div className="rail-total rail-total--empty">
        <div className="rail-total__label">This bill</div>
        <div className="rail-total__value">—</div>
        <div className="rail-total__note">Awaiting Main Data</div>
      </div>
    );
  }

  const count = calculation.problems.length;
  const settled = count === 0;
  return (
    <div className={`rail-total${settled ? '' : ' rail-total--pending'}`}>
      <div className="rail-total__label">{settled ? 'This bill' : 'Provisional'}</div>
      <div className="rail-total__value">₹{formatRupees(calculation.payable)}</div>
      <div className="rail-total__note">
        {settled
          ? `${calculation.quarters.length} quarters · base ${calculation.baseQuarter}`
          : `${count} thing${count === 1 ? '' : 's'} to fix, listed below`}
      </div>
    </div>
  );
}

export function Shell({ readiness, agreementNo, contractor, calculation, onSignOut, children }: Props) {
  const { id } = useParams();
  const blocked = blockedStages(calculation?.problems ?? []);

  return (
    <div className="shell">
      <nav className="shell__nav">
        <div>
          <NavLink to="/" className="rail-back">← All contracts</NavLink>
          <div className="rail-title" style={{ marginTop: 12 }}>{agreementNo || 'Untitled contract'}</div>
          {contractor && <div className="rail-sub">{contractor}</div>}
        </div>

        <RunningTotal calculation={calculation} />
        <ProblemList calculation={calculation} />

        <div className="stage-rail">
          {STAGES.map((s, i) => {
            const state = readiness[s.key] ? ' stage--ready'
              : blocked.has(s.key) ? ' stage--blocked' : '';
            return (
              <NavLink
                key={s.key}
                end={s.to === ''}
                to={`/c/${id}${s.to ? `/${s.to}` : ''}`}
                className={`stage${state}`}
              >
                <span className="stage__number">{i + 1}</span>
                <span>{s.label}</span>
              </NavLink>
            );
          })}
        </div>

        <div className="rail-foot no-print">
          <NavLink to="/profile" className="rail-back">Your account</NavLink>
          <div className="row" style={{ gap: 8 }}>
            <ThemeToggle />
            <button className="ghost small" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </nav>
      <main className="shell__main">{children}</main>
    </div>
  );
}
