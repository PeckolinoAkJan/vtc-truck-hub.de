-- Restrict sensitive columns via column-level privileges.
-- RLS still gates row visibility; column-level REVOKE prevents any
-- authenticated client (Data API) from selecting these secrets, even
-- for their own row / VTC. Server code reads them via supabaseAdmin
-- after authorizing the caller.

REVOKE SELECT (api_key) ON public.vtcs FROM authenticated;
REVOKE SELECT (api_key) ON public.vtcs FROM anon;

REVOKE SELECT (client_key) ON public.profiles FROM authenticated;
REVOKE SELECT (client_key) ON public.profiles FROM anon;

-- service_role keeps full access (already GRANT ALL), so supabaseAdmin
-- reads/writes continue to work for privileged server code.
