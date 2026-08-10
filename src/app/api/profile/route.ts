import { z } from 'zod';
import { fail, handleError, ok } from '@/lib/api/http';
import { loadProfile, saveProfile, savePreferences } from '@/lib/db/queries';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** `username` is not here on purpose — it is the account identity, fixed at sign-up. */
const patchSchema = z.object({
  fullName: z.string().max(80).nullish(),
  email: z
    .string()
    .max(160)
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'That email does not look right.')
    .nullish()
    .or(z.literal('').transform(() => null)),
  age: z.number().int().min(10).max(100).nullish(),
  gender: z.string().max(40).nullish(),
  heightCm: z.number().min(80).max(260).nullish(),
  weightKg: z.number().min(25).max(400).nullish(),
  language: z.enum(['en', 'ar']).optional(),
  theme: z.enum(['dark', 'light']).optional(),
});

/** Profile edits from the Profile tab, plus language and theme preferences. */
export async function PATCH(request: Request) {
  try {
    const patch = patchSchema.parse(await request.json());

    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail('Sign in to save changes.', 401);

    const current = await loadProfile(supabase, user.id);
    const next = {
      ...current,
      ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.age !== undefined ? { age: patch.age } : {}),
      ...(patch.gender !== undefined ? { gender: patch.gender } : {}),
      ...(patch.heightCm !== undefined ? { heightCm: patch.heightCm } : {}),
      ...(patch.weightKg !== undefined ? { weightKg: patch.weightKg } : {}),
    };

    await saveProfile(supabase, user.id, next);
    await savePreferences(supabase, user.id, { language: patch.language, theme: patch.theme });

    return ok({ profile: next });
  } catch (err) {
    if (err instanceof z.ZodError) return fail('Those values do not look right.', 400);
    return handleError(err);
  }
}
