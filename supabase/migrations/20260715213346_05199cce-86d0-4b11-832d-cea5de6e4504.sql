-- Extend telemetry_data with fuel, damage, driving time, truck info
ALTER TABLE public.telemetry_data
  ADD COLUMN IF NOT EXISTS vehicle_id uuid,
  ADD COLUMN IF NOT EXISTS fuel_level numeric,
  ADD COLUMN IF NOT EXISTS fuel_capacity numeric,
  ADD COLUMN IF NOT EXISTS fuel_consumption_avg numeric,
  ADD COLUMN IF NOT EXISTS damage_cabin numeric,
  ADD COLUMN IF NOT EXISTS damage_chassis numeric,
  ADD COLUMN IF NOT EXISTS damage_engine numeric,
  ADD COLUMN IF NOT EXISTS damage_transmission numeric,
  ADD COLUMN IF NOT EXISTS damage_wheels numeric,
  ADD COLUMN IF NOT EXISTS driving_time_today_min integer,
  ADD COLUMN IF NOT EXISTS rest_time_remaining_min integer,
  ADD COLUMN IF NOT EXISTS truck_brand text,
  ADD COLUMN IF NOT EXISTS truck_plate text;

-- Vehicles table
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  model text,
  plate text,
  status text NOT NULL DEFAULT 'idle',
  current_driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vtc_id, plate)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read vehicles of their VTC"
  ON public.vehicles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vtc_members m
    WHERE m.vtc_id = vehicles.vtc_id AND m.user_id = auth.uid()
  ));

CREATE POLICY "Owners/admins can manage vehicles"
  ON public.vehicles FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vtc_members m
    WHERE m.vtc_id = vehicles.vtc_id AND m.user_id = auth.uid()
      AND m.role IN ('owner'::public.vtc_role,'admin'::public.vtc_role)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vtc_members m
    WHERE m.vtc_id = vehicles.vtc_id AND m.user_id = auth.uid()
      AND m.role IN ('owner'::public.vtc_role,'admin'::public.vtc_role)
  ));

CREATE TRIGGER vehicles_set_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable realtime for vehicles
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;