
-- 1. Profile-Erweiterung
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS real_name text,
  ADD COLUMN IF NOT EXISTS discord_id text,
  ADD COLUMN IF NOT EXISTS client_key text NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_client_key_key ON public.profiles(client_key);

-- 2. Jobs-Erweiterung
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_amount numeric(12,2);

CREATE INDEX IF NOT EXISTS jobs_paid_idx ON public.jobs (vtc_id, paid_at) WHERE status = 'approved';

-- 3. Fahrer-Tamper-Schutz erweitern
CREATE OR REPLACE FUNCTION public.jobs_prevent_driver_field_tamper()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.driver_id
     AND NOT private.has_vtc_role(auth.uid(), OLD.vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role, 'dispatcher'::public.vtc_role])
  THEN
    IF NEW.revenue      IS DISTINCT FROM OLD.revenue
    OR NEW.distance_km  IS DISTINCT FROM OLD.distance_km
    OR NEW.fuel_cost    IS DISTINCT FROM OLD.fuel_cost
    OR NEW.damage_pct   IS DISTINCT FROM OLD.damage_pct
    OR NEW.cargo        IS DISTINCT FROM OLD.cargo
    OR NEW.source_city  IS DISTINCT FROM OLD.source_city
    OR NEW.dest_city    IS DISTINCT FROM OLD.dest_city
    OR NEW.truck        IS DISTINCT FROM OLD.truck
    OR NEW.game         IS DISTINCT FROM OLD.game
    OR NEW.vtc_id       IS DISTINCT FROM OLD.vtc_id
    OR NEW.driver_id    IS DISTINCT FROM OLD.driver_id
    OR NEW.status       IS DISTINCT FROM OLD.status
    OR NEW.reviewed_by  IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at  IS DISTINCT FROM OLD.reviewed_at
    OR NEW.review_note  IS DISTINCT FROM OLD.review_note
    OR NEW.paid_at      IS DISTINCT FROM OLD.paid_at
    OR NEW.payout_amount IS DISTINCT FROM OLD.payout_amount
    THEN
      RAISE EXCEPTION 'Drivers cannot modify job fields after submission';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. Balance-Trigger: erlaubt Änderung nur wenn Session-GUC gesetzt ist
CREATE OR REPLACE FUNCTION public.profiles_prevent_balance_tamper()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.balance IS DISTINCT FROM OLD.balance
     AND coalesce(current_setting('app.allow_balance_change', true), '') <> 'on'
  THEN
    RAISE EXCEPTION 'Balance cannot be modified from the client';
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. Auszahlungs-Funktion
CREATE OR REPLACE FUNCTION public.pay_driver_jobs(
  _vtc_id uuid,
  _driver_id uuid,
  _amount numeric,
  _job_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _updated int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT private.has_vtc_role(auth.uid(), _vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role, 'dispatcher'::public.vtc_role]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _amount IS NULL OR _amount < 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  IF _job_ids IS NULL OR array_length(_job_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No jobs selected';
  END IF;

  -- Mark jobs paid (only approved, unpaid, matching driver+vtc)
  UPDATE public.jobs
     SET paid_at = now(),
         payout_amount = _amount / array_length(_job_ids, 1)
   WHERE id = ANY(_job_ids)
     AND vtc_id = _vtc_id
     AND driver_id = _driver_id
     AND status = 'approved'
     AND paid_at IS NULL;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated = 0 THEN
    RAISE EXCEPTION 'No matching unpaid jobs';
  END IF;

  -- Add to balance (bypass tamper trigger via GUC)
  PERFORM set_config('app.allow_balance_change', 'on', true);
  UPDATE public.profiles
     SET balance = balance + _amount
   WHERE user_id = _driver_id;
  PERFORM set_config('app.allow_balance_change', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_driver_jobs(uuid, uuid, numeric, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.pay_driver_jobs(uuid, uuid, numeric, uuid[]) TO authenticated;

-- 6. Globale Statistik-Funktion (öffentlich)
CREATE OR REPLACE FUNCTION public.get_global_stats()
RETURNS TABLE(total_jobs bigint, total_km numeric)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT count(*)::bigint AS total_jobs,
         COALESCE(sum(distance_km), 0)::numeric AS total_km
  FROM public.jobs
  WHERE status = 'approved';
$$;

REVOKE ALL ON FUNCTION public.get_global_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.get_global_stats() TO anon, authenticated;
