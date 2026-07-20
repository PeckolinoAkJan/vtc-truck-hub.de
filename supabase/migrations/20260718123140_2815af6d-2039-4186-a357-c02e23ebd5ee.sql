
-- =========================================================
-- SECURITY HARDENING: move client_key & api_key to dedicated
-- secret tables that are unreachable via the Data API.
-- =========================================================

-- 1) profile_secrets ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_secrets (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_key  text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  rotated_at  timestamptz
);

REVOKE ALL ON public.profile_secrets FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.profile_secrets TO service_role;

ALTER TABLE public.profile_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: authenticated/anon cannot read/write.
-- All access flows through server functions using the service role.

CREATE TRIGGER profile_secrets_set_updated_at
BEFORE UPDATE ON public.profile_secrets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) vtc_secrets ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vtc_secrets (
  vtc_id      uuid PRIMARY KEY REFERENCES public.vtcs(id) ON DELETE CASCADE,
  api_key     text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  rotated_at  timestamptz
);

REVOKE ALL ON public.vtc_secrets FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.vtc_secrets TO service_role;

ALTER TABLE public.vtc_secrets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER vtc_secrets_set_updated_at
BEFORE UPDATE ON public.vtc_secrets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Copy existing secrets -----------------------------------------
INSERT INTO public.profile_secrets (user_id, client_key)
SELECT user_id, client_key FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.vtc_secrets (vtc_id, api_key)
SELECT id, api_key FROM public.vtcs
ON CONFLICT (vtc_id) DO NOTHING;

-- Verify no losses
DO $$
DECLARE p_missing int; v_missing int;
BEGIN
  SELECT count(*) INTO p_missing FROM public.profiles p
    LEFT JOIN public.profile_secrets s ON s.user_id = p.user_id
    WHERE s.user_id IS NULL;
  SELECT count(*) INTO v_missing FROM public.vtcs v
    LEFT JOIN public.vtc_secrets s ON s.vtc_id = v.id
    WHERE s.vtc_id IS NULL;
  IF p_missing > 0 OR v_missing > 0 THEN
    RAISE EXCEPTION 'Secret migration incomplete: % profiles / % vtcs missing', p_missing, v_missing;
  END IF;
END $$;

-- 4) Auto-provision on new profile/vtc ------------------------------
CREATE OR REPLACE FUNCTION public.provision_profile_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile_secrets (user_id)
  VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER profiles_provision_secret
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.provision_profile_secret();

CREATE OR REPLACE FUNCTION public.provision_vtc_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vtc_secrets (vtc_id)
  VALUES (NEW.id)
  ON CONFLICT (vtc_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER vtcs_provision_secret
AFTER INSERT ON public.vtcs
FOR EACH ROW EXECUTE FUNCTION public.provision_vtc_secret();

-- 5) Drop the old secret columns from primary tables ----------------
-- Column-level grants already excluded these, but the columns still
-- lived on rows readable by other members. Removing the columns
-- eliminates the exposure entirely.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS client_key;
ALTER TABLE public.vtcs     DROP COLUMN IF EXISTS api_key;

-- 6) Ensure secret tables are not exposed via Realtime --------------
-- (No ALTER PUBLICATION ADD was ever issued, but be explicit.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname='supabase_realtime' AND schemaname='public'
             AND tablename IN ('profile_secrets','vtc_secrets')) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.profile_secrets, public.vtc_secrets';
  END IF;
END $$;
