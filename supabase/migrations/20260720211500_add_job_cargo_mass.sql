ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS cargo_mass_kg numeric(12,2);

COMMENT ON COLUMN public.jobs.cargo_mass_kg IS
  'Cargo weight captured by the desktop telemetry client and persisted for completed jobs.';
