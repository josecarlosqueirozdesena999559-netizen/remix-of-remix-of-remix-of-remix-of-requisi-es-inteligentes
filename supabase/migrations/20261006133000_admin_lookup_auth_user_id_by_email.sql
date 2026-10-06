CREATE OR REPLACE FUNCTION public.admin_lookup_auth_user_id_by_email(target_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth_user.id
  FROM auth.users AS auth_user
  WHERE pg_catalog.lower(auth_user.email) =
        pg_catalog.lower(pg_catalog.btrim(target_email))
  ORDER BY auth_user.created_at
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.admin_lookup_auth_user_id_by_email(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_lookup_auth_user_id_by_email(text)
TO service_role;

COMMENT ON FUNCTION public.admin_lookup_auth_user_id_by_email(text)
IS 'Server-only lookup of an Auth user ID by email for admin-user-management.';
