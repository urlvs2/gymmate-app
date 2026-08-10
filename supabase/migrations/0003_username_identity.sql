-- Username becomes the account identity.
--
-- Supabase Auth is built around an email address, so every account still has
-- one internally: a deterministic address derived from the username. A real
-- email is optional contact information stored on the profile, never a login
-- credential.

alter table public.profiles
  add column username text,
  add column email text;

-- Backfill anything that predates this migration, then lock the column down.
update public.profiles
set username = 'user_' || substr(id::text, 1, 8)
where username is null;

alter table public.profiles
  alter column username set not null;

-- Usernames are shown as typed but claimed case-insensitively, so "Layla" and
-- "layla" cannot both exist.
create unique index profiles_username_lower_idx on public.profiles (lower(username));

alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[A-Za-z0-9][A-Za-z0-9_.]{2,23}$');

alter table public.profiles
  add constraint profiles_email_format
  check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- The signup trigger now carries the username through from the sign-up call.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, email, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      'user_' || substr(new.id::text, 1, 8)
    ),
    nullif(new.raw_user_meta_data ->> 'contact_email', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Whether a username is free is answered by the sign-up edge function, which
-- checks with the service role. See 0004.
