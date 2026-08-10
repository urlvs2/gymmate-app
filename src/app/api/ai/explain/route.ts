import { z } from 'zod';
import { completeJson } from '@/lib/ai/openrouter';
import { explainSystemPrompt } from '@/lib/ai/prompts';
import { explanationSchema } from '@/lib/ai/schemas';
import { langSchema, resolveContext } from '@/lib/api/context';
import { fail, handleError, ok } from '@/lib/api/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

const exerciseSchema = z.object({
  name: z.string().max(80),
  muscle: z.string().max(60).default(''),
  equipment: z.string().max(60).default(''),
  sets: z.number().int().min(1).max(10).default(3),
  reps: z.string().max(24).default('10'),
  restSeconds: z.number().int().min(15).max(400).default(60),
  howTo: z.array(z.string().max(220)).default([]),
});

const bodySchema = z.object({
  lang: langSchema,
  exercise: exerciseSchema,
  lastWeightKg: z.number().min(0).max(500).nullish(),
  lastFeedback: z.enum(['too_easy', 'good', 'too_hard']).nullish(),
});

/** "How do I do this?" — a plain-language explanation of the current exercise. */
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const ctx = await resolveContext(body);

    const result = await completeJson({
      system: explainSystemPrompt(
        {
          exercise: { ...body.exercise, howTo: body.exercise.howTo },
          lastWeightKg: body.lastWeightKg ?? null,
          lastFeedback: body.lastFeedback ?? null,
        },
        ctx.profile,
        ctx.lang,
      ),
      messages: [{ role: 'user', content: `How do I do ${body.exercise.name} properly?` }],
      schema: explanationSchema,
      maxTokens: 900,
    });

    return ok(result);
  } catch (err) {
    if (err instanceof z.ZodError) return fail('Invalid request.', 400);
    return handleError(err);
  }
}
