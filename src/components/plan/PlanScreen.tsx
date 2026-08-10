'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { ChevronIcon } from '@/components/ui/Icons';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { useApp } from '@/lib/state/AppProvider';
import { schemeLabel } from '@/lib/domain/exercise';
import { todayWeekday } from '@/lib/domain/schedule';
import type { PlanExercise } from '@/lib/domain/types';
import { ExerciseDetailSheet } from '@/components/workout/ExerciseDetailSheet';
import type { Tab } from '@/components/layout/BottomNav';
import styles from './plan.module.css';

/** The whole week the coach wrote, expandable day by day. */
export function PlanScreen({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { t } = usePreferences();
  const { plan, buildPlan, buildingPlan } = useApp();

  const today = todayWeekday();
  const [openDay, setOpenDay] = useState<number | null>(today);
  const [detail, setDetail] = useState<PlanExercise | null>(null);

  if (!plan) {
    return (
      <div className={styles.screen}>
        <div className={styles.head}>
          <h2 className={styles.title}>{t.myPlan}</h2>
        </div>
        <div className={styles.empty}>
          <div className={styles.summary}>
            <div className={styles.summaryName}>{t.noPlanTitle}</div>
            <div className={styles.summaryWhy}>{t.noPlanBody}</div>
            <Button size="md" style={{ marginTop: 18 }} onClick={() => onNavigate('bot')}>
              {t.goToCoach}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t.myPlan}</h2>
      </div>

      <div className={styles.body}>
        <div className={styles.summary}>
          <div className={styles.summaryLabel}>{t.chosenBy}</div>
          <div className={styles.summaryName}>{plan.name}</div>
          <div className={styles.summaryWhy}>{plan.rationale}</div>
        </div>

        <div className={styles.days}>
          {plan.schedule.map((day) => {
            const open = openDay === day.weekday && !day.rest;
            return (
              <div
                key={day.weekday}
                className={[
                  styles.day,
                  day.rest ? styles.dayRest : styles.dayTraining,
                  open ? styles.dayOpen : '',
                  day.weekday === today ? styles.dayToday : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button
                  className={styles.dayButton}
                  onClick={() => setOpenDay(open ? null : day.weekday)}
                  aria-expanded={open}
                >
                  <span
                    className={`${styles.badge} ${day.rest ? '' : styles.badgeTraining}`}
                  >
                    {t.weekdaysShort[day.weekday]}
                  </span>
                  <span className={styles.dayText}>
                    <span className={styles.dayFocus}>{day.rest ? t.recovery : day.focus}</span>
                    <span className={styles.daySub}>
                      {day.rest
                        ? t.restDaySub
                        : `${day.exercises.length} ${t.exercises} · ${plan.sessionMinutes} ${t.min}`}
                    </span>
                  </span>
                  {!day.rest && (
                    <ChevronIcon
                      className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                    />
                  )}
                </button>

                {open && (
                  <div className={styles.exercises}>
                    {day.exercises.map((ex, i) => (
                      <button
                        key={`${ex.name}-${i}`}
                        className={styles.exercise}
                        onClick={() => setDetail(ex)}
                      >
                        <span className={styles.exerciseName}>{ex.name}</span>
                        <span className={styles.exerciseScheme}>{schemeLabel(ex)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.rebuild}>
          <Button
            variant="secondary"
            size="md"
            loading={buildingPlan}
            onClick={() => void buildPlan(undefined, true)}
          >
            {t.rebuildPlan}
          </Button>
          <div className={styles.rebuildHint}>{t.rebuildHint}</div>
        </div>
      </div>

      <ExerciseDetailSheet exercise={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
