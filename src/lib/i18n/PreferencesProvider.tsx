'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dictionaries, type Dictionary } from './dictionary';
import type { Lang, Theme } from '@/lib/domain/types';

const STORAGE_KEY = 'gymmate.prefs.v1';

interface PreferencesValue {
  lang: Lang;
  theme: Theme;
  dir: 'ltr' | 'rtl';
  t: Dictionary;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  toggleLang: () => void;
  toggleTheme: () => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

interface StoredPrefs {
  lang?: Lang;
  theme?: Theme;
}

function readStored(): StoredPrefs {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredPrefs;
  } catch {
    return {};
  }
}

/**
 * Language and theme, mirrored onto the <html> element so the CSS variables and
 * text direction in globals.css apply to the whole document — including the
 * page background behind the app frame.
 */
export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [theme, setThemeState] = useState<Theme>('dark');

  // Read once on mount: the server render has no access to localStorage.
  useEffect(() => {
    const stored = readStored();
    if (stored.lang) setLangState(stored.lang);
    if (stored.theme) setThemeState(stored.theme);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.lang = lang;
    root.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    root.setAttribute('lang', lang);
  }, [lang, theme]);

  const persist = useCallback((next: StoredPrefs) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStored(), ...next }));
    } catch {
      // Private browsing with storage disabled — preferences just won't stick.
    }
    // Signed-in users keep the preference on their profile too; guests don't have one.
    void fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => undefined);
  }, []);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      persist({ lang: next });
    },
    [persist],
  );

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      persist({ theme: next });
    },
    [persist],
  );

  const value = useMemo<PreferencesValue>(
    () => ({
      lang,
      theme,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t: dictionaries[lang],
      setLang,
      setTheme,
      toggleLang: () => setLang(lang === 'en' ? 'ar' : 'en'),
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    }),
    [lang, theme, setLang, setTheme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
