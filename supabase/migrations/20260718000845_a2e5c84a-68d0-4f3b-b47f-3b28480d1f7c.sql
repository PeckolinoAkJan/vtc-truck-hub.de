
CREATE OR REPLACE FUNCTION public.jobs_reverse_balance_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.paid_at IS NOT NULL AND COALESCE(OLD.payout_amount, 0) <> 0 AND OLD.driver_id IS NOT NULL THEN
    PERFORM set_config('app.allow_balance_change', 'on', true);
    UPDATE public.profiles
       SET balance = COALESCE(balance, 0) - OLD.payout_amount
     WHERE user_id = OLD.driver_id;
    PERFORM set_config('app.allow_balance_change', 'off', true);
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS jobs_reverse_balance_on_delete ON public.jobs;
CREATE TRIGGER jobs_reverse_balance_on_delete
BEFORE DELETE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.jobs_reverse_balance_on_delete();
