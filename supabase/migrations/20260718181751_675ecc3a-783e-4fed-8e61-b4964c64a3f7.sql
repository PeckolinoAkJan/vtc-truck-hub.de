
DROP POLICY IF EXISTS "Admin can delete settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin can read all settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin can update settings" ON public.app_settings;

-- Super-admin read policy (parallel to the narrow public-key read policies)
DROP POLICY IF EXISTS "Super admin read app_settings" ON public.app_settings;
CREATE POLICY "Super admin read app_settings"
ON public.app_settings
FOR SELECT
USING (private.is_super_admin_uid(auth.uid()));
