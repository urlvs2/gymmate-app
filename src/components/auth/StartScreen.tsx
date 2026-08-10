'use client';

import { useRouter } from 'next/navigation';
import { Brand } from '@/components/layout/AppFrame';
import { Button } from '@/components/ui';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import styles from './auth.module.css';

/** The front door: create an account or sign in. */
export function StartScreen() {
  const { t } = usePreferences();
  const router = useRouter();

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <Brand name={t.appName} />
      </div>

      <div className={styles.content}>
        <h1 className={styles.title}>{t.startTitle}</h1>
        <p className={styles.subtitle}>{t.startSub}</p>

        <div className={styles.actions}>
          <Button onClick={() => router.push('/signup')}>{t.createAccount}</Button>
          <Button variant="secondary" onClick={() => router.push('/login')}>
            {t.haveAccountLogin}
          </Button>
        </div>
      </div>
    </div>
  );
}
