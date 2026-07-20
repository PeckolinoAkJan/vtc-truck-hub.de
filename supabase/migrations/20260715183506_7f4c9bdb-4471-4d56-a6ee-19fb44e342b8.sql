DROP FUNCTION IF EXISTS public.whoami();

CREATE OR REPLACE FUNCTION public.add_vtc_owner_on_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vtc_members (vtc_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (vtc_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_vtc_owner ON public.vtcs;
CREATE TRIGGER trg_add_vtc_owner
AFTER INSERT ON public.vtcs
FOR EACH ROW EXECUTE FUNCTION public.add_vtc_owner_on_create();