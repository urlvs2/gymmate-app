/**
 * The shapes the whole app agrees on.
 *
 * Nothing here encodes a particular training style. A plan is whatever the AI
 * produced for this user: any number of days, any focus names, any exercises.
 */

export type Lang = 'en' | 'ar';
export type Theme = 'dark' | 'light';
export type Feedback = 'too_easy' | 'good' | 'too_hard';

/** Monday = 0 … Sunday = 6. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Profile {
  /** The account identity. Unique, chosen at sign-up, not editable afterwards. */
  username: string;
  /** Optional contact address. Never used to sign in. */
  email: string | null;
  fullName: string | null;
  age: number | null;
  gender: string | null;
  heightCm: number | null;
  weightKg: number | null;
  experience: string | null;
  goal: string | null;
  daysPerWeek: number | null;
  sessionMinutes: number | null;
  equipment: string | null;
  /** Anything else the coach picked up — injuries, preferences, gym quirks. */
  facts: Record<string, string>;
  onboardingComplete: boolean;
}

export interface PlanExercise {
  name: string;
  muscle: string;
  equipment: string;
  sets: number;
  reps: string;
  restSeconds: number;
  /** Short numbered coaching cues shown in the exercise sheet. */
  howTo: string[];
  note?: string;
  /** The free-exercise-db id this exercise was selected from, when it came from the catalogue. */
  catalogueId?: string;
  /**
   * A real demonstration photo of the movement, matched from an open exercise
   * library. Two frames — the start and mid-rep positions — so the UI can
   * animate them. Absent when no confident match was found; the UI then draws a
   * movement-appropriate illustration instead.
   */
  imageStart?: string;
  imageEnd?: string;
}

export interface PlanDay {
  weekday: Weekday;
  rest: boolean;
  focus: string;
  exercises: PlanExercise[];
}

export interface Plan {
  id: string;
  name: string;
  rationale: string;
  daysPerWeek: number;
  sessionMinutes: number;
  /** Always seven entries, Monday first. Rest days have no exercises. */
  schedule: PlanDay[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Suggested one-tap replies for the current question, when the coach asked one. */
  options?: string[];
  kind?: 'question' | 'note' | 'summary';
  createdAt: string;
}

export interface ExerciseLog {
  orderIndex: number;
  exerciseKey: string;
  exerciseName: string;
  sets: number | null;
  reps: string | null;
  restSeconds: number | null;
  /** Null until the user actually enters something — never guessed for them. */
  weightKg: number | null;
  feedback: Feedback | null;
  loggedAt: string;
}

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

export interface WorkoutSession {
  id: string;
  planId: string | null;
  dayIndex: number;
  focus: string;
  status: SessionStatus;
  scheduledOn: string | null;
  startedAt: string;
  completedAt: string | null;
  logs: ExerciseLog[];
}

/** Everything the UI needs for the signed-in account. */
export interface Snapshot {
  profile: Profile;
  chat: ChatMessage[];
  plan: Plan | null;
  activeSession: WorkoutSession | null;
  history: WorkoutSession[];
}

export const emptyProfile = (): Profile => ({
  username: '',
  email: null,
  fullName: null,
  age: null,
  gender: null,
  heightCm: null,
  weightKg: null,
  experience: null,
  goal: null,
  daysPerWeek: null,
  sessionMinutes: null,
  equipment: null,
  facts: {},
  onboardingComplete: false,
});

export const emptySnapshot = (): Snapshot => ({
  profile: emptyProfile(),
  chat: [],
  plan: null,
  activeSession: null,
  history: [],
});
