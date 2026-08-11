import { z } from 'zod';
import { completeJson } from '@/lib/ai/openrouter';
import { planSystemPrompt, rebuildInstruction } from '@/lib/ai/prompts';
import { planSchema } from '@/lib/ai/schemas';
import { aiPlanToPlan, type ExerciseResolver } from '@/lib/ai/mappers';
import {
  equipmentLabel,
  poolCodes,
  renderPool,
  selectPool,
} from '@/lib/exercises/catalogue';
import { langSchema, resolveContext } from '@/lib/api/context';
import { fail, handleError, ok } from '@/lib/api/http';
import { appendChat, savePlan, saveProfile } from '@/lib/db/queries';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  lang: langSchema,
  /** What changed, when the coach asked for the program to be rewritten. */
  adjustment: z.string().max(500).nullish(),
  /** True when this replaces a program the person already had. */
  rebuild: z.boolean().default(false),
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

    // The exercises are chosen from a real catalogue, pre-filtered to this
    // person's equipment and level, rather than invented. The model picks by
    // reference code; a code that is not in the list fails validation and
    // completeJson feeds the offenders back for one repair pass. Because the
    // pool is already equipment-filtered, every valid choice is also guaranteed
    // to fit their equipment — the old free-text equipment rule is now automatic.
    const pool = selectPool(ctx.profile);
    const codes = poolCodes(pool);

    const schema = planSchema.superRefine((plan, zctx) => {
      for (const day of plan.schedule) {
        if (day.rest) continue;
        for (const ex of day.exercises) {
          if (!codes.has(ex.ref)) {
            zctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Exercise "${ex.name}" has ref "${ex.ref}", which is not one of the codes provided. Every exercise must use a ref from the given list.`,
            });
          }
        }
      }
    });

    const resolve: ExerciseResolver = (ex) => {
      const entry = codes.get(ex.ref);
      if (!entry) return { equipment: equipmentLabel('body only', ctx.lang) };
      return {
        equipment: equipmentLabel(entry.equipment, ctx.lang),
        imageStart: entry.imageStart,
        imageEnd: entry.imageEnd,
        catalogueId: entry.id,
      };
    };

    const aiPlan = await completeJson({
      system: planSystemPrompt(ctx.profile, renderPool(codes), ctx.lang),
      messages: [
        {
          role: 'user',
          content: body.rebuild
            ? rebuildInstruction(body.adjustment ?? null, ctx.lang)
            : body.adjustment?.trim()
              ? `Build my program. Also take this into account: ${body.adjustment.trim()}`
              : 'Build my program now.',
        },
      ],
      schema,
      kind: 'plan',
      maxTokens: 4500,
    });

    const profile = { ...ctx.profile, onboardingComplete: true };
    const supabase = await createServerSupabase();
    const plan = await savePlan(
      supabase,
      ctx.userId,
      aiPlanToPlan(aiPlan, crypto.randomUUID(), resolve),
    );

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
