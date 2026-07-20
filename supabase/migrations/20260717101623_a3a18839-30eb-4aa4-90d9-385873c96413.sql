
DROP POLICY IF EXISTS "vtc-logos public read" ON storage.objects;
CREATE POLICY "vtc-logos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'vtc-logos');

DROP POLICY IF EXISTS "vtc-logos authenticated upload" ON storage.objects;
CREATE POLICY "vtc-logos authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vtc-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "vtc-logos owner update" ON storage.objects;
CREATE POLICY "vtc-logos owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vtc-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "vtc-logos owner delete" ON storage.objects;
CREATE POLICY "vtc-logos owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'vtc-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
