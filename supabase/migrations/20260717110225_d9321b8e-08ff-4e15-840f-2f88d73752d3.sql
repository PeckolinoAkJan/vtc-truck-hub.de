
-- Public read RPCs for landing page: VTC list, VTC public profile, leaderboards.

CREATE OR REPLACE FUNCTION public.list_public_vtcs()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  tag text,
  description text,
  logo_url text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, slug, tag, description, logo_url, created_at
    FROM public.vtcs
   ORDER BY created_at DESC
   LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.get_public_vtc(_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  tag text,
  description text,
  logo_url text,
  discord_url text,
  website_url text,
  instagram_url text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, slug, tag, description, logo_url, discord_url, website_url, instagram_url, created_at
    FROM public.vtcs
   WHERE slug = _slug
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_top_drivers(_limit int DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  total_revenue numeric,
  total_km numeric,
  total_jobs bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id,
         p.display_name,
         p.avatar_url,
         COALESCE(SUM(j.revenue), 0)::numeric AS total_revenue,
         COALESCE(SUM(j.distance_km), 0)::numeric AS total_km,
         COUNT(j.id)::bigint AS total_jobs
    FROM public.jobs j
    JOIN public.profiles p ON p.user_id = j.driver_id
   WHERE j.status = 'approved'
   GROUP BY p.user_id, p.display_name, p.avatar_url
   ORDER BY total_revenue DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 10), 50));
$$;

CREATE OR REPLACE FUNCTION public.get_top_vtcs(_limit int DEFAULT 10)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  tag text,
  logo_url text,
  total_revenue numeric,
  total_km numeric,
  total_jobs bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id,
         v.name,
         v.slug,
         v.tag,
         v.logo_url,
         COALESCE(SUM(j.revenue), 0)::numeric AS total_revenue,
         COALESCE(SUM(j.distance_km), 0)::numeric AS total_km,
         COUNT(j.id)::bigint AS total_jobs
    FROM public.vtcs v
    LEFT JOIN public.jobs j ON j.vtc_id = v.id AND j.status = 'approved'
   GROUP BY v.id, v.name, v.slug, v.tag, v.logo_url
   ORDER BY total_revenue DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 10), 50));
$$;

REVOKE ALL ON FUNCTION public.list_public_vtcs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_vtc(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_top_drivers(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_top_vtcs(int) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_public_vtcs() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_vtc(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_drivers(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_vtcs(int) TO anon, authenticated;
