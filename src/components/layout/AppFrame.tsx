'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { DumbbellIcon, MoonIcon, SunIcon } from '@/components/ui/Icons';
import styles from './shell.module.css';

/**
 * The device frame every screen sits inside: full-bleed on a phone, a centred
 * 390×844 shell on anything larger, exactly as drawn in the mockup.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <StatusBar />
        {children}
      </div>
    </div>
  );
}

function StatusBar() {
  const { lang, theme, toggleLang, toggleTheme } = usePreferences();
  const [time, setTime] = useState('');

  // Rendered client-side only so the server and client markup can't disagree.
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString(lang === 'ar' ? 'ar-KW' : 'en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [lang]);

  return (
    <div className={styles.statusBar}>
      <span className={styles.clock} suppressHydrationWarning>
        {time}
      </span>
      <span className={styles.toggles}>
        <button
          className={styles.toggle}
          onClick={toggleLang}
          aria-label={lang === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}
        >
          {lang === 'en' ? 'ع' : 'EN'}
        </button>
        <button
          className={styles.toggle}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </span>
    </div>
  );
}

/** GymMate wordmark used on the entry screens. */
export function Brand({ name }: { name: string }) {
  return (
    <div className={styles.brandRow}>
      <span className={styles.brandMark}>
        <DumbbellIcon size={20} />
      </span>
      <span className={styles.brandName}>{name}</span>
    </div>
  );
}
