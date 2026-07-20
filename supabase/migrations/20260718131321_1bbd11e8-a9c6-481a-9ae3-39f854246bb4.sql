
CREATE OR REPLACE FUNCTION public.vtc_members_enforce_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_role public.vtc_role;
BEGIN
  -- Service role / internal calls bypass (auth.uid() is null).
  IF _actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT role INTO _actor_role
    FROM public.vtc_members
   WHERE vtc_id = COALESCE(NEW.vtc_id, OLD.vtc_id)
     AND user_id = _actor;

  IF TG_OP = 'DELETE' THEN
    -- Self-leave allowed for non-owners.
    IF OLD.user_id = _actor THEN
      IF OLD.role = 'owner'::public.vtc_role THEN
        RAISE EXCEPTION 'Insufficient permissions to modify this user';
      END IF;
      RETURN OLD;
    END IF;

    IF _actor_role IS NULL OR _actor_role NOT IN ('owner'::public.vtc_role, 'admin'::public.vtc_role) THEN
      RAISE EXCEPTION 'Insufficient permissions to modify this user';
    END IF;
    IF OLD.role = 'owner'::public.vtc_role THEN
      RAISE EXCEPTION 'Insufficient permissions to modify this user';
    END IF;
    IF OLD.role = 'admin'::public.vtc_role AND _actor_role <> 'owner'::public.vtc_role THEN
      RAISE EXCEPTION 'Insufficient permissions to modify this user';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF _actor_role IS NULL OR _actor_role NOT IN ('owner'::public.vtc_role, 'admin'::public.vtc_role) THEN
        RAISE EXCEPTION 'Insufficient permissions to modify this user';
      END IF;
      IF OLD.role = 'owner'::public.vtc_role THEN
        RAISE EXCEPTION 'Insufficient permissions to modify this user';
      END IF;
      IF (OLD.role = 'admin'::public.vtc_role OR NEW.role IN ('owner'::public.vtc_role, 'admin'::public.vtc_role))
         AND _actor_role <> 'owner'::public.vtc_role THEN
        RAISE EXCEPTION 'Insufficient permissions to modify this user';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vtc_members_hierarchy_guard ON public.vtc_members;
CREATE TRIGGER vtc_members_hierarchy_guard
BEFORE UPDATE OR DELETE ON public.vtc_members
FOR EACH ROW EXECUTE FUNCTION public.vtc_members_enforce_hierarchy();
