
DROP POLICY IF EXISTS "members insert self on join" ON public.vtc_members;

CREATE POLICY "members insert self on join"
  ON public.vtc_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'driver'::public.vtc_role
  );

-- Allow existing owners/admins to add members with any role (including elevated).
DROP POLICY IF EXISTS "staff insert members" ON public.vtc_members;
CREATE POLICY "staff insert members"
  ON public.vtc_members FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
  );
