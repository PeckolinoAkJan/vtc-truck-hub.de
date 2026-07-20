-- Fix security definer view: use security_invoker
ALTER VIEW public.vtcs_directory SET (security_invoker = on);

-- Revoke EXECUTE from authenticated on SECURITY DEFINER function.
-- Auth is enforced server-side (server function verifies membership before calling with service role).
REVOKE EXECUTE ON FUNCTION public.accept_vtc_join_request(uuid) FROM authenticated, anon, PUBLIC;