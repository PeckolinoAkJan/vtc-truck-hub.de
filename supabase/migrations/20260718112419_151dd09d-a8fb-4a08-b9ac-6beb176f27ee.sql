
REVOKE SELECT (client_key) ON public.profiles FROM anon, authenticated, PUBLIC;
REVOKE SELECT (balance)    ON public.profiles FROM anon, authenticated, PUBLIC;
REVOKE SELECT (api_key)    ON public.vtcs     FROM anon, authenticated, PUBLIC;
