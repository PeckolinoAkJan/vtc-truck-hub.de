
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DROP POLICY IF EXISTS "vtcs delete by owner" ON public.vtcs;
DROP POLICY IF EXISTS "vtcs select for members" ON public.vtcs;
DROP POLICY IF EXISTS "vtcs update by owner/admin" ON public.vtcs;
DROP POLICY IF EXISTS "members delete by owner/admin or self" ON public.vtc_members;
DROP POLICY IF EXISTS "members select if same vtc" ON public.vtc_members;
DROP POLICY IF EXISTS "members update by owner/admin" ON public.vtc_members;
DROP POLICY IF EXISTS "invites delete by owner/admin" ON public.vtc_invites;
DROP POLICY IF EXISTS "invites insert by owner/admin" ON public.vtc_invites;
DROP POLICY IF EXISTS "invites select by members" ON public.vtc_invites;
DROP POLICY IF EXISTS "telemetry select for vtc members" ON public.telemetry_events;
DROP POLICY IF EXISTS "jobs delete by admin/owner" ON public.jobs;
DROP POLICY IF EXISTS "jobs insert by driver in vtc" ON public.jobs;
DROP POLICY IF EXISTS "jobs select for vtc members" ON public.jobs;
DROP POLICY IF EXISTS "jobs update by dispatch or owner-own-if-submitted" ON public.jobs;
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;

DROP FUNCTION IF EXISTS public.has_vtc_role(uuid, uuid, public.vtc_role[]);
DROP FUNCTION IF EXISTS public.is_vtc_member(uuid, uuid);

CREATE FUNCTION private.has_vtc_role(_user uuid, _vtc uuid, _roles public.vtc_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.vtc_members WHERE user_id = _user AND vtc_id = _vtc AND role = ANY(_roles))
$$;

CREATE FUNCTION private.is_vtc_member(_user uuid, _vtc uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.vtc_members WHERE user_id = _user AND vtc_id = _vtc)
$$;

CREATE FUNCTION private.shares_vtc(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vtc_members m1
    JOIN public.vtc_members m2 ON m1.vtc_id = m2.vtc_id
    WHERE m1.user_id = _a AND m2.user_id = _b
  )
$$;

REVOKE ALL ON FUNCTION private.has_vtc_role(uuid, uuid, public.vtc_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_vtc_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.shares_vtc(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_vtc_role(uuid, uuid, public.vtc_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_vtc_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.shares_vtc(uuid, uuid) TO authenticated;

CREATE POLICY "vtcs delete by owner" ON public.vtcs FOR DELETE TO authenticated
  USING (private.has_vtc_role(auth.uid(), id, ARRAY['owner'::public.vtc_role]));
CREATE POLICY "vtcs select for members" ON public.vtcs FOR SELECT TO authenticated
  USING (private.is_vtc_member(auth.uid(), id));
CREATE POLICY "vtcs update by owner/admin" ON public.vtcs FOR UPDATE TO authenticated
  USING (private.has_vtc_role(auth.uid(), id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role]));

CREATE POLICY "members delete by owner/admin or self" ON public.vtc_members FOR DELETE TO authenticated
  USING (
    private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role])
    OR auth.uid() = user_id
  );
CREATE POLICY "members select if same vtc" ON public.vtc_members FOR SELECT TO authenticated
  USING (private.is_vtc_member(auth.uid(), vtc_id));
CREATE POLICY "members update by owner/admin" ON public.vtc_members FOR UPDATE TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role]))
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role]));

CREATE POLICY "invites delete by owner/admin" ON public.vtc_invites FOR DELETE TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role]));
CREATE POLICY "invites insert by owner/admin" ON public.vtc_invites FOR INSERT TO authenticated
  WITH CHECK (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role]));
CREATE POLICY "invites select by members" ON public.vtc_invites FOR SELECT TO authenticated
  USING (private.is_vtc_member(auth.uid(), vtc_id));

CREATE POLICY "telemetry select for vtc members" ON public.telemetry_events FOR SELECT TO authenticated
  USING (private.is_vtc_member(auth.uid(), vtc_id));

CREATE POLICY "jobs delete by admin/owner" ON public.jobs FOR DELETE TO authenticated
  USING (private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role]));
CREATE POLICY "jobs insert by driver in vtc" ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = driver_id AND private.is_vtc_member(auth.uid(), vtc_id));
CREATE POLICY "jobs select for vtc members" ON public.jobs FOR SELECT TO authenticated
  USING (private.is_vtc_member(auth.uid(), vtc_id));
CREATE POLICY "jobs update by dispatch or owner-own-if-submitted" ON public.jobs FOR UPDATE TO authenticated
  USING (
    private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role, 'dispatcher'::public.vtc_role])
    OR (auth.uid() = driver_id AND status = 'submitted'::public.job_status)
  )
  WITH CHECK (
    private.has_vtc_role(auth.uid(), vtc_id, ARRAY['owner'::public.vtc_role, 'admin'::public.vtc_role, 'dispatcher'::public.vtc_role])
    OR (auth.uid() = driver_id AND status = 'submitted'::public.job_status)
  );

CREATE POLICY "profiles readable by self or shared vtc" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.shares_vtc(auth.uid(), user_id));

REVOKE SELECT (api_key), UPDATE (api_key), INSERT (api_key) ON public.vtcs FROM authenticated;

CREATE OR REPLACE FUNCTION public.prevent_non_owner_owner_grant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'owner'::public.vtc_role THEN
    IF EXISTS (SELECT 1 FROM public.vtc_members WHERE vtc_id = NEW.vtc_id AND role = 'owner'::public.vtc_role)
       AND auth.uid() IS NOT NULL
       AND NOT private.has_vtc_role(auth.uid(), NEW.vtc_id, ARRAY['owner'::public.vtc_role]) THEN
      RAISE EXCEPTION 'Only an existing owner can grant the owner role';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prevent_non_owner_owner_grant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_members_prevent_owner_grant ON public.vtc_members;
CREATE TRIGGER trg_members_prevent_owner_grant
  BEFORE INSERT OR UPDATE OF role ON public.vtc_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_non_owner_owner_grant();

CREATE OR REPLACE FUNCTION public.prevent_non_owner_owner_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'owner'::public.vtc_role THEN
    IF auth.uid() IS NOT NULL
       AND NOT private.has_vtc_role(auth.uid(), NEW.vtc_id, ARRAY['owner'::public.vtc_role]) THEN
      RAISE EXCEPTION 'Only an existing owner can create an owner invite';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prevent_non_owner_owner_invite() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_invites_prevent_owner_grant ON public.vtc_invites;
CREATE TRIGGER trg_invites_prevent_owner_grant
  BEFORE INSERT OR UPDATE OF role ON public.vtc_invites
  FOR EACH ROW EXECUTE FUNCTION public.prevent_non_owner_owner_invite();
