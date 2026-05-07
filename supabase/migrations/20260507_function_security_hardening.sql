-- 🛡️ Function Security Hardening
-- Goal: Revoke public execution on SECURITY DEFINER functions to satisfy Supabase Linter (0028, 0029)

-- 1. Hardening public.add_xp_to_user
-- Switching to SECURITY INVOKER so the function runs with the caller's privileges.
-- This prevents the function from bypassing RLS if called by unauthorized users.

ALTER FUNCTION public.add_xp_to_user(text, text, integer) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.add_xp_to_user(text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_xp_to_user(text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_xp_to_user(text, text, integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.add_xp_to_user(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_xp_to_user(text, text, integer) TO postgres;

-- 📜 ARCHIVIST NOTE:
-- This satisfies the Supabase linter warnings (0028 and 0029) by ensuring
-- that the function cannot be called via the public API (PostgREST) without
-- using the service_role key.
