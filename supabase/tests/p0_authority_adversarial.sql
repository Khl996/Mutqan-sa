-- P0 central authority and provisioning adversarial verification.
-- Run after 20260821013641 (and the remaining P0 migrations) in the isolated
-- PostgreSQL 17 replay database. All fixture data and request state roll back.

\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------------
-- Catalog contracts: explicit callers, postgres-owned definer boundaries,
-- no ambient profile bypass, and a private provisioning approval ledger.
-- ---------------------------------------------------------------------------

DO $assert_catalog$
DECLARE
    v_definition text;
BEGIN
    IF to_regprocedure('public.current_actor_is_active()') IS NULL
       OR to_regprocedure('public.intake_can_manage_tenant(uuid)') IS NULL
       OR to_regprocedure('public.approve_tenant_registration(uuid,text,timestamptz)') IS NULL
       OR to_regprocedure(
             'public.provision_tenant(text,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean,text,text)'
           ) IS NULL
       OR to_regprocedure('public.guard_work_order_sensitive_fields()') IS NULL
       OR to_regprocedure('public.guard_standard_governance_before_work_order_start()') IS NULL
       OR to_regprocedure('public.start_work_order_emergency(uuid,text,text,jsonb,uuid,uuid,uuid,uuid)') IS NULL
    THEN
        RAISE EXCEPTION 'one or more P0 authority functions are missing';
    END IF;

    IF has_function_privilege('anon', 'public.current_actor_is_active()', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.current_actor_is_active()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.intake_can_manage_tenant(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.intake_can_manage_tenant(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.intake_can_manage_tenant(uuid)', 'EXECUTE')
       OR has_function_privilege(
            'anon',
            'public.provision_tenant(text,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean,text,text)',
            'EXECUTE'
          )
       OR NOT has_function_privilege(
            'authenticated',
            'public.provision_tenant(text,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean,text,text)',
            'EXECUTE'
          )
       OR NOT has_function_privilege(
            'service_role',
            'public.provision_tenant(text,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean,text,text)',
            'EXECUTE'
          )
       OR has_function_privilege(
            'anon', 'public.approve_tenant_registration(uuid,text,timestamptz)', 'EXECUTE'
          )
       OR NOT has_function_privilege(
            'authenticated', 'public.approve_tenant_registration(uuid,text,timestamptz)', 'EXECUTE'
          )
       OR NOT has_function_privilege(
            'service_role', 'public.approve_tenant_registration(uuid,text,timestamptz)', 'EXECUTE'
          )
    THEN
        RAISE EXCEPTION 'P0 provisioning function ACL contract is incorrect';
    END IF;

    IF has_function_privilege(
           'anon',
           'public.start_work_order_emergency(uuid,text,text,jsonb,uuid,uuid,uuid,uuid)',
           'EXECUTE'
       )
       OR NOT has_function_privilege(
           'authenticated',
           'public.start_work_order_emergency(uuid,text,text,jsonb,uuid,uuid,uuid,uuid)',
           'EXECUTE'
       )
       OR has_function_privilege(
           'authenticated',
           'public.select_approval_matrix_rule(uuid,integer,integer,numeric)',
           'EXECUTE'
       )
       OR NOT has_function_privilege(
           'service_role',
           'public.select_approval_matrix_rule(uuid,integer,integer,numeric)',
           'EXECUTE'
       )
       OR has_function_privilege(
           'authenticated', 'public.guard_work_order_sensitive_fields()', 'EXECUTE'
       )
       OR has_function_privilege(
           'service_role', 'public.guard_work_order_sensitive_fields()', 'EXECUTE'
       )
       OR NOT has_function_privilege(
           'postgres', 'public.guard_work_order_sensitive_fields()', 'EXECUTE'
       )
    THEN
        RAISE EXCEPTION 'P0 work-order function ACL contract is incorrect';
    END IF;

    IF has_table_privilege(
           'authenticated', 'public.tenant_provisioning_approvals', 'SELECT'
       )
       OR has_table_privilege(
           'anon', 'public.tenant_provisioning_approvals', 'SELECT'
       )
       OR NOT has_table_privilege(
           'service_role', 'public.tenant_provisioning_approvals', 'SELECT'
       )
       OR NOT EXISTS (
           SELECT 1
             FROM pg_class c
            WHERE c.oid = 'public.tenant_provisioning_approvals'::regclass
              AND c.relrowsecurity IS TRUE
       )
    THEN
        RAISE EXCEPTION 'tenant provisioning approval ledger is exposed or lacks RLS';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p')
           AND c.relrowsecurity IS TRUE
           AND NOT EXISTS (
               SELECT 1
                 FROM pg_policy p
                WHERE p.polrelid = c.oid
                  AND p.polname = 'mutqan_active_authenticated_actor'
                  AND p.polpermissive IS FALSE
                  AND p.polroles = ARRAY['authenticated'::regrole::oid]
           )
    ) THEN
        RAISE EXCEPTION 'a public RLS table lacks the restrictive active-actor policy';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc p
         WHERE p.oid IN (
             'public.current_actor_is_active()'::regprocedure::oid,
             'public.intake_can_manage_tenant(uuid)'::regprocedure::oid,
             'public.approve_tenant_registration(uuid,text,timestamptz)'::regprocedure::oid,
             'public.provision_tenant(text,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean,text,text)'::regprocedure::oid,
             'public.guard_standard_governance_before_work_order_start()'::regprocedure::oid,
             'public.guard_work_order_active_actor()'::regprocedure::oid,
             'public.guard_work_order_governance_active_actor()'::regprocedure::oid,
             'public.start_work_order_emergency(uuid,text,text,jsonb,uuid,uuid,uuid,uuid)'::regprocedure::oid,
             'public.select_approval_matrix_rule(uuid,integer,integer,numeric)'::regprocedure::oid
         )
           AND (
               pg_get_userbyid(p.proowner) <> 'postgres'
               OR p.prosecdef IS DISTINCT FROM TRUE
               OR COALESCE(array_to_string(p.proconfig, ','), '') !~ 'search_path=pg_catalog'
           )
    ) THEN
        RAISE EXCEPTION 'a P0 SECURITY DEFINER boundary has the wrong owner or search_path';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc p
         WHERE p.oid = 'public.guard_work_order_sensitive_fields()'::regprocedure::oid
           AND (
               pg_get_userbyid(p.proowner) <> 'postgres'
               OR p.prosecdef IS DISTINCT FROM FALSE
               OR p.proconfig IS DISTINCT FROM
                  ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
           )
    ) THEN
        RAISE EXCEPTION 'sensitive work-order trigger is not an explicit SECURITY INVOKER boundary';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc p
          CROSS JOIN LATERAL aclexplode(
              COALESCE(p.proacl, acldefault('f', p.proowner))
          ) acl
         WHERE p.oid IN (
             'public.current_actor_is_active()'::regprocedure::oid,
             'public.intake_can_manage_tenant(uuid)'::regprocedure::oid,
             'public.guard_work_order_sensitive_fields()'::regprocedure::oid,
             'public.approve_tenant_registration(uuid,text,timestamptz)'::regprocedure::oid,
             'public.provision_tenant(text,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean,text,text)'::regprocedure::oid,
             'public.guard_standard_governance_before_work_order_start()'::regprocedure::oid,
             'public.guard_work_order_active_actor()'::regprocedure::oid,
             'public.guard_work_order_governance_active_actor()'::regprocedure::oid,
             'public.start_work_order_emergency(uuid,text,text,jsonb,uuid,uuid,uuid,uuid)'::regprocedure::oid,
             'public.select_approval_matrix_rule(uuid,integer,integer,numeric)'::regprocedure::oid
         )
           AND acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'PUBLIC retains EXECUTE on a P0 authority boundary';
    END IF;

    SELECT pg_get_functiondef(
        'public.enforce_profile_update_permissions()'::regprocedure
    ) INTO v_definition;
    IF position('app.bypass_profile_guard' IN v_definition) > 0 THEN
        RAISE EXCEPTION 'profile guard still trusts caller-controlled bypass state';
    END IF;

    SELECT lower(pg_get_functiondef(
        'public.intake_can_manage_tenant(uuid)'::regprocedure
    )) INTO v_definition;
    IF position('current_actor_is_active' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'intake administration does not use the central suspension authority';
    END IF;

    SELECT lower(pg_get_functiondef(
        'public.guard_work_order_sensitive_fields()'::regprocedure
    )) INTO v_definition;
    IF position('work_order_workflow_authorized' IN v_definition) > 0
       OR position('current_user' IN v_definition) = 0
    THEN
        RAISE EXCEPTION 'sensitive work-order guard still trusts ambient caller state';
    END IF;

    SELECT pg_get_functiondef(
        'public.guard_standard_governance_before_work_order_start()'::regprocedure
    ) INTO v_definition;
    IF position('IF NOT FOUND' IN v_definition) = 0
       OR position('Work-order governance must be evaluated before work starts' IN v_definition) = 0
    THEN
        RAISE EXCEPTION 'standard work-order start does not fail closed without governance';
    END IF;

    SELECT pg_get_functiondef(
        'public.select_approval_matrix_rule(uuid,integer,integer,numeric)'::regprocedure
    ) INTO v_definition;
    IF position('p_amount IS NULL' IN v_definition) = 0
       OR position('r.auto_approve IS FALSE' IN v_definition) = 0
    THEN
        RAISE EXCEPTION 'unknown work-order cost is not explicitly routed away from auto approval';
    END IF;
END
$assert_catalog$;

-- ---------------------------------------------------------------------------
-- Real application fixtures. The signup metadata deliberately requests an
-- elevated role to prove the auth trigger owns profile authority.
-- ---------------------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.email', '', true);

INSERT INTO public.subscription_plans (
    id, code, name, name_ar, price_monthly, price_yearly,
    is_active, is_default, trial_days, display_order
) VALUES (
    '30000000-0000-4000-8000-000000000001',
    'p0-authority-nine-day',
    'P0 Authority Nine Day',
    'P0 Authority Nine Day',
    90,
    900,
    true,
    false,
    9,
    9000
);

INSERT INTO public.tenants (
    id, name, slug, subscription_status, trial_ends_at, is_active
) VALUES
    (
        '30000000-0000-4000-8000-000000000011',
        'P0 Authority Tenant A',
        'p0-authority-tenant-a',
        'trial',
        now() + interval '30 days',
        true
    ),
    (
        '30000000-0000-4000-8000-000000000012',
        'P0 Authority Tenant B',
        'p0-authority-tenant-b',
        'trial',
        now() + interval '30 days',
        true
    );

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
VALUES
    (
        '30000000-0000-4000-8000-000000000021',
        'p0-normal-a@example.invalid',
        '{"full_name":"P0 Normal A"}'::jsonb,
        now()
    ),
    (
        '30000000-0000-4000-8000-000000000022',
        'p0-inactive@example.invalid',
        '{"full_name":"P0 Inactive"}'::jsonb,
        now()
    ),
    (
        '30000000-0000-4000-8000-000000000023',
        'p0-normal-b@example.invalid',
        '{"full_name":"P0 Normal B"}'::jsonb,
        now()
    ),
    (
        '30000000-0000-4000-8000-000000000024',
        'p0-tenant-admin@example.invalid',
        '{"full_name":"P0 Tenant Admin"}'::jsonb,
        now()
    ),
    (
        '30000000-0000-4000-8000-000000000025',
        'p0-platform-admin@example.invalid',
        '{"full_name":"P0 Platform Admin"}'::jsonb,
        now()
    ),
    (
        '30000000-0000-4000-8000-000000000026',
        'p0-signup@example.invalid',
        '{"full_name":"P0 Signup","role":"platform_admin","is_super_admin":true,"tenant_id":"30000000-0000-4000-8000-000000000012"}'::jsonb,
        now()
    );

DO $assert_signup_profile$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = '30000000-0000-4000-8000-000000000026'
           AND p.email = 'p0-signup@example.invalid'
           AND p.full_name = 'P0 Signup'
           AND p.role = 'user'
           AND p.tenant_id IS NULL
           AND p.is_super_admin IS NOT TRUE
           AND p.is_active IS TRUE
    ) OR (
        SELECT count(*)
          FROM public.profiles p
         WHERE p.id = '30000000-0000-4000-8000-000000000026'
    ) <> 1 THEN
        RAISE EXCEPTION 'signup trigger accepted caller-owned authority metadata';
    END IF;
END
$assert_signup_profile$;

UPDATE public.profiles
   SET tenant_id = '30000000-0000-4000-8000-000000000011',
       role = 'technician',
       is_active = true
 WHERE id = '30000000-0000-4000-8000-000000000021';

UPDATE public.profiles
   SET tenant_id = '30000000-0000-4000-8000-000000000011',
       role = 'platform_admin',
       is_active = false
 WHERE id = '30000000-0000-4000-8000-000000000022';

UPDATE public.profiles
   SET tenant_id = '30000000-0000-4000-8000-000000000012',
       role = 'technician',
       is_active = true
 WHERE id = '30000000-0000-4000-8000-000000000023';

UPDATE public.profiles
   SET tenant_id = '30000000-0000-4000-8000-000000000011',
       role = 'tenant_admin',
       is_active = true
 WHERE id = '30000000-0000-4000-8000-000000000024';

UPDATE public.profiles
   SET tenant_id = NULL,
       role = 'platform_admin',
       is_active = true
 WHERE id = '30000000-0000-4000-8000-000000000025';

INSERT INTO public.assets (
    id, tenant_id, code, name, status, criticality
) VALUES
    (
        '30000000-0000-4000-8000-000000000031',
        '30000000-0000-4000-8000-000000000011',
        'P0-A-ASSET-1',
        'P0 Tenant A Critical Asset',
        'operational',
        'critical'
    ),
    (
        '30000000-0000-4000-8000-000000000032',
        '30000000-0000-4000-8000-000000000011',
        'P0-A-ASSET-2',
        'P0 Tenant A Alternate Asset',
        'operational',
        'low'
    ),
    (
        '30000000-0000-4000-8000-000000000033',
        '30000000-0000-4000-8000-000000000012',
        'P0-B-ASSET-1',
        'P0 Tenant B Asset',
        'operational',
     'medium'
    );

INSERT INTO public.intake_sources (
    id, tenant_id, source_type, display_name, secret
) VALUES (
    '30000000-0000-4000-8000-000000000051',
    '30000000-0000-4000-8000-000000000011',
    'form',
    'P0 protected intake source',
    'p0-protected-intake-source-secret'
);

INSERT INTO public.work_orders (
    id, tenant_id, code, title, status, priority, work_type, assigned_to, asset_id
) VALUES
    (
        '30000000-0000-4000-8000-000000000041',
        '30000000-0000-4000-8000-000000000011',
        'P0-WO-NO-GOV',
        'P0 missing governance fixture',
        'assigned',
        'medium',
        'reactive',
        '30000000-0000-4000-8000-000000000021',
        '30000000-0000-4000-8000-000000000031'
    ),
    (
        '30000000-0000-4000-8000-000000000042',
        '30000000-0000-4000-8000-000000000011',
        'P0-WO-INACTIVE',
        'P0 inactive actor fixture',
        'assigned',
        'medium',
        'reactive',
        '30000000-0000-4000-8000-000000000022',
        '30000000-0000-4000-8000-000000000031'
    ),
    (
        '30000000-0000-4000-8000-000000000043',
        '30000000-0000-4000-8000-000000000012',
        'P0-WO-TENANT-B',
        'P0 cross-tenant fixture',
        'assigned',
        'medium',
        'reactive',
        '30000000-0000-4000-8000-000000000023',
        '30000000-0000-4000-8000-000000000033'
    ),
    (
        '30000000-0000-4000-8000-000000000044',
        '30000000-0000-4000-8000-000000000011',
        'P0-WO-EMERGENCY',
        'P0 emergency scope fixture',
        'assigned',
        'urgent',
        'reactive',
        '30000000-0000-4000-8000-000000000021',
        '30000000-0000-4000-8000-000000000031'
    );

INSERT INTO public.work_order_governance (
    tenant_id, work_order_id, route_type, governance_state
) VALUES (
    '30000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000042',
    'standard',
    'approved'
);

-- Anonymous is denied both at the provisioning API and the tenant data plane.
SET LOCAL ROLE anon;
DO $assert_anon$
DECLARE
    v_count integer;
BEGIN
    BEGIN
        PERFORM public.provision_tenant(p_name => 'Anonymous tenant');
        RAISE EXCEPTION 'anonymous caller reached provision_tenant';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        SELECT count(*) INTO v_count FROM public.assets;
        IF v_count <> 0 THEN
            RAISE EXCEPTION 'anonymous caller read % protected assets', v_count;
        END IF;
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_anon$;
RESET ROLE;

-- A normal active tenant-A user can see only tenant A, cannot self-elevate
-- through the retired GUC, cannot provision a tenant, and cannot cross tenant.
SELECT set_config(
    'request.jwt.claim.sub', '30000000-0000-4000-8000-000000000021', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.email', 'p0-normal-a@example.invalid', true);
SET LOCAL ROLE authenticated;
DO $assert_normal_active$
DECLARE
    v_count integer;
BEGIN
    IF public.current_actor_is_active() IS DISTINCT FROM TRUE
       OR public.get_user_tenant_id() IS DISTINCT FROM
          '30000000-0000-4000-8000-000000000011'::uuid
       OR public.can_view_inventory(
          '30000000-0000-4000-8000-000000000011'::uuid
       ) IS DISTINCT FROM TRUE
       OR public.can_view_inventory(
          '30000000-0000-4000-8000-000000000012'::uuid
       ) IS NOT FALSE
    THEN
        RAISE EXCEPTION 'normal active tenant authority is incorrect';
    END IF;

    SELECT count(*) INTO v_count FROM public.assets;
    IF v_count <> 2 OR EXISTS (
        SELECT 1
          FROM public.assets
         WHERE tenant_id <> '30000000-0000-4000-8000-000000000011'
    ) THEN
        RAISE EXCEPTION 'tenant A data plane leaked or hid assets; visible=%', v_count;
    END IF;

    PERFORM set_config('app.bypass_profile_guard', '1', true);
    BEGIN
        UPDATE public.profiles
           SET role = 'platform_admin', is_super_admin = true
         WHERE id = '30000000-0000-4000-8000-000000000021';
        RAISE EXCEPTION 'caller-controlled profile bypass elevated a normal user';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    PERFORM set_config('app.work_order_workflow_authorized', 'true', true);
    BEGIN
        UPDATE public.work_orders
           SET status = 'completed', completed_at = now()
         WHERE id = '30000000-0000-4000-8000-000000000041'::uuid;
        RAISE EXCEPTION 'caller-controlled workflow GUC changed sensitive work-order state';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        UPDATE public.profiles
           SET is_active = false
         WHERE id = '30000000-0000-4000-8000-000000000021'::uuid;
        RAISE EXCEPTION 'normal user changed suspension state outside the managed-user service';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM public.provision_tenant(
            p_name => 'Bound normal user tenant',
            p_assign_caller_as_admin => true
        );
        RAISE EXCEPTION 'bound normal user provisioned another tenant';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM public.start_work_order(
            '30000000-0000-4000-8000-000000000041'::uuid
        );
        RAISE EXCEPTION 'work order started without a governance record';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM public.start_work_order(
            '30000000-0000-4000-8000-000000000043'::uuid
        );
        RAISE EXCEPTION 'tenant A user started tenant B work order';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM public.start_work_order_emergency(
            p_work_order_id => '30000000-0000-4000-8000-000000000044'::uuid,
            p_override_reason => 'P0 fixture emergency',
            p_override_severity => 'critical',
            p_evidence => '[{"kind":"fixture"}]'::jsonb,
            p_affected_asset_id => '30000000-0000-4000-8000-000000000032'::uuid
        );
        RAISE EXCEPTION 'caller replaced canonical emergency asset scope';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_normal_active$;
RESET ROLE;

DO $assert_failed_paths_unchanged$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM public.profiles
         WHERE id = '30000000-0000-4000-8000-000000000021'
           AND (role <> 'technician' OR is_super_admin IS TRUE)
    ) OR EXISTS (
        SELECT 1
          FROM public.work_orders
         WHERE id IN (
             '30000000-0000-4000-8000-000000000041',
             '30000000-0000-4000-8000-000000000043',
             '30000000-0000-4000-8000-000000000044'
         )
           AND status <> 'assigned'
    ) OR EXISTS (
        SELECT 1
          FROM public.work_order_governance
         WHERE work_order_id = '30000000-0000-4000-8000-000000000044'
    ) THEN
        RAISE EXCEPTION 'a denied normal-user path left privileged state behind';
    END IF;
END
$assert_failed_paths_unchanged$;

-- An explicit standard approval enables the exact same assigned actor. A
-- matching emergency scope uses its explicit governance route successfully.
INSERT INTO public.work_order_governance (
    tenant_id, work_order_id, route_type, governance_state
) VALUES (
    '30000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000041',
    'standard',
    'approved'
);

SELECT set_config(
    'request.jwt.claim.sub', '30000000-0000-4000-8000-000000000021', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $assert_approved_paths$
DECLARE
    v_result jsonb;
BEGIN
    PERFORM public.start_work_order(
        '30000000-0000-4000-8000-000000000041'::uuid
    );

    v_result := public.start_work_order_emergency(
        p_work_order_id => '30000000-0000-4000-8000-000000000044'::uuid,
        p_override_reason => 'P0 fixture matching emergency scope',
        p_override_severity => 'critical',
        p_evidence => '[{"kind":"fixture"}]'::jsonb,
        p_affected_asset_id => '30000000-0000-4000-8000-000000000031'::uuid
    );
    IF v_result->>'success' IS DISTINCT FROM 'true'
       OR v_result->>'governance_state' IS DISTINCT FROM 'post_action_required'
       OR v_result->>'effective_severity' IS DISTINCT FROM 'critical'
    THEN
        RAISE EXCEPTION 'valid explicit emergency path returned an invalid result: %', v_result;
    END IF;
END
$assert_approved_paths$;
RESET ROLE;

DO $assert_approved_results$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.work_orders
         WHERE id = '30000000-0000-4000-8000-000000000041'
           AND status = 'in_progress'
    ) OR NOT EXISTS (
        SELECT 1 FROM public.work_orders
         WHERE id = '30000000-0000-4000-8000-000000000044'
           AND status = 'in_progress'
    ) OR NOT EXISTS (
        SELECT 1 FROM public.work_order_governance
         WHERE work_order_id = '30000000-0000-4000-8000-000000000044'
           AND route_type = 'emergency_override'
           AND governance_state = 'post_action_required'
           AND affected_asset_id = '30000000-0000-4000-8000-000000000031'
           AND override_severity = 'critical'
    ) THEN
        RAISE EXCEPTION 'approved standard or emergency work-order result is missing';
    END IF;
END
$assert_approved_results$;

-- An inactive user remains suspended even with a platform role, a tenant,
-- an assignment and an approved governance record already in place.
SELECT set_config(
    'request.jwt.claim.sub', '30000000-0000-4000-8000-000000000022', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $assert_inactive$
DECLARE
    v_count integer;
    v_updated integer;
BEGIN
    IF public.current_actor_is_active() IS NOT FALSE
       OR public.is_platform_admin() IS NOT FALSE
       OR public.can_view_platform_tenants() IS NOT FALSE
       OR public.can_manage_work_orders_scope(
          '30000000-0000-4000-8000-000000000011'::uuid
       ) IS NOT FALSE
       OR public.intake_can_manage_tenant(
          '30000000-0000-4000-8000-000000000011'::uuid
       ) IS NOT FALSE
       OR public.get_user_tenant_id() IS NOT NULL
    THEN
        RAISE EXCEPTION 'inactive platform-shaped actor retained authority';
    END IF;

    SELECT count(*) INTO v_count FROM public.assets;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'inactive user retained tenant data access';
    END IF;

    SELECT count(*)
      INTO v_count
      FROM public.subscription_plans
     WHERE id = '30000000-0000-4000-8000-000000000001';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'inactive user retained direct subscription-plan read access';
    END IF;

    BEGIN
        UPDATE public.subscription_plans
           SET description = 'inactive caller mutation'
         WHERE id = '30000000-0000-4000-8000-000000000001';
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated <> 0 THEN
            RAISE EXCEPTION 'inactive user mutated a subscription plan';
        END IF;
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM public.intake_update_source(
            '30000000-0000-4000-8000-000000000051'::uuid,
            'inactive caller mutation', NULL, NULL, NULL, NULL
        );
        RAISE EXCEPTION 'inactive platform-shaped caller mutated an intake source';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM public.start_work_order(
            '30000000-0000-4000-8000-000000000042'::uuid
        );
        RAISE EXCEPTION 'inactive assigned actor started an approved work order';
    EXCEPTION
        WHEN SQLSTATE '28000' THEN NULL;
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_inactive$;
RESET ROLE;

DO $assert_inactive_intake_unchanged$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.intake_sources
         WHERE id = '30000000-0000-4000-8000-000000000051'::uuid
           AND display_name = 'P0 protected intake source'
    ) THEN
        RAISE EXCEPTION 'inactive intake denial was not state-preserving';
    END IF;
END
$assert_inactive_intake_unchanged$;

-- Tenant administrators retain only tenant-scoped management authority and
-- cannot mint signup approvals or another tenant.
SELECT set_config(
    'request.jwt.claim.sub', '30000000-0000-4000-8000-000000000024', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $assert_tenant_admin$
BEGIN
    IF public.current_actor_is_active() IS DISTINCT FROM TRUE
       OR public.can_manage_work_orders_scope(
          '30000000-0000-4000-8000-000000000011'::uuid
       ) IS DISTINCT FROM TRUE
       OR public.can_manage_work_orders_scope(
          '30000000-0000-4000-8000-000000000012'::uuid
       ) IS NOT FALSE
       OR public.can_view_platform_tenants() IS NOT FALSE
    THEN
        RAISE EXCEPTION 'tenant administrator authority is incorrectly scoped';
    END IF;

    BEGIN
        PERFORM public.approve_tenant_registration(
            '30000000-0000-4000-8000-000000000026'::uuid,
            'p0-authority-nine-day',
            now() + interval '1 day'
        );
        RAISE EXCEPTION 'tenant administrator created a provisioning approval';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        UPDATE public.profiles
           SET is_active = false
         WHERE id = '30000000-0000-4000-8000-000000000021'::uuid;
        RAISE EXCEPTION 'tenant administrator changed suspension state outside the managed-user service';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM public.provision_tenant(
            p_name => 'Tenant admin extra tenant',
            p_assign_caller_as_admin => true
        );
        RAISE EXCEPTION 'tenant administrator provisioned another tenant';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_tenant_admin$;
RESET ROLE;

DO $assert_tenant_admin_profile_change_unchanged$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.profiles
         WHERE id = '30000000-0000-4000-8000-000000000021'::uuid
           AND is_active IS TRUE
    ) THEN
        RAISE EXCEPTION 'denied tenant-admin suspension change was not state-preserving';
    END IF;
END
$assert_tenant_admin_profile_change_unchanged$;

-- Active platform authority can see both tenants and issue a one-time,
-- plan-bound signup approval, but cannot supply trial duration.
SELECT set_config(
    'request.jwt.claim.sub', '30000000-0000-4000-8000-000000000025', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $assert_platform_admin$
DECLARE
    v_count integer;
    v_approval jsonb;
BEGIN
    IF public.current_actor_is_active() IS DISTINCT FROM TRUE
       OR public.is_platform_admin() IS DISTINCT FROM TRUE
       OR public.can_view_platform_tenants() IS DISTINCT FROM TRUE
    THEN
        RAISE EXCEPTION 'active platform administrator authority is missing';
    END IF;

    SELECT count(*) INTO v_count
      FROM public.assets
     WHERE id IN (
        '30000000-0000-4000-8000-000000000031',
        '30000000-0000-4000-8000-000000000032',
        '30000000-0000-4000-8000-000000000033'
     );
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'platform administrator could not read both fixture tenants';
    END IF;

    BEGIN
        PERFORM public.provision_tenant(
            p_name => 'Caller-controlled trial',
            p_plan_code => 'p0-authority-nine-day',
            p_trial_days => 999,
            p_assign_caller_as_admin => false
        );
        RAISE EXCEPTION 'platform administrator supplied caller-controlled trial days';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    v_approval := public.approve_tenant_registration(
        '30000000-0000-4000-8000-000000000026'::uuid,
        'p0-authority-nine-day',
        now() + interval '1 day'
    );
    IF v_approval->>'status' IS DISTINCT FROM 'approved'
       OR v_approval->>'plan_code' IS DISTINCT FROM 'p0-authority-nine-day'
    THEN
        RAISE EXCEPTION 'platform approval was not plan-bound: %', v_approval;
    END IF;
END
$assert_platform_admin$;
RESET ROLE;

-- The unbound signup caller cannot replace the approved plan or trial. The
-- valid call consumes the approval, binds the profile, and derives nine days
-- from the server-owned plan.
SELECT set_config(
    'request.jwt.claim.sub', '30000000-0000-4000-8000-000000000026', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $assert_signup_provisioning$
DECLARE
    v_result jsonb;
    v_tenant_id uuid;
BEGIN
    BEGIN
        PERFORM public.provision_tenant(
            p_name => 'Signup plan override',
            p_plan_code => 'p0-authority-nine-day',
            p_assign_caller_as_admin => true
        );
        RAISE EXCEPTION 'signup caller supplied its own plan code';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM public.provision_tenant(
            p_name => 'Signup trial override',
            p_trial_days => 999,
            p_assign_caller_as_admin => true
        );
        RAISE EXCEPTION 'signup caller supplied its own trial duration';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    v_result := public.provision_tenant(
        p_name => 'P0 Approved Signup Tenant',
        p_slug => 'p0-approved-signup-tenant',
        p_email => 'p0-signup-tenant@example.invalid',
        p_plan_code => NULL,
        p_trial_days => NULL,
        p_assign_caller_as_admin => true,
        p_caller_full_name => 'P0 Approved Signup'
    );
    v_tenant_id := (v_result->>'tenant_id')::uuid;

    IF v_result->>'success' IS DISTINCT FROM 'true'
       OR v_result->>'plan_code' IS DISTINCT FROM 'p0-authority-nine-day'
       OR (v_result->>'trial_days')::integer <> 9
       OR (v_result->>'plan_id')::uuid IS DISTINCT FROM
          '30000000-0000-4000-8000-000000000001'::uuid
    THEN
        RAISE EXCEPTION 'approved signup result violated plan authority: %', v_result;
    END IF;

    BEGIN
        PERFORM public.provision_tenant(
            p_name => 'Consumed approval replay',
            p_assign_caller_as_admin => true
        );
        RAISE EXCEPTION 'one-time provisioning approval was replayed';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_signup_provisioning$;
RESET ROLE;

-- Inspect private approval and subscription state only after leaving the
-- authenticated role; the signup caller intentionally has no ledger access.
DO $assert_signup_atomic_result$
DECLARE
    v_tenant_id uuid;
    v_trial_ends_at timestamptz;
BEGIN
    SELECT t.id
      INTO v_tenant_id
      FROM public.tenants t
     WHERE t.slug = 'p0-approved-signup-tenant';

    IF NOT FOUND
       OR NOT EXISTS (
           SELECT 1
             FROM public.profiles p
            WHERE p.id = '30000000-0000-4000-8000-000000000026'
              AND p.tenant_id = v_tenant_id
              AND p.role = 'tenant_admin'
              AND p.is_active IS TRUE
       )
       OR NOT EXISTS (
           SELECT 1
             FROM public.tenant_provisioning_approvals a
            WHERE a.user_id = '30000000-0000-4000-8000-000000000026'
              AND a.status = 'consumed'
              AND a.tenant_id = v_tenant_id
              AND a.consumed_at IS NOT NULL
       )
    THEN
        RAISE EXCEPTION 'signup approval was not atomically consumed and bound';
    END IF;

    SELECT ts.trial_ends_at
      INTO v_trial_ends_at
      FROM public.tenant_subscriptions ts
     WHERE ts.tenant_id = v_tenant_id
       AND ts.plan_id = '30000000-0000-4000-8000-000000000001'
       AND ts.status = 'trial';
    IF NOT FOUND
       OR v_trial_ends_at IS DISTINCT FROM now() + interval '9 days'
    THEN
        RAISE EXCEPTION 'signup subscription did not use the plan-owned nine-day trial';
    END IF;
END
$assert_signup_atomic_result$;

-- Service authority is explicit through auth.role(). It may provision without
-- a user profile, but cannot inject trial days or assign a nonexistent caller.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
DO $assert_service_role$
DECLARE
    v_result jsonb;
    v_tenant_id uuid;
    v_trial_ends_at timestamptz;
    v_rule public.approval_matrix_rules%ROWTYPE;
BEGIN
    BEGIN
        PERFORM public.provision_tenant(
            p_name => 'Service trial override',
            p_plan_code => 'p0-authority-nine-day',
            p_trial_days => 999
        );
        RAISE EXCEPTION 'service caller injected trial duration';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM public.provision_tenant(
            p_name => 'Service caller reassignment',
            p_plan_code => 'p0-authority-nine-day',
            p_assign_caller_as_admin => true
        );
        RAISE EXCEPTION 'service caller reassigned itself as tenant admin';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    v_result := public.provision_tenant(
        p_name => 'P0 Service Provisioned Tenant',
        p_slug => 'p0-service-provisioned-tenant',
        p_plan_code => 'p0-authority-nine-day',
        p_trial_days => NULL,
        p_assign_caller_as_admin => false
    );
    v_tenant_id := (v_result->>'tenant_id')::uuid;

    IF v_result->>'success' IS DISTINCT FROM 'true'
       OR v_result->>'plan_code' IS DISTINCT FROM 'p0-authority-nine-day'
       OR (v_result->>'trial_days')::integer <> 9
    THEN
        RAISE EXCEPTION 'service provisioning result violated plan authority: %', v_result;
    END IF;

    SELECT ts.trial_ends_at
      INTO v_trial_ends_at
      FROM public.tenant_subscriptions ts
     WHERE ts.tenant_id = v_tenant_id
       AND ts.plan_id = '30000000-0000-4000-8000-000000000001'
       AND ts.status = 'trial';
    IF NOT FOUND
       OR v_trial_ends_at IS DISTINCT FROM now() + interval '9 days'
    THEN
        RAISE EXCEPTION 'service subscription did not use plan-owned trial days';
    END IF;

    v_rule := public.select_approval_matrix_rule(
        '30000000-0000-4000-8000-000000000011'::uuid,
        1,
        1,
        NULL
    );
    IF v_rule.auto_approve IS NOT FALSE
       OR v_rule.amount_max IS NOT NULL
    THEN
        RAISE EXCEPTION 'unknown work-order cost matched an auto-approval rule: %', v_rule.rule_code;
    END IF;
END
$assert_service_role$;
RESET ROLE;

-- Confirm the inactive work-order denial was state-preserving.
DO $assert_final_state$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.work_orders
         WHERE id = '30000000-0000-4000-8000-000000000042'
           AND status = 'assigned'
    ) THEN
        RAISE EXCEPTION 'inactive work-order start changed state';
    END IF;
END
$assert_final_state$;

ROLLBACK;
