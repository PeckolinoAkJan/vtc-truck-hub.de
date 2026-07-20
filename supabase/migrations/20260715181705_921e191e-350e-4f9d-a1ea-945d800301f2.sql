
ALTER FUNCTION public.set_updated_at() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_vtc_member(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_vtc_role(uuid, uuid, public.vtc_role[]) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_vtc_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_vtc_role(uuid, uuid, public.vtc_role[]) TO authenticated, service_role;
