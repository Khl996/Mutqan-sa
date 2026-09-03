-- P0 regression: future public functions are private until explicitly granted.
-- Run after 20260903235032 in the isolated PostgreSQL 17 environment.

\set ON_ERROR_STOP on

BEGIN;

CREATE FUNCTION public.__p0_explicit_publication_probe_20260902()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT 'ok'::text
$function$;

DO $assert_probe_is_private_by_default$
DECLARE
    v_probe regprocedure :=
        'public.__p0_explicit_publication_probe_20260902()'::regprocedure;
BEGIN
    IF has_function_privilege('anon', v_probe, 'EXECUTE')
       OR has_function_privilege('authenticated', v_probe, 'EXECUTE')
       OR has_function_privilege('service_role', v_probe, 'EXECUTE')
       OR EXISTS (
            SELECT 1
              FROM pg_proc p
              JOIN LATERAL aclexplode(
                    coalesce(p.proacl, acldefault('f', p.proowner))
              ) acl ON true
             WHERE p.oid = v_probe
               AND acl.grantee = 0
               AND acl.privilege_type = 'EXECUTE'
       )
    THEN
        RAISE EXCEPTION
            'a new postgres-owned public SECURITY DEFINER inherited API execution';
    END IF;
END;
$assert_probe_is_private_by_default$;

GRANT EXECUTE ON FUNCTION public.__p0_explicit_publication_probe_20260902()
    TO authenticated, service_role;

DO $assert_explicit_publication_only$
DECLARE
    v_probe regprocedure :=
        'public.__p0_explicit_publication_probe_20260902()'::regprocedure;
BEGIN
    IF NOT has_function_privilege('authenticated', v_probe, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_probe, 'EXECUTE')
       OR has_function_privilege('anon', v_probe, 'EXECUTE')
       OR EXISTS (
            SELECT 1
              FROM pg_proc p
              JOIN LATERAL aclexplode(
                    coalesce(p.proacl, acldefault('f', p.proowner))
              ) acl ON true
             WHERE p.oid = v_probe
               AND acl.grantee = 0
               AND acl.privilege_type = 'EXECUTE'
       )
    THEN
        RAISE EXCEPTION
            'explicit API function publication did not preserve the reviewed grants';
    END IF;
END;
$assert_explicit_publication_only$;

ROLLBACK;
