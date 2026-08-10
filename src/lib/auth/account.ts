import { createClient } from '@/lib/supabase/client';

/**
 * Accounts are identified by username.
 *
 * Supabase Auth needs an email address, so each account carries a deterministic
 * internal one derived from its username. It can never receive mail and is
 * never shown to anyone — a real email address is optional contact information
 * on the profile. Signing in only ever needs the username and password.
 *
 * Sign-up also collects the body facts the coach would otherwise have to ask
 * for. They are written to the profile as the account is created, so the very
 * first conversation starts from what it already knows.
 */

const AUTH_EMAIL_DOMAIN = 'users.gymmate.app';

export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.]{2,23}$/;
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MIN_PASSWORD = 8;

/** Ranges mirror the CHECK constraints on public.profiles. */
export const LIMITS = {
  age: { min: 10, max: 100 },
  heightCm: { min: 80, max: 260 },
  weightKg: { min: 25, max: 400 },
} as const;

export type Gender = 'female' | 'male';

/** Must match the address the signup edge function registers. */
export const authEmailFor = (username: string) =>
  `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;

export type SignupFailure =
  | 'invalid_username'
  | 'username_taken'
  | 'weak_password'
  | 'invalid_email'
  | 'invalid_name'
  | 'invalid_age'
  | 'invalid_height'
  | 'invalid_weight'
  | 'invalid_gender'
  | 'signup_failed'
  | 'network';

export interface SignupInput {
  username: string;
  password: string;
  fullName: string;
  age: number;
  heightCm: number;
  weightKg: number;
  gender: Gender;
  email?: string | null;
}

export interface SignupResult {
  ok: boolean;
  reason?: SignupFailure;
}

/**
 * Creates the account, then signs in with it.
 *
 * Creation runs in an edge function because the internal address cannot receive
 * a confirmation mail — the function holds the service role, registers the
 * account already confirmed, and writes the profile in the same call.
 */
export async function createAccount(input: SignupInput): Promise<SignupResult> {
  const username = input.username.trim();

  if (!USERNAME_PATTERN.test(username)) return { ok: false, reason: 'invalid_username' };
  if (input.password.length < MIN_PASSWORD) return { ok: false, reason: 'weak_password' };

  const supabase = createClient();

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'signup',
    {
      body: {
        username,
        password: input.password,
        email: input.email?.trim() || null,
        fullName: input.fullName.trim(),
        age: input.age,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        gender: input.gender,
      },
    },
  );

  if (error || !data?.ok) {
    // A non-2xx reply carries the reason in the response body.
    let reason: SignupFailure = 'signup_failed';
    const context = (error as { context?: Response } | null)?.context;
    if (context && typeof context.json === 'function') {
      try {
        const body = (await context.json()) as { error?: string };
        if (body.error) reason = body.error as SignupFailure;
      } catch {
        // fall through with the generic reason
      }
    } else if (data?.error) {
      reason = data.error as SignupFailure;
    } else if (error) {
      reason = 'network';
    }
    return { ok: false, reason };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: authEmailFor(username),
    password: input.password,
  });

  if (signInError) return { ok: false, reason: 'signup_failed' };
  return { ok: true };
}

/** Signs in with the username and password the person chose at sign-up. */
export async function signInWithUsername(username: string, password: string) {
  const supabase = createClient();
  return supabase.auth.signInWithPassword({
    email: authEmailFor(username),
    password,
  });
}
