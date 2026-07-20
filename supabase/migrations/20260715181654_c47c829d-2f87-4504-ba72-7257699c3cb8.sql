
-- Enums
CREATE TYPE public.vtc_role AS ENUM ('owner','admin','dispatcher','driver');
CREATE TYPE public.job_status AS ENUM ('submitted','approved','rejected');
CREATE TYPE public.game_type AS ENUM ('ets2','ats','other');

-- profiles
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  steam_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- vtcs
CREATE TABLE public.vtcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  tag text NOT NULL,
  description text,
  logo_url text,
  api_key text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtcs TO authenticated;
GRANT ALL ON public.vtcs TO service_role;
ALTER TABLE public.vtcs ENABLE ROW LEVEL SECURITY;

-- vtc_members
CREATE TABLE public.vtc_members (
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.vtc_role NOT NULL DEFAULT 'driver',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vtc_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_members TO authenticated;
GRANT ALL ON public.vtc_members TO service_role;
ALTER TABLE public.vtc_members ENABLE ROW LEVEL SECURITY;

-- security definer role check (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_vtc_member(_user uuid, _vtc uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.vtc_members WHERE user_id = _user AND vtc_id = _vtc)
$$;

CREATE OR REPLACE FUNCTION public.has_vtc_role(_user uuid, _vtc uuid, _roles public.vtc_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.vtc_members WHERE user_id = _user AND vtc_id = _vtc AND role = ANY(_roles))
$$;

-- vtcs policies
CREATE POLICY "vtcs select for members" ON public.vtcs FOR SELECT TO authenticated
  USING (public.is_vtc_member(auth.uid(), id));
CREATE POLICY "vtcs insert by any auth user" ON public.vtcs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "vtcs update by owner/admin" ON public.vtcs FOR UPDATE TO authenticated
  USING (public.has_vtc_role(auth.uid(), id, ARRAY['owner','admin']::public.vtc_role[]))
  WITH CHECK (public.has_vtc_role(auth.uid(), id, ARRAY['owner','admin']::public.vtc_role[]));
CREATE POLICY "vtcs delete by owner" ON public.vtcs FOR DELETE TO authenticated
  USING (public.has_vtc_role(auth.uid(), id, ARRAY['owner']::public.vtc_role[]));

-- Hide api_key from non-owners via view
CREATE VIEW public.vtcs_public WITH (security_invoker=on) AS
  SELECT id, name, slug, tag, description, logo_url, created_by, created_at, updated_at FROM public.vtcs;
GRANT SELECT ON public.vtcs_public TO authenticated;

-- vtc_members policies
CREATE POLICY "members select if same vtc" ON public.vtc_members FOR SELECT TO authenticated
  USING (public.is_vtc_member(auth.uid(), vtc_id));
CREATE POLICY "members insert self on join" ON public.vtc_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "members update by owner/admin" ON public.vtc_members FOR UPDATE TO authenticated
  USING (public.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner','admin']::public.vtc_role[]))
  WITH CHECK (public.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner','admin']::public.vtc_role[]));
CREATE POLICY "members delete by owner/admin or self" ON public.vtc_members FOR DELETE TO authenticated
  USING (public.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner','admin']::public.vtc_role[]) OR auth.uid() = user_id);

-- vtc_invites
CREATE TABLE public.vtc_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  role public.vtc_role NOT NULL DEFAULT 'driver',
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_invites TO authenticated;
GRANT ALL ON public.vtc_invites TO service_role;
ALTER TABLE public.vtc_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites select by members" ON public.vtc_invites FOR SELECT TO authenticated
  USING (public.is_vtc_member(auth.uid(), vtc_id));
CREATE POLICY "invites insert by owner/admin" ON public.vtc_invites FOR INSERT TO authenticated
  WITH CHECK (public.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner','admin']::public.vtc_role[]));
CREATE POLICY "invites delete by owner/admin" ON public.vtc_invites FOR DELETE TO authenticated
  USING (public.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner','admin']::public.vtc_role[]));

-- jobs
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.job_status NOT NULL DEFAULT 'submitted',
  source_city text NOT NULL,
  dest_city text NOT NULL,
  cargo text NOT NULL,
  distance_km numeric(10,2) NOT NULL DEFAULT 0,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  fuel_cost numeric(12,2) NOT NULL DEFAULT 0,
  damage_pct numeric(5,2) NOT NULL DEFAULT 0,
  game public.game_type NOT NULL DEFAULT 'ets2',
  truck text,
  started_at timestamptz,
  finished_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_vtc_idx ON public.jobs(vtc_id, submitted_at DESC);
CREATE INDEX jobs_driver_idx ON public.jobs(driver_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs select for vtc members" ON public.jobs FOR SELECT TO authenticated
  USING (public.is_vtc_member(auth.uid(), vtc_id));
CREATE POLICY "jobs insert by driver in vtc" ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = driver_id AND public.is_vtc_member(auth.uid(), vtc_id));
CREATE POLICY "jobs update by dispatch or owner-own-if-submitted" ON public.jobs FOR UPDATE TO authenticated
  USING (
    public.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner','admin','dispatcher']::public.vtc_role[])
    OR (auth.uid() = driver_id AND status = 'submitted')
  )
  WITH CHECK (
    public.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner','admin','dispatcher']::public.vtc_role[])
    OR (auth.uid() = driver_id AND status = 'submitted')
  );
CREATE POLICY "jobs delete by admin/owner" ON public.jobs FOR DELETE TO authenticated
  USING (public.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner','admin']::public.vtc_role[]));

-- telemetry_events
CREATE TABLE public.telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telemetry_vtc_idx ON public.telemetry_events(vtc_id, received_at DESC);
CREATE INDEX telemetry_job_idx ON public.telemetry_events(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemetry_events TO authenticated;
GRANT ALL ON public.telemetry_events TO service_role;
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telemetry select for vtc members" ON public.telemetry_events FOR SELECT TO authenticated
  USING (public.is_vtc_member(auth.uid(), vtc_id));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_vtcs_upd BEFORE UPDATE ON public.vtcs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_jobs_upd BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'Driver'));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
