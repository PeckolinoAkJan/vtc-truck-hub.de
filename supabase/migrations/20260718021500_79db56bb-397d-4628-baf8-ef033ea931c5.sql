
-- Admin-User-ID Helper (per E-Mail)
CREATE OR REPLACE FUNCTION public.is_super_admin_uid()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND lower(email) = 'j.rikeit@gmail.com'
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin_uid() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin_uid() TO authenticated;

-- News Tabelle
CREATE TABLE public.vtc_news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vtc_news TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vtc_news TO authenticated;
GRANT ALL ON public.vtc_news TO service_role;

ALTER TABLE public.vtc_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "News public read" ON public.vtc_news
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "News admin insert" ON public.vtc_news
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin_uid());

CREATE POLICY "News admin update" ON public.vtc_news
  FOR UPDATE TO authenticated
  USING (public.is_super_admin_uid())
  WITH CHECK (public.is_super_admin_uid());

CREATE POLICY "News admin delete" ON public.vtc_news
  FOR DELETE TO authenticated USING (public.is_super_admin_uid());

CREATE TRIGGER vtc_news_updated_at
BEFORE UPDATE ON public.vtc_news
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- app_settings: RLS auf User-ID (E-Mail) statt bisherigem JWT-Email-Check härten
DROP POLICY IF EXISTS "Admin can insert app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin can update app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin can delete app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can insert app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can update app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can delete app_settings" ON public.app_settings;

CREATE POLICY "Super admin insert app_settings" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin_uid());
CREATE POLICY "Super admin update app_settings" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.is_super_admin_uid())
  WITH CHECK (public.is_super_admin_uid());
CREATE POLICY "Super admin delete app_settings" ON public.app_settings
  FOR DELETE TO authenticated USING (public.is_super_admin_uid());
