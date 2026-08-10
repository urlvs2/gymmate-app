import type { AiPlan, ProfileUpdates } from './schemas';
import type { Plan, PlanDay, PlanExercise, Profile, Weekday } from '@/lib/domain/types';

/** Turn the model's snake_case JSON into the app's plan shape. */
export function aiPlanToPlan(ai: AiPlan, id: string, createdAt = new Date().toISOString()): Plan {
  const schedule: PlanDay[] = [...ai.schedule]
    .sort((a, b) => a.weekday - b.weekday)
    .map((day) => ({
      weekday: day.weekday as Weekday,
      rest: day.rest,
      focus: day.focus,
      exercises: day.rest ? [] : day.exercises.map(toExercise),
    }));

  return {
    id,
    name: ai.name,
    rationale: ai.rationale,
    daysPerWeek: ai.days_per_week,
    sessionMinutes: ai.session_minutes,
    schedule,
    createdAt,
  };
}

function toExercise(ex: AiPlan['schedule'][number]['exercises'][number]): PlanExercise {
  return {
    name: ex.name,
    muscle: ex.muscle,
    equipment: ex.equipment,
    sets: ex.sets,
    reps: ex.reps,
    restSeconds: ex.rest_seconds,
    howTo: ex.how_to,
    note: ex.note ?? undefined,
  };
}

export { toExercise as aiExerciseToExercise };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Fold what the coach learned into the profile.
 *
 * Values are range-checked here rather than trusted: a model that answers "age:
 * 250" should not be able to poison the profile or fail a database constraint.
 */
export function applyProfileUpdates(profile: Profile, updates: ProfileUpdates): Profile {
  const next: Profile = { ...profile, facts: { ...profile.facts } };

  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v * 10) / 10, min, max) : null;

  const fullName = text(updates.full_name);
  if (fullName) next.fullName = fullName;

  const age = num(updates.age, 10, 100);
  if (age !== null) next.age = Math.round(age);

  const gender = text(updates.gender);
  if (gender) next.gender = gender;

  const height = num(updates.height_cm, 80, 260);
  if (height !== null) next.heightCm = height;

  const weight = num(updates.weight_kg, 25, 400);
  if (weight !== null) next.weightKg = weight;

  const experience = text(updates.experience);
  if (experience) next.experience = experience;

  const goal = text(updates.goal);
  if (goal) next.goal = goal;

  const days = num(updates.days_per_week, 1, 7);
  if (days !== null) next.daysPerWeek = Math.round(days);

  const minutes = num(updates.session_minutes, 10, 180);
  if (minutes !== null) next.sessionMinutes = Math.round(minutes);

  const equipment = text(updates.equipment);
  if (equipment) next.equipment = equipment;

  if (updates.facts) {
    for (const [key, value] of Object.entries(updates.facts)) {
      const clean = text(value);
      if (clean && Object.keys(next.facts).length < 40) next.facts[key.slice(0, 40)] = clean.slice(0, 400);
    }
  }

  return next;
}

/** A compact description of the plan for follow-up chat context. */
export function summarisePlan(plan: Plan, dayNames: string[]): string {
  const lines = plan.schedule.map((day) => {
    const name = dayNames[day.weekday] ?? `Day ${day.weekday + 1}`;
    if (day.rest) return `- ${name}: rest`;
    const list = day.exercises.map((e) => `${e.name} ${e.sets}x${e.reps}`).join(', ');
    return `- ${name}: ${day.focus} — ${list}`;
  });
  return [`${plan.name} (${plan.daysPerWeek} days/week, ~${plan.sessionMinutes} min)`, ...lines].join('\n');
}
