-- P0 anonymous SECURITY DEFINER allowlist regression.
-- Run after 20260822165746 in the isolated PostgreSQL 17 environment.

\set ON_ERROR_STOP on

BEGIN;

DO $assert_anonymous_definer_contract$
DECLARE
    v_actual text[];
    v_expected constant text[] := ARRAY[
        'create_intake_report_from_public_token(text,text,text,text,text,jsonb)',
        'get_public_tenant_data(text)',
        'get_public_work_order_status(text)',
        'submit_intake_report(uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text)',
        'submit_public_work_order(text,text,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text)'
    ];
BEGIN
    SELECT coalesce(array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text), ARRAY[]::text[])
      INTO v_actual
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE');

    IF v_actual IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION
            'anonymous SECURITY DEFINER allowlist mismatch; expected %, found %',
            v_expected, v_actual;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl ON true
         WHERE n.nspname = 'public'
           AND p.prosecdef
           AND acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'a public SECURITY DEFINER still grants EXECUTE to PUBLIC';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_default_acl d
          JOIN LATERAL aclexplode(d.defaclacl) acl ON true
         WHERE d.defaclrole = 'postgres'::regrole
           AND d.defaclnamespace = 'public'::regnamespace
           AND d.defaclobjtype = 'f'
           AND acl.grantee = 0
           AND acl.privilege_type = 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'postgres public-function default privileges still grant EXECUTE to PUBLIC';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prokind = 'f'
           AND NOT EXISTS (
               SELECT 1
                 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
                WHERE cfg LIKE 'search_path=%'
           )
    ) THEN
        RAISE EXCEPTION 'a reviewed public function still has a mutable search path';
    END IF;
END;
$assert_anonymous_definer_contract$;

DO $assert_private_helpers_are_denied$
DECLARE
    v_signature text;
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'public.pm_calculate_compliance_stats(uuid)',
        'public.check_subscription_limits(uuid,character varying)',
        'public.is_tenant_feature_enabled(uuid,text,text)',
        'public.facility_location_is_valid(uuid,uuid,uuid,uuid)',
        'public.work_order_asset_location_is_valid(uuid,uuid,uuid,uuid,uuid)',
        'public.get_my_profile()',
        'public.wo_start(uuid)',
        'public.start_work_order(uuid)',
        'public.handle_new_user()',
        'public.notify_on_work_order_assignment()'
    ]
    LOOP
        IF to_regprocedure(v_signature) IS NULL THEN
            RAISE EXCEPTION 'Expected helper is missing: %', v_signature;
        END IF;

        IF has_function_privilege('anon', to_regprocedure(v_signature), 'EXECUTE') THEN
            RAISE EXCEPTION 'anonymous caller still executes %', v_signature;
        END IF;
    END LOOP;
END;
$assert_private_helpers_are_denied$;

DO $assert_authenticated_regression_subset$
DECLARE
    v_signature text;
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'public.get_my_profile()',
        'public.complete_pending_registration(jsonb)',
        'public.approve_tenant_registration(uuid,text,timestamptz)',
        'public.provision_tenant(text,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean,text,text)',
        'public.wo_start(uuid)',
        'public.wo_complete(uuid,text)',
        'public.pm_start_task(uuid)',
        'public.pm_complete_task(uuid,text)',
        'public.pm_calculate_compliance_stats(uuid)'
    ]
    LOOP
        IF to_regprocedure(v_signature) IS NULL THEN
            RAISE EXCEPTION 'Expected authenticated API is missing: %', v_signature;
        END IF;

        IF NOT has_function_privilege('authenticated', to_regprocedure(v_signature), 'EXECUTE') THEN
            RAISE EXCEPTION 'authenticated caller lost required API %', v_signature;
        END IF;
    END LOOP;

    IF NOT has_function_privilege(
        'service_role',
        'public.engine_activate(uuid,uuid,character varying,character varying,character varying,integer,uuid,uuid,character varying,character varying,numeric,text)'::regprocedure,
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'service role lost payment activation authority';
    END IF;
END;
$assert_authenticated_regression_subset$;

ROLLBACK;
