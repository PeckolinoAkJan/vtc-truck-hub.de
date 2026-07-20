UPDATE public.global_stats
   SET active_drivers = (SELECT count(DISTINCT driver_id) FROM public.jobs WHERE status = 'approved'),
       active_jobs = (SELECT count(*) FROM public.jobs WHERE status = 'approved'),
       total_revenue = (SELECT COALESCE(sum(revenue), 0) FROM public.jobs WHERE status = 'approved'),
       total_profit = (SELECT COALESCE(sum(revenue - fuel_cost), 0) FROM public.jobs WHERE status = 'approved'),
       total_jobs = (SELECT count(*) FROM public.jobs WHERE status = 'approved'),
       total_km = (SELECT COALESCE(sum(distance_km), 0) FROM public.jobs WHERE status = 'approved'),
       updated_at = now()
 WHERE id = 1;

CREATE OR REPLACE FUNCTION public.refresh_global_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.global_stats
     SET total_jobs = (SELECT count(*) FROM public.jobs WHERE status = 'approved'),
         total_km = (SELECT COALESCE(sum(distance_km), 0) FROM public.jobs WHERE status = 'approved'),
         active_drivers = (SELECT count(DISTINCT driver_id) FROM public.jobs WHERE status = 'approved'),
         active_jobs = (SELECT count(*) FROM public.jobs WHERE status = 'approved'),
         total_revenue = (SELECT COALESCE(sum(revenue), 0) FROM public.jobs WHERE status = 'approved'),
         total_profit = (SELECT COALESCE(sum(revenue - fuel_cost), 0) FROM public.jobs WHERE status = 'approved'),
         updated_at = now()
   WHERE id = 1;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_global_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_global_stats() FROM anon, authenticated;
GRANT ALL ON FUNCTION public.refresh_global_stats() TO service_role;
