
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS odometer_start_km numeric,
  ADD COLUMN IF NOT EXISTS odometer_end_km numeric;
