import type { Plan, PlanDay, Weekday, WorkoutSession } from './types';

/** Local weekday with Monday = 0, matching PlanDay.weekday. */
export function todayWeekday(now: Date = new Date()): Weekday {
  return ((now.getDay() + 6) % 7) as Weekday;
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export interface UpNext {
  /** The day to train, or null when the whole plan is rest (shouldn't happen). */
  day: PlanDay | null;
  dayIndex: number;
  /** 0 = today, 1 = tomorrow, … */
  inDays: number;
  /** True when today itself is a rest day in the plan. */
  restToday: boolean;
  /** True when today's session is already completed. */
  doneToday: boolean;
}

/**
 * Works out what the user should do next.
 *
 * A day only counts as done when a completed session exists for it *today*.
 * Days the user skipped are simply left behind — they are never back-filled or
 * marked complete on their behalf.
 */
export function resolveUpNext(
  plan: Plan | null,
  history: WorkoutSession[],
  now: Date = new Date(),
): UpNext {
  if (!plan || plan.schedule.length === 0) {
    return { day: null, dayIndex: -1, inDays: 0, restToday: false, doneToday: false };
  }

  const today = todayWeekday(now);
  const todayKey = toDateKey(now);
  const completedToday = history.some(
    (s) => s.status === 'completed' && s.completedAt != null && s.completedAt.slice(0, 10) === todayKey,
  );

  const byWeekday = (w: Weekday) => plan.schedule.find((d) => d.weekday === w) ?? null;
  const todayPlan = byWeekday(today);
  const restToday = !todayPlan || todayPlan.rest;

  if (todayPlan && !todayPlan.rest && !completedToday) {
    return {
      day: todayPlan,
      dayIndex: plan.schedule.indexOf(todayPlan),
      inDays: 0,
      restToday: false,
      doneToday: false,
    };
  }

  // Look forward for the next training day, wrapping into next week.
  for (let offset = 1; offset <= 7; offset += 1) {
    const w = ((today + offset) % 7) as Weekday;
    const d = byWeekday(w);
    if (d && !d.rest) {
      return {
        day: d,
        dayIndex: plan.schedule.indexOf(d),
        inDays: offset,
        restToday,
        doneToday: completedToday,
      };
    }
  }

  return { day: null, dayIndex: -1, inDays: 0, restToday, doneToday: completedToday };
}

/** Sessions completed on the same calendar day as `day`. */
export function completedOn(history: WorkoutSession[], day: Date): WorkoutSession | null {
  const key = toDateKey(day);
  return (
    history.find(
      (s) => s.status === 'completed' && s.completedAt != null && s.completedAt.slice(0, 10) === key,
    ) ?? null
  );
}
