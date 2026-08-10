import type { ActiveWorkout } from './types';

/**
 * The in-progress workout is mirrored to the browser so a refresh mid-session
 * does not lose the user's place. It is scoped to the account that started it,
 * so a different user signing in on the same device never inherits it.
 */

const WORKOUT_KEY = 'gymmate.workout.v1';

export function loadActiveWorkout(userId: string): ActiveWorkout | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WORKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveWorkout;
    return parsed.userId === userId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveActiveWorkout(workout: ActiveWorkout): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WORKOUT_KEY, JSON.stringify(workout));
  } catch {
    // Storage blocked; the session still works, it just won't survive a refresh.
  }
}

export function clearActiveWorkout(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WORKOUT_KEY);
  } catch {
    // ignore
  }
}
