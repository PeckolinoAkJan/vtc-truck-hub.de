CREATE OR REPLACE FUNCTION public.pay_driver_jobs(
  _actor_id uuid,
  _vtc_id uuid,
  _driver_id uuid,
  _amount numeric,
  _job_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _updated int;
BEGIN
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT private.has_vtc_role(
    _actor_id,
    _vtc_id,
    ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role, 'dispatcher'::public.vtc_role]
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _amount IS NULL OR _amount < 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF _job_ids IS NULL OR array_length(_job_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No jobs selected';
  END IF;

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

  PERFORM set_config('app.allow_balance_change', 'on', true);

  UPDATE public.profiles
     SET balance = balance + _amount
   WHERE user_id = _driver_id;

  PERFORM set_config('app.allow_balance_change', 'off', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.pay_driver_jobs(uuid, uuid, uuid, numeric, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_driver_jobs(uuid, uuid, uuid, numeric, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.pay_driver_jobs(uuid, uuid, uuid, numeric, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pay_driver_jobs(uuid, uuid, uuid, numeric, uuid[]) TO service_role;

DROP FUNCTION IF EXISTS public.pay_driver_jobs(uuid, uuid, numeric, uuid[]);