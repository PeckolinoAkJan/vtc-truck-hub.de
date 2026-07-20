-- Ensure authenticated users can reach vtcs via Data API (RLS still filters rows).
GRANT SELECT ON public.vtcs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vtcs TO authenticated;
GRANT ALL ON public.vtcs TO service_role;
GRANT SELECT ON public.vtcs_public TO authenticated;
GRANT SELECT ON public.vtcs_public TO anon;
GRANT SELECT ON public.vtcs_directory TO authenticated;