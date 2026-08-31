/**
 * A bound book puts the chapter on every page. This does the same for the
 * contract: nothing else on screen names it, and the rail that used to is the
 * first thing a narrow window takes away.
 *
 * Save state and errors live here rather than inline on each page, so they
 * stop shifting the layout when they appear — the row reserves its height
 * whether or not there is anything to say.
 */
export function RunningHead({
  identity, sub, saving, error, payable, problemCount,
}: {
  identity: string;
  sub?: string;
  saving?: boolean;
  error?: string | null;
  payable?: string | null;
  problemCount?: number;
}) {
  return (
    <div className="running-head">
      <div className="running-head__id">
        <span className="running-head__name">{identity}</span>
        {sub && <span className="running-head__sub">{sub}</span>}
      </div>

      {/* Carried here only on a narrow screen, where the rail is out of sight. */}
      {payable && (
        <span className="running-head__payable">
          {payable}
          {problemCount ? <span className="running-head__flag">{problemCount}</span> : null}
        </span>
      )}

      <span className={`running-head__state${error ? ' running-head__state--error' : ''}`}>
        {error ?? (saving ? 'Saving…' : 'All changes saved')}
      </span>
    </div>
  );
}
