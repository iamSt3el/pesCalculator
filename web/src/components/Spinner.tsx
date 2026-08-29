/**
 * The one loading indicator. `page` is for the boot screen, before any chrome
 * exists to centre it inside; everywhere else it centres in its own section.
 */
export function Spinner({ page = false, label = 'Loading' }: { page?: boolean; label?: string }) {
  return (
    <div className={`loading-center${page ? ' loading-center--page' : ''}`} role="status">
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
