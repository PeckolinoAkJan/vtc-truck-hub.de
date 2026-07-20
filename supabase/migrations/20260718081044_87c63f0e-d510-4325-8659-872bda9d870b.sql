
-- Enums
DO $$ BEGIN
  CREATE TYPE public.vtc_service_type AS ENUM ('oil','tires','tuv','brakes','inspection','engine','gearbox','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vtc_insurance_status AS ENUM ('none','pending','approved','denied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vtc_damage_work_status AS ENUM ('open','in_progress','done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fuel logs
CREATE TABLE public.vtc_fuel_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  game text,
  liters numeric(10,2) NOT NULL,
  price_per_liter numeric(10,3) NOT NULL,
  total_cost numeric(12,2) NOT NULL,
  fuel_level_pct numeric(5,2),
  odometer_km numeric(12,1),
  station text,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.vtc_fuel_logs(vtc_id, occurred_at DESC);
CREATE INDEX ON public.vtc_fuel_logs(driver_id);
CREATE INDEX ON public.vtc_fuel_logs(vehicle_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_fuel_logs TO authenticated;
GRANT ALL ON public.vtc_fuel_logs TO service_role;
ALTER TABLE public.vtc_fuel_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_logs_select_members" ON public.vtc_fuel_logs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_fuel_logs.vtc_id AND m.user_id = auth.uid()));

CREATE POLICY "fuel_logs_insert_members" ON public.vtc_fuel_logs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_fuel_logs.vtc_id AND m.user_id = auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "fuel_logs_update_staff" ON public.vtc_fuel_logs FOR UPDATE TO authenticated
USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))
WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

CREATE POLICY "fuel_logs_delete_staff" ON public.vtc_fuel_logs FOR DELETE TO authenticated
USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

CREATE TRIGGER trg_fuel_logs_updated BEFORE UPDATE ON public.vtc_fuel_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Service logs
CREATE TABLE public.vtc_service_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  service_type public.vtc_service_type NOT NULL,
  workshop text,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  odometer_km numeric(12,1),
  responsible_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.vtc_service_logs(vtc_id, occurred_at DESC);
CREATE INDEX ON public.vtc_service_logs(vehicle_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_service_logs TO authenticated;
GRANT ALL ON public.vtc_service_logs TO service_role;
ALTER TABLE public.vtc_service_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_logs_select_members" ON public.vtc_service_logs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_service_logs.vtc_id AND m.user_id = auth.uid()));

CREATE POLICY "service_logs_insert_members" ON public.vtc_service_logs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_service_logs.vtc_id AND m.user_id = auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "service_logs_update_staff" ON public.vtc_service_logs FOR UPDATE TO authenticated
USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))
WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

CREATE POLICY "service_logs_delete_staff" ON public.vtc_service_logs FOR DELETE TO authenticated
USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

CREATE TRIGGER trg_service_logs_updated BEFORE UPDATE ON public.vtc_service_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Damage logs
CREATE TABLE public.vtc_damage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  damage_type text NOT NULL,
  damage_pct numeric(5,2),
  repair_cost numeric(12,2) NOT NULL DEFAULT 0,
  cause text,
  screenshot_url text,
  insurance_status public.vtc_insurance_status NOT NULL DEFAULT 'none',
  work_status public.vtc_damage_work_status NOT NULL DEFAULT 'open',
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.vtc_damage_logs(vtc_id, occurred_at DESC);
CREATE INDEX ON public.vtc_damage_logs(vehicle_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_damage_logs TO authenticated;
GRANT ALL ON public.vtc_damage_logs TO service_role;
ALTER TABLE public.vtc_damage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "damage_logs_select_members" ON public.vtc_damage_logs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_damage_logs.vtc_id AND m.user_id = auth.uid()));

CREATE POLICY "damage_logs_insert_members" ON public.vtc_damage_logs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_damage_logs.vtc_id AND m.user_id = auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "damage_logs_update_staff" ON public.vtc_damage_logs FOR UPDATE TO authenticated
USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))
WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

CREATE POLICY "damage_logs_delete_staff" ON public.vtc_damage_logs FOR DELETE TO authenticated
USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

CREATE TRIGGER trg_damage_logs_updated BEFORE UPDATE ON public.vtc_damage_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cost settings (one row per vtc)
CREATE TABLE public.vtc_cost_settings (
  vtc_id uuid PRIMARY KEY REFERENCES public.vtcs(id) ON DELETE CASCADE,
  default_fuel_price numeric(10,3) NOT NULL DEFAULT 1.82,
  oil_interval_km integer NOT NULL DEFAULT 50000,
  tire_interval_km integer NOT NULL DEFAULT 120000,
  inspection_interval_km integer NOT NULL DEFAULT 100000,
  brake_interval_km integer NOT NULL DEFAULT 80000,
  tuv_interval_days integer NOT NULL DEFAULT 365,
  damage_rate_per_pct numeric(10,2) NOT NULL DEFAULT 100,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  notifications_enabled boolean NOT NULL DEFAULT true,
  notify_oil boolean NOT NULL DEFAULT true,
  notify_tires boolean NOT NULL DEFAULT true,
  notify_inspection boolean NOT NULL DEFAULT true,
  notify_brakes boolean NOT NULL DEFAULT true,
  notify_tuv boolean NOT NULL DEFAULT true,
  notify_high_consumption boolean NOT NULL DEFAULT true,
  notify_high_repair boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_cost_settings TO authenticated;
GRANT ALL ON public.vtc_cost_settings TO service_role;
ALTER TABLE public.vtc_cost_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_settings_select_members" ON public.vtc_cost_settings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_cost_settings.vtc_id AND m.user_id = auth.uid()));

CREATE POLICY "cost_settings_manage_staff" ON public.vtc_cost_settings FOR ALL TO authenticated
USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]))
WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]));

CREATE TRIGGER trg_cost_settings_updated BEFORE UPDATE ON public.vtc_cost_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
