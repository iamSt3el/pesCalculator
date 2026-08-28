import { useEffect, useRef, useState } from 'react';

/**
 * Debounced save. Edits stay instant in local state; the write lands once
 * typing pauses, so a spreadsheet-style grid does not fire a request per keypress.
 */
export function useDebouncedSave<T>(save: (value: T) => Promise<unknown>, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ value: T } | null>(null);
  const latest = useRef(save);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  latest.current = save;
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = (value: T): Promise<void> => {
    pending.current = null;
    setSaving(true);
    return latest.current(value)
      .then(() => setError(null))
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false));
  };

  return {
    saving,
    error,
    schedule(value: T) {
      clearTimeout(timer.current);
      pending.current = { value };
      timer.current = setTimeout(() => void run(value), delay);
    },
    /**
     * Lands a waiting edit now instead of in half a second. Needed before any
     * write that is not a whole-collection replace — a delete, say — because
     * the queued save would otherwise put the removed row straight back.
     */
    flush(): Promise<void> {
      clearTimeout(timer.current);
      const held = pending.current;
      return held ? run(held.value) : Promise.resolve();
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
