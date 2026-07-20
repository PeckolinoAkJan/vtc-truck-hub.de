-- Harden vtc_members: no direct PostgREST modification of owner rows.
DROP POLICY IF EXISTS "members update by owner/admin" ON public.vtc_members;
DROP POLICY IF EXISTS "members delete by owner/admin or self" ON public.vtc_members;

-- UPDATE: staff can update non-owner rows only, and cannot promote anyone to owner via API.
CREATE POLICY "members update by owner/admin"
ON public.vtc_members
FOR UPDATE
TO authenticated
USING (
  private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
  AND role <> 'owner'::public.vtc_role
)
WITH CHECK (
  private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
  AND role <> 'owner'::public.vtc_role
);

-- DELETE: never allow direct deletion of an owner row (not even self-delete).
--   Staff (owner/admin) may delete non-owner members.
--   Users may self-leave only if they are not owner.
CREATE POLICY "members delete by owner/admin or self"
ON public.vtc_members
FOR DELETE
TO authenticated
USING (
  role <> 'owner'::public.vtc_role
  AND (
    private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
    OR auth.uid() = user_id
  )
);