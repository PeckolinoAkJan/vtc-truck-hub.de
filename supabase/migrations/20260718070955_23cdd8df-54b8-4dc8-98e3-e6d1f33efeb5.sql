
-- Enums
CREATE TYPE public.settlement_status AS ENUM ('draft','pending','ready','approved','paid','disputed','archived');
CREATE TYPE public.settlement_pay_model AS ENUM ('per_km','per_job','fixed','manual');
CREATE TYPE public.settlement_adjustment_kind AS ENUM ('bonus','deduction');
CREATE TYPE public.settlement_dispute_status AS ENUM ('open','answered','resolved');

-- Sequence for numbering
CREATE SEQUENCE public.settlements_seq START 1;

-- settlements
CREATE TABLE public.settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE,
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  pay_model public.settlement_pay_model NOT NULL DEFAULT 'manual',
  status public.settlement_status NOT NULL DEFAULT 'draft',
  jobs_count int NOT NULL DEFAULT 0,
  total_km numeric NOT NULL DEFAULT 0,
  base_pay numeric NOT NULL DEFAULT 0,
  bonus_total numeric NOT NULL DEFAULT 0,
  deduction_total numeric NOT NULL DEFAULT 0,
  final_amount numeric GENERATED ALWAYS AS (base_pay + bonus_total - deduction_total) STORED,
  note text,
  created_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz,
  paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlements TO authenticated;
GRANT ALL ON public.settlements TO service_role;
GRANT USAGE ON SEQUENCE public.settlements_seq TO authenticated, service_role;

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlements admin manage"
  ON public.settlements FOR ALL TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]));

CREATE POLICY "settlements driver read own"
  ON public.settlements FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

CREATE TRIGGER settlements_set_updated_at BEFORE UPDATE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Number auto-assign
CREATE OR REPLACE FUNCTION public.settlements_assign_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.number IS NULL THEN
    NEW.number := '#SET-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.settlements_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER settlements_assign_number_trg BEFORE INSERT ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.settlements_assign_number();

-- settlement_jobs
CREATE TABLE public.settlement_jobs (
  settlement_id uuid NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (settlement_id, job_id)
);
CREATE INDEX settlement_jobs_job_idx ON public.settlement_jobs(job_id);

GRANT SELECT, INSERT, DELETE ON public.settlement_jobs TO authenticated;
GRANT ALL ON public.settlement_jobs TO service_role;
ALTER TABLE public.settlement_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlement_jobs admin manage"
  ON public.settlement_jobs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id
    AND private.has_vtc_role(auth.uid(), s.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id
    AND private.has_vtc_role(auth.uid(), s.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role])));

CREATE POLICY "settlement_jobs driver read own"
  ON public.settlement_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id AND s.driver_id = auth.uid()));

-- settlement_adjustments
CREATE TABLE public.settlement_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  kind public.settlement_adjustment_kind NOT NULL,
  category text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX settlement_adjustments_settlement_idx ON public.settlement_adjustments(settlement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_adjustments TO authenticated;
GRANT ALL ON public.settlement_adjustments TO service_role;
ALTER TABLE public.settlement_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlement_adjustments admin manage"
  ON public.settlement_adjustments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id
    AND private.has_vtc_role(auth.uid(), s.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id
    AND private.has_vtc_role(auth.uid(), s.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role])));

CREATE POLICY "settlement_adjustments driver read own"
  ON public.settlement_adjustments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id AND s.driver_id = auth.uid()));

-- Aggregate totals trigger
CREATE OR REPLACE FUNCTION public.settlements_recalc_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _sid uuid;
BEGIN
  _sid := COALESCE(NEW.settlement_id, OLD.settlement_id);
  UPDATE public.settlements SET
    bonus_total = COALESCE((SELECT SUM(amount) FROM public.settlement_adjustments WHERE settlement_id = _sid AND kind='bonus'),0),
    deduction_total = COALESCE((SELECT SUM(amount) FROM public.settlement_adjustments WHERE settlement_id = _sid AND kind='deduction'),0)
  WHERE id = _sid;
  RETURN NULL;
END $$;

CREATE TRIGGER settlement_adjustments_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.settlement_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.settlements_recalc_totals();

-- settlement_disputes
CREATE TABLE public.settlement_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL,
  message text NOT NULL,
  response text,
  responded_by uuid,
  responded_at timestamptz,
  status public.settlement_dispute_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX settlement_disputes_settlement_idx ON public.settlement_disputes(settlement_id);

GRANT SELECT, INSERT, UPDATE ON public.settlement_disputes TO authenticated;
GRANT ALL ON public.settlement_disputes TO service_role;
ALTER TABLE public.settlement_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disputes admin manage"
  ON public.settlement_disputes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id
    AND private.has_vtc_role(auth.uid(), s.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id
    AND private.has_vtc_role(auth.uid(), s.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role])));

CREATE POLICY "disputes driver read own"
  ON public.settlement_disputes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id AND s.driver_id = auth.uid()));

CREATE POLICY "disputes driver open own"
  ON public.settlement_disputes FOR INSERT TO authenticated
  WITH CHECK (opened_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id AND s.driver_id = auth.uid()));

CREATE TRIGGER settlement_disputes_set_updated_at BEFORE UPDATE ON public.settlement_disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Dispute status impacts settlement
CREATE OR REPLACE FUNCTION public.settlements_update_disputed_flag()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _sid uuid; _open int;
BEGIN
  _sid := COALESCE(NEW.settlement_id, OLD.settlement_id);
  SELECT COUNT(*) INTO _open FROM public.settlement_disputes WHERE settlement_id = _sid AND status <> 'resolved';
  IF _open > 0 THEN
    UPDATE public.settlements SET status = 'disputed' WHERE id = _sid AND status <> 'paid';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER settlement_disputes_flag
  AFTER INSERT OR UPDATE ON public.settlement_disputes
  FOR EACH ROW EXECUTE FUNCTION public.settlements_update_disputed_flag();

-- settlement_activity
CREATE TABLE public.settlement_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX settlement_activity_settlement_idx ON public.settlement_activity(settlement_id, created_at DESC);

GRANT SELECT, INSERT ON public.settlement_activity TO authenticated;
GRANT ALL ON public.settlement_activity TO service_role;
ALTER TABLE public.settlement_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity read via settlement"
  ON public.settlement_activity FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id
    AND (s.driver_id = auth.uid()
      OR private.has_vtc_role(auth.uid(), s.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))));

CREATE POLICY "activity insert via settlement"
  ON public.settlement_activity FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.settlements s WHERE s.id = settlement_id
    AND (s.driver_id = auth.uid()
      OR private.has_vtc_role(auth.uid(), s.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]))));

-- Pay settlement RPC (marks jobs paid + updates balance)
CREATE OR REPLACE FUNCTION public.pay_settlement(_settlement_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.settlements%ROWTYPE; _job_ids uuid[]; _per_job numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _s FROM public.settlements WHERE id = _settlement_id FOR UPDATE;
  IF _s.id IS NULL THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF NOT private.has_vtc_role(auth.uid(), _s.vtc_id, ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _s.status = 'paid' THEN RAISE EXCEPTION 'Already paid'; END IF;
  IF _s.final_amount < 0 THEN RAISE EXCEPTION 'Negative amount'; END IF;

  SELECT ARRAY_AGG(job_id) INTO _job_ids FROM public.settlement_jobs WHERE settlement_id = _settlement_id;

  IF _job_ids IS NOT NULL AND array_length(_job_ids,1) > 0 THEN
    _per_job := _s.final_amount / array_length(_job_ids,1);
    UPDATE public.jobs SET paid_at = now(), payout_amount = _per_job
      WHERE id = ANY(_job_ids) AND vtc_id = _s.vtc_id AND driver_id = _s.driver_id AND paid_at IS NULL;
  END IF;

  PERFORM set_config('app.allow_balance_change','on',true);
  UPDATE public.profiles SET balance = COALESCE(balance,0) + _s.final_amount WHERE user_id = _s.driver_id;
  PERFORM set_config('app.allow_balance_change','off',true);

  UPDATE public.settlements SET status='paid', paid_at=now(), paid_by=auth.uid() WHERE id = _settlement_id;
  INSERT INTO public.settlement_activity(settlement_id, actor_id, action, meta)
    VALUES (_settlement_id, auth.uid(), 'paid', jsonb_build_object('amount', _s.final_amount));
END $$;

REVOKE EXECUTE ON FUNCTION public.pay_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_settlement(uuid) TO authenticated;
