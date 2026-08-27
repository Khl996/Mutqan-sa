-- Tenant-scoped release control for production canaries.
--
-- Release state is private, absent overrides fail closed, and the only public
-- surface is a read-only getter that derives tenant authority from the caller.
-- Operational changes are postgres-only and append an audit event atomically.

BEGIN;

SET LOCAL check_function_bodies = on;

DO $require_postgres_executor$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            'Tenant release control must be applied by postgres'
            USING ERRCODE = '42501';
    END IF;

    IF pg_catalog.to_regprocedure('public.current_actor_is_active()') IS NULL
       OR pg_catalog.to_regprocedure('public.get_user_tenant_id()') IS NULL
       OR pg_catalog.to_regprocedure('public.tenant_has_operational_access(uuid)') IS NULL
    THEN
        RAISE EXCEPTION
            'Tenant release control requires the P0 central-authority migration';
    END IF;
END
$require_postgres_executor$;

CREATE SCHEMA IF NOT EXISTS internal AUTHORIZATION postgres;
ALTER SCHEMA internal OWNER TO postgres;
REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated, service_role;

-- Keep future internal functions private by default. The P0 anonymous-definer
-- migration establishes the corresponding deny-by-default rule for public.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA internal
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE internal.release_flag_definitions (
    flag_key text PRIMARY KEY,
    description text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    retired_at timestamptz,
    CONSTRAINT release_flag_definitions_key_format
        CHECK (flag_key ~ '^[a-z][a-z0-9_]{2,62}$'),
    CONSTRAINT release_flag_definitions_description_present
        CHECK (pg_catalog.length(pg_catalog.btrim(description)) >= 8)
);

CREATE TABLE internal.tenant_release_flags (
    tenant_id uuid NOT NULL
        REFERENCES public.tenants(id) ON DELETE RESTRICT,
    flag_key text NOT NULL
        REFERENCES internal.release_flag_definitions(flag_key) ON DELETE RESTRICT,
    enabled boolean NOT NULL DEFAULT false,
    change_reason text NOT NULL,
    actor_label text NOT NULL,
    actor_user_id uuid,
    changed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    PRIMARY KEY (tenant_id, flag_key),
    CONSTRAINT tenant_release_flags_reason_present
        CHECK (pg_catalog.length(pg_catalog.btrim(change_reason)) >= 8),
    CONSTRAINT tenant_release_flags_actor_present
        CHECK (pg_catalog.length(pg_catalog.btrim(actor_label)) >= 3)
);

-- Deliberately no foreign keys: the audit record survives future tenant,
-- definition, or user retirement.
CREATE TABLE internal.tenant_release_flag_events (
    event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL,
    flag_key text NOT NULL,
    event_kind text NOT NULL,
    old_enabled boolean,
    new_enabled boolean NOT NULL,
    change_reason text NOT NULL,
    actor_label text NOT NULL,
    actor_user_id uuid,
    occurred_at timestamptz NOT NULL,
    CONSTRAINT tenant_release_flag_events_kind
        CHECK (event_kind IN ('created', 'enabled', 'disabled')),
    CONSTRAINT tenant_release_flag_events_key_format
        CHECK (flag_key ~ '^[a-z][a-z0-9_]{2,62}$')
);

ALTER TABLE internal.release_flag_definitions OWNER TO postgres;
ALTER TABLE internal.tenant_release_flags OWNER TO postgres;
ALTER TABLE internal.tenant_release_flag_events OWNER TO postgres;

ALTER TABLE internal.release_flag_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.tenant_release_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal.tenant_release_flag_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE internal.release_flag_definitions
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE internal.tenant_release_flags
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE internal.tenant_release_flag_events
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE internal.tenant_release_flag_events_event_id_seq
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.guard_tenant_release_flag_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'Tenant release flags cannot be deleted; set enabled=false instead'
            USING ERRCODE = '42501';
    END IF;

    NEW.flag_key := pg_catalog.lower(pg_catalog.btrim(NEW.flag_key));
    NEW.change_reason := pg_catalog.btrim(NEW.change_reason);
    NEW.actor_label := pg_catalog.btrim(NEW.actor_label);

    IF NEW.flag_key !~ '^[a-z][a-z0-9_]{2,62}$' THEN
        RAISE EXCEPTION 'Invalid release flag key' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.length(NEW.change_reason) < 8 THEN
        RAISE EXCEPTION 'A release reason of at least 8 characters is required'
            USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.length(NEW.actor_label) < 3 THEN
        RAISE EXCEPTION 'A release actor label is required'
            USING ERRCODE = '22023';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.flag_key IS DISTINCT FROM OLD.flag_key
        THEN
            RAISE EXCEPTION 'Release flag identity is immutable'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.enabled IS NOT DISTINCT FROM OLD.enabled THEN
            RAISE EXCEPTION 'No-op release flag updates are not allowed'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    NEW.changed_at := pg_catalog.clock_timestamp();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION internal.audit_tenant_release_flag_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
    INSERT INTO internal.tenant_release_flag_events (
        tenant_id,
        flag_key,
        event_kind,
        old_enabled,
        new_enabled,
        change_reason,
        actor_label,
        actor_user_id,
        occurred_at
    ) VALUES (
        NEW.tenant_id,
        NEW.flag_key,
        CASE
            WHEN TG_OP = 'INSERT' THEN 'created'
            WHEN NEW.enabled THEN 'enabled'
            ELSE 'disabled'
        END,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.enabled ELSE NULL END,
        NEW.enabled,
        NEW.change_reason,
        NEW.actor_label,
        NEW.actor_user_id,
        NEW.changed_at
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION internal.deny_tenant_release_flag_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
    RAISE EXCEPTION 'Tenant release flag events are append-only'
        USING ERRCODE = '42501';
END;
$function$;

ALTER FUNCTION internal.guard_tenant_release_flag_write() OWNER TO postgres;
ALTER FUNCTION internal.audit_tenant_release_flag_write() OWNER TO postgres;
ALTER FUNCTION internal.deny_tenant_release_flag_event_mutation() OWNER TO postgres;

REVOKE ALL ON FUNCTION internal.guard_tenant_release_flag_write()
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION internal.audit_tenant_release_flag_write()
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION internal.deny_tenant_release_flag_event_mutation()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.guard_tenant_release_flag_write() TO postgres;
GRANT EXECUTE ON FUNCTION internal.audit_tenant_release_flag_write() TO postgres;
GRANT EXECUTE ON FUNCTION internal.deny_tenant_release_flag_event_mutation() TO postgres;

CREATE TRIGGER tenant_release_flags_10_guard
BEFORE INSERT OR UPDATE OR DELETE ON internal.tenant_release_flags
FOR EACH ROW EXECUTE FUNCTION internal.guard_tenant_release_flag_write();

CREATE TRIGGER tenant_release_flags_20_audit
AFTER INSERT OR UPDATE ON internal.tenant_release_flags
FOR EACH ROW EXECUTE FUNCTION internal.audit_tenant_release_flag_write();

CREATE TRIGGER tenant_release_flag_events_append_only
BEFORE UPDATE OR DELETE ON internal.tenant_release_flag_events
FOR EACH ROW EXECUTE FUNCTION internal.deny_tenant_release_flag_event_mutation();

CREATE OR REPLACE FUNCTION internal.set_tenant_release_flag(
    p_tenant_id uuid,
    p_flag_key text,
    p_enabled boolean,
    p_reason text,
    p_actor_label text,
    p_actor_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
    v_flag_key text := pg_catalog.lower(pg_catalog.btrim(
        COALESCE(p_flag_key, '')
    ));
    v_existing_enabled boolean;
BEGIN
    IF p_tenant_id IS NULL OR p_enabled IS NULL THEN
        RAISE EXCEPTION 'Tenant id and enabled state are required'
            USING ERRCODE = '22023';
    END IF;
    IF v_flag_key !~ '^[a-z][a-z0-9_]{2,62}$' THEN
        RAISE EXCEPTION 'Invalid release flag key' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 8 THEN
        RAISE EXCEPTION 'A release reason of at least 8 characters is required'
            USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_actor_label, ''))) < 3 THEN
        RAISE EXCEPTION 'A release actor label is required'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1
      FROM public.tenants AS t
     WHERE t.id = p_tenant_id
     FOR KEY SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown release tenant' USING ERRCODE = 'P0002';
    END IF;

    PERFORM 1
      FROM internal.release_flag_definitions AS d
     WHERE d.flag_key = v_flag_key
       AND d.retired_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown or retired release flag' USING ERRCODE = '22023';
    END IF;

    SELECT f.enabled
      INTO v_existing_enabled
      FROM internal.tenant_release_flags AS f
     WHERE f.tenant_id = p_tenant_id
       AND f.flag_key = v_flag_key
     FOR UPDATE;

    IF FOUND AND v_existing_enabled IS NOT DISTINCT FROM p_enabled THEN
        RETURN false;
    END IF;

    INSERT INTO internal.tenant_release_flags (
        tenant_id,
        flag_key,
        enabled,
        change_reason,
        actor_label,
        actor_user_id
    ) VALUES (
        p_tenant_id,
        v_flag_key,
        p_enabled,
        pg_catalog.btrim(p_reason),
        pg_catalog.btrim(p_actor_label),
        p_actor_user_id
    )
    ON CONFLICT (tenant_id, flag_key) DO UPDATE
       SET enabled = EXCLUDED.enabled,
           change_reason = EXCLUDED.change_reason,
           actor_label = EXCLUDED.actor_label,
           actor_user_id = EXCLUDED.actor_user_id;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION internal.tenant_release_flag_enabled(
    p_tenant_id uuid,
    p_flag_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
    SELECT p_tenant_id IS NOT NULL
       AND public.tenant_has_operational_access(p_tenant_id)
       AND EXISTS (
            SELECT 1
              FROM internal.release_flag_definitions AS d
              JOIN internal.tenant_release_flags AS f
                ON f.flag_key = d.flag_key
               AND f.tenant_id = p_tenant_id
             WHERE d.flag_key = pg_catalog.lower(pg_catalog.btrim(
                       COALESCE(p_flag_key, '')
                   ))
               AND d.retired_at IS NULL
               AND f.enabled IS TRUE
       );
$function$;

ALTER FUNCTION internal.set_tenant_release_flag(uuid, text, boolean, text, text, uuid)
    OWNER TO postgres;
ALTER FUNCTION internal.tenant_release_flag_enabled(uuid, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION internal.set_tenant_release_flag(
    uuid, text, boolean, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION internal.tenant_release_flag_enabled(uuid, text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.set_tenant_release_flag(
    uuid, text, boolean, text, text, uuid
) TO postgres;
GRANT EXECUTE ON FUNCTION internal.tenant_release_flag_enabled(uuid, text)
    TO postgres;

CREATE OR REPLACE FUNCTION public.get_my_tenant_release_flag(p_flag_key text)
RETURNS TABLE (
    tenant_id uuid,
    flag_key text,
    enabled boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_tenant_id uuid;
    v_flag_key text := pg_catalog.lower(pg_catalog.btrim(
        COALESCE(p_flag_key, '')
    ));
BEGIN
    v_tenant_id := public.get_user_tenant_id();

    tenant_id := v_tenant_id;
    flag_key := v_flag_key;
    enabled := false;

    IF v_tenant_id IS NOT NULL
       AND v_flag_key ~ '^[a-z][a-z0-9_]{2,62}$'
    THEN
        enabled := internal.tenant_release_flag_enabled(
            v_tenant_id,
            v_flag_key
        );
    END IF;

    RETURN NEXT;
END;
$function$;

ALTER FUNCTION public.get_my_tenant_release_flag(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_my_tenant_release_flag(text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_release_flag(text)
    TO authenticated, postgres;

INSERT INTO internal.release_flag_definitions (flag_key, description)
VALUES (
    'operations_golden_path_v1',
    'Tenant-scoped production canary for the operations Golden Path v1 release.'
);

COMMENT ON TABLE internal.release_flag_definitions IS
    'Private catalog of release controls. Definitions never enable a tenant by themselves.';
COMMENT ON TABLE internal.tenant_release_flags IS
    'Private tenant release overrides. Missing rows and enabled=false both fail closed.';
COMMENT ON TABLE internal.tenant_release_flag_events IS
    'Append-only audit history for tenant release-control state changes.';
COMMENT ON FUNCTION internal.set_tenant_release_flag(uuid, text, boolean, text, text, uuid) IS
    'Postgres-only, audited release-control mutation. Returns false for an idempotent no-op.';
COMMENT ON FUNCTION internal.tenant_release_flag_enabled(uuid, text) IS
    'Postgres-only backend predicate combining operational tenant access with an enabled release override.';
COMMENT ON FUNCTION public.get_my_tenant_release_flag(text) IS
    'Read-only authenticated release getter. Tenant identity is derived from the active caller and cannot be supplied by the client.';

COMMIT;
