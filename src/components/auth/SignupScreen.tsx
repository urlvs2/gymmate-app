'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/layout/AppFrame';
import { Button, ErrorNote, Field } from '@/components/ui';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { createAccount, MIN_PASSWORD, USERNAME_PATTERN, type SignupFailure } from '@/lib/auth/account';
import styles from './auth.module.css';

/**
 * Account creation. Username and password are the account; an email address is
 * optional and only ever used as contact information. Age, height, goal and the
 * rest are the coach's job, not a form's.
 */
export function SignupScreen() {
  const { t } = usePreferences();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonText: Record<SignupFailure, string> = {
    invalid_username: t.usernameRules,
    username_taken: t.usernameTaken,
    weak_password: t.passwordHint,
    invalid_email: t.emailInvalid,
    signup_failed: t.genericError,
    network: t.genericError,
  };

  const submit = async () => {
    if (!USERNAME_PATTERN.test(username.trim())) {
      setError(t.usernameRules);
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(t.passwordHint);
      return;
    }

    setBusy(true);
    setError(null);

    const result = await createAccount({ username, password, email });

    if (!result.ok) {
      setError(reasonText[result.reason ?? 'signup_failed']);
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
        <h1 className={`${styles.title} ${styles.titleTight}`}>{t.basicsTitle}</h1>
        <p className={styles.subtitle}>{t.basicsSub}</p>

        <div className={styles.fields}>
          <Field
            label={t.username}
            hint={t.usernameHint}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={24}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Field
            label={t.password}
            hint={t.passwordHint}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label={t.email}
            hint={t.optional}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <p className={styles.note}>{t.emailWhy}</p>

        {error && (
          <div className={styles.errorSlot}>
            <ErrorNote message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className={styles.actions}>
          <Button type="submit" loading={busy} disabled={!username || !password}>
            {t.createCta}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push('/login')}>
            {t.haveAccount}
          </Button>
        </div>
      </form>
    </div>
  );
}
