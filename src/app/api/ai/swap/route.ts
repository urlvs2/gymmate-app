import { z } from 'zod';
import { completeJson } from '@/lib/ai/openrouter';
import { swapSystemPrompt } from '@/lib/ai/prompts';
import { swapSchema } from '@/lib/ai/schemas';
import { aiExerciseToExercise } from '@/lib/ai/mappers';
import { attachImagesToExercises } from '@/lib/exercises/attach';
import { langSchema, resolveContext } from '@/lib/api/context';
import { fail, handleError, ok } from '@/lib/api/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  lang: langSchema,
  exercise: z.object({
    name: z.string().max(80),
    muscle: z.string().max(60).default(''),
    equipment: z.string().max(60).default(''),
    sets: z.number().int().min(1).max(10).default(3),
    reps: z.string().max(24).default('10'),
    restSeconds: z.number().int().min(15).max(400).default(60),
  }),
  reason: z.string().max(300).nullish(),
});

/** Replaces one exercise in today's session with something equivalent. */
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const ctx = await resolveContext(body);

    const result = await completeJson({
      system: swapSystemPrompt(
        {
          exercise: { ...body.exercise, howTo: [] },
          lastWeightKg: null,
          lastFeedback: null,
        },
        ctx.profile,
        ctx.lang,
        body.reason?.trim() || null,
      ),
      messages: [{ role: 'user', content: `Replace ${body.exercise.name} for today.` }],
      schema: swapSchema,
      maxTokens: 900,
    });

    // Give the replacement a demonstration photo too, so a swapped exercise is
    // never the odd one out with a bare illustration.
    const [exercise] = await attachImagesToExercises([aiExerciseToExercise(result.exercise)]);

    return ok({ exercise, reason: result.reason });
  } catch (err) {
    if (err instanceof z.ZodError) return fail('Invalid request.', 400);
    return handleError(err);
  }
}
