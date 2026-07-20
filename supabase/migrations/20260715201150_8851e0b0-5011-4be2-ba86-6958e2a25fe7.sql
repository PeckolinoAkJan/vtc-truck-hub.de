
-- Live telemetry table (latest position/state per driver)
CREATE TABLE public.telemetry_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  truck_model TEXT,
  speed_kmh NUMERIC(6,2),
  position_x NUMERIC(12,3),
  position_y NUMERIC(12,3),
  position_z NUMERIC(12,3),
  heading NUMERIC(6,3),
  fuel NUMERIC(8,2),
  fuel_capacity NUMERIC(8,2),
  cargo TEXT,
  cargo_mass_kg NUMERIC(12,2),
  source_city TEXT,
  dest_city TEXT,
  job_distance_km NUMERIC(10,2),
  job_remaining_km NUMERIC(10,2),
  damage_pct NUMERIC(5,2),
  game TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vtc_id, driver_id)
);

CREATE INDEX telemetry_data_vtc_updated_idx ON public.telemetry_data (vtc_id, updated_at DESC);

GRANT SELECT ON public.telemetry_data TO authenticated;
GRANT ALL ON public.telemetry_data TO service_role;

ALTER TABLE public.telemetry_data ENABLE ROW LEVEL SECURITY;

-- Members of the VTC can read live telemetry for their VTC
CREATE POLICY "Members can read vtc telemetry"
  ON public.telemetry_data FOR SELECT
  TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role,'driver'::public.vtc_role]));

-- updated_at trigger (function public.set_updated_at already exists)
CREATE TRIGGER telemetry_data_set_updated_at
  BEFORE UPDATE ON public.telemetry_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable realtime
ALTER TABLE public.telemetry_data REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_data;
