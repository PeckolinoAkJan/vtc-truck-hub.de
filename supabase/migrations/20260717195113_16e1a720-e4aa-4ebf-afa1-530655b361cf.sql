DROP POLICY IF EXISTS "Super admin full access" ON public.app_settings;
DROP POLICY IF EXISTS "Super admin can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Super admin can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Super admin can delete settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin can delete settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin can read all settings" ON public.app_settings;

DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;

CREATE POLICY "Admin can read all settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'email'::text) = 'j.rikeit@gmail.com'::text);

CREATE POLICY "Admin can insert settings" ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email'::text) = 'j.rikeit@gmail.com'::text);

CREATE POLICY "Admin can update settings" ON public.app_settings
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'email'::text) = 'j.rikeit@gmail.com'::text)
  WITH CHECK ((auth.jwt() ->> 'email'::text) = 'j.rikeit@gmail.com'::text);

CREATE POLICY "Admin can delete settings" ON public.app_settings
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'email'::text) = 'j.rikeit@gmail.com'::text);