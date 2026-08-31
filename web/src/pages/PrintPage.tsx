import { BaseRateSummary } from '../components/BaseRateSummary.tsx';
import { BillPaper } from '../components/BillPaper.tsx';
import { IndexAverageTables } from '../components/IndexAverageTables.tsx';
import { ScheduleTable } from '../components/ScheduleTable.tsx';
import { ProvisionalBand } from '../components/ProvisionalBand.tsx';
import { SheetFurniture } from '../components/SheetFurniture.tsx';
import { useContract } from '../ContractLayout.tsx';
import { formatRupees } from '../format.ts';

/**
 * The three derived stages as one document: index averages, then the base
 * rates and payment schedule they feed, then the bill itself. Each starts a
 * fresh sheet, so what comes off the printer is the set that gets filed.
 */
/** Three sheets today. Derived from this, never hardcoded into a foot. */
const SHEETS = 3;

export function PrintPage() {
  const { bundle, calculation } = useContract();

  if (!calculation) {
    return <>
      <h1 className="title">Print bill</h1>
      <p className="hint">
        There is nothing to print yet. Fill in Main Data and the rates chart first.
      </p>
    </>;
  }

  const provisional = calculation.problems.length > 0;
  const marks = {
    agreementNo: bundle.contract.agreementNo,
    contractor: bundle.contract.contractor,
    problemCount: calculation.problems.length,
  };

  return (
    <div className="report">
      <div className="spread no-print bar">
        <div>
          <h1 className="title">Print bill</h1>
          <p className="subtitle">
            Index Average, Base Rate and Calculation on three sheets — the set as it is filed.
          </p>
        </div>
        <button onClick={() => window.print()}>Print all three</button>
      </div>

      {provisional && (
        <div className="no-print">
          <p className="notice">
            This bill still has {calculation.problems.length} thing
            {calculation.problems.length === 1 ? '' : 's'} to fix, so ₹{formatRupees(calculation.payable)}{' '}
            is provisional. It will print marked as such.
          </p>
          {calculation.problems.map((p) => <p key={p.code} className="notice">{p.message}</p>)}
        </div>
      )}

      <SheetFurniture index={0} total={SHEETS} {...marks}>
        <ProvisionalBand count={calculation.problems.length} />
        <h2 className="sheet__title">Index Average</h2>
        <IndexAverageTables />
      </SheetFurniture>

      <SheetFurniture index={1} total={SHEETS} {...marks}>
        <h2 className="sheet__title">Base Rate</h2>
        <BaseRateSummary rows={bundle.components} />
        <ScheduleTable />
      </SheetFurniture>

      <SheetFurniture index={2} total={SHEETS} last {...marks}>
        <BillPaper showBand={false} />
      </SheetFurniture>
    </div>
  );
}
