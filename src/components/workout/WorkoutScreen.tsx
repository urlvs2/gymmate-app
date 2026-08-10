'use client';

import { useMemo, useState } from 'react';
import { Button, Chip, ErrorNote, Sheet, SheetBody, SheetHeader, StatGrid } from '@/components/ui';
import { DumbbellIcon } from '@/components/ui/Icons';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { useApp } from '@/lib/state/AppProvider';
import { exerciseKey, restLabel, schemeLabel } from '@/lib/domain/exercise';
import { resolveUpNext } from '@/lib/domain/schedule';
import { suggestWeight } from '@/lib/domain/progression';
import type { Feedback, PlanExercise } from '@/lib/domain/types';
import type { Tab } from '@/components/layout/BottomNav';
import { ExerciseDetailSheet } from './ExerciseDetailSheet';
import styles from './workout.module.css';

const FEEDBACK_ORDER: Feedback[] = ['too_easy', 'good', 'too_hard'];

interface SwapProposal {
  exercise: PlanExercise;
  reason: string;
}

/**
 * Runs a session one exercise at a time.
 *
 * Weight is never pre-filled from body stats. The first time an exercise comes
 * up the user is told to start light; after that the field is seeded from what
 * they actually lifted last time and how it felt.
 */
export function WorkoutScreen({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { t, lang } = usePreferences();
  const {
    plan,
    history,
    workout,
    profile,
    startWorkout,
    setEntry,
    goToExercise,
    replaceExercise,
    finishWorkout,
    error,
    clearError,
  } = useApp();

  const [detail, setDetail] = useState<PlanExercise | null>(null);
  const [explanation, setExplanation] = useState<{ title: string; body: string } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [proposal, setProposal] = useState<SwapProposal | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  const upNext = useMemo(() => resolveUpNext(plan, history), [plan, history]);

  const index = workout?.index ?? 0;
  const exercise = workout?.exercises[index] ?? null;
  const entry = workout?.entries[index] ?? null;
  const key = exercise ? exerciseKey(exercise.name) : '';
  const suggestion = useMemo(
    () => (key ? suggestWeight(history, key) : null),
    [history, key],
  );

  const feedbackLabel: Record<Feedback, string> = {
    too_easy: t.tooEasy,
    good: t.good,
    too_hard: t.tooHard,
  };

  /* ---------------------------------------------------------- AI actions -- */

  const askExplanation = async () => {
    if (!exercise) return;
    setExplaining(true);
    setExplanation(null);
    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang,
          profile,
          exercise: {
            name: exercise.name,
            muscle: exercise.muscle,
            equipment: exercise.equipment,
            sets: exercise.sets,
            reps: exercise.reps,
            restSeconds: exercise.restSeconds,
            howTo: exercise.howTo,
          },
          lastWeightKg: suggestion?.lastKg ?? null,
          lastFeedback: suggestion?.lastFeedback ?? null,
        }),
      });
      const data = (await res.json()) as { title?: string; body?: string; error?: string };
      setExplanation({
        title: data.title ?? exercise.name,
        body: data.body ?? data.error ?? t.genericError,
      });
    } catch {
      setExplanation({ title: exercise.name, body: t.genericError });
    } finally {
      setExplaining(false);
    }
  };

  const askSwap = async () => {
    if (!exercise) return;
    setSwapOpen(true);
    setSwapping(true);
    setProposal(null);
    try {
      const res = await fetch('/api/ai/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang,
          profile,
          exercise: {
            name: exercise.name,
            muscle: exercise.muscle,
            equipment: exercise.equipment,
            sets: exercise.sets,
            reps: exercise.reps,
            restSeconds: exercise.restSeconds,
          },
          reason: null,
        }),
      });
      const data = (await res.json()) as {
        exercise?: PlanExercise;
        reason?: string;
        error?: string;
      };
      if (data.exercise) setProposal({ exercise: data.exercise, reason: data.reason ?? '' });
      else setProposal(null);
    } catch {
      setProposal(null);
    } finally {
      setSwapping(false);
    }
  };

  /* ------------------------------------------------------------- states --- */

  if (!plan) {
    return (
      <div className={styles.screen}>
        <div className={styles.state}>
          <div className={styles.stateCard}>
            <div className={styles.stateTitle}>{t.noPlanTitle}</div>
            <div className={styles.stateBody}>{t.noPlanBody}</div>
            <div className={styles.stateActions}>
              <Button size="md" onClick={() => onNavigate('bot')}>
                {t.goToCoach}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!workout) {
    const trainingToday = upNext.inDays === 0 && upNext.day !== null;
    const day = upNext.day;

    return (
      <div className={styles.screen}>
        <div className={styles.state}>
          <div className={styles.stateCard}>
            <div className={styles.stateTitle}>
              {trainingToday ? `${t.today} — ${day?.focus}` : upNext.doneToday ? t.doneToday : t.restToday}
            </div>
            <div className={styles.stateBody}>
              {trainingToday
                ? plan.name
                : upNext.doneToday
                  ? t.doneTodayBody
                  : t.restTodayBody}
            </div>

            {!trainingToday && day && (
              <div className={styles.upNext}>
                <div className={styles.upNextLabel}>{t.nextUp}</div>
                <div className={styles.upNextValue}>{day.focus}</div>
                <div className={styles.upNextSub}>
                  {t.weekdaysLong[day.weekday]} · {t.inDays(upNext.inDays)}
                </div>
              </div>
            )}

            {trainingToday && day && (
              <div className={styles.preview}>
                {day.exercises.map((ex, i) => (
                  <div className={styles.previewItem} key={`${ex.name}-${i}`}>
                    <span className={styles.previewName}>{ex.name}</span>
                    <span className={styles.previewScheme}>{schemeLabel(ex)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.stateActions}>
              {upNext.dayIndex >= 0 && (
                <Button
                  size="md"
                  loading={starting}
                  onClick={async () => {
                    setStarting(true);
                    await startWorkout(upNext.dayIndex);
                    setStarting(false);
                  }}
                >
                  {trainingToday ? t.startWorkout : t.startAnyway}
                </Button>
              )}
              <Button variant="secondary" size="md" onClick={() => onNavigate('plan')}>
                {t.seeWeek}
              </Button>
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 14 }}>
              <ErrorNote message={error} onDismiss={clearError} />
            </div>
          )}
        </div>

        <CompletionSheet count={done} onClose={() => setDone(null)} />
      </div>
    );
  }

  /* ------------------------------------------------------------- runner --- */

  const total = workout.exercises.length;
  const isLast = index >= total - 1;
  const weightValue = entry?.weightKg;
  const placeholder =
    suggestion?.suggestedKg != null ? String(suggestion.suggestedKg) : t.noWeightYet;

  const stepWeight = (delta: number) => {
    const base = weightValue ?? suggestion?.suggestedKg ?? 0;
    setEntry(index, { weightKg: Math.max(0, Math.round((base + delta) * 10) / 10) });
  };

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <div className={styles.headRow}>
          <h2 className={styles.title}>
            {t.today} — {workout.focus}
          </h2>
          <span className={styles.position}>
            {index + 1} {t.of} {total}
          </span>
        </div>
        <div className={styles.progress}>
          {workout.exercises.map((_, i) => (
            <span
              key={i}
              className={`${styles.segment} ${
                i < index ? styles.segmentDone : i === index ? styles.segmentCurrent : ''
              }`}
            />
          ))}
        </div>
      </div>

      <div className={styles.body}>
        {exercise && (
          <>
            <button className={styles.exerciseCard} onClick={() => setDetail(exercise)}>
              <div className={styles.exerciseTop}>
                <span className={styles.muscle}>{exercise.muscle}</span>
                <span className={styles.tapHint}>{t.tapForPreview}</span>
              </div>
              <div className={styles.exerciseName}>{exercise.name}</div>
              <StatGrid
                className={styles.exerciseStats}
                items={[
                  { value: schemeLabel(exercise), label: t.setsReps },
                  { value: restLabel(exercise.restSeconds, lang), label: t.rest },
                  {
                    value: entry?.feedback ? feedbackLabel[entry.feedback] : '—',
                    label: t.lastFeel,
                  },
                ]}
              />
            </button>

            <div className={styles.block}>
              <div className={styles.sectionLabel}>{t.weightUsed}</div>
              <div className={styles.weightRow}>
                <button
                  className={styles.stepper}
                  onClick={() => stepWeight(-2.5)}
                  aria-label="-2.5"
                >
                  −
                </button>
                <div className={styles.weightValue}>
                  <input
                    className={styles.weightInput}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={500}
                    step={0.5}
                    value={weightValue ?? ''}
                    placeholder={placeholder}
                    aria-label={t.weightUsed}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setEntry(index, {
                        weightKg: raw === '' ? null : Math.max(0, Math.min(500, Number(raw))),
                      });
                    }}
                  />
                  <div className={styles.weightUnit}>{t.kg}</div>
                </div>
                <button
                  className={styles.stepper}
                  onClick={() => stepWeight(2.5)}
                  aria-label="+2.5"
                >
                  +
                </button>
              </div>

              {suggestion?.kind === 'first_time' ? (
                <div className={styles.firstTime}>
                  <div className={styles.firstTimeTitle}>{t.firstTimeTitle}</div>
                  <div className={styles.firstTimeBody}>{t.firstTimeHint}</div>
                </div>
              ) : (
                suggestion && (
                  <div className={styles.hint}>
                    {t.lastTime}: {suggestion.lastKg} {t.kg}
                    {suggestion.lastFeedback ? ` · ${feedbackLabel[suggestion.lastFeedback]}` : ''}
                    {suggestion.suggestedKg != null
                      ? ` — ${t.suggestion}: ${suggestion.suggestedKg} ${t.kg}`
                      : ''}
                  </div>
                )
              )}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionLabel}>{t.howFeel}</div>
              <div className={styles.row}>
                {FEEDBACK_ORDER.map((value) => (
                  <Chip
                    key={value}
                    wide
                    active={entry?.feedback === value}
                    onClick={() => setEntry(index, { feedback: value })}
                  >
                    {feedbackLabel[value]}
                  </Chip>
                ))}
              </div>
            </div>

            <div className={styles.aiRow}>
              <Button variant="subtle" size="md" loading={explaining} onClick={() => void askExplanation()}>
                {t.askForm}
              </Button>
              <Button variant="subtle" size="md" onClick={() => void askSwap()}>
                {t.swapIt}
              </Button>
            </div>

            <div className={styles.navRow}>
              <Button
                variant="subtle"
                size="md"
                disabled={index === 0}
                onClick={() => goToExercise(index - 1)}
              >
                {t.back}
              </Button>
              <Button
                size="md"
                onClick={async () => {
                  if (!isLast) {
                    goToExercise(index + 1);
                    return;
                  }
                  const count = await finishWorkout();
                  setDone(count);
                }}
              >
                {isLast ? t.finish : t.nextEx}
              </Button>
            </div>

            {error && (
              <div style={{ marginTop: 14 }}>
                <ErrorNote message={error} onDismiss={clearError} />
              </div>
            )}
          </>
        )}
      </div>

      <ExerciseDetailSheet exercise={detail} onClose={() => setDetail(null)} />

      <Sheet
        open={explaining || explanation !== null}
        onClose={() => {
          setExplanation(null);
          setExplaining(false);
        }}
        surface
      >
        <SheetHeader icon={<DumbbellIcon size={17} />} title={explanation?.title ?? t.explaining} />
        {explaining ? (
          <div className={styles.sheetLoading}>{t.explaining}</div>
        ) : (
          <SheetBody>{explanation?.body}</SheetBody>
        )}
        <Button size="md" style={{ marginTop: 20 }} onClick={() => setExplanation(null)}>
          {t.gotIt}
        </Button>
      </Sheet>

      <Sheet open={swapOpen} onClose={() => setSwapOpen(false)} surface>
        <SheetHeader icon={<DumbbellIcon size={17} />} title={t.swapIt} />
        {swapping && <div className={styles.sheetLoading}>{t.swapping}</div>}
        {!swapping && proposal && (
          <>
            <div className={styles.swapCard}>
              <div className={styles.swapName}>{proposal.exercise.name}</div>
              <div className={styles.swapMeta}>
                {proposal.exercise.muscle} · {proposal.exercise.equipment} ·{' '}
                {schemeLabel(proposal.exercise)} · {restLabel(proposal.exercise.restSeconds, lang)}
              </div>
            </div>
            <SheetBody>{proposal.reason}</SheetBody>
            <div className={styles.sheetActions}>
              <Button
                size="md"
                onClick={() => {
                  replaceExercise(index, proposal.exercise);
                  setSwapOpen(false);
                  setProposal(null);
                }}
              >
                {t.swapped}
              </Button>
              <Button variant="secondary" size="md" onClick={() => setSwapOpen(false)}>
                {t.close}
              </Button>
            </div>
          </>
        )}
        {!swapping && !proposal && (
          <>
            <SheetBody>{t.genericError}</SheetBody>
            <Button size="md" style={{ marginTop: 20 }} onClick={() => setSwapOpen(false)}>
              {t.close}
            </Button>
          </>
        )}
      </Sheet>

      <CompletionSheet count={done} onClose={() => setDone(null)} />
    </div>
  );
}

function CompletionSheet({ count, onClose }: { count: number | null; onClose: () => void }) {
  const { t } = usePreferences();
  const { plan, history } = useApp();
  const upNext = useMemo(() => resolveUpNext(plan, history), [plan, history]);

  if (count === null) return null;

  return (
    <Sheet open onClose={onClose} surface>
      <SheetHeader icon={<DumbbellIcon size={17} />} title={t.sessionDone} />
      <SheetBody>{t.sessionDoneBody(count)}</SheetBody>

      {upNext.day && (
        <div className={styles.upNext}>
          <div className={styles.upNextLabel}>{t.nextUp}</div>
          <div className={styles.upNextValue}>{upNext.day.focus}</div>
          <div className={styles.upNextSub}>
            {t.weekdaysLong[upNext.day.weekday]} ·{' '}
            {upNext.inDays === 0 ? t.today : t.inDays(upNext.inDays)}
          </div>
        </div>
      )}

      <Button size="md" style={{ marginTop: 20 }} onClick={onClose}>
        {t.gotIt}
      </Button>
    </Sheet>
  );
}
