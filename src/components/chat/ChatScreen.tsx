'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Chip, ErrorNote, TypingDots } from '@/components/ui';
import { ArrowUpIcon, DumbbellIcon } from '@/components/ui/Icons';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { useApp } from '@/lib/state/AppProvider';
import type { Tab } from '@/components/layout/BottomNav';
import styles from './chat.module.css';

/**
 * The coach conversation — the first thing a new user meets.
 *
 * The questions, their order and the one-tap options all come from the model.
 * This screen only renders whatever the coach decided to ask.
 */
export function ChatScreen({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { t, lang } = usePreferences();
  const { chat, plan, thinking, buildingPlan, error, clearError, openCoach, sendMessage, restartCoach } =
    useApp();

  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  // The coach writes its own opening line the first time this screen is shown.
  useEffect(() => {
    void openCoach();
  }, [openCoach]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length, thinking, buildingPlan, plan]);

  const busy = thinking || buildingPlan;
  const lastMessage = chat[chat.length - 1];
  const quickOptions = !busy && lastMessage?.role === 'assistant' ? (lastMessage.options ?? []) : [];

  const submit = (text: string) => {
    setDraft('');
    void sendMessage(text);
  };

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.avatar}>
          <div className={styles.avatarGlow} />
          <div className={styles.avatarMark}>
            <DumbbellIcon size={20} />
          </div>
        </div>
        <div className={styles.headerText}>
          <div className={styles.botName}>{t.botName}</div>
          <div className={styles.botStatus}>{plan ? t.botStatusReady : t.botStatus}</div>
        </div>
        <button className={styles.restart} onClick={() => void restartCoach()} disabled={busy}>
          {t.restart}
        </button>
      </header>

      <div className={styles.thread} ref={threadRef}>
        {chat.map((m) => (
          <div
            key={m.id}
            className={`${styles.bubble} ${m.role === 'user' ? styles.fromUser : styles.fromBot}`}
          >
            {m.content}
          </div>
        ))}

        {thinking && (
          <div className={styles.typing}>
            <TypingDots />
          </div>
        )}

        {buildingPlan && (
          <div className={styles.typing}>
            <TypingDots />
            <span>{t.buildingPlan}</span>
          </div>
        )}

        {plan && !buildingPlan && (
          <div className={styles.planCard}>
            <div className={styles.planHead}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  fontWeight: 700,
                }}
              >
                {t.selectedByAI}
              </div>
              <div className={styles.planName}>{plan.name}</div>
              <div className={styles.planWhy}>{plan.rationale}</div>
            </div>

            <div className={styles.planStats}>
              <div className={styles.planStat}>
                <div className={styles.planStatValue}>{plan.daysPerWeek}×</div>
                <div className={styles.planStatLabel}>{t.perWeek}</div>
              </div>
              <div className={styles.planStat}>
                <div className={styles.planStatValue}>
                  {plan.sessionMinutes}
                  {lang === 'ar' ? 'د' : 'm'}
                </div>
                <div className={styles.planStatLabel}>{t.perSession}</div>
              </div>
              <div className={styles.planStat}>
                <div className={styles.planStatValue}>
                  {plan.schedule.filter((d) => !d.rest).length}
                </div>
                <div className={styles.planStatLabel}>{t.rotation}</div>
              </div>
            </div>

            <div className={styles.planActions}>
              <Button size="md" onClick={() => onNavigate('workout')}>
                {t.startToday}
              </Button>
              <Button variant="subtle" size="md" onClick={() => onNavigate('plan')}>
                {t.seeWeek}
              </Button>
            </div>
          </div>
        )}

      </div>

      <div className={styles.composer}>
        {error && (
          <div className={styles.errorSlot}>
            <ErrorNote message={error} onDismiss={clearError} />
          </div>
        )}

        {quickOptions.length > 0 && (
          <div className={styles.quick}>
            {quickOptions.map((option) => (
              <Chip key={option} onClick={() => submit(option)}>
                {option}
              </Chip>
            ))}
          </div>
        )}

        <form
          className={styles.inputRow}
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) submit(draft);
          }}
        >
          <input
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.typeAny}
            aria-label={t.typeAny}
            disabled={busy}
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={busy || !draft.trim()}
            aria-label={t.send}
          >
            <ArrowUpIcon />
          </button>
        </form>
      </div>
    </div>
  );
}
