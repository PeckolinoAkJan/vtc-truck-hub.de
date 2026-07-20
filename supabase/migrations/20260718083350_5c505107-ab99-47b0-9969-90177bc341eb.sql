
-- Trial + demo support on vtcs (additive only)
ALTER TABLE public.vtcs
  ADD COLUMN IF NOT EXISTS trial_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Backfill trial fields for existing VTCs (14-day window from creation)
UPDATE public.vtcs
SET trial_starts_at = COALESCE(trial_starts_at, created_at),
    trial_ends_at   = COALESCE(trial_ends_at, created_at + INTERVAL '14 days')
WHERE trial_starts_at IS NULL OR trial_ends_at IS NULL;

-- Set trial window on new VTCs by default
CREATE OR REPLACE FUNCTION public.set_default_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.trial_starts_at IS NULL THEN
    NEW.trial_starts_at := COALESCE(NEW.created_at, now());
  END IF;
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NEW.trial_starts_at + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vtcs_set_default_trial ON public.vtcs;
CREATE TRIGGER vtcs_set_default_trial
  BEFORE INSERT ON public.vtcs
  FOR EACH ROW EXECUTE FUNCTION public.set_default_trial();

-- Ensure anon can still SELECT public vtc fields (already granted historically; keep idempotent)
GRANT SELECT ON public.vtcs TO anon;
