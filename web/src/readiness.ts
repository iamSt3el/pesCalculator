import { blockedStages, type ProblemLike, type StageKey } from './problems.ts';

export type StageReadiness = Record<StageKey, boolean>;

interface ReadinessBundle {
  contract: { agreementNo: string; workDoneAmount: number; bidDate: string; commencement: string; actualCompletion: string };
  components: Array<{ percent: number }>;
  progress: Array<{ month: string }>;
}
interface ReadinessCalculation { problems: ProblemLike[]; payable: number }

/**
 * Drives the numbered rail: a stage fills in once its own inputs are complete
 * and nothing outstanding has invalidated it. Which problems invalidate which
 * stage is `blockedStages` — a stage the problem does not touch stays filled,
 * so the rail points at the one place that needs attention rather than dimming
 * everything downstream at once.
 */
export function computeReadiness(
  bundle: ReadinessBundle,
  rates: Array<{ month: string }>,
  calculation: ReadinessCalculation | null,
): StageReadiness {
  const percentTotal = bundle.components.reduce((a, c) => a + c.percent, 0);
  const mainData = Boolean(
    bundle.contract.agreementNo && bundle.contract.bidDate &&
    bundle.contract.commencement && bundle.contract.actualCompletion &&
    bundle.contract.workDoneAmount > 0 && Math.abs(percentTotal - 100) < 1e-9,
  );
  const blocked = calculation ? blockedStages(calculation.problems) : null;
  const clear = (stage: StageKey) => blocked !== null && !blocked.has(stage);

  return {
    mainData: mainData && !blocked?.has('mainData'),
    rates: rates.length > 0 && !blocked?.has('rates'),
    indexAverage: clear('indexAverage'),
    baseRate: clear('baseRate'),
    calculation: clear('calculation'),
    print: clear('print'),
  };
}
