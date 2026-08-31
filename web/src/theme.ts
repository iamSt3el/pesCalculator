import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'pes-theme';
const ORDER: Theme[] = ['system', 'light', 'dark'];

export const THEME_LABEL: Record<Theme, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

/**
 * Reading storage throws outright in some privacy modes rather than returning
 * nothing, so every access is guarded and the app falls back to following the
 * system setting - which is what an unset preference means anyway.
 */
function read(): Theme {
  try {
    const held = localStorage.getItem(KEY);
    return held === 'light' || held === 'dark' ? held : 'system';
  } catch {
    return 'system';
  }
}

/**
 * 'system' leaves the root element unstamped, which is the state the stylesheet
 * treats as "follow prefers-color-scheme". An explicit choice stamps it, and
 * that stamp is what lets a light choice win on a dark machine and the reverse.
 */
function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    apply(theme);
    try {
      if (theme === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch { /* a preference that cannot be stored still applies for this visit */ }
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]!);
  }, []);

  return { theme, cycle, label: THEME_LABEL[theme] };
}
