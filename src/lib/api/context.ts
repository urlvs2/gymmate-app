import 'server-only';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadActivePlan, loadChat, loadProfile, loadSessions } from '@/lib/db/queries';
import type { ChatMessage, Lang, Plan, Profile, WorkoutSession } from '@/lib/domain/types';

/**
 * Every AI route runs on behalf of a signed-in account, and reads that
 * account's profile, conversation and history from the database. Nothing about
 * the user is taken from the request body, so a client cannot talk the coach
 * into reasoning about someone else's data.
 */

export const langSchema = z.enum(['en', 'ar']).default('en');

export class UnauthorizedError extends Error {
  constructor() {
    super('Sign in to continue.');
    this.name = 'UnauthorizedError';
  }
}

export interface RequestContext {
  userId: string;
  profile: Profile;
  chat: Pick<ChatMessage, 'role' | 'content'>[];
  plan: Plan | null;
  history: WorkoutSession[];
  lang: Lang;
}

/**
 * Loads what an AI route needs. `needs` keeps the database round trips down —
 * most routes do not care about the plan or the workout history.
 */
export async function resolveContext(
  body: { lang?: unknown },
  needs: { plan?: boolean; history?: boolean; chat?: boolean } = {},
): Promise<RequestContext> {
  const lang = langSchema.parse(body.lang ?? 'en');

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new UnauthorizedError();

  const [profile, chat, plan, history] = await Promise.all([
    loadProfile(supabase, user.id),
    needs.chat ? loadChat(supabase, user.id, 40) : Promise.resolve([] as ChatMessage[]),
    needs.plan ? loadActivePlan(supabase, user.id) : Promise.resolve(null),
    needs.history ? loadSessions(supabase, user.id, 40) : Promise.resolve([] as WorkoutSession[]),
  ]);

  return {
    userId: user.id,
    profile,
    chat: chat.map((m) => ({ role: m.role, content: m.content })),
    plan,
    history,
    lang,
  };
}
