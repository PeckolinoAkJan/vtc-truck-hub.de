
ALTER TABLE public.vtc_events
  ADD COLUMN IF NOT EXISTS game text DEFAULT 'ets2',
  ADD COLUMN IF NOT EXISTS server text,
  ADD COLUMN IF NOT EXISTS voice_server text,
  ADD COLUMN IF NOT EXISTS difficulty text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS discord_link text,
  ADD COLUMN IF NOT EXISTS route_link text,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS registration_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS dlc_requirements text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.vtc_events ADD CONSTRAINT vtc_events_game_check CHECK (game IN ('ets2','ats'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.vtc_events ADD CONSTRAINT vtc_events_difficulty_check CHECK (difficulty IN ('easy','normal','hard','expert'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;

ALTER TABLE public.vtc_event_participants
  ADD COLUMN IF NOT EXISTS rsvp text DEFAULT 'going',
  ADD COLUMN IF NOT EXISTS convoy_role text DEFAULT 'driver',
  ADD COLUMN IF NOT EXISTS notes text;

DO $$ BEGIN
  ALTER TABLE public.vtc_event_participants ADD CONSTRAINT vtc_event_participants_rsvp_check CHECK (rsvp IN ('going','maybe','declined','waitlist'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.vtc_event_participants ADD CONSTRAINT vtc_event_participants_role_check CHECK (convoy_role IN ('driver','lead_driver','tail_driver','scout','convoy_control','event_manager','media_team','moderator'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;

-- Stops
CREATE TABLE IF NOT EXISTS public.vtc_event_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.vtc_events(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  name text NOT NULL,
  kind text DEFAULT 'waypoint' CHECK (kind IN ('waypoint','rest','fuel','finish')),
  arrive_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_event_stops TO authenticated;
GRANT ALL ON public.vtc_event_stops TO service_role;
ALTER TABLE public.vtc_event_stops ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "stops_select" ON public.vtc_event_stops FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vtc_events e WHERE e.id = event_id AND (
    e.visibility = 'public'
    OR EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = e.vtc_id AND m.user_id = auth.uid())
  ))
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "stops_manage" ON public.vtc_event_stops FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vtc_events e JOIN public.vtc_members m ON m.vtc_id = e.vtc_id AND m.user_id = auth.uid()
    WHERE e.id = event_id AND m.role IN ('owner','admin','dispatcher'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.vtc_events e JOIN public.vtc_members m ON m.vtc_id = e.vtc_id AND m.user_id = auth.uid()
    WHERE e.id = event_id AND m.role IN ('owner','admin','dispatcher'))
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Media
CREATE TABLE IF NOT EXISTS public.vtc_event_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.vtc_events(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  caption text,
  kind text DEFAULT 'screenshot' CHECK (kind IN ('screenshot','replay','video','other')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_event_media TO authenticated;
GRANT ALL ON public.vtc_event_media TO service_role;
ALTER TABLE public.vtc_event_media ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "media_select" ON public.vtc_event_media FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vtc_events e WHERE e.id = event_id AND (
    e.visibility = 'public'
    OR EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = e.vtc_id AND m.user_id = auth.uid())
  ))
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "media_insert" ON public.vtc_event_media FOR INSERT TO authenticated WITH CHECK (
  uploaded_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.vtc_events e JOIN public.vtc_members m ON m.vtc_id = e.vtc_id AND m.user_id = auth.uid() WHERE e.id = event_id
  )
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "media_delete" ON public.vtc_event_media FOR DELETE TO authenticated USING (
  uploaded_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.vtc_events e JOIN public.vtc_members m ON m.vtc_id = e.vtc_id AND m.user_id = auth.uid()
    WHERE e.id = event_id AND m.role IN ('owner','admin','dispatcher')
  )
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Feedback
CREATE TABLE IF NOT EXISTS public.vtc_event_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.vtc_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_event_feedback TO authenticated;
GRANT ALL ON public.vtc_event_feedback TO service_role;
ALTER TABLE public.vtc_event_feedback ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "feedback_select" ON public.vtc_event_feedback FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.vtc_events e WHERE e.id = event_id AND (
    e.visibility = 'public'
    OR EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = e.vtc_id AND m.user_id = auth.uid())
  ))
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "feedback_manage_own" ON public.vtc_event_feedback FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reminders
CREATE TABLE IF NOT EXISTS public.vtc_event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.vtc_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offset_minutes int NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id, offset_minutes)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_event_reminders TO authenticated;
GRANT ALL ON public.vtc_event_reminders TO service_role;
ALTER TABLE public.vtc_event_reminders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "reminders_manage_own" ON public.vtc_event_reminders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage policies for event-banners bucket
DO $$ BEGIN
  CREATE POLICY "event_banners_read_members" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'event-banners'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "event_banners_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'event-banners' AND owner = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "event_banners_delete_owner" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id = 'event-banners' AND owner = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
