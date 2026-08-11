'use client';

import { useState } from 'react';
import { useApp } from '@/lib/state/AppProvider';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { ChatScreen } from '@/components/chat/ChatScreen';
import { WorkoutScreen } from '@/components/workout/WorkoutScreen';
import { PlanScreen } from '@/components/plan/PlanScreen';
import { ProfileScreen } from '@/components/profile/ProfileScreen';
import { TypingDots } from '@/components/ui';
import { BottomNav, type Tab } from './BottomNav';
import styles from './shell.module.css';

/** The app: four areas behind one bottom navigation bar. */
export function AppTabs() {
  const { ready } = useApp();
  const { t } = usePreferences();
  const [tab, setTab] = useState<Tab>('bot');

  if (!ready) {
    return (
      <div className={styles.body}>
        <div className={styles.loading} aria-label={t.appName}>
          <TypingDots />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.body}>
      <div className={styles.main}>
        {tab === 'bot' && <ChatScreen onNavigate={setTab} />}
        {tab === 'workout' && <WorkoutScreen onNavigate={setTab} />}
        {tab === 'plan' && <PlanScreen onNavigate={setTab} />}
        {tab === 'profile' && <ProfileScreen />}
      </div>
      <BottomNav tab={tab} onChange={setTab} />
    </div>
  );
}
