import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client. Uses the publishable key, which is safe to ship:
 * every table is behind Row Level Security keyed on the signed-in user.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
