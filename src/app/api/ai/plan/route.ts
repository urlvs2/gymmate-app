import { z } from 'zod';
import { completeJson } from '@/lib/ai/openrouter';
import { planSystemPrompt, rebuildInstruction } from '@/lib/ai/prompts';
import { planSchema } from '@/lib/ai/schemas';
import { aiPlanToPlan } from '@/lib/ai/mappers';
import { equipmentPolicy } from '@/lib/domain/equipment';
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

    // The equipment answer is an allow-list, enforced here rather than merely
    // requested: a plan that uses gear the person does not have fails schema
    // validation, and completeJson feeds the specifics back for one repair pass.
    const policy = equipmentPolicy(ctx.profile.equipment);
    const schema =
      policy.level === 'any'
        ? planSchema
        : planSchema.superRefine((plan, zctx) => {
            for (const day of plan.schedule) {
              if (day.rest) continue;
              for (const ex of day.exercises) {
                const bad = policy.violation(ex.name, ex.equipment);
                if (bad) {
                  zctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Exercise "${ex.name}" uses "${bad}", but this person can use ${policy.allowed}. Replace it with an exercise that needs only ${policy.allowed}.`,
                  });
                }
              }
            }
          });

    const aiPlan = await completeJson({
      system: planSystemPrompt(ctx.profile, ctx.lang),
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
