-- Tenant release-control adversarial verification.
-- Run after 20260826230345 in the isolated PostgreSQL 17 replay database.

\set ON_ERROR_STOP on

BEGIN;

DO $assert_catalog_contract$
DECLARE
    v_function_config text;
BEGIN
    IF pg_catalog.to_regclass('internal.release_flag_definitions') IS NULL
       OR pg_catalog.to_regclass('internal.tenant_release_flags') IS NULL
       OR pg_catalog.to_regclass('internal.tenant_release_flag_events') IS NULL
       OR pg_catalog.to_regprocedure(
            'internal.set_tenant_release_flag(uuid,text,boolean,text,text,uuid)'
          ) IS NULL
       OR pg_catalog.to_regprocedure(
            'internal.tenant_release_flag_enabled(uuid,text)'
          ) IS NULL
       OR pg_catalog.to_regprocedure(
            'public.get_my_tenant_release_flag(text)'
          ) IS NULL
    THEN
        RAISE EXCEPTION 'Tenant release-control objects are missing';
    END IF;

    IF has_schema_privilege('anon', 'internal', 'USAGE')
       OR has_schema_privilege('authenticated', 'internal', 'USAGE')
       OR has_schema_privilege('service_role', 'internal', 'USAGE')
    THEN
        RAISE EXCEPTION 'A Data API role can enter the internal schema';
    END IF;

    IF has_table_privilege('anon', 'internal.tenant_release_flags', 'SELECT')
       OR has_table_privilege('authenticated', 'internal.tenant_release_flags', 'SELECT')
       OR has_table_privilege('service_role', 'internal.tenant_release_flags', 'SELECT')
       OR has_table_privilege('anon', 'internal.tenant_release_flags', 'INSERT')
       OR has_table_privilege('authenticated', 'internal.tenant_release_flags', 'INSERT')
       OR has_table_privilege('service_role', 'internal.tenant_release_flags', 'INSERT')
       OR has_table_privilege('authenticated', 'internal.tenant_release_flag_events', 'UPDATE')
    THEN
        RAISE EXCEPTION 'A Data API role has direct release-control table authority';
    END IF;

    IF has_function_privilege(
           'anon', 'public.get_my_tenant_release_flag(text)', 'EXECUTE'
       )
       OR has_function_privilege(
           'service_role', 'public.get_my_tenant_release_flag(text)', 'EXECUTE'
       )
       OR NOT has_function_privilege(
           'authenticated', 'public.get_my_tenant_release_flag(text)', 'EXECUTE'
       )
       OR has_function_privilege(
           'authenticated',
           'internal.set_tenant_release_flag(uuid,text,boolean,text,text,uuid)',
           'EXECUTE'
       )
       OR has_function_privilege(
           'service_role',
           'internal.set_tenant_release_flag(uuid,text,boolean,text,text,uuid)',
           'EXECUTE'
       )
       OR NOT has_function_privilege(
           'postgres',
           'internal.set_tenant_release_flag(uuid,text,boolean,text,text,uuid)',
           'EXECUTE'
       )
    THEN
        RAISE EXCEPTION 'Tenant release-control function ACL is incorrect';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_proc AS p
         WHERE p.oid IN (
             'public.get_my_tenant_release_flag(text)'::regprocedure::oid,
             'internal.set_tenant_release_flag(uuid,text,boolean,text,text,uuid)'::regprocedure::oid,
             'internal.tenant_release_flag_enabled(uuid,text)'::regprocedure::oid
         )
           AND pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
    ) THEN
        RAISE EXCEPTION 'A release-control function has the wrong owner';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_proc AS p
         WHERE p.oid = 'public.get_my_tenant_release_flag(text)'::regprocedure::oid
           AND p.prosecdef IS TRUE
    ) THEN
        RAISE EXCEPTION 'The public release getter is not SECURITY DEFINER';
    END IF;

    SELECT pg_catalog.array_to_string(p.proconfig, ',')
      INTO v_function_config
      FROM pg_catalog.pg_proc AS p
     WHERE p.oid = 'public.get_my_tenant_release_flag(text)'::regprocedure::oid;
    IF v_function_config IS NULL
       OR v_function_config NOT LIKE 'search_path=%'
    THEN
        RAISE EXCEPTION 'The public release getter has a mutable search path';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_proc AS p
          CROSS JOIN LATERAL pg_catalog.aclexplode(
              COALESCE(
                  p.proacl,
                  pg_catalog.acldefault('f', p.proowner)
              )
          ) AS acl
         WHERE p.oid IN (
             'public.get_my_tenant_release_flag(text)'::regprocedure::oid,
             'internal.set_tenant_release_flag(uuid,text,boolean,text,text,uuid)'::regprocedure::oid,
             'internal.tenant_release_flag_enabled(uuid,text)'::regprocedure::oid
         )
           AND acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'PUBLIC retains release-control function execution';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS c
         WHERE c.oid IN (
             'internal.release_flag_definitions'::regclass::oid,
             'internal.tenant_release_flags'::regclass::oid,
             'internal.tenant_release_flag_events'::regclass::oid
         )
           AND c.relrowsecurity IS DISTINCT FROM TRUE
    ) THEN
        RAISE EXCEPTION 'An internal release-control table lacks RLS';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM internal.release_flag_definitions AS d
         WHERE d.flag_key = 'operations_golden_path_v1'
           AND d.retired_at IS NULL
    ) THEN
        RAISE EXCEPTION 'The Golden Path release definition is missing';
    END IF;
END
$assert_catalog_contract$;

SELECT pg_catalog.set_config('request.jwt.claim.sub', '', true);
SELECT pg_catalog.set_config('request.jwt.claim.role', '', true);
SELECT pg_catalog.set_config('request.jwt.claim.email', '', true);

INSERT INTO public.tenants (
    id, name, slug, subscription_status, trial_ends_at, is_active
) VALUES
    (
        '35000000-0000-4000-8000-000000000001',
        'Release Control Tenant A',
        'release-control-tenant-a',
        'trial',
        pg_catalog.now() + interval '30 days',
        true
    ),
    (
        '35000000-0000-4000-8000-000000000002',
        'Release Control Tenant B',
        'release-control-tenant-b',
        'trial',
        pg_catalog.now() + interval '30 days',
        true
    ),
    (
        '35000000-0000-4000-8000-000000000003',
        'Release Control Inactive Tenant',
        'release-control-inactive-tenant',
        'trial',
        pg_catalog.now() + interval '30 days',
        false
    );

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
VALUES
    (
        '35000000-0000-4000-8000-000000000011',
        'release-a@example.invalid',
        '{"full_name":"Release Tenant A"}'::jsonb,
        pg_catalog.now()
    ),
    (
        '35000000-0000-4000-8000-000000000012',
        'release-b@example.invalid',
        '{"full_name":"Release Tenant B"}'::jsonb,
        pg_catalog.now()
    ),
    (
        '35000000-0000-4000-8000-000000000013',
        'release-inactive-user@example.invalid',
        '{"full_name":"Release Inactive User"}'::jsonb,
        pg_catalog.now()
    ),
    (
        '35000000-0000-4000-8000-000000000014',
        'release-inactive-tenant@example.invalid',
        '{"full_name":"Release Inactive Tenant User"}'::jsonb,
        pg_catalog.now()
    );

UPDATE public.profiles
   SET tenant_id = '35000000-0000-4000-8000-000000000001',
       role = 'technician',
       is_active = true
 WHERE id = '35000000-0000-4000-8000-000000000011';
UPDATE public.profiles
   SET tenant_id = '35000000-0000-4000-8000-000000000002',
       role = 'technician',
       is_active = true
 WHERE id = '35000000-0000-4000-8000-000000000012';
UPDATE public.profiles
   SET tenant_id = '35000000-0000-4000-8000-000000000001',
       role = 'technician',
       is_active = false
 WHERE id = '35000000-0000-4000-8000-000000000013';
UPDATE public.profiles
   SET tenant_id = '35000000-0000-4000-8000-000000000003',
       role = 'technician',
       is_active = true
 WHERE id = '35000000-0000-4000-8000-000000000014';

-- Anonymous cannot reach either the getter or the private data plane.
SET LOCAL ROLE anon;
DO $assert_anon_denied$
BEGIN
    BEGIN
        PERFORM 1
          FROM public.get_my_tenant_release_flag(
              'operations_golden_path_v1'
          );
        RAISE EXCEPTION 'Anonymous caller reached the release getter';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM 1 FROM internal.tenant_release_flags;
        RAISE EXCEPTION 'Anonymous caller read private release state';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_anon_denied$;
RESET ROLE;

-- Tenant A starts with no override, which is the authoritative default-off.
SELECT pg_catalog.set_config(
    'request.jwt.claim.sub', '35000000-0000-4000-8000-000000000011', true
);
SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
SELECT pg_catalog.set_config(
    'request.jwt.claim.email', 'release-a@example.invalid', true
);
SET LOCAL ROLE authenticated;
DO $assert_tenant_a_default_off$
DECLARE
    v_result record;
BEGIN
    SELECT *
      INTO v_result
      FROM public.get_my_tenant_release_flag(
          ' OPERATIONS_GOLDEN_PATH_V1 '
      );

    IF v_result.tenant_id IS DISTINCT FROM
           '35000000-0000-4000-8000-000000000001'::uuid
       OR v_result.flag_key IS DISTINCT FROM 'operations_golden_path_v1'
       OR v_result.enabled IS DISTINCT FROM false
    THEN
        RAISE EXCEPTION 'Tenant A did not fail closed before enablement';
    END IF;

    BEGIN
        INSERT INTO internal.tenant_release_flags (
            tenant_id, flag_key, enabled, change_reason, actor_label
        ) VALUES (
            '35000000-0000-4000-8000-000000000001',
            'operations_golden_path_v1',
            true,
            'Unauthorized browser mutation',
            'browser'
        );
        RAISE EXCEPTION 'Authenticated client wrote private release state';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        PERFORM internal.set_tenant_release_flag(
            '35000000-0000-4000-8000-000000000001',
            'operations_golden_path_v1',
            true,
            'Unauthorized browser mutation',
            'browser',
            NULL
        );
        RAISE EXCEPTION 'Authenticated client reached the release setter';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_tenant_a_default_off$;
RESET ROLE;

DO $enable_tenant_a$
DECLARE
    v_changed boolean;
BEGIN
    v_changed := internal.set_tenant_release_flag(
        '35000000-0000-4000-8000-000000000001',
        'operations_golden_path_v1',
        true,
        'Enable isolated Golden Path canary',
        'controlled-replay',
        NULL
    );
    IF v_changed IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'First canary enablement was not recorded as a change';
    END IF;
END
$enable_tenant_a$;

SET LOCAL ROLE authenticated;
DO $assert_tenant_a_on$
DECLARE
    v_result record;
BEGIN
    SELECT *
      INTO v_result
      FROM public.get_my_tenant_release_flag(
          'operations_golden_path_v1'
      );
    IF v_result.tenant_id IS DISTINCT FROM
           '35000000-0000-4000-8000-000000000001'::uuid
       OR v_result.enabled IS DISTINCT FROM true
    THEN
        RAISE EXCEPTION 'Tenant A did not receive its enabled canary';
    END IF;

    SELECT *
      INTO v_result
      FROM public.get_my_tenant_release_flag('unknown_release_key');
    IF v_result.enabled IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'An unknown flag did not fail closed';
    END IF;
END
$assert_tenant_a_on$;
RESET ROLE;

-- Tenant B cannot observe or inherit Tenant A's enabled override.
SELECT pg_catalog.set_config(
    'request.jwt.claim.sub', '35000000-0000-4000-8000-000000000012', true
);
SELECT pg_catalog.set_config(
    'request.jwt.claim.email', 'release-b@example.invalid', true
);
SET LOCAL ROLE authenticated;
DO $assert_tenant_b_off$
DECLARE
    v_result record;
BEGIN
    SELECT *
      INTO v_result
      FROM public.get_my_tenant_release_flag(
          'operations_golden_path_v1'
      );
    IF v_result.tenant_id IS DISTINCT FROM
           '35000000-0000-4000-8000-000000000002'::uuid
       OR v_result.enabled IS DISTINCT FROM false
    THEN
        RAISE EXCEPTION 'Tenant B inherited Tenant A release state';
    END IF;
END
$assert_tenant_b_off$;
RESET ROLE;

-- A suspended profile receives no tenant identity and no enabled flag.
SELECT pg_catalog.set_config(
    'request.jwt.claim.sub', '35000000-0000-4000-8000-000000000013', true
);
SELECT pg_catalog.set_config(
    'request.jwt.claim.email', 'release-inactive-user@example.invalid', true
);
SET LOCAL ROLE authenticated;
DO $assert_inactive_user_off$
DECLARE
    v_result record;
BEGIN
    SELECT *
      INTO v_result
      FROM public.get_my_tenant_release_flag(
          'operations_golden_path_v1'
      );
    IF v_result.tenant_id IS NOT NULL
       OR v_result.enabled IS DISTINCT FROM false
    THEN
        RAISE EXCEPTION 'An inactive profile received release authority';
    END IF;
END
$assert_inactive_user_off$;
RESET ROLE;

-- An active profile in an inactive tenant also fails closed.
SELECT pg_catalog.set_config(
    'request.jwt.claim.sub', '35000000-0000-4000-8000-000000000014', true
);
SELECT pg_catalog.set_config(
    'request.jwt.claim.email', 'release-inactive-tenant@example.invalid', true
);
SET LOCAL ROLE authenticated;
DO $assert_inactive_tenant_off$
DECLARE
    v_result record;
BEGIN
    SELECT *
      INTO v_result
      FROM public.get_my_tenant_release_flag(
          'operations_golden_path_v1'
      );
    IF v_result.tenant_id IS NOT NULL
       OR v_result.enabled IS DISTINCT FROM false
    THEN
        RAISE EXCEPTION 'An inactive tenant received release authority';
    END IF;
END
$assert_inactive_tenant_off$;
RESET ROLE;

DO $disable_tenant_a_and_assert_audit$
DECLARE
    v_changed boolean;
    v_event_count integer;
    v_transitions text[];
BEGIN
    v_changed := internal.set_tenant_release_flag(
        '35000000-0000-4000-8000-000000000001',
        'operations_golden_path_v1',
        false,
        'Disable isolated Golden Path canary',
        'controlled-replay',
        NULL
    );
    IF v_changed IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Canary disablement was not recorded as a change';
    END IF;

    v_changed := internal.set_tenant_release_flag(
        '35000000-0000-4000-8000-000000000001',
        'operations_golden_path_v1',
        false,
        'Idempotent disable verification',
        'controlled-replay',
        NULL
    );
    IF v_changed IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Idempotent release setter did not report a no-op';
    END IF;

    SELECT pg_catalog.count(*),
           pg_catalog.array_agg(
               COALESCE(e.old_enabled::text, 'null')
               || '>' || e.new_enabled::text
               ORDER BY e.event_id
           )
      INTO v_event_count, v_transitions
      FROM internal.tenant_release_flag_events AS e
     WHERE e.tenant_id = '35000000-0000-4000-8000-000000000001'
       AND e.flag_key = 'operations_golden_path_v1';

    IF v_event_count <> 2
       OR v_transitions IS DISTINCT FROM ARRAY['null>true', 'true>false']::text[]
    THEN
        RAISE EXCEPTION
            'Release audit sequence is incomplete: count %, transitions %',
            v_event_count, v_transitions;
    END IF;

    BEGIN
        UPDATE internal.tenant_release_flag_events
           SET actor_label = 'tampered'
         WHERE tenant_id = '35000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Append-only release audit was mutable';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$disable_tenant_a_and_assert_audit$;

SELECT pg_catalog.set_config(
    'request.jwt.claim.sub', '35000000-0000-4000-8000-000000000011', true
);
SELECT pg_catalog.set_config(
    'request.jwt.claim.email', 'release-a@example.invalid', true
);
SET LOCAL ROLE authenticated;
DO $assert_tenant_a_off_after_rollback_switch$
DECLARE
    v_result record;
BEGIN
    SELECT *
      INTO v_result
      FROM public.get_my_tenant_release_flag(
          'operations_golden_path_v1'
      );
    IF v_result.enabled IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Tenant A remained enabled after the release switch was disabled';
    END IF;
END
$assert_tenant_a_off_after_rollback_switch$;
RESET ROLE;

ROLLBACK;
