import { z } from 'zod';
import { completeJson, type AiMessage } from '@/lib/ai/openrouter';
import { coachSystemPrompt } from '@/lib/ai/prompts';
import { coachTurnSchema } from '@/lib/ai/schemas';
import { applyProfileUpdates, summarisePlan } from '@/lib/ai/mappers';
import { langSchema, resolveContext } from '@/lib/api/context';
import { fail, handleError, ok } from '@/lib/api/http';
import { appendChat, saveProfile } from '@/lib/db/queries';
import { createServerSupabase } from '@/lib/supabase/server';
import { WEEKDAY_KEYS } from '@/lib/i18n/dictionary';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().max(1000).default(''),
  lang: langSchema,
});

/**
 * One turn of the conversation.
 *
 * The same call covers the interview before a program exists and every
 * conversation after it, because the coach sees the profile, the running
 * program and the recent history every time. When something the person says
 * invalidates their program, the turn comes back asking for a rebuild and the
 * client follows up with the plan endpoint — which is what makes "I can't get
 * to the gym any more" actually change what they are asked to do tomorrow.
 */
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const ctx = await resolveContext(body, { chat: true, plan: true });

    const planSummary = ctx.plan ? summarisePlan(ctx.plan, [...WEEKDAY_KEYS]) : null;

    // Enough history for the coach to remember what was already said and asked.
    const history: AiMessage[] = ctx.chat
      .slice(-20)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    const userText = body.message.trim();

    const messages: AiMessage[] = userText
      ? [...history, { role: 'user', content: userText }]
      : [
          ...history,
          {
            role: 'user',
            content: planSummary
              ? 'Greet me in one short sentence and ask how the training is going.'
              : 'Introduce yourself in one short sentence and ask the single most useful thing you still need to know.',
          },
        ];

    const turn = await completeJson({
      system: coachSystemPrompt(ctx.profile, planSummary, ctx.lang),
      messages,
      schema: coachTurnSchema,
      maxTokens: 900,
    });

    const profile = applyProfileUpdates(ctx.profile, turn.profile_updates);

    // A turn that is about to (re)write the program should not also offer chips.
    const changingPlan = turn.plan_action !== 'none';
    const options = changingPlan ? [] : turn.options;

    // Asking to build when a plan already exists means replacing it.
    const planAction =
      turn.plan_action === 'build' && ctx.plan ? 'rebuild' : turn.plan_action;

    const supabase = await createServerSupabase();
    await Promise.all([
      saveProfile(supabase, ctx.userId, profile),
      appendChat(supabase, ctx.userId, [
        ...(userText ? [{ role: 'user' as const, content: userText }] : []),
        {
          role: 'assistant' as const,
          content: turn.reply,
          options,
          kind: options.length ? ('question' as const) : undefined,
        },
      ]),
    ]);

    return ok({
      reply: turn.reply,
      options,
      planAction,
      planNote: turn.plan_note ?? null,
      profile,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return fail('Invalid request.', 400);
    return handleError(err);
  }
}
