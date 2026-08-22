-- P0 replay reconciliation for a table omitted from the consolidated baseline.
--
-- Historical truth:
--   * 057_email_notifications.sql created internal.runtime_secrets.
--   * 091_secure_notification_delivery_and_audit_logs.sql retained the table
--     and added the optional Vault fallback.
-- The consolidated baseline retained public.get_runtime_secret(text), but not
-- the internal schema/table on which it depends. This forward migration makes
-- the active chain self-contained without editing the already-applied baseline.

BEGIN;
SET LOCAL check_function_bodies = on;

DO $require_postgres_executor$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            'Runtime-secret reconciliation must be applied by postgres';
    END IF;
END
$require_postgres_executor$;

CREATE SCHEMA IF NOT EXISTS internal AUTHORIZATION postgres;
ALTER SCHEMA internal OWNER TO postgres;

REVOKE ALL ON SCHEMA internal FROM PUBLIC;
REVOKE ALL ON SCHEMA internal FROM anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS internal.runtime_secrets (
    name text PRIMARY KEY,
    secret_value text NOT NULL,
    description text,
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE internal.runtime_secrets OWNER TO postgres;
ALTER TABLE internal.runtime_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.runtime_secrets
    ALTER COLUMN updated_at SET DEFAULT pg_catalog.now();

-- Fail rather than guessing if an existing relation does not match the
-- archived contract. This is a reconciliation guard, not schema synthesis.
DO $assert_runtime_secret_shape$
DECLARE
    v_name_attnum smallint;
    v_primary_key smallint[];
BEGIN
    IF EXISTS (
        SELECT 1
          FROM (
              VALUES
                  ('name'::text, 'text'::text, true),
                  ('secret_value', 'text', true),
                  ('description', 'text', false),
                  ('updated_at', 'timestamp with time zone', true)
          ) AS expected(column_name, data_type, is_not_null)
          LEFT JOIN pg_catalog.pg_attribute a
            ON a.attrelid = 'internal.runtime_secrets'::regclass
           AND a.attname = expected.column_name
           AND a.attnum > 0
           AND NOT a.attisdropped
         WHERE a.attnum IS NULL
            OR pg_catalog.format_type(a.atttypid, a.atttypmod) <> expected.data_type
            OR a.attnotnull IS DISTINCT FROM expected.is_not_null
    ) THEN
        RAISE EXCEPTION
            'internal.runtime_secrets is incompatible with the archived 057/091 contract';
    END IF;

    SELECT a.attnum
      INTO v_name_attnum
      FROM pg_catalog.pg_attribute a
     WHERE a.attrelid = 'internal.runtime_secrets'::regclass
       AND a.attname = 'name'
       AND a.attnum > 0
       AND NOT a.attisdropped;

    SELECT c.conkey
      INTO v_primary_key
      FROM pg_catalog.pg_constraint c
     WHERE c.conrelid = 'internal.runtime_secrets'::regclass
       AND c.contype = 'p';

    IF v_primary_key IS DISTINCT FROM ARRAY[v_name_attnum]::smallint[] THEN
        RAISE EXCEPTION
            'internal.runtime_secrets must have a primary key on name only';
    END IF;
END
$assert_runtime_secret_shape$;

REVOKE ALL ON TABLE internal.runtime_secrets FROM PUBLIC;
REVOKE ALL ON TABLE internal.runtime_secrets
    FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_runtime_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'internal', 'pg_temp'
AS $function$
DECLARE
    v_value text;
BEGIN
    SELECT rs.secret_value
      INTO v_value
      FROM internal.runtime_secrets AS rs
     WHERE rs.name = p_name
     LIMIT 1;

    IF v_value IS NOT NULL THEN
        RETURN v_value;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_extension e
         WHERE e.extname IN ('vault', 'supabase_vault')
    ) AND pg_catalog.to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
        EXECUTE
            'SELECT ds.decrypted_secret '
            'FROM vault.decrypted_secrets AS ds '
            'WHERE ds.name = $1 '
            'ORDER BY ds.created_at DESC '
            'LIMIT 1'
        INTO v_value
        USING p_name;
    END IF;

    RETURN v_value;
END;
$function$;

ALTER FUNCTION public.get_runtime_secret(text) OWNER TO postgres;
COMMENT ON FUNCTION public.get_runtime_secret(text) IS
'Reads a named runtime secret for trusted server execution. Reconciled from archived migrations 057 and 091; never callable by end-user roles.';

REVOKE ALL ON FUNCTION public.get_runtime_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_runtime_secret(text)
    FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_runtime_secret(text)
    TO postgres, service_role;

COMMIT;
