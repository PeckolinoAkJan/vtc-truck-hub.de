
-- Move super-admin check into the private schema (not exposed via API)
-- so it can't be executed directly by authenticated/anon through PostgREST.

CREATE OR REPLACE FUNCTION private.is_super_admin_uid(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id AND lower(email) = 'j.rikeit@gmail.com'
  );
$$;

REVOKE ALL ON FUNCTION private.is_super_admin_uid(uuid) FROM PUBLIC, anon, authenticated;

-- Rewire policies to use the private helper
DROP POLICY IF EXISTS "News admin insert" ON public.vtc_news;
DROP POLICY IF EXISTS "News admin update" ON public.vtc_news;
DROP POLICY IF EXISTS "News admin delete" ON public.vtc_news;
DROP POLICY IF EXISTS "Super admin insert app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Super admin update app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Super admin delete app_settings" ON public.app_settings;

CREATE POLICY "News admin insert" ON public.vtc_news
  FOR INSERT TO authenticated
  WITH CHECK (private.is_super_admin_uid(auth.uid()));
CREATE POLICY "News admin update" ON public.vtc_news
  FOR UPDATE TO authenticated
  USING (private.is_super_admin_uid(auth.uid()))
  WITH CHECK (private.is_super_admin_uid(auth.uid()));
CREATE POLICY "News admin delete" ON public.vtc_news
  FOR DELETE TO authenticated
  USING (private.is_super_admin_uid(auth.uid()));

CREATE POLICY "Super admin insert app_settings" ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (private.is_super_admin_uid(auth.uid()));
CREATE POLICY "Super admin update app_settings" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (private.is_super_admin_uid(auth.uid()))
  WITH CHECK (private.is_super_admin_uid(auth.uid()));
CREATE POLICY "Super admin delete app_settings" ON public.app_settings
  FOR DELETE TO authenticated
  USING (private.is_super_admin_uid(auth.uid()));

-- Retire the old public-schema helper so it no longer appears on the API surface
DROP FUNCTION IF EXISTS public.is_super_admin_uid();
