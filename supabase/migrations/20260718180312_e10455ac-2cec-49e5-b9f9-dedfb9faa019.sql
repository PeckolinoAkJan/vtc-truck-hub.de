REVOKE ALL ON FUNCTION private.is_super_admin_uid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_super_admin_uid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_super_admin_uid(uuid) TO service_role;