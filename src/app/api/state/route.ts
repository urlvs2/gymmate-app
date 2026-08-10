import { handleError, ok } from '@/lib/api/http';
import { loadSnapshot } from '@/lib/db/queries';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything the app needs on boot. Signed out callers get `null`. */
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return ok({ user: null, snapshot: null });

    const snapshot = await loadSnapshot(supabase, user.id);
    return ok({
      // The address on the auth record is internal and derived from the
      // username; the contact email, if there is one, lives on the profile.
      user: {
        id: user.id,
        username: snapshot.profile.username,
        email: snapshot.profile.email,
      },
      snapshot,
    });
  } catch (err) {
    return handleError(err);
  }
}
