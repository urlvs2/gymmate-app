import { z } from 'zod';
import { completeJson } from '@/lib/ai/openrouter';
import { swapSystemPrompt } from '@/lib/ai/prompts';
import { swapSchema } from '@/lib/ai/schemas';
import { aiExerciseToExercise } from '@/lib/ai/mappers';
import { equipmentLabel, poolCodes, renderPool, selectPool } from '@/lib/exercises/catalogue';
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

/** Replaces one exercise in today's session with a real one from the catalogue. */
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const ctx = await resolveContext(body);

    // The replacement is chosen from the same equipment- and level-filtered
    // catalogue the plan was built from, so it is a real exercise that fits
    // their equipment by construction.
    const pool = selectPool(ctx.profile);
    const codes = poolCodes(pool);

    const schema = swapSchema.superRefine((result, zctx) => {
      if (!codes.has(result.exercise.ref)) {
        zctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `The replacement has ref "${result.exercise.ref}", which is not one of the codes provided. Choose a replacement from the given list by its code.`,
        });
      }
    });

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
        renderPool(codes),
      ),
      messages: [{ role: 'user', content: `Replace ${body.exercise.name} for today.` }],
      schema,
      maxTokens: 900,
    });

    // Fill in the real identity — equipment and demonstration photos — from the
    // chosen catalogue entry.
    const exercise = aiExerciseToExercise(result.exercise, (ex) => {
      const entry = codes.get(ex.ref);
      if (!entry) return { equipment: equipmentLabel('body only', ctx.lang) };
      return {
        equipment: equipmentLabel(entry.equipment, ctx.lang),
        imageStart: entry.imageStart,
        imageEnd: entry.imageEnd,
        catalogueId: entry.id,
      };
    });

    return ok({ exercise, reason: result.reason });
  } catch (err) {
    if (err instanceof z.ZodError) return fail('Invalid request.', 400);
    return handleError(err);
  }
}
