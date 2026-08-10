import { fail, handleError, ok } from '@/lib/api/http';
import { clearChat } from '@/lib/db/queries';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Clears the stored conversation when the user restarts the coach. */
export async function DELETE() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail('Not signed in.', 401);

    await clearChat(supabase, user.id);
    return ok({ cleared: true });
  } catch (err) {
    return handleError(err);
  }
}
