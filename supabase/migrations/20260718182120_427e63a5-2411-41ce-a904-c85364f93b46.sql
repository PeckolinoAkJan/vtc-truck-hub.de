-- Harden event-banners storage policies: enforce VTC staff membership via path prefix
-- Path structure: {vtc_id}/{user_id}/{timestamp}.{ext}

-- Helper (private schema, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION private.can_manage_vtc_event_assets(_user_id uuid, _vtc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vtc_members
    WHERE vtc_id = _vtc_id
      AND user_id = _user_id
      AND role IN ('owner'::public.vtc_role, 'admin'::public.vtc_role, 'dispatcher'::public.vtc_role)
  );
$$;

REVOKE EXECUTE ON FUNCTION private.can_manage_vtc_event_assets(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_manage_vtc_event_assets(uuid, uuid) TO authenticated, service_role;

-- Drop old permissive policies
DROP POLICY IF EXISTS event_banners_insert_auth ON storage.objects;
DROP POLICY IF EXISTS event_banners_delete_owner ON storage.objects;
DROP POLICY IF EXISTS event_banners_update_staff ON storage.objects;

-- INSERT: only VTC staff of the VTC identified by the first path segment
CREATE POLICY event_banners_insert_staff ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-banners'
    AND auth.uid() IS NOT NULL
    AND owner = auth.uid()
    AND private.can_manage_vtc_event_assets(
      auth.uid(),
      (split_part(name, '/', 1))::uuid
    )
  );

-- UPDATE: check both old and new path VTC id
CREATE POLICY event_banners_update_staff ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-banners'
    AND private.can_manage_vtc_event_assets(
      auth.uid(),
      (split_part(name, '/', 1))::uuid
    )
  )
  WITH CHECK (
    bucket_id = 'event-banners'
    AND owner = auth.uid()
    AND private.can_manage_vtc_event_assets(
      auth.uid(),
      (split_part(name, '/', 1))::uuid
    )
  );

-- DELETE: only VTC staff of the target VTC (not just uploader)
CREATE POLICY event_banners_delete_staff ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-banners'
    AND private.can_manage_vtc_event_assets(
      auth.uid(),
      (split_part(name, '/', 1))::uuid
    )
  );