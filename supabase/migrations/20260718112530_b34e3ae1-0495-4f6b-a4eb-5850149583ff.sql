
-- Postgres: column-level REVOKE has no effect while the role holds table-level SELECT.
-- Drop table-level SELECT and re-grant only the safe columns explicitly.

REVOKE SELECT ON public.profiles FROM anon, authenticated, PUBLIC;
GRANT SELECT (user_id, display_name, avatar_url, steam_id, created_at, updated_at, real_name, discord_id)
  ON public.profiles TO authenticated;

REVOKE SELECT ON public.vtcs FROM anon, authenticated, PUBLIC;
GRANT SELECT (id, name, slug, tag, description, logo_url, created_by, created_at, updated_at,
              discord_url, website_url, instagram_url, trial_starts_at, trial_ends_at, trial_status, plan, is_demo)
  ON public.vtcs TO authenticated;
