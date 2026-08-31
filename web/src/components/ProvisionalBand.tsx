/**
 * The mark that separates a provisional bill from a final one on paper. Until
 * this existed the only difference was one word in a label, which is thin for
 * a document that leaves the building.
 *
 * Every sheet's foot carries the same count — see SheetFurniture — so a page
 * separated from the set still declares itself. This is the loud half.
 */
export function ProvisionalBand({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="provisional-band">
      <span className="provisional-band__word">Provisional</span>
      <span className="provisional-band__detail">
        {count} item{count === 1 ? '' : 's'} outstanding — not for payment
      </span>
    </div>
  );
}
