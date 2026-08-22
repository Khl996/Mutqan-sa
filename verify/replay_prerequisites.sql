-- Isolated-replay compatibility bootstrap (not a migration-ledger entry).
--
-- This restores an omitted prerequisite before the consolidated baseline is
-- parsed/exercised. It contains no secret values and must not be recorded as a
-- historical migration. The forward migration
-- 20260821014202_p0_runtime_secret_reconciliation.sql is the authoritative
-- convergence step for deployed databases.
--
-- Provenance:
--   archived 057_email_notifications.sql
--     SHA-256 C63413F6DF6E2537EC1BFEF25B6E2C2CEE323E39B15DD2353F1AAA4D16E5D47C
--   archived 091_secure_notification_delivery_and_audit_logs.sql
--     SHA-256 0635DFCA43D653D1A7D862741FABEFC58C8024181898E5634B7602DC21A9215D

\set ON_ERROR_STOP on

DO $require_postgres_executor$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            'Replay prerequisites must be applied by postgres';
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

REVOKE ALL ON TABLE internal.runtime_secrets FROM PUBLIC;
REVOKE ALL ON TABLE internal.runtime_secrets
    FROM anon, authenticated, service_role;
