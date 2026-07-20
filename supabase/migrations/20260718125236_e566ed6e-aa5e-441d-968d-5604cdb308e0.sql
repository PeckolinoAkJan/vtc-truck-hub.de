
-- Drop unsafe self-join policy
DROP POLICY IF EXISTS "members insert self on join" ON public.vtc_members;

-- Provide a SECURITY DEFINER RPC that validates an invite before inserting membership
CREATE OR REPLACE FUNCTION public.accept_vtc_invite(_code text)
RETURNS TABLE(vtc_id uuid, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _invite public.vtc_invites%ROWTYPE;
  _slug text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _invite
    FROM public.vtc_invites
   WHERE code = upper(btrim(_code))
   LIMIT 1;

  IF _invite.id IS NULL THEN
    RAISE EXCEPTION 'Ungültiger Einladungscode';
  END IF;

  IF _invite.expires_at IS NOT NULL AND _invite.expires_at < now() THEN
    RAISE EXCEPTION 'Dieser Code ist abgelaufen';
  END IF;

  -- Owner role can only be granted via existing owner flow; downgrade defensively
  IF _invite.role = 'owner'::public.vtc_role THEN
    RAISE EXCEPTION 'Owner-Rolle kann nicht per Code beigetreten werden';
  END IF;

  INSERT INTO public.vtc_members (vtc_id, user_id, role)
    VALUES (_invite.vtc_id, _uid, _invite.role)
    ON CONFLICT (vtc_id, user_id) DO NOTHING;

  SELECT v.slug INTO _slug FROM public.vtcs v WHERE v.id = _invite.vtc_id;

  vtc_id := _invite.vtc_id;
  slug := COALESCE(_slug, '');
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_vtc_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_vtc_invite(text) TO authenticated;
