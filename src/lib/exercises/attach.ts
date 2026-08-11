import 'server-only';
import type { Plan, PlanExercise } from '@/lib/domain/types';
import { completeJson } from '@/lib/ai/openrouter';
import { englishNamesPrompt } from '@/lib/ai/prompts';
import { englishNamesSchema } from '@/lib/ai/schemas';
import { matchExerciseImages } from './match';

/**
 * Gives each exercise a real demonstration photo, in two passes, cheapest first:
 *
 *   1. Match every exercise's own name directly. English names resolve here for
 *      free, with no model call.
 *   2. Whatever is left — non-English names, or names the library spells
 *      differently — is sent to the model once, as a single batch, to get the
 *      common English name, then matched again.
 *
 * Exercises that still do not clear the matcher's confidence bar keep no image;
 * the UI shows a movement-appropriate illustration for those rather than risk
 * displaying the wrong exercise.
 */
export async function attachImagesToExercises(
  exercises: PlanExercise[],
): Promise<PlanExercise[]> {
  const out = exercises.map((e) => ({ ...e }));

  // -- Pass 1: direct match on each name --
  const unresolved: number[] = [];
  out.forEach((exercise, i) => {
    if (exercise.imageStart) return;
    const hit = matchExerciseImages(exercise.name, {
      equipment: exercise.equipment,
      muscle: exercise.muscle,
    });
    if (hit) {
      out[i] = { ...exercise, imageStart: hit.start, imageEnd: hit.end };
    } else {
      unresolved.push(i);
    }
  });

  if (unresolved.length === 0) return out;

  // -- Pass 2: one batched normalization to English, then match again --
  try {
    const list = unresolved
      .map(
        (idx, i) =>
          `${i + 1}. ${out[idx].name} | muscle: ${out[idx].muscle} | equipment: ${out[idx].equipment}`,
      )
      .join('\n');

    const result = await completeJson({
      system: englishNamesPrompt(unresolved.length),
      messages: [
        { role: 'user', content: `Convert these ${unresolved.length} exercises:\n${list}` },
      ],
      schema: englishNamesSchema,
      maxTokens: 700,
    });

    result.names.slice(0, unresolved.length).forEach((english, i) => {
      const name = english.trim();
      if (!name) return; // model judged it not a resistance exercise
      const idx = unresolved[i];
      const hit = matchExerciseImages(name, {
        equipment: out[idx].equipment,
        muscle: out[idx].muscle,
      });
      if (hit) out[idx] = { ...out[idx], imageStart: hit.start, imageEnd: hit.end };
    });
  } catch {
    // Normalization is best-effort: on failure, unmatched exercises simply keep
    // their illustration.
  }

  return out;
}

/** Fills in demonstration photos across a whole plan's training days. */
export async function attachExerciseImages(plan: Plan): Promise<Plan> {
  // Flatten the training exercises, remembering where each one lives.
  const slots: { dayIndex: number; exIndex: number }[] = [];
  const flat: PlanExercise[] = [];
  plan.schedule.forEach((day, dayIndex) => {
    if (day.rest) return;
    day.exercises.forEach((exercise, exIndex) => {
      slots.push({ dayIndex, exIndex });
      flat.push(exercise);
    });
  });

  if (flat.every((e) => e.imageStart)) return plan;

  const filled = await attachImagesToExercises(flat);

  const schedule = plan.schedule.map((day) => ({
    ...day,
    exercises: day.exercises.map((e) => ({ ...e })),
  }));
  slots.forEach((slot, i) => {
    schedule[slot.dayIndex].exercises[slot.exIndex] = filled[i];
  });

  return { ...plan, schedule };
}

/** True when any training exercise still lacks a demonstration image. */
export function planNeedsImages(plan: Plan | null): boolean {
  if (!plan) return false;
  return plan.schedule.some((day) => !day.rest && day.exercises.some((e) => !e.imageStart));
}
