'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/layout/AppFrame';
import { Button, ErrorNote, Field } from '@/components/ui';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { signInWithUsername } from '@/lib/auth/account';
import styles from './auth.module.css';

/** Signing in: username and password, the same pair used at sign-up. */
export function LoginScreen() {
  const { t } = usePreferences();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);

    const { error: authError } = await signInWithUsername(username, password);

    if (authError) {
      // Supabase phrases this in terms of an email address the user never saw.
      setError(t.wrongCredentials);
      setBusy(false);
      return;
    }

    router.replace('/app');
    router.refresh();
  };

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <Brand name={t.appName} />
      </div>

      <form
        className={styles.content}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className={styles.title}>{t.welcome}</h1>
        <p className={styles.subtitle}>{t.welcomeSub}</p>

        <div className={styles.fields}>
          <Field
            label={t.username}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Field
            label={t.password}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className={styles.errorSlot}>
            <ErrorNote message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className={styles.actions}>
          <Button type="submit" loading={busy} disabled={!username || !password}>
            {t.login}
          </Button>
          <Button variant="secondary" onClick={() => router.push('/signup')}>
            {t.createAccount}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            {t.backToStart}
          </Button>
        </div>
      </form>
    </div>
  );
}
