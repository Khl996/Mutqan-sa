\set ON_ERROR_STOP on

BEGIN;

DO $fixture$
DECLARE
    v_tenant_id uuid := gen_random_uuid();
    v_slug text := 'p0-governance-bootstrap-' || replace(v_tenant_id::text, '-', '');
    v_count integer;
    v_roles text[];
BEGIN
    INSERT INTO public.tenants (id, name, name_ar, slug)
    VALUES (
        v_tenant_id,
        'P0 Governance Bootstrap Fixture',
        'اختبار تهيئة صلاحيات الحوكمة',
        v_slug
    );

    SELECT count(*), array_agg(role ORDER BY role)
      INTO v_count, v_roles
      FROM public.governance_approval_authority_limits
     WHERE tenant_id = v_tenant_id
       AND limit_code LIKE 'default\_%\_native' ESCAPE '\'
       AND profile_id IS NULL
       AND is_active IS TRUE
       AND deactivated_at IS NULL
       AND max_approval_amount = 999999999.99;

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Expected five default governance authority rows for a new tenant, found %', v_count;
    END IF;

    IF v_roles IS DISTINCT FROM ARRAY[
        'engineer',
        'facility_manager',
        'maintenance_manager',
        'supervisor',
        'tenant_admin'
    ]::text[] THEN
        RAISE EXCEPTION 'Unexpected default governance authority roles: %', v_roles;
    END IF;

    -- The reconciliation helper must remain idempotent and preserve the
    -- tenant's exactly-once default set.
    PERFORM public.ensure_default_governance_authority_limits(v_tenant_id);

    SELECT count(*)
      INTO v_count
      FROM public.governance_approval_authority_limits
     WHERE tenant_id = v_tenant_id
       AND limit_code LIKE 'default\_%\_native' ESCAPE '\';

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Governance authority reconciliation is not idempotent; found % rows', v_count;
    END IF;

    IF has_function_privilege('anon', 'internal.bootstrap_tenant_governance_authority_limits()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'internal.bootstrap_tenant_governance_authority_limits()', 'EXECUTE')
       OR has_function_privilege('service_role', 'internal.bootstrap_tenant_governance_authority_limits()', 'EXECUTE')
    THEN
        RAISE EXCEPTION 'Tenant governance bootstrap trigger function leaked API execution';
    END IF;

    IF has_function_privilege('authenticated', 'public.ensure_default_governance_authority_limits(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.ensure_default_governance_authority_limits(uuid)', 'EXECUTE')
    THEN
        RAISE EXCEPTION 'Default governance authority helper leaked direct API execution';
    END IF;
END;
$fixture$;

ROLLBACK;
