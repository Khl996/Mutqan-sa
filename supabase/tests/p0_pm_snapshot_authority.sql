-- P0 PM snapshot authority verification.
-- Run after 20260821014205 in an isolated PostgreSQL 17/Supabase database.
-- Runtime checks use nonexistent UUIDs only and all session state is rolled back.

BEGIN;

DO $assert_catalog$
DECLARE
    v_public_definition text;
    v_internal_definition text;
    v_pm_sync_definition text;
    v_sync_definition text;
    v_start_definition text;
    v_complete_definition text;
    v_trigger_count integer;
BEGIN
    IF to_regprocedure('internal.pm_build_task_execution_snapshot(uuid)') IS NULL THEN
        RAISE EXCEPTION 'postgres-only PM snapshot implementation is missing';
    END IF;
    IF to_regprocedure('public.pm_build_task_execution_snapshot(uuid,boolean)') IS NULL THEN
        RAISE EXCEPTION 'public PM snapshot ABI is missing';
    END IF;
    IF to_regprocedure('public.current_actor_is_active()') IS NULL THEN
        RAISE EXCEPTION 'central active-actor authority prerequisite is missing';
    END IF;

    IF has_schema_privilege('anon', 'internal', 'USAGE')
       OR has_schema_privilege('authenticated', 'internal', 'USAGE')
       OR has_schema_privilege('service_role', 'internal', 'USAGE') THEN
        RAISE EXCEPTION 'a Data API role can enter the internal schema';
    END IF;

    IF has_function_privilege(
           'anon', 'internal.pm_build_task_execution_snapshot(uuid)', 'EXECUTE'
       )
       OR has_function_privilege(
           'authenticated', 'internal.pm_build_task_execution_snapshot(uuid)', 'EXECUTE'
       )
       OR has_function_privilege(
           'service_role', 'internal.pm_build_task_execution_snapshot(uuid)', 'EXECUTE'
       )
       OR NOT has_function_privilege(
           'postgres', 'internal.pm_build_task_execution_snapshot(uuid)', 'EXECUTE'
       ) THEN
        RAISE EXCEPTION 'internal PM snapshot implementation is not postgres-only';
    END IF;

    IF has_function_privilege(
           'anon', 'public.pm_build_task_execution_snapshot(uuid,boolean)', 'EXECUTE'
       )
       OR NOT has_function_privilege(
           'authenticated', 'public.pm_build_task_execution_snapshot(uuid,boolean)', 'EXECUTE'
       )
       OR NOT has_function_privilege(
           'service_role', 'public.pm_build_task_execution_snapshot(uuid,boolean)', 'EXECUTE'
       ) THEN
        RAISE EXCEPTION 'public PM snapshot wrapper ACL is incorrect';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc p
          CROSS JOIN LATERAL aclexplode(
              COALESCE(p.proacl, acldefault('f', p.proowner))
          ) acl
         WHERE p.oid IN (
             'internal.pm_build_task_execution_snapshot(uuid)'::regprocedure::oid,
             'public.pm_build_task_execution_snapshot(uuid,boolean)'::regprocedure::oid,
             'public.pm_sync_task_from_work_order()'::regprocedure::oid,
             'public.sync_maintenance_task_from_work_order()'::regprocedure::oid
         )
           AND acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'PUBLIC retains PM snapshot or trigger-function execution';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc p
         WHERE p.oid IN (
             'internal.pm_build_task_execution_snapshot(uuid)'::regprocedure::oid,
             'public.pm_build_task_execution_snapshot(uuid,boolean)'::regprocedure::oid,
             'public.pm_sync_task_from_work_order()'::regprocedure::oid,
             'public.sync_maintenance_task_from_work_order()'::regprocedure::oid,
             'public.pm_start_task(uuid)'::regprocedure::oid,
             'public.pm_complete_task(uuid,text)'::regprocedure::oid
         )
           AND (
               pg_get_userbyid(p.proowner) <> 'postgres'
               OR p.prosecdef IS DISTINCT FROM TRUE
           )
    ) THEN
        RAISE EXCEPTION 'PM SECURITY DEFINER owner/attribute contract is incorrect';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc p
         WHERE p.oid IN (
             'internal.pm_build_task_execution_snapshot(uuid)'::regprocedure::oid,
             'public.pm_build_task_execution_snapshot(uuid,boolean)'::regprocedure::oid,
             'public.pm_sync_task_from_work_order()'::regprocedure::oid,
             'public.sync_maintenance_task_from_work_order()'::regprocedure::oid
         )
           AND COALESCE(array_to_string(p.proconfig, ','), '')
               !~ 'search_path=pg_catalog, pg_temp'
    ) THEN
        RAISE EXCEPTION 'PM snapshot or trigger implementation has an unsafe search_path';
    END IF;

    SELECT pg_get_functiondef(
        'public.pm_build_task_execution_snapshot(uuid,boolean)'::regprocedure
    ) INTO v_public_definition;
    SELECT pg_get_functiondef(
        'internal.pm_build_task_execution_snapshot(uuid)'::regprocedure
    ) INTO v_internal_definition;

    IF position('pg_trigger_depth' IN lower(v_public_definition)) > 0 THEN
        RAISE EXCEPTION 'public PM snapshot wrapper still trusts ambient trigger depth';
    END IF;
    IF position('public.current_actor_is_active() IS DISTINCT FROM TRUE'
                IN v_public_definition) = 0
       OR position('public.pm_can_view_task(p_task_id) IS DISTINCT FROM TRUE'
                   IN v_public_definition) = 0 THEN
        RAISE EXCEPTION 'public PM snapshot wrapper is not active-user/fail-closed';
    END IF;
    IF position('auth.role() = ''service_role''' IN v_public_definition) = 0
       OR position('internal.pm_build_task_execution_snapshot(p_task_id)'
                   IN v_public_definition) = 0 THEN
        RAISE EXCEPTION 'public PM snapshot wrapper lacks explicit service/internal routing';
    END IF;
    IF v_public_definition ~* 'IF[^;\n]*p_skip_auth' THEN
        RAISE EXCEPTION 'deprecated p_skip_auth still influences authorization';
    END IF;
    IF lower(v_internal_definition) ~ 'auth\.(uid|role)'
       OR position('pm_can_view_task' IN v_internal_definition) > 0
       OR position('pg_trigger_depth' IN lower(v_internal_definition)) > 0 THEN
        RAISE EXCEPTION 'internal PM snapshot builder contains ambient caller authority';
    END IF;
    IF position('JOIN public.asset_groups' IN v_internal_definition) > 0 THEN
        RAISE EXCEPTION 'internal PM snapshot builder resurrects retired asset_groups';
    END IF;

    SELECT pg_get_functiondef('public.pm_sync_task_from_work_order()'::regprocedure)
      INTO v_pm_sync_definition;
    SELECT pg_get_functiondef(
        'public.sync_maintenance_task_from_work_order()'::regprocedure
    ) INTO v_sync_definition;

    IF position('internal.pm_build_task_execution_snapshot' IN v_pm_sync_definition) = 0
       OR position('internal.pm_build_task_execution_snapshot' IN v_sync_definition) = 0
       OR position('public.pm_build_task_execution_snapshot' IN v_pm_sync_definition) > 0
       OR position('public.pm_build_task_execution_snapshot' IN v_sync_definition) > 0 THEN
        RAISE EXCEPTION 'work-order PM triggers do not use the explicit internal path';
    END IF;

    IF has_function_privilege(
           'anon', 'public.pm_sync_task_from_work_order()', 'EXECUTE'
       )
       OR has_function_privilege(
           'authenticated', 'public.pm_sync_task_from_work_order()', 'EXECUTE'
       )
       OR has_function_privilege(
           'service_role', 'public.pm_sync_task_from_work_order()', 'EXECUTE'
       )
       OR has_function_privilege(
           'anon', 'public.sync_maintenance_task_from_work_order()', 'EXECUTE'
       )
       OR has_function_privilege(
           'authenticated', 'public.sync_maintenance_task_from_work_order()', 'EXECUTE'
       )
       OR has_function_privilege(
           'service_role', 'public.sync_maintenance_task_from_work_order()', 'EXECUTE'
       ) THEN
        RAISE EXCEPTION 'Data API role can execute a PM work-order trigger function';
    END IF;

    SELECT count(*)
      INTO v_trigger_count
      FROM pg_trigger t
     WHERE t.tgrelid = 'public.work_orders'::regclass
       AND NOT t.tgisinternal
       AND t.tgenabled IN ('O', 'A')
       AND t.tgfoid IN (
           'public.pm_sync_task_from_work_order()'::regprocedure::oid,
           'public.sync_maintenance_task_from_work_order()'::regprocedure::oid
       );
    IF v_trigger_count <> 2 THEN
        RAISE EXCEPTION 'expected both explicit PM work-order trigger bindings';
    END IF;

    SELECT pg_get_functiondef('public.pm_start_task(uuid)'::regprocedure)
      INTO v_start_definition;
    SELECT pg_get_functiondef('public.pm_complete_task(uuid,text)'::regprocedure)
      INTO v_complete_definition;

    IF position('public.pm_build_task_execution_snapshot' IN v_start_definition) = 0
       OR position('public.pm_build_task_execution_snapshot' IN v_complete_definition) = 0
       OR position('internal.pm_build_task_execution_snapshot' IN v_start_definition) > 0
       OR position('internal.pm_build_task_execution_snapshot' IN v_complete_definition) > 0 THEN
        RAISE EXCEPTION 'direct PM RPCs must retain the checked public snapshot path';
    END IF;
END
$assert_catalog$;

-- Transactional application fixtures. The inactive task begins with a
-- pre-existing snapshot to prove the direct start RPC cannot rely on the
-- wrapper's COALESCE branch as its only suspension check.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);

INSERT INTO public.tenants (
    id, name, slug, subscription_status, trial_ends_at, is_active
) VALUES
    (
        '20000000-0000-4000-8000-000000000001',
        'P0 PM Fixture Tenant A',
        'p0-pm-fixture-tenant-a',
        'trial',
        now() + interval '1 day',
        true
    ),
    (
        '20000000-0000-4000-8000-000000000002',
        'P0 PM Fixture Tenant B',
        'p0-pm-fixture-tenant-b',
        'trial',
        now() + interval '1 day',
        true
    );

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
VALUES
    (
        '20000000-0000-4000-8000-000000000011',
        'p0-pm-active@example.invalid',
        '{"full_name":"P0 PM Active"}'::jsonb,
        now()
    ),
    (
        '20000000-0000-4000-8000-000000000012',
        'p0-pm-inactive@example.invalid',
        '{"full_name":"P0 PM Inactive"}'::jsonb,
        now()
    ),
    (
        '20000000-0000-4000-8000-000000000013',
        'p0-pm-other-tenant@example.invalid',
        '{"full_name":"P0 PM Other Tenant"}'::jsonb,
        now()
    );

UPDATE public.profiles
   SET tenant_id = '20000000-0000-4000-8000-000000000001',
       role = 'technician',
       is_active = true
 WHERE id = '20000000-0000-4000-8000-000000000011';
UPDATE public.profiles
   SET tenant_id = '20000000-0000-4000-8000-000000000001',
       role = 'technician',
       is_active = false
 WHERE id = '20000000-0000-4000-8000-000000000012';
UPDATE public.profiles
   SET tenant_id = '20000000-0000-4000-8000-000000000002',
       role = 'technician',
       is_active = true
 WHERE id = '20000000-0000-4000-8000-000000000013';

INSERT INTO public.work_orders (
    id, tenant_id, code, title, status, work_type, assigned_to
) VALUES (
    '20000000-0000-4000-8000-000000000021',
    '20000000-0000-4000-8000-000000000001',
    'P0-PM-WO-1',
    'P0 PM work-order fixture',
    'pending',
    'preventive',
    '20000000-0000-4000-8000-000000000011'
);

INSERT INTO public.maintenance_tasks (
    id, tenant_id, title, assigned_to, status,
    related_work_order_id, execution_snapshot
) VALUES
    (
        '20000000-0000-4000-8000-000000000031',
        '20000000-0000-4000-8000-000000000001',
        'P0 PM view fixture',
        '20000000-0000-4000-8000-000000000011',
        'pending',
        NULL,
        NULL
    ),
    (
        '20000000-0000-4000-8000-000000000032',
        '20000000-0000-4000-8000-000000000001',
        'P0 PM direct execution fixture',
        '20000000-0000-4000-8000-000000000011',
        'pending',
        NULL,
        NULL
    ),
    (
        '20000000-0000-4000-8000-000000000033',
        '20000000-0000-4000-8000-000000000001',
        'P0 PM work-order execution fixture',
        '20000000-0000-4000-8000-000000000011',
        'pending',
        '20000000-0000-4000-8000-000000000021',
        NULL
    ),
    (
        '20000000-0000-4000-8000-000000000034',
        '20000000-0000-4000-8000-000000000001',
        'P0 PM inactive direct fixture',
        '20000000-0000-4000-8000-000000000012',
        'pending',
        NULL,
        '{"version":2,"snapshot_type":"pm_execution"}'::jsonb
    );

-- Anonymous callers cannot reach the public wrapper at all.
SET LOCAL ROLE anon;
DO $assert_anon_denial$
BEGIN
    BEGIN
        PERFORM public.pm_build_task_execution_snapshot(
            '20000000-0000-4000-8000-000000000031'::uuid,
            true
        );
        RAISE EXCEPTION 'anonymous caller reached the PM snapshot wrapper';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_anon_denial$;
RESET ROLE;

-- An authenticated but unknown actor cannot revive p_skip_auth or call the
-- implementation directly.
SELECT set_config(
    'request.jwt.claim.sub', '20000000-0000-4000-8000-000000000099', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $assert_unknown_actor_denial$
BEGIN
    BEGIN
        PERFORM public.pm_build_task_execution_snapshot(
            '20000000-0000-4000-8000-000000000031'::uuid,
            true
        );
        RAISE EXCEPTION 'unknown authenticated caller bypassed active-user authority';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM internal.pm_build_task_execution_snapshot(
            '20000000-0000-4000-8000-000000000031'::uuid
        );
        RAISE EXCEPTION 'authenticated caller reached the postgres-only builder';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_unknown_actor_denial$;
RESET ROLE;

-- A normal active assignee can snapshot, start and complete through the
-- checked public path.
SELECT set_config(
    'request.jwt.claim.sub', '20000000-0000-4000-8000-000000000011', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $assert_active_direct_path$
DECLARE
    v_snapshot jsonb;
BEGIN
    v_snapshot := public.pm_build_task_execution_snapshot(
        '20000000-0000-4000-8000-000000000031'::uuid,
        true
    );
    IF v_snapshot->>'snapshot_type' IS DISTINCT FROM 'pm_execution' THEN
        RAISE EXCEPTION 'active assignee received an invalid PM snapshot';
    END IF;

    PERFORM public.pm_start_task(
        '20000000-0000-4000-8000-000000000032'::uuid
    );
    PERFORM public.pm_complete_task(
        '20000000-0000-4000-8000-000000000032'::uuid,
        'P0 fixture completion'
    );
END
$assert_active_direct_path$;
RESET ROLE;

DO $assert_direct_result$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.maintenance_tasks mt
         WHERE mt.id = '20000000-0000-4000-8000-000000000032'
           AND mt.status = 'completed'
           AND mt.execution_status = 'completed'
           AND mt.execution_snapshot->>'snapshot_type' = 'pm_execution'
    ) THEN
        RAISE EXCEPTION 'direct PM start/complete did not persist its snapshot';
    END IF;
END
$assert_direct_result$;

-- Suspension remains authoritative even when COALESCE can skip snapshot
-- construction because an execution snapshot already exists.
SELECT set_config(
    'request.jwt.claim.sub', '20000000-0000-4000-8000-000000000012', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $assert_inactive_denial$
BEGIN
    BEGIN
        PERFORM public.pm_build_task_execution_snapshot(
            '20000000-0000-4000-8000-000000000031'::uuid,
            true
        );
        RAISE EXCEPTION 'inactive caller reached the PM snapshot wrapper';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM public.pm_start_task(
            '20000000-0000-4000-8000-000000000034'::uuid
        );
        RAISE EXCEPTION 'inactive assignee started a task with a prebuilt snapshot';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN SQLSTATE 'P0001' THEN
            IF SQLERRM <> 'Unauthorized to start this maintenance task' THEN
                RAISE;
            END IF;
    END;
END
$assert_inactive_denial$;
RESET ROLE;

-- Tenant B cannot snapshot tenant A's task, even with the deprecated flag.
SELECT set_config(
    'request.jwt.claim.sub', '20000000-0000-4000-8000-000000000013', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $assert_cross_tenant_denial$
BEGIN
    BEGIN
        PERFORM public.pm_build_task_execution_snapshot(
            '20000000-0000-4000-8000-000000000031'::uuid,
            true
        );
        RAISE EXCEPTION 'tenant B caller snapshotted tenant A task';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_cross_tenant_denial$;
RESET ROLE;

-- Service authority is explicit and succeeds through the public wrapper while
-- direct execution of the implementation remains denied by ACL.
SELECT set_config(
    'request.jwt.claim.sub', '20000000-0000-4000-8000-000000000098', true
);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
DO $assert_service_path$
DECLARE
    v_snapshot jsonb;
BEGIN
    v_snapshot := public.pm_build_task_execution_snapshot(
        '20000000-0000-4000-8000-000000000031'::uuid,
        true
    );
    IF v_snapshot->>'snapshot_type' IS DISTINCT FROM 'pm_execution' THEN
        RAISE EXCEPTION 'service wrapper did not reach the PM snapshot builder';
    END IF;
END
$assert_service_path$;
RESET ROLE;

-- Work-order synchronization uses the explicit trigger path. Preventive work
-- avoids unrelated standard-governance fixtures; the workflow flag models the
-- approved work-order RPC's transaction-local authorization.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('app.work_order_workflow_authorized', 'true', true);

UPDATE public.work_orders
   SET status = 'in_progress'
 WHERE id = '20000000-0000-4000-8000-000000000021';

DO $assert_work_order_start$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.maintenance_tasks mt
         WHERE mt.id = '20000000-0000-4000-8000-000000000033'
           AND mt.status = 'in_progress'
           AND mt.execution_snapshot->>'snapshot_type' = 'pm_execution'
    ) THEN
        RAISE EXCEPTION 'work-order start did not persist a PM snapshot';
    END IF;
END
$assert_work_order_start$;

UPDATE public.work_orders
   SET status = 'completed'
 WHERE id = '20000000-0000-4000-8000-000000000021';

DO $assert_work_order_completion$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.maintenance_tasks mt
         WHERE mt.id = '20000000-0000-4000-8000-000000000033'
           AND mt.status = 'completed'
           AND mt.execution_snapshot->>'snapshot_type' = 'pm_execution'
    ) THEN
        RAISE EXCEPTION 'work-order completion did not preserve the PM snapshot';
    END IF;
END
$assert_work_order_completion$;

ROLLBACK;
