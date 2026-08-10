import { z } from 'zod';

/**
 * Contracts for everything the model is allowed to hand back.
 *
 * These describe *structure*, never content: the coach picks the questions, the
 * split, the exercises, the sets, the reps and the rest — the schema only makes
 * sure the answer is shaped so the app can render it.
 */

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/** A number that may arrive as "72" or "72 kg" from a chatty model. */
const looseNumber = z.union([z.number(), z.string()]).transform((v, ctx) => {
  if (typeof v === 'number') return v;
  const match = /-?\d+(?:[.,]\d+)?/.exec(v);
  if (!match) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'expected a number' });
    return z.NEVER;
  }
  return Number(match[0].replace(',', '.'));
});

export const profileUpdatesSchema = z.object({
  full_name: trimmed(80).nullish(),
  age: looseNumber.nullish(),
  gender: trimmed(40).nullish(),
  height_cm: looseNumber.nullish(),
  weight_kg: looseNumber.nullish(),
  experience: trimmed(120).nullish(),
  goal: trimmed(120).nullish(),
  days_per_week: looseNumber.nullish(),
  session_minutes: looseNumber.nullish(),
  equipment: trimmed(160).nullish(),
  facts: z.record(z.string(), trimmed(400)).nullish(),
});

export type ProfileUpdates = z.infer<typeof profileUpdatesSchema>;

/**
 * What the coach decides to do with the program this turn.
 *
 * `build` writes the first one, `rebuild` replaces an existing one because
 * something the program was built on has changed — different equipment, fewer
 * days, a new injury. `none` is an ordinary reply.
 */
export const planActionSchema = z.enum(['none', 'build', 'rebuild']).default('none');

export const coachTurnSchema = z.object({
  /** What the coach says next, in the user's language. */
  reply: trimmed(900),
  /** One-tap answers for the question just asked. Empty when free text fits better. */
  options: z.array(trimmed(60)).max(6).default([]),
  plan_action: planActionSchema,
  /** What the plan writer must take into account, when the plan is being changed. */
  plan_note: trimmed(400).nullish(),
  /** Facts learned from the user's last message. */
  profile_updates: profileUpdatesSchema.default({}),
});

export type CoachTurn = z.infer<typeof coachTurnSchema>;

export const planExerciseSchema = z.object({
  name: trimmed(80),
  muscle: trimmed(60),
  equipment: trimmed(60),
  sets: looseNumber.pipe(z.number().int().min(1).max(10)),
  reps: z.union([z.number(), z.string()]).transform((v) => String(v).trim().slice(0, 24)),
  rest_seconds: looseNumber.pipe(z.number().int().min(15).max(400)),
  how_to: z.array(trimmed(220)).min(2).max(6),
  note: trimmed(200).nullish(),
});

export const planDaySchema = z.object({
  weekday: looseNumber.pipe(z.number().int().min(0).max(6)),
  rest: z.boolean(),
  focus: trimmed(60),
  exercises: z.array(planExerciseSchema).max(12).default([]),
});

export const planSchema = z
  .object({
    name: trimmed(60),
    rationale: trimmed(700),
    days_per_week: looseNumber.pipe(z.number().int().min(1).max(7)),
    session_minutes: looseNumber.pipe(z.number().int().min(10).max(180)),
    schedule: z.array(planDaySchema).min(7).max(7),
  })
  .superRefine((plan, ctx) => {
    const weekdays = new Set(plan.schedule.map((d) => d.weekday));
    if (weekdays.size !== 7) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'schedule must contain each weekday 0-6 exactly once',
      });
    }
    for (const day of plan.schedule) {
      if (!day.rest && day.exercises.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `training day ${day.weekday} has no exercises`,
        });
      }
    }
    const trainingDays = plan.schedule.filter((d) => !d.rest).length;
    if (trainingDays !== plan.days_per_week) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `days_per_week (${plan.days_per_week}) does not match the ${trainingDays} training days in the schedule`,
      });
    }
  });

export type AiPlan = z.infer<typeof planSchema>;

export const explanationSchema = z.object({
  title: trimmed(80),
  body: trimmed(1400),
});

export const swapSchema = z.object({
  exercise: planExerciseSchema,
  reason: trimmed(400),
});
