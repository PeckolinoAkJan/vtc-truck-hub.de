DROP POLICY IF EXISTS vehicle_media_write_staff ON storage.objects;
CREATE POLICY vehicle_media_write_staff ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-media'
  AND auth.uid() IS NOT NULL
  AND owner = auth.uid()
  AND private.has_vtc_role(
    auth.uid(),
    (split_part(name, '/', 1))::uuid,
    ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role, 'dispatcher'::public.vtc_role]
  )
  AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.vtc_id = (split_part(storage.objects.name, '/', 1))::uuid
      AND (v.id)::text = split_part(storage.objects.name, '/', 2)
  )
);