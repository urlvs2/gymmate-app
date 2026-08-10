'use client';

import { useEffect, useState } from 'react';
import { Button, ErrorNote } from '@/components/ui';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { useApp } from '@/lib/state/AppProvider';
import styles from './profile.module.css';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface EditableFields {
  fullName: string;
  email: string;
  age: string;
  heightCm: string;
  weightKg: string;
}

/**
 * What GymMate knows about the user.
 *
 * The editable rows are the plain facts they own. Username is shown but fixed —
 * it identifies the account. Everything the coach worked out from the
 * conversation is read-only, because changing it here would put the profile and
 * the program out of step.
 */
export function ProfileScreen() {
  const { t } = usePreferences();
  const { profile, plan, history, updateProfile, signOut, error, clearError } = useApp();

  const [editing, setEditing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EditableFields>({
    fullName: '',
    email: '',
    age: '',
    heightCm: '',
    weightKg: '',
  });

  useEffect(() => {
    setDraft({
      fullName: profile.fullName ?? '',
      email: profile.email ?? '',
      age: profile.age?.toString() ?? '',
      heightCm: profile.heightCm?.toString() ?? '',
      weightKg: profile.weightKg?.toString() ?? '',
    });
  }, [profile]);

  const completed = history.filter((s) => s.status === 'completed').length;

  const displayName = profile.fullName?.trim() || profile.username;
  const initials = (profile.fullName?.trim() || profile.username || 'G')
    .split(/[\s@._]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join('');

  const numberOrNull = (value: string, min: number, max: number) => {
    const n = Number(value);
    if (!value.trim() || Number.isNaN(n)) return null;
    return Math.min(max, Math.max(min, n));
  };

  const save = async () => {
    const email = draft.email.trim();
    if (email && !EMAIL_PATTERN.test(email)) {
      setLocalError(t.emailInvalid);
      return;
    }

    setSaving(true);
    setLocalError(null);
    clearError();

    const saved = await updateProfile({
      fullName: draft.fullName.trim() || null,
      email: email || null,
      age: numberOrNull(draft.age, 10, 100),
      heightCm: numberOrNull(draft.heightCm, 80, 260),
      weightKg: numberOrNull(draft.weightKg, 25, 400),
    });

    setSaving(false);
    if (saved) setEditing(false);
  };

  const editableRows: {
    label: string;
    field: keyof EditableFields;
    suffix?: string;
    inputMode?: 'text' | 'email' | 'decimal';
  }[] = [
    { label: t.rName, field: 'fullName', inputMode: 'text' },
    { label: t.rEmail, field: 'email', inputMode: 'email' },
    { label: t.rAge, field: 'age', inputMode: 'decimal' },
    { label: t.rHeight, field: 'heightCm', suffix: t.cm, inputMode: 'decimal' },
    { label: t.rWeight, field: 'weightKg', suffix: t.kg, inputMode: 'decimal' },
  ];

  const readOnlyRows: { label: string; value: string }[] = [
    { label: t.rGender, value: profile.gender ?? '—' },
    { label: t.rExperience, value: profile.experience ?? t.notSet },
    { label: t.rGoal, value: profile.goal ?? t.notSet },
    {
      label: t.rDays,
      value: profile.daysPerWeek ? `${profile.daysPerWeek} ${t.perWeekShort}` : t.notSet,
    },
    {
      label: t.rTime,
      value: profile.sessionMinutes ? `${profile.sessionMinutes} ${t.min}` : t.notSet,
    },
    { label: t.rEquipment, value: profile.equipment ?? t.notSet },
    { label: t.rPlan, value: plan ? plan.name : t.waiting },
    { label: t.rWorkouts, value: String(completed) },
  ];

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t.profile}</h2>
        <button
          className={styles.editButton}
          disabled={saving}
          onClick={() => {
            if (editing) {
              void save();
            } else {
              setLocalError(null);
              clearError();
              setEditing(true);
            }
          }}
        >
          {editing ? t.save : t.edit}
        </button>
      </div>

      <div className={styles.body}>
        {(localError || error) && (
          <div className={styles.errorSlot}>
            <ErrorNote
              message={localError ?? error ?? ''}
              onDismiss={() => {
                setLocalError(null);
                clearError();
              }}
            />
          </div>
        )}

        <div className={styles.identity}>
          <div className={styles.avatar}>{initials || 'G'}</div>
          <div className={styles.identityText}>
            <div className={styles.name}>{displayName}</div>
            <div className={styles.sub}>
              @{profile.username}
              {plan ? ` · ${plan.name}` : ` · ${t.waiting}`}
            </div>
          </div>
        </div>

        <div className={styles.rows}>
          {/* The account's identity: shown first, never editable. */}
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t.rUsername}</span>
            <span className={styles.rowValue}>@{profile.username}</span>
          </div>

          {editableRows.map((row) => (
            <div className={styles.row} key={row.field}>
              <span className={styles.rowLabel}>
                {row.label}
                {row.field === 'email' && !editing && !draft.email ? ` · ${t.optional}` : ''}
              </span>
              {editing ? (
                <input
                  className={styles.rowInput}
                  value={draft[row.field]}
                  inputMode={row.inputMode}
                  autoCapitalize={row.field === 'email' ? 'none' : undefined}
                  onChange={(e) => setDraft({ ...draft, [row.field]: e.target.value })}
                  aria-label={row.label}
                />
              ) : (
                <span className={styles.rowValue}>
                  {draft[row.field]
                    ? `${draft[row.field]}${row.suffix ? ` ${row.suffix}` : ''}`
                    : '—'}
                </span>
              )}
            </div>
          ))}

          {readOnlyRows.map((row) => (
            <div className={styles.row} key={row.label}>
              <span className={styles.rowLabel}>{row.label}</span>
              <span className={styles.rowValue}>{row.value}</span>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" size="md" onClick={() => void signOut()}>
            {t.logout}
          </Button>
        </div>
      </div>
    </div>
  );
}
