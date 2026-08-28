-- Keep tenant provisioning and governance authority in one atomic contract.
--
-- Historical governance migrations seeded tenants that existed at the time,
-- but tenants provisioned later did not receive the default native authority
-- rows. As a result, their first standard work order could be evaluated but no
-- tenant administrator could approve it. This forward-only reconciliation
-- makes the same accepted defaults part of every future tenant insert and
-- backfills only missing default rows for existing tenants.

BEGIN;

SET LOCAL check_function_bodies = on;

DO $executor_precondition$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            USING ERRCODE = '42501',
                  MESSAGE = 'Tenant governance authority bootstrap migration must be executed by postgres';
    END IF;
END;
$executor_precondition$;

-- Preserve the existing helper and pin its historical relative references to
-- trusted schemas before it becomes part of the tenant-insert path.
ALTER FUNCTION public.ensure_default_governance_authority_limits(uuid)
    SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.ensure_default_governance_authority_limits(uuid)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_default_governance_authority_limits(uuid)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_default_governance_authority_limits(uuid)
    TO postgres;

CREATE OR REPLACE FUNCTION internal.bootstrap_tenant_governance_authority_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, internal, pg_temp
AS $function$
BEGIN
    PERFORM public.ensure_default_governance_authority_limits(NEW.id);
    RETURN NEW;
END;
$function$;

ALTER FUNCTION internal.bootstrap_tenant_governance_authority_limits()
    OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.bootstrap_tenant_governance_authority_limits()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.bootstrap_tenant_governance_authority_limits()
    TO postgres;

DROP TRIGGER IF EXISTS trg_bootstrap_tenant_governance_authority_limits
    ON public.tenants;
CREATE TRIGGER trg_bootstrap_tenant_governance_authority_limits
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION internal.bootstrap_tenant_governance_authority_limits();

-- Reconcile tenants created after the historical one-time seed. The helper is
-- idempotent and never overwrites tenant-specific authority configuration.
SELECT public.ensure_default_governance_authority_limits(t.id)
  FROM public.tenants AS t;

COMMENT ON FUNCTION internal.bootstrap_tenant_governance_authority_limits() IS
    'Postgres-owned tenant insert hook that atomically creates the accepted default governance authority rows for every new tenant.';
COMMENT ON TRIGGER trg_bootstrap_tenant_governance_authority_limits ON public.tenants IS
    'Makes governance authority bootstrap a required part of tenant creation; failures roll back the tenant insert.';

COMMIT;
