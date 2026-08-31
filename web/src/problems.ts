export type StageKey =
  'mainData' | 'rates' | 'indexAverage' | 'baseRate' | 'calculation' | 'print';

/** The narrow shape of a problem this module needs; the API type satisfies it. */
export interface ProblemLike {
  code: string;
  message?: string;
  months?: string[];
}

export interface RoutedProblem {
  code: string;
  message: string;
  /** The stage that can fix it. */
  stage: StageKey;
  /** Route under /c/:id — empty for Main Data, which is the index route. */
  path: string;
  /** Months the fix concerns, so the rates grid can be scrolled to them. */
  months: string[];
}

interface Owner {
  stage: StageKey;
  path: string;
  /** Stages whose figures cannot be trusted while this problem stands. */
  blocks: StageKey[];
}

const DOWNSTREAM: StageKey[] = ['indexAverage', 'baseRate', 'calculation', 'print'];

/**
 * Where each problem is fixed, and what it invalidates. The two are different:
 * a percentage that does not total 100 is fixed on Main Data and only breaks
 * the formula, while the quarter means and the base indices above it stay true.
 * Blocking every derived stage for every problem alike, as this once did, hides
 * which stage actually needs attention.
 */
const OWNERS: Record<string, Owner> = {
  missing_rates: {
    stage: 'rates', path: 'rates',
    blocks: ['rates', ...DOWNSTREAM],
  },
  percent_total: {
    stage: 'mainData', path: '',
    blocks: ['mainData', 'calculation', 'print'],
  },
  invalid_period: {
    stage: 'mainData', path: '',
    blocks: ['mainData', ...DOWNSTREAM],
  },
  zero_base: {
    stage: 'baseRate', path: 'base-rate',
    blocks: ['baseRate', 'calculation', 'print'],
  },
  // The schedule and its adjustments are edited on Base Rate, not Main Data.
  schedule_drift: {
    stage: 'baseRate', path: 'base-rate',
    blocks: ['baseRate', 'calculation', 'print'],
  },
};

/** A code the engine grows later still has to land somewhere a reader can see it. */
const FALLBACK: Owner = { stage: 'calculation', path: 'calculation', blocks: ['calculation', 'print'] };

export function routeProblems(problems: ProblemLike[]): RoutedProblem[] {
  return problems.map((p) => {
    const owner = OWNERS[p.code] ?? FALLBACK;
    return {
      code: p.code,
      message: p.message ?? '',
      stage: owner.stage,
      path: owner.path,
      months: p.months ?? [],
    };
  });
}

export function blockedStages(problems: ProblemLike[]): Set<StageKey> {
  const out = new Set<StageKey>();
  for (const p of problems) {
    for (const s of (OWNERS[p.code] ?? FALLBACK).blocks) out.add(s);
  }
  return out;
}
