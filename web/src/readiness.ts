export interface StageReadiness {
  mainData: boolean;
  rates: boolean;
  indexAverage: boolean;
  baseRate: boolean;
  calculation: boolean;
  print: boolean;
}

interface ReadinessBundle {
  contract: { agreementNo: string; workDoneAmount: number; bidDate: string; commencement: string; actualCompletion: string };
  components: Array<{ percent: number }>;
  progress: Array<{ month: string }>;
}
interface ReadinessCalculation { problems: Array<{ code: string }>; payable: number }

/** Drives the numbered rail: a stage fills in once its own inputs are complete. */
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
  const ratesReady = rates.length > 0;
  const derived = Boolean(calculation && calculation.problems.length === 0);

  return {
    mainData,
    rates: ratesReady,
    indexAverage: derived,
    baseRate: derived,
    calculation: derived,
    print: derived,
  };
}
