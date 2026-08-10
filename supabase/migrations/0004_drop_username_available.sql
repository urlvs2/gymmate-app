-- The sign-up edge function is the only thing that needs to know whether a
-- username is free, and it checks with the service role. Exposing the same
-- question as a public RPC only offers a way to enumerate accounts.

drop function if exists public.username_available(text);
