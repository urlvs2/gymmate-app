import type { Feedback, PlanExercise } from '@/lib/domain/types';

/**
 * The workout the user is in the middle of.
 *
 * Held by the client (and mirrored to localStorage) because it changes on every
 * tap and because a swap should only affect today. Each entry is also written
 * to the database as the session is finished, so what they lifted is never
 * only in the browser.
 */
export interface ActiveWorkout {
  /** The account this session belongs to. */
  userId: string;
  sessionId: string;
  planId: string | null;
  dayIndex: number;
  focus: string;
  scheduledOn: string;
  exercises: PlanExercise[];
  entries: Record<number, WorkoutEntry>;
  index: number;
  startedAt: string;
}

export interface WorkoutEntry {
  /** Null until the user types something — never pre-filled with a guess. */
  weightKg: number | null;
  feedback: Feedback | null;
}

export const emptyEntry = (): WorkoutEntry => ({ weightKg: null, feedback: null });
