
-- Prevent drivers from editing financial/route fields on their own submitted jobs
CREATE OR REPLACE FUNCTION public.jobs_prevent_driver_field_tamper()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when acting as an authenticated end user who is the driver
  -- and who is NOT a dispatcher/admin/owner of the VTC.
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
    THEN
      RAISE EXCEPTION 'Drivers cannot modify job fields after submission';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_prevent_driver_field_tamper ON public.jobs;
CREATE TRIGGER jobs_prevent_driver_field_tamper
BEFORE UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.jobs_prevent_driver_field_tamper();

-- Prevent users from changing their own balance directly
CREATE OR REPLACE FUNCTION public.profiles_prevent_balance_tamper()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.balance IS DISTINCT FROM OLD.balance
  THEN
    RAISE EXCEPTION 'Balance cannot be modified from the client';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_balance_tamper ON public.profiles;
CREATE TRIGGER profiles_prevent_balance_tamper
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_prevent_balance_tamper();
