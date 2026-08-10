import { z } from 'zod';
import { completeJson, type AiMessage } from '@/lib/ai/openrouter';
import { coachSystemPrompt, followUpSystemPrompt } from '@/lib/ai/prompts';
import { coachTurnSchema, freeReplySchema } from '@/lib/ai/schemas';
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
 * One conversational turn with the coach.
 *
 * Before a plan exists this is the onboarding interview: the model decides what
 * it still needs to know and asks for one thing at a time. Once a plan exists it
 * becomes a normal question-and-answer channel about that plan.
 */
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const ctx = await resolveContext(body, { chat: true, plan: true });

    const history: AiMessage[] = ctx.chat
      .slice(-14)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    const userText = body.message.trim();

    // Follow-up mode: the program is already written.
    const planSummary = ctx.plan != null ? summarisePlan(ctx.plan, [...WEEKDAY_KEYS]) : null;

    if (planSummary && userText) {
      const result = await completeJson({
        system: followUpSystemPrompt(ctx.profile, planSummary, ctx.lang),
        messages: [...history, { role: 'user', content: userText }],
        schema: freeReplySchema,
        maxTokens: 700,
      });

      const supabase = await createServerSupabase();
      await appendChat(supabase, ctx.userId, [
        { role: 'user', content: userText },
        { role: 'assistant', content: result.reply },
      ]);

      return ok({
        reply: result.reply,
        options: [] as string[],
        readyToBuild: false,
        profile: ctx.profile,
      });
    }

    // Onboarding mode. An empty message means "open the conversation".
    const messages: AiMessage[] = userText
      ? [...history, { role: 'user', content: userText }]
      : [
          ...history,
          {
            role: 'user',
            content:
              'Introduce yourself in one short sentence and ask the single most useful thing you still need to know.',
          },
        ];

    const turn = await completeJson({
      system: coachSystemPrompt(ctx.profile, ctx.lang),
      messages,
      schema: coachTurnSchema,
      maxTokens: 900,
    });

    const profile = applyProfileUpdates(ctx.profile, turn.profile_updates);
    const options = turn.ready_to_build ? [] : turn.options;

    const supabase = await createServerSupabase();
    await Promise.all([
      saveProfile(supabase, ctx.userId, profile),
      appendChat(supabase, ctx.userId, [
        ...(userText ? [{ role: 'user' as const, content: userText }] : []),
        {
          role: 'assistant' as const,
          content: turn.reply,
          options,
          kind: 'question' as const,
        },
      ]),
    ]);

    return ok({
      reply: turn.reply,
      options,
      readyToBuild: turn.ready_to_build,
      profile,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return fail('Invalid request.', 400);
    return handleError(err);
  }
}
