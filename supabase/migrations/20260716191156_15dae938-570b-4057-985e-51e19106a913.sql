
-- 1) Tighten vtc_invites SELECT: only owners/admins may read invite codes
DROP POLICY IF EXISTS "invites select by members" ON public.vtc_invites;

CREATE POLICY "invites select by owner or admin"
ON public.vtc_invites
FOR SELECT
TO authenticated
USING (
  private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
);

-- 2) Attach trigger that blocks users from modifying their own balance
DROP TRIGGER IF EXISTS profiles_prevent_balance_tamper_trg ON public.profiles;
CREATE TRIGGER profiles_prevent_balance_tamper_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_prevent_balance_tamper();

-- 3) Attach trigger that blocks drivers from tampering with financial/reporting fields
DROP TRIGGER IF EXISTS jobs_prevent_driver_field_tamper_trg ON public.jobs;
CREATE TRIGGER jobs_prevent_driver_field_tamper_trg
BEFORE UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.jobs_prevent_driver_field_tamper();
