
-- 1) Remove publicly executable SECURITY DEFINER function
DROP FUNCTION IF EXISTS public.get_global_stats();

-- 2) Stats table (readable by everyone, writable only via trigger/service role)
CREATE TABLE IF NOT EXISTS public.global_stats (
  id smallint PRIMARY KEY DEFAULT 1,
  total_jobs bigint NOT NULL DEFAULT 0,
  total_km numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_stats_single_row CHECK (id = 1)
);

GRANT SELECT ON public.global_stats TO anon, authenticated;
GRANT ALL ON public.global_stats TO service_role;

ALTER TABLE public.global_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "global_stats readable by all" ON public.global_stats;
CREATE POLICY "global_stats readable by all"
  ON public.global_stats FOR SELECT
  TO anon, authenticated
  USING (true);

-- Seed the single row with current values
INSERT INTO public.global_stats (id, total_jobs, total_km)
VALUES (
  1,
  (SELECT count(*) FROM public.jobs WHERE status = 'approved'),
  (SELECT COALESCE(sum(distance_km), 0) FROM public.jobs WHERE status = 'approved')
)
ON CONFLICT (id) DO UPDATE SET
  total_jobs = EXCLUDED.total_jobs,
  total_km = EXCLUDED.total_km,
  updated_at = now();

-- 3) Trigger keeps stats fresh (not directly callable by anon/authenticated)
CREATE OR REPLACE FUNCTION public.refresh_global_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.global_stats
     SET total_jobs = (SELECT count(*) FROM public.jobs WHERE status = 'approved'),
         total_km   = (SELECT COALESCE(sum(distance_km), 0) FROM public.jobs WHERE status = 'approved'),
         updated_at = now()
   WHERE id = 1;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_global_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_global_stats() FROM anon, authenticated;

DROP TRIGGER IF EXISTS jobs_refresh_stats_ins ON public.jobs;
DROP TRIGGER IF EXISTS jobs_refresh_stats_upd ON public.jobs;
DROP TRIGGER IF EXISTS jobs_refresh_stats_del ON public.jobs;

CREATE TRIGGER jobs_refresh_stats_ins
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION public.refresh_global_stats();

CREATE TRIGGER jobs_refresh_stats_upd
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.distance_km IS DISTINCT FROM NEW.distance_km)
  EXECUTE FUNCTION public.refresh_global_stats();

CREATE TRIGGER jobs_refresh_stats_del
  AFTER DELETE ON public.jobs
  FOR EACH ROW
  WHEN (OLD.status = 'approved')
  EXECUTE FUNCTION public.refresh_global_stats();

-- 4) Restrict pay_driver_jobs to service_role only; server function now verifies caller and invokes with admin client
REVOKE EXECUTE ON FUNCTION public.pay_driver_jobs(uuid, uuid, numeric, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pay_driver_jobs(uuid, uuid, numeric, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_driver_jobs(uuid, uuid, numeric, uuid[]) TO service_role;
