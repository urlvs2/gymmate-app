'use client';

import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { CalendarIcon, ProfileIcon, SparkIcon, WorkoutIcon } from '@/components/ui/Icons';
import styles from './shell.module.css';

export type Tab = 'profile' | 'bot' | 'workout' | 'plan';

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const { t } = usePreferences();

  const items: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: t.navProfile, icon: <ProfileIcon /> },
    { key: 'bot', label: t.navBot, icon: <SparkIcon /> },
    { key: 'workout', label: t.navWorkout, icon: <WorkoutIcon /> },
    { key: 'plan', label: t.navPlan, icon: <CalendarIcon /> },
  ];

  return (
    <nav className={styles.nav}>
      {items.map((item) => (
        <button
          key={item.key}
          className={cx(styles.navItem, tab === item.key && styles.navItemActive)}
          onClick={() => onChange(item.key)}
          aria-current={tab === item.key ? 'page' : undefined}
        >
          {item.icon}
          <span className={styles.navLabel}>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
