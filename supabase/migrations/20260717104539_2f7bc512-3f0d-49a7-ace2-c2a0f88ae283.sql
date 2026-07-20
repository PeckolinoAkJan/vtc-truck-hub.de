
ALTER TABLE public.vtcs
  ADD COLUMN IF NOT EXISTS discord_url text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text;

DROP VIEW IF EXISTS public.vtcs_public;
CREATE VIEW public.vtcs_public
  WITH (security_invoker = on) AS
  SELECT id, name, slug, tag, description, logo_url,
         discord_url, website_url, instagram_url,
         created_by, created_at, updated_at
  FROM public.vtcs;
GRANT SELECT ON public.vtcs_public TO authenticated;

DROP VIEW IF EXISTS public.vtcs_directory;
CREATE VIEW public.vtcs_directory
  WITH (security_invoker = off) AS
  SELECT id, name, slug, tag, description, logo_url,
         discord_url, website_url, instagram_url, created_at
  FROM public.vtcs;
GRANT SELECT ON public.vtcs_directory TO authenticated;

DO $$ BEGIN
  CREATE TYPE public.vtc_join_request_status AS ENUM ('pending','accepted','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.vtc_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vtc_id uuid NOT NULL REFERENCES public.vtcs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text,
  status public.vtc_join_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS vtc_join_requests_unique_pending
  ON public.vtc_join_requests (vtc_id, user_id) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtc_join_requests TO authenticated;
GRANT ALL ON public.vtc_join_requests TO service_role;
ALTER TABLE public.vtc_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "join req insert self" ON public.vtc_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (SELECT 1 FROM public.vtc_members m WHERE m.vtc_id = vtc_join_requests.vtc_id AND m.user_id = auth.uid())
  );

CREATE POLICY "join req select applicant or admin" ON public.vtc_join_requests
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
  );

CREATE POLICY "join req update by admin" ON public.vtc_join_requests
  FOR UPDATE TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role]));

CREATE POLICY "join req delete self or admin" ON public.vtc_join_requests
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
  );

CREATE OR REPLACE FUNCTION public.accept_vtc_join_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vtc_id uuid;
  _user_id uuid;
  _status public.vtc_join_request_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT vtc_id, user_id, status INTO _vtc_id, _user_id, _status
    FROM public.vtc_join_requests WHERE id = _request_id;
  IF _vtc_id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT private.has_vtc_role(auth.uid(), _vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _status <> 'pending' THEN RAISE EXCEPTION 'Request already decided'; END IF;

  INSERT INTO public.vtc_members (vtc_id, user_id, role)
    VALUES (_vtc_id, _user_id, 'driver'::public.vtc_role)
    ON CONFLICT (vtc_id, user_id) DO NOTHING;

  UPDATE public.vtc_join_requests
    SET status = 'accepted', decided_at = now(), decided_by = auth.uid()
    WHERE id = _request_id;
END; $$;

REVOKE ALL ON FUNCTION public.accept_vtc_join_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_vtc_join_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_vtc_join_request(uuid) TO authenticated;
