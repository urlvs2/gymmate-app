import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Account creation for GymMate.
 *
 * The app identifies people by username, but Supabase Auth is built around an
 * email address — so every account gets a deterministic internal address
 * derived from its username, and the real email (if the person gave one) is
 * kept on the profile as contact information only.
 *
 * That internal address can never receive mail, so the account is created here
 * with the service role and marked confirmed. This function is deliberately
 * public (it is the sign-up endpoint) and does nothing but create an account:
 * it never reads or returns anyone else's data, and the only thing it reveals
 * is whether a username is already taken, which the sign-up form has to know.
 *
 * The body facts the form collects — name, age, height, weight, gender — are
 * written to the profile in the same call, so the coach starts the very first
 * conversation already knowing them and never asks again.
 */

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.]{2,23}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const AUTH_EMAIL_DOMAIN = 'users.gymmate.app';
const MIN_PASSWORD = 8;
const GENDERS = ['female', 'male'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** The internal address for a username. Must match the one the app signs in with. */
const authEmailFor = (username: string) => `${username.toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;

/** Ranges mirror the CHECK constraints on public.profiles. */
function numberIn(value: unknown, min: number, max: number, round = false): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return round ? Math.round(n) : Math.round(n * 10) / 10;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const username = str(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  const email = str(body.email) || null;
  const fullName = str(body.fullName) || null;
  const gender = str(body.gender).toLowerCase();

  if (!USERNAME_PATTERN.test(username)) return json({ error: 'invalid_username' }, 400);
  if (password.length < MIN_PASSWORD) return json({ error: 'weak_password' }, 400);
  if (email !== null && !EMAIL_PATTERN.test(email)) return json({ error: 'invalid_email' }, 400);
  if (fullName === null || fullName.length > 80) return json({ error: 'invalid_name' }, 400);
  if (!GENDERS.includes(gender)) return json({ error: 'invalid_gender' }, 400);

  const age = numberIn(body.age, 10, 100, true);
  const heightCm = numberIn(body.heightCm, 80, 260);
  const weightKg = numberIn(body.weightKg, 25, 400);

  if (age === null) return json({ error: 'invalid_age' }, 400);
  if (heightCm === null) return json({ error: 'invalid_height' }, 400);
  if (weightKg === null) return json({ error: 'invalid_weight' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: taken } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .maybeSingle();

  if (taken) return json({ error: 'username_taken' }, 409);

  const { data, error } = await admin.auth.admin.createUser({
    email: authEmailFor(username),
    password,
    email_confirm: true, // the internal address cannot receive mail
    user_metadata: { username, contact_email: email, full_name: fullName },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('already') || message.includes('exists')) {
      return json({ error: 'username_taken' }, 409);
    }
    console.error('createUser failed:', error.message);
    return json({ error: 'signup_failed' }, 400);
  }

  if (data.user) {
    // The trigger created the row; this fills in everything the form collected.
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        username,
        email,
        full_name: fullName,
        age,
        height_cm: heightCm,
        weight_kg: weightKg,
        gender,
      })
      .eq('id', data.user.id);

    if (profileError) {
      // Never leave a half-made account behind for someone to log into.
      await admin.auth.admin.deleteUser(data.user.id);
      console.error('profile update failed:', profileError.message);
      return json({ error: 'signup_failed' }, 400);
    }
  }

  return json({ ok: true, username });
});
