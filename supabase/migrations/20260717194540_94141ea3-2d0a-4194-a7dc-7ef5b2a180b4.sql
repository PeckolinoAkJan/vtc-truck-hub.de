DROP POLICY IF EXISTS "Authenticated can read settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated read client_download_url" ON public.app_settings;
DROP POLICY IF EXISTS "Super admin full access" ON public.app_settings;

CREATE POLICY "Authenticated read client_download_url"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (key = 'client_download_url');

CREATE POLICY "Super admin full access"
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());