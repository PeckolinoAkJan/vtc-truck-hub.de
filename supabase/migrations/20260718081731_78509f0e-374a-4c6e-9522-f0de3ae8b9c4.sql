
-- === vehicle_details: Erweiterte Fahrzeugdaten (Sidecar zu vehicles) ===
CREATE TABLE public.vehicle_details (
  vehicle_id UUID PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  year INTEGER,
  color TEXT,
  vehicle_code TEXT,
  engine_hp INTEGER,
  engine_torque_nm INTEGER,
  gearbox TEXT,
  cylinders INTEGER,
  axles INTEGER,
  fuel_tank_l INTEGER,
  odometer_km NUMERIC(12,2) DEFAULT 0,
  fuel_level_pct NUMERIC(5,2),
  location TEXT,
  game TEXT CHECK (game IS NULL OR game IN ('ets2','ats')),
  dlc TEXT[] DEFAULT ARRAY[]::TEXT[],
  image_url TEXT,
  notes TEXT,
  purchase_price NUMERIC(12,2),
  purchase_date DATE,
  reserved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reserved_until TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_details_vtc_idx ON public.vehicle_details(vtc_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_details TO authenticated;
GRANT ALL ON public.vehicle_details TO service_role;
ALTER TABLE public.vehicle_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_vehicle_details" ON public.vehicle_details FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vehicle_details.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "staff_manage_vehicle_details" ON public.vehicle_details FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

CREATE TRIGGER trg_vehicle_details_updated_at BEFORE UPDATE ON public.vehicle_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === vehicle_condition: Komponenten-Zustand (0-100 %) ===
CREATE TABLE public.vehicle_condition (
  vehicle_id UUID PRIMARY KEY REFERENCES public.vehicles(id) ON DELETE CASCADE,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  engine_pct NUMERIC(5,2) DEFAULT 100 CHECK (engine_pct BETWEEN 0 AND 100),
  gearbox_pct NUMERIC(5,2) DEFAULT 100 CHECK (gearbox_pct BETWEEN 0 AND 100),
  brakes_pct NUMERIC(5,2) DEFAULT 100 CHECK (brakes_pct BETWEEN 0 AND 100),
  tires_pct NUMERIC(5,2) DEFAULT 100 CHECK (tires_pct BETWEEN 0 AND 100),
  chassis_pct NUMERIC(5,2) DEFAULT 100 CHECK (chassis_pct BETWEEN 0 AND 100),
  body_pct NUMERIC(5,2) DEFAULT 100 CHECK (body_pct BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_condition_vtc_idx ON public.vehicle_condition(vtc_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_condition TO authenticated;
GRANT ALL ON public.vehicle_condition TO service_role;
ALTER TABLE public.vehicle_condition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_vehicle_condition" ON public.vehicle_condition FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vehicle_condition.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "staff_manage_vehicle_condition" ON public.vehicle_condition FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));
CREATE TRIGGER trg_vehicle_condition_updated_at BEFORE UPDATE ON public.vehicle_condition
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === vehicle_maintenance_schedule: Wartungsintervalle & Fälligkeiten ===
CREATE TABLE public.vehicle_maintenance_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('oil','inspection','brakes','tires','tuv','ac','other')),
  interval_km NUMERIC(12,2),
  interval_days INTEGER,
  last_service_km NUMERIC(12,2),
  last_service_at TIMESTAMPTZ,
  next_due_km NUMERIC(12,2),
  next_due_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, kind)
);
CREATE INDEX vehicle_maint_vtc_idx ON public.vehicle_maintenance_schedule(vtc_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_maintenance_schedule TO authenticated;
GRANT ALL ON public.vehicle_maintenance_schedule TO service_role;
ALTER TABLE public.vehicle_maintenance_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_vehicle_maint" ON public.vehicle_maintenance_schedule FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vehicle_maintenance_schedule.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "staff_manage_vehicle_maint" ON public.vehicle_maintenance_schedule FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));
CREATE TRIGGER trg_vehicle_maint_updated_at BEFORE UPDATE ON public.vehicle_maintenance_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === vehicle_history: Ereignis-Log ===
CREATE TABLE public.vehicle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('assigned','released','reserved','driver_changed','fuel','service','repair','damage','status_changed','odometer','note','created','retired')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  odometer_km NUMERIC(12,2),
  cost NUMERIC(12,2),
  description TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_history_vehicle_idx ON public.vehicle_history(vehicle_id, created_at DESC);
CREATE INDEX vehicle_history_vtc_idx ON public.vehicle_history(vtc_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_history TO authenticated;
GRANT ALL ON public.vehicle_history TO service_role;
ALTER TABLE public.vehicle_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_vehicle_history" ON public.vehicle_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vehicle_history.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "staff_write_vehicle_history" ON public.vehicle_history FOR INSERT TO authenticated
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

-- === vehicle_documents: Dokumente je Fahrzeug ===
CREATE TABLE public.vehicle_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('tuv','insurance','lease','purchase','maintenance','image','other')),
  title TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_documents_vehicle_idx ON public.vehicle_documents(vehicle_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_documents TO authenticated;
GRANT ALL ON public.vehicle_documents TO service_role;
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_read_vehicle_docs" ON public.vehicle_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vehicle_documents.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "staff_manage_vehicle_docs" ON public.vehicle_documents FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

-- === Storage Policies für vehicle-media Bucket ===
CREATE POLICY "vehicle_media_read_members" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-media' AND EXISTS (
    SELECT 1 FROM public.vtc_members m
    WHERE m.user_id = auth.uid() AND m.vtc_id::text = split_part(name, '/', 1)
  ));
CREATE POLICY "vehicle_media_write_staff" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-media' AND private.has_vtc_role(auth.uid(), split_part(name,'/',1)::uuid, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));
CREATE POLICY "vehicle_media_update_staff" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-media' AND private.has_vtc_role(auth.uid(), split_part(name,'/',1)::uuid, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));
CREATE POLICY "vehicle_media_delete_staff" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-media' AND private.has_vtc_role(auth.uid(), split_part(name,'/',1)::uuid, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));
