import { BaseRateSummary } from '../components/BaseRateSummary.tsx';
import { BillPaper } from '../components/BillPaper.tsx';
import { IndexAverageTables } from '../components/IndexAverageTables.tsx';
import { ScheduleTable } from '../components/ScheduleTable.tsx';
import { useContract } from '../ContractLayout.tsx';
import { formatRupees } from '../format.ts';

/**
 * The three derived stages as one document: index averages, then the base
 * rates and payment schedule they feed, then the bill itself. Each starts a
 * fresh sheet, so what comes off the printer is the set that gets filed.
 */
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

      <section className="sheet">
        <h2 className="sheet__title">
          Index Average — {bundle.contract.agreementNo || 'Untitled contract'}
        </h2>
        <IndexAverageTables />
      </section>

      <section className="sheet">
        <h2 className="sheet__title">
          Base Rate — {bundle.contract.agreementNo || 'Untitled contract'}
        </h2>
        <BaseRateSummary rows={bundle.components} />
        <ScheduleTable />
      </section>

      <section className="sheet sheet--last">
        <BillPaper />
      </section>
    </div>
  );
}
