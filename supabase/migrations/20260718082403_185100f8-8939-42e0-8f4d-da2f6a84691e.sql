
-- ============ RANKS ============
CREATE TABLE public.vtc_career_ranks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  sort INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  min_xp INT NOT NULL DEFAULT 0,
  max_xp INT,
  icon TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.vtc_career_ranks (vtc_id, sort);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_career_ranks TO authenticated;
GRANT ALL ON public.vtc_career_ranks TO service_role;
ALTER TABLE public.vtc_career_ranks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_ranks_read" ON public.vtc_career_ranks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_career_ranks.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "career_ranks_write" ON public.vtc_career_ranks FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]));

-- ============ XP RULES ============
CREATE TABLE public.vtc_career_xp_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  label TEXT NOT NULL,
  xp_amount INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vtc_id, rule_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_career_xp_rules TO authenticated;
GRANT ALL ON public.vtc_career_xp_rules TO service_role;
ALTER TABLE public.vtc_career_xp_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_xp_rules_read" ON public.vtc_career_xp_rules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_career_xp_rules.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "career_xp_rules_write" ON public.vtc_career_xp_rules FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]));

-- ============ BADGES ============
CREATE TABLE public.vtc_career_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  rarity TEXT NOT NULL DEFAULT 'common',
  category TEXT,
  metric TEXT NOT NULL,
  threshold NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vtc_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_career_badges TO authenticated;
GRANT ALL ON public.vtc_career_badges TO service_role;
ALTER TABLE public.vtc_career_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_badges_read" ON public.vtc_career_badges FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_career_badges.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "career_badges_write" ON public.vtc_career_badges FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]));

-- ============ ACHIEVEMENTS ============
CREATE TABLE public.vtc_career_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  rarity TEXT NOT NULL DEFAULT 'common',
  category TEXT,
  metric TEXT NOT NULL,
  threshold NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vtc_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_career_achievements TO authenticated;
GRANT ALL ON public.vtc_career_achievements TO service_role;
ALTER TABLE public.vtc_career_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_ach_read" ON public.vtc_career_achievements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_career_achievements.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "career_ach_write" ON public.vtc_career_achievements FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]));

-- ============ GOALS ============
CREATE TABLE public.vtc_career_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly','season')),
  name TEXT NOT NULL,
  description TEXT,
  metric TEXT NOT NULL,
  target NUMERIC NOT NULL,
  xp_reward INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_career_goals TO authenticated;
GRANT ALL ON public.vtc_career_goals TO service_role;
ALTER TABLE public.vtc_career_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_goals_read" ON public.vtc_career_goals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_career_goals.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "career_goals_write" ON public.vtc_career_goals FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]));

-- ============ SEASONS ============
CREATE TABLE public.vtc_career_seasons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('upcoming','active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_career_seasons TO authenticated;
GRANT ALL ON public.vtc_career_seasons TO service_role;
ALTER TABLE public.vtc_career_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_seasons_read" ON public.vtc_career_seasons FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_career_seasons.vtc_id AND m.user_id = auth.uid()));
CREATE POLICY "career_seasons_write" ON public.vtc_career_seasons FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role]));

-- ============ HISTORY ============
CREATE TABLE public.vtc_career_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtc_id UUID NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.vtc_career_history (vtc_id, user_id, created_at DESC);
GRANT SELECT ON public.vtc_career_history TO authenticated;
GRANT ALL ON public.vtc_career_history TO service_role;
ALTER TABLE public.vtc_career_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_history_read_self_or_admin" ON public.vtc_career_history FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role])
  );

-- ============ updated_at triggers ============
CREATE TRIGGER trg_career_ranks_updated BEFORE UPDATE ON public.vtc_career_ranks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_career_xp_rules_updated BEFORE UPDATE ON public.vtc_career_xp_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_career_badges_updated BEFORE UPDATE ON public.vtc_career_badges FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_career_ach_updated BEFORE UPDATE ON public.vtc_career_achievements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_career_goals_updated BEFORE UPDATE ON public.vtc_career_goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_career_seasons_updated BEFORE UPDATE ON public.vtc_career_seasons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
