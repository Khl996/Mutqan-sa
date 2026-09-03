-- P0: make future postgres-owned API functions explicit-publication only.
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. A
-- schema-scoped REVOKE cannot remove that global default; it can only undo a
-- schema-scoped GRANT. Supabase also adds schema-local defaults for its API
-- roles. Remove both sources for future functions without changing any
-- existing function ACL.

BEGIN;

DO $require_postgres_executor$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            'Explicit API function publication migration must be executed by postgres'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
    THEN
        RAISE EXCEPTION
            'Explicit API function publication requires the Supabase API roles';
    END IF;
END;
$require_postgres_executor$;

-- The built-in PUBLIC function grant is global and must be revoked globally.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Supabase API-role grants are additions scoped to the exposed public schema.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS
    FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
