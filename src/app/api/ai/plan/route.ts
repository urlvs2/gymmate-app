import { z } from 'zod';
import { completeJson } from '@/lib/ai/openrouter';
import { planSystemPrompt } from '@/lib/ai/prompts';
import { planSchema } from '@/lib/ai/schemas';
import { aiPlanToPlan } from '@/lib/ai/mappers';
import { langSchema, resolveContext } from '@/lib/api/context';
import { fail, handleError, ok } from '@/lib/api/http';
import { appendChat, savePlan, saveProfile } from '@/lib/db/queries';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  lang: langSchema,
  /** Free-text steer from the user, e.g. "rebuild it around 4 days". */
  adjustment: z.string().max(500).nullish(),
});

/**
 * Generates the whole program. The model chooses the split, the exercises and
 * every set, rep and rest value; the app only checks the answer is well formed
 * and stores it.
 */
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const ctx = await resolveContext(body);

    const aiPlan = await completeJson({
      system: planSystemPrompt(ctx.profile, ctx.lang),
      messages: [
        {
          role: 'user',
          content: body.adjustment?.trim()
            ? `Build my program. Also take this into account: ${body.adjustment.trim()}`
            : 'Build my program now.',
        },
      ],
      schema: planSchema,
      kind: 'plan',
      maxTokens: 4500,
    });

    const profile = { ...ctx.profile, onboardingComplete: true };
    const supabase = await createServerSupabase();
    const plan = await savePlan(supabase, ctx.userId, aiPlanToPlan(aiPlan, crypto.randomUUID()));

    await Promise.all([
      saveProfile(supabase, ctx.userId, profile),
      appendChat(supabase, ctx.userId, [
        { role: 'assistant', content: plan.rationale, kind: 'summary' },
      ]),
    ]);

    return ok({ plan, profile });
  } catch (err) {
    if (err instanceof z.ZodError) return fail('Invalid request.', 400);
    return handleError(err);
  }
}
