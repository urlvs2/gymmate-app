import { z } from 'zod';
import { langSchema, resolveContext } from '@/lib/api/context';
import { fail, handleError, ok } from '@/lib/api/http';
import { attachExerciseImages, planNeedsImages } from '@/lib/exercises/attach';
import { updatePlanSchedule } from '@/lib/db/queries';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({ lang: langSchema });

/**
 * Attaches real demonstration photos to the user's active plan.
 *
 * The client calls this once whenever it loads a plan whose exercises have no
 * images yet — new plans, and any plan created before this feature existed. It
 * is idempotent: a plan whose exercises already have images is returned
 * untouched without a database write or a model call.
 */
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const ctx = await resolveContext(body, { plan: true });

    if (!ctx.plan || !planNeedsImages(ctx.plan)) {
      return ok({ plan: ctx.plan });
    }

    const withImages = await attachExerciseImages(ctx.plan);

    // Only write if something actually changed.
    if (planNeedsImages(withImages) === planNeedsImages(ctx.plan) &&
        JSON.stringify(withImages.schedule) === JSON.stringify(ctx.plan.schedule)) {
      return ok({ plan: ctx.plan });
    }

    const supabase = await createServerSupabase();
    await updatePlanSchedule(supabase, ctx.userId, ctx.plan.id, withImages.schedule);

    return ok({ plan: withImages });
  } catch (err) {
    if (err instanceof z.ZodError) return fail('Invalid request.', 400);
    return handleError(err);
  }
}
