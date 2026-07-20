GRANT EXECUTE ON FUNCTION public.pay_driver_jobs(uuid, uuid, numeric, uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pay_driver_jobs(uuid, uuid, numeric, uuid[]) FROM anon, PUBLIC;