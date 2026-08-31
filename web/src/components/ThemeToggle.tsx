import { useTheme } from '../theme.ts';

/**
 * One control, three states: follow the machine, or override it either way.
 * The label says which is in force rather than which comes next, so the button
 * reports the current state instead of asking the reader to predict it.
 */
export function ThemeToggle() {
  const { label, cycle } = useTheme();
  return (
    <button type="button" className="theme-toggle no-print" onClick={cycle} title="Change theme">
      <span className="theme-toggle__dot" aria-hidden="true" />
      {label}
    </button>
  );
}
