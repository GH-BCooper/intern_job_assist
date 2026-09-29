import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyAccent, applyContrast, applyFontScale } from '../lib/accent';
import { read, savePreferences, subscribe, type AccentId } from '../lib/store';

type Theme = 'light' | 'dark';

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  accent: AccentId;
  setAccent: (a: AccentId) => void;
  highContrast: boolean;
  setHighContrast: (on: boolean) => void;
  fontScale: number;
  setFontScale: (scale: number) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
}

/**
 * Light/dark plus the three presentation preferences that live in the store:
 * accent palette, high contrast, and base font size.
 *
 * Light/dark stays in `localStorage` under its own key because it has to apply
 * before the store is scoped to a user — the others are per-user preferences and
 * are read from (and written back to) the local store.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Seeded from the class the inline script in index.html already set before first
  // paint, so React's idea of the theme matches the screen from the first render.
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );
  const [presentation, setPresentation] = useState(() => {
    const p = read().preferences;
    return { accent: p.accent, highContrast: p.highContrast, fontScale: p.fontScale };
  });

  // Follow the theme chosen in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'theme' || (e.newValue !== 'light' && e.newValue !== 'dark')) return;
      setThemeState(e.newValue);
      applyTheme(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // The store is the source of truth, and it changes when a user signs in (the
  // scope switches) as well as when Settings writes a preference.
  useEffect(
    () =>
      subscribe(() => {
        const p = read().preferences;
        setPresentation(prev =>
          prev.accent === p.accent && prev.highContrast === p.highContrast && prev.fontScale === p.fontScale
            ? prev
            : { accent: p.accent, highContrast: p.highContrast, fontScale: p.fontScale },
        );
      }),
    [],
  );

  useEffect(() => {
    applyAccent(presentation.accent);
    applyContrast(presentation.highContrast);
    applyFontScale(presentation.fontScale);
  }, [presentation]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('theme', t);
    applyTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      toggleTheme,
      setTheme,
      accent: presentation.accent,
      setAccent: (a: AccentId) => savePreferences({ accent: a }),
      highContrast: presentation.highContrast,
      setHighContrast: (on: boolean) => savePreferences({ highContrast: on }),
      fontScale: presentation.fontScale,
      setFontScale: (scale: number) => savePreferences({ fontScale: Math.max(0.85, Math.min(1.35, scale)) }),
    }),
    [theme, toggleTheme, setTheme, presentation],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
