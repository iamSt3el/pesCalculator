import { useEffect, useRef, useState } from 'react';

/**
 * Debounced save. Edits stay instant in local state; the write lands once
 * typing pauses, so a spreadsheet-style grid does not fire a request per keypress.
 */
export function useDebouncedSave<T>(save: (value: T) => Promise<unknown>, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    saving,
    error,
    schedule(value: T) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setSaving(true);
        save(value)
          .then(() => setError(null))
          .catch((e: Error) => setError(e.message))
          .finally(() => setSaving(false));
      }, delay);
    },
  };
}

/** Adds the settle class for one animation frame whenever value changes. */
export function useSettle(value: unknown): string {
  const first = useRef(true);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setOn(true);
    const t = setTimeout(() => setOn(false), 140);
    return () => clearTimeout(t);
  }, [value]);
  return on ? 'settled' : '';
}
