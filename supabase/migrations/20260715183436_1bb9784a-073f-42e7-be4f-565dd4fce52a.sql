CREATE OR REPLACE FUNCTION public.whoami() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT auth.uid() $$;
GRANT EXECUTE ON FUNCTION public.whoami() TO anon, authenticated;