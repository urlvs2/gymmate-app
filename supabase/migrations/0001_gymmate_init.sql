-- GymMate initial schema.
--
-- Every table holds per-user data and is protected by Row Level Security:
-- a row is readable and writable only by the account that owns it. Nothing in
-- here is world-readable, so the publishable key is safe in the browser.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles --
-- One row per account. Holds the facts the AI uses to reason about the user.
-- `facts` is free-form so the coach can remember anything it learns without a
-- migration (injuries, preferences, gym quirks) — nothing about the plan itself
-- is hardcoded into columns.
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text,
  age                 integer check (age is null or (age between 10 and 100)),
  gender              text,
  height_cm           numeric(5, 1) check (height_cm is null or (height_cm between 80 and 260)),
  weight_kg           numeric(5, 1) check (weight_kg is null or (weight_kg between 25 and 400)),
  experience          text,
  goal                text,
  days_per_week       integer check (days_per_week is null or (days_per_week between 1 and 7)),
  session_minutes     integer check (session_minutes is null or (session_minutes between 10 and 180)),
  equipment           text,
  facts               jsonb not null default '{}'::jsonb,
  language            text not null default 'en' check (language in ('en', 'ar')),
  theme               text not null default 'dark' check (theme in ('dark', 'light')),
  onboarding_complete boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ------------------------------------------------------------------- plans --
-- The generated program. `schedule` is the AI's output verbatim (validated
-- against a schema in the app before it is stored): a list of week days, each
-- either a rest day or a session with its own exercises, sets, reps and rest.
-- No split, exercise or scheme is fixed by the database.
create table public.plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  rationale       text,
  days_per_week   integer,
  session_minutes integer,
  schedule        jsonb not null,
  meta            jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index plans_user_created_idx on public.plans (user_id, created_at desc);

-- At most one active plan per user.
create unique index plans_one_active_per_user_idx
  on public.plans (user_id)
  where is_active;

-- -------------------------------------------------------- workout_sessions --
-- A session row is created when the user starts a workout and only reaches
-- 'completed' when they actually finish it. A day that was never started has no
-- row at all, which is what keeps missed workouts from counting as done.
create table public.workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  plan_id      uuid references public.plans (id) on delete set null,
  day_index    integer not null,
  focus        text,
  status       text not null default 'in_progress'
                 check (status in ('in_progress', 'completed', 'abandoned')),
  scheduled_on date,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  constraint workout_sessions_completed_at_matches_status
    check ((status = 'completed') = (completed_at is not null))
);

create index workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);

create index workout_sessions_user_status_idx
  on public.workout_sessions (user_id, status);

-- ------------------------------------------------------------ exercise_logs --
-- What the user actually lifted. `weight_kg` is deliberately nullable: the first
-- time someone performs a movement there is no honest number to suggest, so the
-- app records nothing rather than guessing from body weight.
create table public.exercise_logs (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.workout_sessions (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  exercise_key  text not null,
  exercise_name text not null,
  order_index   integer not null default 0,
  sets          integer,
  reps          text,
  rest_seconds  integer,
  weight_kg     numeric(6, 2),
  feedback      text check (feedback in ('too_easy', 'good', 'too_hard')),
  logged_at     timestamptz not null default now(),
  unique (session_id, order_index)
);

-- Drives "what did they lift last time?" lookups for the AI's weight suggestion.
create index exercise_logs_history_idx
  on public.exercise_logs (user_id, exercise_key, logged_at desc);

-- ----------------------------------------------------------- chat_messages --
-- The coach conversation, so a returning user picks up where they left off.
create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

-- ---------------------------------------------------------------- triggers --

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Give every new account an empty profile row so the app never has to branch on
-- "profile missing".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------- RLS --

alter table public.profiles         enable row level security;
alter table public.plans            enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.exercise_logs    enable row level security;
alter table public.chat_messages    enable row level security;

create policy "profiles are private to their owner"
  on public.profiles for all
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "plans are private to their owner"
  on public.plans for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "sessions are private to their owner"
  on public.workout_sessions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "exercise logs are private to their owner"
  on public.exercise_logs for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "chat messages are private to their owner"
  on public.chat_messages for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
