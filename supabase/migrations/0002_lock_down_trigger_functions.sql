-- The signup trigger runs as SECURITY DEFINER so it can write a profile row for
-- a user that does not exist yet. Postgres grants EXECUTE to PUBLIC by default,
-- which would also expose it as a callable REST endpoint. Only the trigger needs
-- it, so take that grant away.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
