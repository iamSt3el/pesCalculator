/**
 * Prints the stage you are looking at. Every page carries one; print.css strips
 * the rail, the buttons and anything marked no-print, so what reaches the paper
 * is the figures alone.
 */
export function PrintButton({ label = 'Print' }: { label?: string }) {
  return <button className="ghost no-print" onClick={() => window.print()}>{label}</button>;
}
