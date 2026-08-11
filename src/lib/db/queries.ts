import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ChatMessage,
  ExerciseLog,
  Feedback,
  Plan,
  PlanDay,
  Profile,
  Snapshot,
  WorkoutSession,
} from '@/lib/domain/types';
import { emptyProfile } from '@/lib/domain/types';

/**
 * All database access lives here so the route handlers stay thin and there is
 * one place to look when reasoning about what is stored per user.
 *
 * Every query is scoped by the caller's session; Row Level Security enforces
 * the same thing server-side, so a bug here still cannot leak another user's
 * data.
 */

type DB = SupabaseClient;

interface ProfileRow {
  id: string;
  username: string;
  email: string | null;
  full_name: string | null;
  age: number | null;
  gender: string | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  experience: string | null;
  goal: string | null;
  days_per_week: number | null;
  session_minutes: number | null;
  equipment: string | null;
  facts: Record<string, string> | null;
  language: string;
  theme: string;
  onboarding_complete: boolean;
}

interface PlanRow {
  id: string;
  name: string;
  rationale: string | null;
  days_per_week: number | null;
  session_minutes: number | null;
  schedule: PlanDay[];
  created_at: string;
}

interface SessionRow {
  id: string;
  plan_id: string | null;
  day_index: number;
  focus: string | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  scheduled_on: string | null;
  started_at: string;
  completed_at: string | null;
}

interface LogRow {
  session_id: string;
  order_index: number;
  exercise_key: string;
  exercise_name: string;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  weight_kg: number | string | null;
  feedback: Feedback | null;
  logged_at: string;
}

const toNumber = (v: number | string | null): number | null =>
  v === null || v === '' ? null : Number(v);

function rowToProfile(row: ProfileRow | null): Profile {
  if (!row) return emptyProfile();
  return {
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    age: row.age,
    gender: row.gender,
    heightCm: toNumber(row.height_cm),
    weightKg: toNumber(row.weight_kg),
    experience: row.experience,
    goal: row.goal,
    daysPerWeek: row.days_per_week,
    sessionMinutes: row.session_minutes,
    equipment: row.equipment,
    facts: row.facts ?? {},
    onboardingComplete: row.onboarding_complete,
  };
}

function rowToPlan(row: PlanRow | null): Plan | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    rationale: row.rationale ?? '',
    daysPerWeek: row.days_per_week ?? row.schedule.filter((d) => !d.rest).length,
    sessionMinutes: row.session_minutes ?? 45,
    schedule: row.schedule,
    createdAt: row.created_at,
  };
}

function rowToSession(row: SessionRow, logs: ExerciseLog[]): WorkoutSession {
  return {
    id: row.id,
    planId: row.plan_id,
    dayIndex: row.day_index,
    focus: row.focus ?? '',
    status: row.status,
    scheduledOn: row.scheduled_on,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    logs,
  };
}

function rowToLog(row: LogRow): ExerciseLog {
  return {
    orderIndex: row.order_index,
    exerciseKey: row.exercise_key,
    exerciseName: row.exercise_name,
    sets: row.sets,
    reps: row.reps,
    restSeconds: row.rest_seconds,
    weightKg: toNumber(row.weight_kg),
    feedback: row.feedback,
    loggedAt: row.logged_at,
  };
}

export interface Preferences {
  language: 'en' | 'ar';
  theme: 'dark' | 'light';
}

export async function loadProfile(db: DB, userId: string): Promise<Profile> {
  const { data } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
  return rowToProfile(data as ProfileRow | null);
}

export async function loadPreferences(db: DB, userId: string): Promise<Preferences> {
  const { data } = await db.from('profiles').select('language, theme').eq('id', userId).maybeSingle();
  return {
    language: (data?.language as 'en' | 'ar') ?? 'en',
    theme: (data?.theme as 'dark' | 'light') ?? 'dark',
  };
}

/**
 * Writes the editable parts of a profile. `username` is deliberately absent:
 * it is the account's identity and is fixed at sign-up.
 */
export async function saveProfile(db: DB, userId: string, profile: Profile): Promise<void> {
  // An update, not an upsert: the row is created by the sign-up trigger, which
  // is also the only thing that ever sets a username.
  const { error } = await db
    .from('profiles')
    .update({
      email: profile.email,
      full_name: profile.fullName,
      age: profile.age,
      gender: profile.gender,
      height_cm: profile.heightCm,
      weight_kg: profile.weightKg,
      experience: profile.experience,
      goal: profile.goal,
      days_per_week: profile.daysPerWeek,
      session_minutes: profile.sessionMinutes,
      equipment: profile.equipment,
      facts: profile.facts,
      onboarding_complete: profile.onboardingComplete,
    })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function savePreferences(
  db: DB,
  userId: string,
  prefs: Partial<Preferences>,
): Promise<void> {
  const patch: Record<string, string> = {};
  if (prefs.language) patch.language = prefs.language;
  if (prefs.theme) patch.theme = prefs.theme;
  if (Object.keys(patch).length === 0) return;
  await db.from('profiles').update(patch).eq('id', userId);
}

export async function loadActivePlan(db: DB, userId: string): Promise<Plan | null> {
  const { data } = await db
    .from('plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return rowToPlan(data as PlanRow | null);
}

/** Replaces the active plan — the previous one is kept as history, deactivated. */
export async function savePlan(db: DB, userId: string, plan: Plan): Promise<Plan> {
  await db.from('plans').update({ is_active: false }).eq('user_id', userId).eq('is_active', true);

  const { data, error } = await db
    .from('plans')
    .insert({
      user_id: userId,
      name: plan.name,
      rationale: plan.rationale,
      days_per_week: plan.daysPerWeek,
      session_minutes: plan.sessionMinutes,
      schedule: plan.schedule,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToPlan(data as PlanRow)!;
}

/**
 * Rewrites the schedule of an existing plan in place. Used to attach exercise
 * images without minting a new plan or disturbing history — the plan is the
 * same program, just with demonstrations filled in.
 */
export async function updatePlanSchedule(
  db: DB,
  userId: string,
  planId: string,
  schedule: Plan['schedule'],
): Promise<void> {
  const { error } = await db
    .from('plans')
    .update({ schedule })
    .eq('id', planId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function loadChat(db: DB, userId: string, limit = 100): Promise<ChatMessage[]> {
  const { data } = await db
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    meta: { options?: string[]; kind?: ChatMessage['kind'] } | null;
    created_at: string;
  }[];

  return rows.reverse().map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    options: r.meta?.options,
    kind: r.meta?.kind,
    createdAt: r.created_at,
  }));
}

export async function appendChat(
  db: DB,
  userId: string,
  messages: Omit<ChatMessage, 'id' | 'createdAt'>[],
): Promise<void> {
  if (messages.length === 0) return;

  // Stamped a millisecond apart rather than left to the column default: rows
  // written in one insert would otherwise share a timestamp, and the read below
  // orders by it — which showed the coach answering before the user spoke.
  const base = Date.now();

  await db.from('chat_messages').insert(
    messages.map((m, i) => ({
      user_id: userId,
      role: m.role,
      content: m.content,
      meta: { options: m.options ?? [], kind: m.kind ?? null },
      created_at: new Date(base + i).toISOString(),
    })),
  );
}

export async function clearChat(db: DB, userId: string): Promise<void> {
  await db.from('chat_messages').delete().eq('user_id', userId);
}

export async function loadSessions(db: DB, userId: string, limit = 60): Promise<WorkoutSession[]> {
  const { data: sessionRows } = await db
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);

  const sessions = (sessionRows ?? []) as SessionRow[];
  if (sessions.length === 0) return [];

  const { data: logRows } = await db
    .from('exercise_logs')
    .select('*')
    .in(
      'session_id',
      sessions.map((s) => s.id),
    );

  const logs = (logRows ?? []) as LogRow[];
  const bySession = new Map<string, ExerciseLog[]>();
  for (const row of logs) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(rowToLog(row));
    bySession.set(row.session_id, list);
  }

  return sessions.map((s) =>
    rowToSession(
      s,
      (bySession.get(s.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex),
    ),
  );
}

export async function loadSnapshot(db: DB, userId: string): Promise<Snapshot> {
  const [profile, plan, chat, sessions] = await Promise.all([
    loadProfile(db, userId),
    loadActivePlan(db, userId),
    loadChat(db, userId),
    loadSessions(db, userId),
  ]);

  const active = sessions.find((s) => s.status === 'in_progress') ?? null;
  const history = sessions.filter((s) => s.status !== 'in_progress');

  return { profile, plan, chat, activeSession: active, history };
}

export async function startSession(
  db: DB,
  userId: string,
  input: { planId: string | null; dayIndex: number; focus: string; scheduledOn: string },
): Promise<WorkoutSession> {
  // A workout left open from an earlier day is abandoned, not completed.
  await db
    .from('workout_sessions')
    .update({ status: 'abandoned' })
    .eq('user_id', userId)
    .eq('status', 'in_progress');

  const { data, error } = await db
    .from('workout_sessions')
    .insert({
      user_id: userId,
      plan_id: input.planId,
      day_index: input.dayIndex,
      focus: input.focus,
      scheduled_on: input.scheduledOn,
      status: 'in_progress',
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToSession(data as SessionRow, []);
}

export async function upsertLog(
  db: DB,
  userId: string,
  sessionId: string,
  log: ExerciseLog,
): Promise<void> {
  const { error } = await db.from('exercise_logs').upsert(
    {
      session_id: sessionId,
      user_id: userId,
      order_index: log.orderIndex,
      exercise_key: log.exerciseKey,
      exercise_name: log.exerciseName,
      sets: log.sets,
      reps: log.reps,
      rest_seconds: log.restSeconds,
      weight_kg: log.weightKg,
      feedback: log.feedback,
      logged_at: log.loggedAt,
    },
    { onConflict: 'session_id,order_index' },
  );
  if (error) throw new Error(error.message);
}

/** Marks a session complete. Only ever called from an explicit "finish" action. */
export async function finishSession(db: DB, userId: string, sessionId: string): Promise<void> {
  const { error } = await db
    .from('workout_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'in_progress');
  if (error) throw new Error(error.message);
}

export async function abandonSession(db: DB, userId: string, sessionId: string): Promise<void> {
  await db
    .from('workout_sessions')
    .update({ status: 'abandoned' })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'in_progress');
}
