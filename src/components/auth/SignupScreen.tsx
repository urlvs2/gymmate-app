'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/layout/AppFrame';
import { Button, Chip, ErrorNote, Field } from '@/components/ui';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import {
  createAccount,
  EMAIL_PATTERN,
  LIMITS,
  MIN_PASSWORD,
  USERNAME_PATTERN,
  type Gender,
  type SignupFailure,
} from '@/lib/auth/account';
import styles from './auth.module.css';

/**
 * Account creation.
 *
 * Username and password are the account; an email address is optional contact
 * information. The rest — name, age, height, weight, gender — is what the coach
 * would otherwise have to ask for, so collecting it here means the first
 * conversation is only ever about training.
 */
export function SignupScreen() {
  const { t } = usePreferences();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonText: Record<SignupFailure, string> = {
    invalid_username: t.usernameRules,
    username_taken: t.usernameTaken,
    weak_password: t.passwordHint,
    invalid_email: t.emailInvalid,
    invalid_name: t.nameRequired,
    invalid_age: t.ageRange,
    invalid_height: t.heightRange,
    invalid_weight: t.weightRange,
    invalid_gender: t.genderRequired,
    signup_failed: t.genericError,
    network: t.genericError,
  };

  /** Mirrors what the edge function will accept, so mistakes surface instantly. */
  const validate = (): { reason: SignupFailure } | null => {
    const num = (value: string) => Number(value.trim().replace(',', '.'));
    const outside = (value: string, range: { min: number; max: number }) => {
      const n = num(value);
      return !Number.isFinite(n) || n < range.min || n > range.max;
    };

    if (!fullName.trim()) return { reason: 'invalid_name' };
    if (!USERNAME_PATTERN.test(username.trim())) return { reason: 'invalid_username' };
    if (password.length < MIN_PASSWORD) return { reason: 'weak_password' };
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) return { reason: 'invalid_email' };
    if (outside(age, LIMITS.age)) return { reason: 'invalid_age' };
    if (outside(height, LIMITS.heightCm)) return { reason: 'invalid_height' };
    if (outside(weight, LIMITS.weightKg)) return { reason: 'invalid_weight' };
    if (!gender) return { reason: 'invalid_gender' };
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setError(reasonText[problem.reason]);
      return;
    }

    setBusy(true);
    setError(null);

    const result = await createAccount({
      username,
      password,
      email,
      fullName,
      age: Number(age.trim().replace(',', '.')),
      heightCm: Number(height.trim().replace(',', '.')),
      weightKg: Number(weight.trim().replace(',', '.')),
      gender: gender as Gender,
    });

    if (!result.ok) {
      setError(reasonText[result.reason ?? 'signup_failed']);
      setBusy(false);
      return;
    }

    router.replace('/app');
    router.refresh();
  };

  const genders: { value: Gender; label: string }[] = [
    { value: 'female', label: t.female },
    { value: 'male', label: t.male },
  ];

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <Brand name={t.appName} />
      </div>

      <form
        className={styles.content}
        // The browser's own validation bubbles are English whatever the app's
        // language is, and they pre-empt the checks below. `validate` covers the
        // same ground and speaks the user's language.
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className={`${styles.title} ${styles.titleTight}`}>{t.basicsTitle}</h1>
        <p className={styles.subtitle}>{t.basicsSub}</p>

        <div className={styles.grid}>
          <Field
            className={styles.span2}
            label={t.fullName}
            autoComplete="name"
            required
            maxLength={80}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Field
            className={styles.span2}
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
            className={styles.span2}
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
            className={styles.span2}
            label={t.email}
            hint={t.optional}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label={t.age}
            type="number"
            inputMode="numeric"
            required
            min={LIMITS.age.min}
            max={LIMITS.age.max}
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
          <Field
            label={t.heightCm}
            type="number"
            inputMode="decimal"
            required
            min={LIMITS.heightCm.min}
            max={LIMITS.heightCm.max}
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
          <Field
            className={styles.span2}
            label={t.weightKg}
            type="number"
            inputMode="decimal"
            required
            min={LIMITS.weightKg.min}
            max={LIMITS.weightKg.max}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>

        <div className={styles.genderBlock}>
          <div className={styles.genderLabel}>{t.gender}</div>
          <div className={styles.genderRow}>
            {genders.map((option) => (
              <Chip
                key={option.value}
                wide
                active={gender === option.value}
                className={styles.genderChip}
                onClick={() => setGender(option.value)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>

        <p className={styles.note}>{t.signupWhy}</p>

        {error && (
          <div className={styles.errorSlot}>
            <ErrorNote message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className={styles.actions}>
          <Button type="submit" loading={busy}>
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
