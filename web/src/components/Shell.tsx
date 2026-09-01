import type { ReactNode } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import type { Calculation } from '../api.ts';
import { formatRupees } from '../format.ts';
import { blockedStages, type StageKey } from '../problems.ts';
import type { StageReadiness } from '../readiness.ts';
import { ProblemList } from './ProblemList.tsx';
import { RunningHead } from './RunningHead.tsx';
import { SheetFurniture } from './SheetFurniture.tsx';
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
  /** Reported by whichever stage owns a saver; shown in the running head. */
  saving?: boolean;
  error?: string | null;
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

export function Shell({
  readiness, agreementNo, contractor, calculation, saving, error, onSignOut, children,
}: Props) {
  const { id } = useParams();
  const { pathname } = useLocation();
  const blocked = blockedStages(calculation?.problems ?? []);

  /**
   * Every working stage prints through the same furniture as the filed set, so
   * a page run off from Index Average or the Rates Chart carries margins, says
   * which contract it belongs to and when it was prepared. Without it those
   * pages printed edge to edge on all four sides, with nothing naming them.
   *
   * Print bill is the exception: it renders three sheets of its own, and a
   * fourth wrapped around them would nest furniture inside furniture.
   */
  // The segment after /c/:id, which is '' on Main Data. Compared this way
  // rather than against the whole path, so that a trailing slash — /c/3/ is a
  // URL anyone can arrive at — does not silently drop the furniture.
  const stagePath = pathname.replace(/\/+$/, '').slice(`/c/${id}`.length).replace(/^\//, '');
  const current = STAGES.find((s) => s.to === stagePath);
  const framed = current !== undefined && current.key !== 'print';

  return (
    <div className="shell">
      <nav className="shell__nav">
        <div>
          <NavLink to="/" className="rail-back">← All contracts</NavLink>
          <div className="rail-title">{agreementNo || 'Untitled contract'}</div>
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
          <div className="row row--tight">
            <ThemeToggle />
            <button className="ghost small" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </nav>
      <main className="shell__main">
        <RunningHead
          identity={agreementNo || 'Untitled contract'}
          sub={contractor}
          saving={saving}
          error={error}
          payable={calculation ? `₹${formatRupees(calculation.payable)}` : null}
          problemCount={calculation?.problems.length ?? 0}
        />
        {framed ? (
          <SheetFurniture
            stage last
            label={current.label}
            agreementNo={agreementNo}
            contractor={contractor}
            problemCount={calculation?.problems.length ?? 0}
          >
            {children}
          </SheetFurniture>
        ) : children}
      </main>
    </div>
  );
}
