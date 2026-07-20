
-- ============ vtc_messages: team chat ============
CREATE TABLE public.vtc_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vtc_messages_vtc_created_idx ON public.vtc_messages (vtc_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.vtc_messages TO authenticated;
GRANT ALL ON public.vtc_messages TO service_role;

ALTER TABLE public.vtc_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read vtc messages"
  ON public.vtc_messages FOR SELECT TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id,
    ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role,'driver'::public.vtc_role]));

CREATE POLICY "members can send vtc messages"
  ON public.vtc_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND private.has_vtc_role(auth.uid(), vtc_id,
      ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role,'driver'::public.vtc_role]));

CREATE POLICY "author or owner can delete vtc message"
  ON public.vtc_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid()
    OR private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role]));

ALTER PUBLICATION supabase_realtime ADD TABLE public.vtc_messages;
ALTER TABLE public.vtc_messages REPLICA IDENTITY FULL;

-- ============ vtc_documents metadata table ============
CREATE TABLE public.vtc_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path text NOT NULL UNIQUE,
  name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vtc_documents_vtc_created_idx ON public.vtc_documents (vtc_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.vtc_documents TO authenticated;
GRANT ALL ON public.vtc_documents TO service_role;

ALTER TABLE public.vtc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read vtc docs"
  ON public.vtc_documents FOR SELECT TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id,
    ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role,'driver'::public.vtc_role]));

CREATE POLICY "owner insert vtc docs"
  ON public.vtc_documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid()
    AND private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role]));

CREATE POLICY "owner delete vtc docs"
  ON public.vtc_documents FOR DELETE TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role]));

-- ============ Storage RLS for vtc-documents bucket ============
-- Paths follow the shape: <vtc_id>/<file>
CREATE POLICY "vtc docs: members read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vtc-documents'
    AND private.has_vtc_role(
      auth.uid(),
      (split_part(name, '/', 1))::uuid,
      ARRAY['owner'::public.vtc_role,'admin'::public.vtc_role,'dispatcher'::public.vtc_role,'driver'::public.vtc_role]
    )
  );

CREATE POLICY "vtc docs: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vtc-documents'
    AND private.has_vtc_role(
      auth.uid(),
      (split_part(name, '/', 1))::uuid,
      ARRAY['owner'::public.vtc_role]
    )
  );

CREATE POLICY "vtc docs: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vtc-documents'
    AND private.has_vtc_role(
      auth.uid(),
      (split_part(name, '/', 1))::uuid,
      ARRAY['owner'::public.vtc_role]
    )
  );
