
DROP POLICY IF EXISTS "members update by owner/admin" ON public.vtc_members;
DROP POLICY IF EXISTS "members delete by owner/admin or self" ON public.vtc_members;

CREATE POLICY "members update by owner/admin"
ON public.vtc_members
FOR UPDATE
USING (
  private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
  AND (
    vtc_members.role <> 'owner'::public.vtc_role
    OR private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role])
  )
)
WITH CHECK (
  private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
  AND (
    vtc_members.role <> 'owner'::public.vtc_role
    OR private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role])
  )
);

CREATE POLICY "members delete by owner/admin or self"
ON public.vtc_members
FOR DELETE
USING (
  (
    private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
    AND vtc_members.role <> 'owner'::public.vtc_role
  )
  OR (
    auth.uid() = user_id
    AND vtc_members.role <> 'owner'::public.vtc_role
  )
);
