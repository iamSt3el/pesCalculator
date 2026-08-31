import { Link, useParams } from 'react-router-dom';
import type { Calculation } from '../api.ts';
import { formatMonth } from '../format.ts';
import { routeProblems, type StageKey } from '../problems.ts';

const STAGE_LABEL: Record<StageKey, string> = {
  mainData: 'Main Data', rates: 'Rates Chart', indexAverage: 'Index Average',
  baseRate: 'Base Rate', calculation: 'Calculation', print: 'Print bill',
};

/**
 * Each outstanding problem as a link to the stage that can fix it. The engine
 * already knows what is wrong and which months it concerns; this is the path
 * from knowing to fixing. A gap in the rates chart carries its months through
 * as ?focus=, so the grid opens on the rows the calculation went looking for.
 */
export function ProblemList({ calculation }: { calculation: Calculation | null }) {
  const { id } = useParams();
  if (!calculation || calculation.problems.length === 0) return null;

  return (
    <div className="problems no-print">
      {routeProblems(calculation.problems).map((p) => {
        const query = p.months.length > 0 ? `?focus=${p.months.join(',')}` : '';
        return (
          <Link key={p.code} to={`/c/${id}${p.path ? `/${p.path}` : ''}${query}`} className="problem">
            <span className="problem__where">{STAGE_LABEL[p.stage]}</span>
            <span>{p.message}</span>
            {p.months.length > 0 && (
              <span className="problem__months">{p.months.map(formatMonth).join(' · ')}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
