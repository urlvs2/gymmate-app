'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ChatMessage,
  ExerciseLog,
  Plan,
  PlanExercise,
  Profile,
  Snapshot,
  WorkoutSession,
} from '@/lib/domain/types';
import { emptySnapshot } from '@/lib/domain/types';
import { exerciseKey } from '@/lib/domain/exercise';
import { toDateKey } from '@/lib/domain/schedule';
import { usePreferences } from '@/lib/i18n/PreferencesProvider';
import { createClient } from '@/lib/supabase/client';
import { clearActiveWorkout, loadActiveWorkout, saveActiveWorkout } from './localWorkout';
import { emptyEntry, type ActiveWorkout, type WorkoutEntry } from './types';

/**
 * The single place the UI talks to.
 *
 * Everything here belongs to the signed-in account: the profile the coach
 * assembled, the program it wrote, the conversation and the workout history.
 * There is no anonymous mode — screens can assume a user.
 */

export interface AppUser {
  id: string;
  username: string;
  email: string | null;
}

/** What the coach decided to do with the program on a given turn. */
export type PlanAction = 'none' | 'build' | 'rebuild';

interface AppValue {
  ready: boolean;
  user: AppUser | null;
  profile: Profile;
  chat: ChatMessage[];
  plan: Plan | null;
  history: WorkoutSession[];
  workout: ActiveWorkout | null;

  thinking: boolean;
  buildingPlan: boolean;
  error: string | null;
  clearError: () => void;

  openCoach: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  buildPlan: (adjustment?: string, rebuild?: boolean) => Promise<void>;
  restartCoach: () => Promise<void>;

  startWorkout: (dayIndex: number) => Promise<void>;
  setEntry: (orderIndex: number, patch: Partial<WorkoutEntry>) => void;
  goToExercise: (index: number) => void;
  replaceExercise: (orderIndex: number, exercise: PlanExercise) => void;
  finishWorkout: () => Promise<number>;
  cancelWorkout: () => Promise<void>;

  /** Resolves false when the server rejected the change. */
  updateProfile: (patch: Partial<Profile>) => Promise<boolean>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppValue | null>(null);

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

/**
 * Accounts already greeted in this page load.
 *
 * Module scope rather than a ref because React re-mounts providers in
 * development and a fresh ref would let the coach introduce itself twice —
 * which showed up as two opening messages and two billed API calls.
 */
const greeted = new Set<string>();

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const message = (
  role: ChatMessage['role'],
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  id: uid(),
  role,
  content,
  createdAt: new Date().toISOString(),
  ...extra,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { lang } = usePreferences();

  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const [thinking, setThinking] = useState(false);
  const [buildingPlan, setBuildingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Set for the whole of a coach request. Two turns must never overlap: they
   * would each answer the same question and append a duplicate reply.
   */
  const coachBusyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      const data = (await res.json()) as { user: AppUser | null; snapshot: Snapshot | null };

      if (data.user && data.snapshot) {
        setUser(data.user);
        setSnapshot(data.snapshot);
        setWorkout(loadActiveWorkout(data.user.id));
      } else {
        setUser(null);
        setSnapshot(emptySnapshot());
        setWorkout(null);
      }
    } catch {
      setUser(null);
      setSnapshot(emptySnapshot());
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * This provider sits in the root layout, so signing in navigates without
   * remounting it. Without this the app would keep serving the signed-out
   * snapshot until a full page reload.
   */
  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        void load();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    if (workout) saveActiveWorkout(workout);
  }, [workout]);

  /**
   * Fills in exercise demonstration photos.
   *
   * The plan comes back from generation without images; the server matches them
   * (and normalizes non-English names) on demand. We ask once per plan — guarded
   * by id so a plan with a few genuinely unmatchable exercises is not retried
   * forever — and merge the result into both the plan and any workout already in
   * progress for it.
   */
  const imagesRequestedRef = useRef<string | null>(null);
  useEffect(() => {
    const plan = snapshot.plan;
    if (!plan) return;
    const needs = plan.schedule.some((d) => !d.rest && d.exercises.some((e) => !e.imageStart));
    if (!needs || imagesRequestedRef.current === plan.id) return;
    imagesRequestedRef.current = plan.id;

    void (async () => {
      try {
        const data = await postJson<{ plan: Plan | null }>('/api/plan/images', { lang });
        const filled = data.plan;
        if (!filled) return;

        setSnapshot((prev) =>
          prev.plan && prev.plan.id === filled.id ? { ...prev, plan: filled } : prev,
        );

        // A session already underway holds its own copy of the exercises; give
        // those the images too, matched by name.
        setWorkout((current) => {
          if (!current) return current;
          const day = filled.schedule[current.dayIndex];
          if (!day || day.rest) return current;
          const byName = new Map(day.exercises.map((e) => [e.name, e]));
          const exercises = current.exercises.map((e) => {
            const match = byName.get(e.name);
            return match?.imageStart
              ? { ...e, imageStart: match.imageStart, imageEnd: match.imageEnd }
              : e;
          });
          return { ...current, exercises };
        });
      } catch {
        // Leave illustrations in place; a reload will try again.
      }
    })();
  }, [snapshot.plan, lang]);

  // ----------------------------------------------------------------- coach --

  const runCoachTurn = useCallback(
    async (text: string) => {
      // Checked and set synchronously, so two callers in the same tick cannot
      // both get through and post the same turn twice.
      if (coachBusyRef.current) return { action: 'none' as const, note: null };
      coachBusyRef.current = true;

      setThinking(true);
      setError(null);
      try {
        const data = await postJson<{
          reply: string;
          options: string[];
          planAction: PlanAction;
          planNote: string | null;
          profile: Profile;
        }>('/api/ai/coach', { lang, message: text });

        setSnapshot((prev) => ({
          ...prev,
          profile: data.profile,
          chat: [
            ...prev.chat,
            message('assistant', data.reply, {
              options: data.options,
              kind: data.options.length ? 'question' : undefined,
            }),
          ],
        }));

        return { action: data.planAction, note: data.planNote };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        return { action: 'none' as const, note: null };
      } finally {
        coachBusyRef.current = false;
        setThinking(false);
      }
    },
    [lang],
  );

  const buildPlan = useCallback(
    async (adjustment?: string, rebuild = false) => {
      setBuildingPlan(true);
      setError(null);
      try {
        const data = await postJson<{ plan: Plan; profile: Profile }>('/api/ai/plan', {
          lang,
          adjustment: adjustment ?? null,
          rebuild,
        });

        setSnapshot((prev) => ({
          ...prev,
          plan: data.plan,
          profile: data.profile,
          chat: [...prev.chat, message('assistant', data.plan.rationale, { kind: 'summary' })],
        }));

        // A session in progress belongs to the program that was just replaced —
        // finishing it would have them doing exercises the coach has withdrawn.
        if (rebuild) {
          setWorkout((current) => {
            if (current) {
              void postJson('/api/workout', {
                action: 'abandon',
                sessionId: current.sessionId,
              }).catch(() => undefined);
              clearActiveWorkout();
            }
            return null;
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setBuildingPlan(false);
      }
    },
    [lang],
  );

  /** Opens the conversation — the coach writes its own greeting and first question. */
  const openCoach = useCallback(async () => {
    if (!user || snapshot.chat.length > 0 || thinking || greeted.has(user.id)) return;
    greeted.add(user.id);
    const turn = await runCoachTurn('');
    if (turn.action !== 'none') await buildPlan(turn.note ?? undefined, turn.action === 'rebuild');
  }, [user, snapshot.chat.length, thinking, runCoachTurn, buildPlan]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinking || buildingPlan) return;

      setSnapshot((prev) => ({
        ...prev,
        // The previous question's chips disappear once it has been answered.
        chat: [
          ...prev.chat.map((m) => (m.options?.length ? { ...m, options: [] } : m)),
          message('user', trimmed),
        ],
      }));

      // The coach decides whether what they just said changes the program.
      const turn = await runCoachTurn(trimmed);
      if (turn.action !== 'none') {
        await buildPlan(turn.note ?? undefined, turn.action === 'rebuild');
      }
    },
    [thinking, buildingPlan, runCoachTurn, buildPlan],
  );

  const restartCoach = useCallback(async () => {
    if (user) greeted.add(user.id);
    setSnapshot((prev) => ({ ...prev, chat: [] }));
    await fetch('/api/chat', { method: 'DELETE' }).catch(() => undefined);
    const turn = await runCoachTurn('');
    if (turn.action !== 'none') await buildPlan(turn.note ?? undefined, turn.action === 'rebuild');
  }, [user, runCoachTurn, buildPlan]);

  // --------------------------------------------------------------- workout --

  const startWorkout = useCallback(
    async (dayIndex: number) => {
      const plan = snapshot.plan;
      const day = plan?.schedule[dayIndex];
      if (!plan || !day || day.rest || !user) return;

      const scheduledOn = toDateKey(new Date());

      try {
        const data = await postJson<{ session: WorkoutSession }>('/api/workout', {
          action: 'start',
          planId: plan.id,
          dayIndex,
          focus: day.focus,
          scheduledOn,
        });

        setWorkout({
          userId: user.id,
          sessionId: data.session.id,
          planId: plan.id,
          dayIndex,
          focus: day.focus,
          scheduledOn,
          exercises: day.exercises,
          entries: {},
          index: 0,
          startedAt: new Date().toISOString(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    },
    [snapshot.plan, user],
  );

  const setEntry = useCallback((orderIndex: number, patch: Partial<WorkoutEntry>) => {
    setWorkout((prev) => {
      if (!prev) return prev;
      const current = prev.entries[orderIndex] ?? emptyEntry();
      return {
        ...prev,
        entries: { ...prev.entries, [orderIndex]: { ...current, ...patch } },
      };
    });
  }, []);

  const goToExercise = useCallback((index: number) => {
    setWorkout((prev) => {
      if (!prev) return prev;
      const clamped = Math.max(0, Math.min(index, prev.exercises.length - 1));
      return { ...prev, index: clamped };
    });
  }, []);

  /** A swap only changes today's session; the stored plan is untouched. */
  const replaceExercise = useCallback((orderIndex: number, exercise: PlanExercise) => {
    setWorkout((prev) => {
      if (!prev) return prev;
      const exercises = [...prev.exercises];
      exercises[orderIndex] = exercise;
      const entries = { ...prev.entries };
      delete entries[orderIndex];
      return { ...prev, exercises, entries };
    });
  }, []);

  const buildLogs = useCallback((w: ActiveWorkout): ExerciseLog[] => {
    const now = new Date().toISOString();
    return w.exercises.map((ex, i) => {
      const entry = w.entries[i] ?? emptyEntry();
      return {
        orderIndex: i,
        exerciseKey: exerciseKey(ex.name),
        exerciseName: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        restSeconds: ex.restSeconds,
        weightKg: entry.weightKg,
        feedback: entry.feedback,
        loggedAt: now,
      };
    });
  }, []);

  const finishWorkout = useCallback(async (): Promise<number> => {
    const current = workout;
    if (!current) return 0;

    const logs = buildLogs(current);

    try {
      for (const log of logs) {
        await postJson('/api/workout', { action: 'log', sessionId: current.sessionId, log });
      }
      await postJson('/api/workout', { action: 'finish', sessionId: current.sessionId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }

    setWorkout(null);
    clearActiveWorkout();
    return logs.length;
  }, [workout, buildLogs, load]);

  const cancelWorkout = useCallback(async () => {
    const current = workout;
    setWorkout(null);
    clearActiveWorkout();
    if (current) {
      await postJson('/api/workout', { action: 'abandon', sessionId: current.sessionId }).catch(
        () => undefined,
      );
    }
  }, [workout]);

  // --------------------------------------------------------------- profile --

  const updateProfile = useCallback(
    async (patch: Partial<Profile>): Promise<boolean> => {
      // Shown immediately, but rolled back from the server if the save is
      // rejected — otherwise the screen would keep displaying a value that was
      // never stored.
      setSnapshot((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
      try {
        const res = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: patch.fullName,
            age: patch.age,
            gender: patch.gender,
            heightCm: patch.heightCm,
            weightKg: patch.weightKg,
            email: patch.email,
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? 'Could not save your profile.');
          await load();
          return false;
        }
        return true;
      } catch {
        setError('Could not save your profile.');
        await load();
        return false;
      }
    },
    [load],
  );

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearActiveWorkout();
    setWorkout(null);
    setUser(null);
    setSnapshot(emptySnapshot());
    window.location.href = '/';
  }, []);

  const value = useMemo<AppValue>(
    () => ({
      ready,
      user,
      profile: snapshot.profile,
      chat: snapshot.chat,
      plan: snapshot.plan,
      history: snapshot.history,
      workout,
      thinking,
      buildingPlan,
      error,
      clearError: () => setError(null),
      openCoach,
      sendMessage,
      buildPlan,
      restartCoach,
      startWorkout,
      setEntry,
      goToExercise,
      replaceExercise,
      finishWorkout,
      cancelWorkout,
      updateProfile,
      refresh: load,
      signOut,
    }),
    [
      ready,
      user,
      snapshot,
      workout,
      thinking,
      buildingPlan,
      error,
      openCoach,
      sendMessage,
      buildPlan,
      restartCoach,
      startWorkout,
      setEntry,
      goToExercise,
      replaceExercise,
      finishWorkout,
      cancelWorkout,
      updateProfile,
      load,
      signOut,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
