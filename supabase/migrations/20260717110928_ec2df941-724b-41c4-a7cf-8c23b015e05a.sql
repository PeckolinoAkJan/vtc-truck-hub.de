
REVOKE EXECUTE ON FUNCTION public.list_public_vtcs() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_vtc(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_drivers(int) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_vtcs(int) FROM anon, authenticated, PUBLIC;
