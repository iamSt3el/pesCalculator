import { BillPaper } from '../components/BillPaper.tsx';
import { PrintButton } from '../components/PrintButton.tsx';
import { useContract } from '../ContractLayout.tsx';

export function CalculationPage() {
  const { calculation } = useContract();

  if (!calculation) {
    return <>
      <h1 className="title">Calculation</h1>
      <p className="subtitle">Fill in Main Data and the rates chart to produce the bill.</p>
    </>;
  }

  return (
    <div className="report">
      <div className="spread no-print" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="title">Calculation</h1>
          <p className="subtitle">Every line shown in full, so the bill can be checked.</p>
        </div>
        <PrintButton />
      </div>

      {calculation.problems.length > 0 && (
        <div className="no-print">
          {calculation.problems.map((p) => <p key={p.code} className="notice">{p.message}</p>)}
        </div>
      )}

      <BillPaper />
    </div>
  );
}
