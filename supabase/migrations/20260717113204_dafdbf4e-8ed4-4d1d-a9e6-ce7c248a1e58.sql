
-- 1. Vehicles: unique key for auto-upsert per (vtc, plate)
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vtc_plate_uidx
  ON public.vehicles (vtc_id, plate) WHERE plate IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vtc_name_uidx
  ON public.vehicles (vtc_id, lower(name)) WHERE plate IS NULL;

-- 2. Events / Convoys
CREATE TABLE IF NOT EXISTS public.vtc_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  meeting_point text NOT NULL,
  destination text NOT NULL,
  max_participants integer,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','members')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','closed','cancelled','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_events TO authenticated;
GRANT SELECT ON public.vtc_events TO anon;
GRANT ALL ON public.vtc_events TO service_role;

ALTER TABLE public.vtc_events ENABLE ROW LEVEL SECURITY;

-- Public can read public events (for showcase on public VTC page).
CREATE POLICY "public read public events"
  ON public.vtc_events FOR SELECT
  TO anon, authenticated
  USING (visibility = 'public');

-- Members of VTC can read all their VTC events.
CREATE POLICY "members read own vtc events"
  ON public.vtc_events FOR SELECT
  TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role,'driver'::public.vtc_role]));

-- Owner/admin/dispatcher can create.
CREATE POLICY "staff insert events"
  ON public.vtc_events FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role])
  );

CREATE POLICY "staff update events"
  ON public.vtc_events FOR UPDATE
  TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

CREATE POLICY "staff delete events"
  ON public.vtc_events FOR DELETE
  TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]));

CREATE TRIGGER vtc_events_updated_at
  BEFORE UPDATE ON public.vtc_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Event participants
CREATE TABLE IF NOT EXISTS public.vtc_event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.vtc_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.vtc_event_participants TO authenticated;
GRANT SELECT ON public.vtc_event_participants TO anon;
GRANT ALL ON public.vtc_event_participants TO service_role;

ALTER TABLE public.vtc_event_participants ENABLE ROW LEVEL SECURITY;

-- Participants readable when the event itself is readable to the caller.
CREATE POLICY "read participants of readable events"
  ON public.vtc_event_participants FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vtc_events e
    WHERE e.id = event_id
      AND (
        e.visibility = 'public'
        OR (auth.uid() IS NOT NULL AND private.has_vtc_role(auth.uid(), e.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role,'driver'::public.vtc_role]))
      )
  ));

-- Any authenticated user can join a public event; members can join member-only events.
CREATE POLICY "join events"
  ON public.vtc_event_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.vtc_events e
      WHERE e.id = event_id
        AND e.status IN ('planned','open')
        AND (
          e.visibility = 'public'
          OR private.has_vtc_role(auth.uid(), e.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role,'driver'::public.vtc_role])
        )
    )
  );

-- Leave: user removes their own; staff can remove anyone.
CREATE POLICY "leave or manage participants"
  ON public.vtc_event_participants FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.vtc_events e
      WHERE e.id = event_id
        AND private.has_vtc_role(auth.uid(), e.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role])
    )
  );

CREATE INDEX IF NOT EXISTS vtc_events_vtc_starts_idx ON public.vtc_events (vtc_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS vtc_event_participants_event_idx ON public.vtc_event_participants (event_id);
