import type { ExerciseLog, Feedback, WorkoutSession } from './types';

/**
 * Weight guidance from the user's own logs.
 *
 * The first time someone meets an exercise there is no honest number to give
 * them — body weight and height say nothing about how much they can press. So
 * the first session suggests nothing at all and asks them to start light; from
 * then on the suggestion moves with what they actually lifted and how it felt.
 */

export interface WeightSuggestion {
  kind: 'first_time' | 'from_history';
  /** Null the first time — the UI tells them to start light instead. */
  suggestedKg: number | null;
  lastKg: number | null;
  lastFeedback: Feedback | null;
  lastLoggedAt: string | null;
}

function roundToStep(kg: number): number {
  const step = kg >= 20 ? 2.5 : 1;
  return Math.max(0, Math.round(kg / step) * step);
}

/** Most recent log of this exercise that recorded an actual weight. */
export function lastLogFor(history: WorkoutSession[], exerciseKey: string): ExerciseLog | null {
  const logs = history
    .filter((s) => s.status === 'completed')
    .flatMap((s) => s.logs)
    .filter((l) => l.exerciseKey === exerciseKey && l.weightKg !== null)
    .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1));
  return logs[0] ?? null;
}

export function suggestWeight(history: WorkoutSession[], exerciseKey: string): WeightSuggestion {
  const last = lastLogFor(history, exerciseKey);

  if (!last || last.weightKg === null) {
    return {
      kind: 'first_time',
      suggestedKg: null,
      lastKg: null,
      lastFeedback: null,
      lastLoggedAt: null,
    };
  }

  const base = last.weightKg;
  let next = base;

  // Body-weight movements stay at zero; there is nothing to add.
  if (base > 0) {
    if (last.feedback === 'too_easy') next = roundToStep(base * 1.075);
    else if (last.feedback === 'too_hard') next = roundToStep(base * 0.9);
    else next = roundToStep(base);

    if (last.feedback === 'too_easy' && next <= base) next = roundToStep(base + 2.5);
    if (last.feedback === 'too_hard' && next >= base) next = roundToStep(Math.max(0, base - 2.5));
  }

  return {
    kind: 'from_history',
    suggestedKg: next,
    lastKg: base,
    lastFeedback: last.feedback,
    lastLoggedAt: last.loggedAt,
  };
}

/** How many times this exercise has been logged, for "session 3 of this lift" copy. */
export function timesPerformed(history: WorkoutSession[], exerciseKey: string): number {
  return history
    .filter((s) => s.status === 'completed')
    .flatMap((s) => s.logs)
    .filter((l) => l.exerciseKey === exerciseKey).length;
}
