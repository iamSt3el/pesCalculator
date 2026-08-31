import { IndexAverageTables } from '../components/IndexAverageTables.tsx';
import { PrintButton } from '../components/PrintButton.tsx';
import { useContract } from '../ContractLayout.tsx';

export function IndexAveragePage() {
  const { calculation } = useContract();

  if (!calculation) {
    return <>
      <h1 className="title">Index Average</h1>
      <p className="hint">Fill in Main Data and the rates chart, and the quarter averages appear here.</p>
    </>;
  }

  return (
    <div className="derived">
      <div className="spread">
        <div>
          <span className="derived-mark">Computed</span>
          <h1 className="title" style={{ marginTop: 4 }}>Index Average</h1>
          <p className="subtitle">
            Derived from the rates chart. Nothing here is entered by hand.
          </p>
        </div>
        <PrintButton />
      </div>
      <IndexAverageTables />
    </div>
  );
}
