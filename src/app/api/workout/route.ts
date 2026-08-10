import { z } from 'zod';
import { fail, handleError, ok } from '@/lib/api/http';
import { abandonSession, finishSession, startSession, upsertLog } from '@/lib/db/queries';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const startSchema = z.object({
  action: z.literal('start'),
  planId: z.string().uuid().nullish(),
  dayIndex: z.number().int().min(0).max(6),
  focus: z.string().max(60).default(''),
  scheduledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const logSchema = z.object({
  action: z.literal('log'),
  sessionId: z.string().uuid(),
  log: z.object({
    orderIndex: z.number().int().min(0).max(50),
    exerciseKey: z.string().max(120),
    exerciseName: z.string().max(120),
    sets: z.number().int().min(1).max(20).nullable(),
    reps: z.string().max(24).nullable(),
    restSeconds: z.number().int().min(0).max(600).nullable(),
    weightKg: z.number().min(0).max(500).nullable(),
    feedback: z.enum(['too_easy', 'good', 'too_hard']).nullable(),
    loggedAt: z.string(),
  }),
});

const finishSchema = z.object({
  action: z.literal('finish'),
  sessionId: z.string().uuid(),
});

const abandonSchema = z.object({
  action: z.literal('abandon'),
  sessionId: z.string().uuid(),
});

const bodySchema = z.discriminatedUnion('action', [
  startSchema,
  logSchema,
  finishSchema,
  abandonSchema,
]);

/**
 * Workout progress for signed-in users. A session is only ever marked complete
 * by an explicit `finish` from the user pressing "Finish workout" — nothing here
 * back-fills days that were skipped.
 */
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());

    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail('Sign in to save your workout.', 401);

    switch (body.action) {
      case 'start': {
        const session = await startSession(supabase, user.id, {
          planId: body.planId ?? null,
          dayIndex: body.dayIndex,
          focus: body.focus,
          scheduledOn: body.scheduledOn,
        });
        return ok({ session });
      }
      case 'log': {
        await upsertLog(supabase, user.id, body.sessionId, body.log);
        return ok({ saved: true });
      }
      case 'finish': {
        await finishSession(supabase, user.id, body.sessionId);
        return ok({ finished: true });
      }
      case 'abandon': {
        await abandonSession(supabase, user.id, body.sessionId);
        return ok({ abandoned: true });
      }
    }
  } catch (err) {
    if (err instanceof z.ZodError) return fail('Invalid workout update.', 400);
    return handleError(err);
  }
}
