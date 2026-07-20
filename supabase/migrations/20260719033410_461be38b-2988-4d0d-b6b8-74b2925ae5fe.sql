
CREATE TABLE IF NOT EXISTS public.site_visits (
  id smallint PRIMARY KEY DEFAULT 1,
  count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_visits_singleton CHECK (id = 1)
);

GRANT SELECT ON public.site_visits TO anon, authenticated;
GRANT ALL ON public.site_visits TO service_role;

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_visits_read_all" ON public.site_visits;
CREATE POLICY "site_visits_read_all" ON public.site_visits FOR SELECT USING (true);

INSERT INTO public.site_visits (id, count) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.increment_site_visits()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.site_visits (id, count, updated_at)
  VALUES (1, 1, now())
  ON CONFLICT (id) DO UPDATE SET count = public.site_visits.count + 1, updated_at = now()
  RETURNING count;
$$;

REVOKE ALL ON FUNCTION public.increment_site_visits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_site_visits() TO anon, authenticated;
