-- Mutqan Wave 0 RPC security verification.
-- Run only after applying 20260820234813 to an isolated/staging database.
-- This script changes no application data and rolls back session state.

BEGIN;

DO $assert_acl$
DECLARE
    v_definition text;
BEGIN
    IF has_function_privilege('anon', 'public.pm_build_task_execution_snapshot(uuid,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anon must not execute pm_build_task_execution_snapshot';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.pm_build_task_execution_snapshot(uuid,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'authenticated must retain the PM snapshot wrapper contract';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.pm_build_task_execution_snapshot(uuid,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service_role must retain trusted PM snapshot access';
    END IF;

    SELECT pg_get_functiondef('public.pm_build_task_execution_snapshot(uuid,boolean)'::regprocedure)
      INTO v_definition;
    IF position('JOIN public.asset_groups' IN v_definition) > 0 THEN
        RAISE EXCEPTION 'PM snapshot still joins the retired asset_groups relation';
    END IF;
    IF position('pg_trigger_depth()' IN v_definition) = 0
       OR position('pm_can_view_task' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'PM snapshot trusted/internal and user authorization paths are incomplete';
    END IF;
    IF position('pm_can_view_task(p_task_id) IS DISTINCT FROM TRUE' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'PM snapshot authorization is NULL-fail-open';
    END IF;
    IF v_definition ~* 'IF[^;\n]*p_skip_auth' THEN
        RAISE EXCEPTION 'p_skip_auth still influences PM authorization';
    END IF;

    IF has_function_privilege('anon', 'public.get_inventory_stats(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_inventory_stats(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.get_inventory_stats(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'inventory stats wrapper ACL is incorrect';
    END IF;
    SELECT pg_get_functiondef('public.get_inventory_stats(uuid)'::regprocedure)
      INTO v_definition;
    IF position('can_view_inventory' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'inventory stats lacks tenant authorization';
    END IF;

    IF has_function_privilege('anon', 'public.log_platform_action(character varying,character varying,character varying,uuid,character varying,jsonb,jsonb,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.log_platform_action(character varying,character varying,character varying,uuid,character varying,jsonb,jsonb,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.log_platform_action(character varying,character varying,character varying,uuid,character varying,jsonb,jsonb,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'platform audit wrapper ACL is incorrect';
    END IF;
    SELECT pg_get_functiondef('public.log_platform_action(character varying,character varying,character varying,uuid,character varying,jsonb,jsonb,jsonb)'::regprocedure)
      INTO v_definition;
    IF position('can_view_platform_tenants' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'platform audit writer lacks platform-role authorization';
    END IF;
    IF position('can_view_platform_tenants() IS DISTINCT FROM TRUE' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'platform audit authorization is NULL-fail-open';
    END IF;

    IF has_function_privilege('anon', 'public.check_and_escalate_priority()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.check_and_escalate_priority()', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.check_and_escalate_priority()', 'EXECUTE') THEN
        RAISE EXCEPTION 'priority escalation is not service-only';
    END IF;
    IF has_function_privilege('anon', 'public.cleanup_expired_otps()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.cleanup_expired_otps()', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.cleanup_expired_otps()', 'EXECUTE') THEN
        RAISE EXCEPTION 'OTP cleanup is not service-only';
    END IF;

    IF has_function_privilege('anon', 'public.get_runtime_secret(text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.get_runtime_secret(text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.get_runtime_secret(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'runtime secret reader is not service-only';
    END IF;
    IF has_function_privilege('anon', 'public.create_notification(uuid,uuid,text,text,text,text,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.create_notification(uuid,uuid,text,text,text,text,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.create_notification(uuid,uuid,text,text,text,text,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'create_notification is not service-only';
    END IF;
    IF has_function_privilege('anon', 'public.create_operation_log(uuid,uuid,character varying,character varying,uuid,character varying)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.create_operation_log(uuid,uuid,character varying,character varying,uuid,character varying)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.create_operation_log(uuid,uuid,character varying,character varying,uuid,character varying)', 'EXECUTE') THEN
        RAISE EXCEPTION 'create_operation_log is not service-only';
    END IF;
    IF has_function_privilege('anon', 'public.pm_write_audit_log(text,text,text,uuid,jsonb,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.pm_write_audit_log(text,text,text,uuid,jsonb,jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.pm_write_audit_log(text,text,text,uuid,jsonb,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'pm_write_audit_log is not service-only';
    END IF;
    IF has_function_privilege('anon', 'public.pm_populate_task_checks_internal(uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.pm_populate_task_checks_internal(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.pm_populate_task_checks_internal(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'pm_populate_task_checks_internal is not service-only';
    END IF;

    IF has_table_privilege('authenticated', 'public.profiles', 'INSERT')
       OR has_table_privilege('authenticated', 'public.profiles', 'DELETE')
       OR has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.profiles', 'MAINTAIN')
       OR has_table_privilege('anon', 'public.profiles', 'INSERT')
       OR has_table_privilege('anon', 'public.profiles', 'DELETE')
       OR has_table_privilege('anon', 'public.profiles', 'TRUNCATE')
       OR has_table_privilege('anon', 'public.profiles', 'MAINTAIN') THEN
        RAISE EXCEPTION 'Data API roles retain unsafe profile table authority';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND policyname = 'Users can manage own profile'
    ) THEN
        RAISE EXCEPTION 'dangerous profiles FOR ALL self-policy still exists';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM pg_trigger t
         WHERE t.tgrelid = 'auth.users'::regclass
           AND t.tgname = 'on_auth_user_created'
           AND NOT t.tgisinternal
           AND t.tgfoid = 'public.handle_new_user()'::regprocedure
           AND t.tgtype = 5
           AND t.tgenabled IN ('O', 'A')
    ) THEN
        RAISE EXCEPTION 'trusted Auth signup profile trigger is missing or incompatible';
    END IF;
    IF has_function_privilege('anon', 'public.engine_create_quote(uuid,uuid,character varying,uuid[],uuid,integer,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.engine_approve_quote(uuid,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.engine_activate_from_quote(uuid,integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.engine_cancel(uuid,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.engine_extend_trial(uuid,integer,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.engine_activate(uuid,uuid,character varying,character varying,character varying,integer,uuid,uuid,character varying,character varying,numeric,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'anonymous role retains a billing write primitive';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.engine_create_quote(uuid,uuid,character varying,uuid[],uuid,integer,text,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.engine_approve_quote(uuid,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.engine_activate_from_quote(uuid,integer)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.engine_cancel(uuid,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.engine_extend_trial(uuid,integer,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.engine_activate(uuid,uuid,character varying,character varying,character varying,integer,uuid,uuid,character varying,character varying,numeric,text)', 'EXECUTE')
        OR has_function_privilege('service_role', 'public.engine_create_quote(uuid,uuid,character varying,uuid[],uuid,integer,text,text)', 'EXECUTE')
        OR has_function_privilege('service_role', 'public.engine_approve_quote(uuid,text)', 'EXECUTE')
        OR has_function_privilege('service_role', 'public.engine_activate_from_quote(uuid,integer)', 'EXECUTE')
        OR has_function_privilege('service_role', 'public.engine_cancel(uuid,text)', 'EXECUTE')
        OR has_function_privilege('service_role', 'public.engine_extend_trial(uuid,integer,text)', 'EXECUTE')
        OR NOT has_function_privilege('service_role', 'public.engine_activate(uuid,uuid,character varying,character varying,character varying,integer,uuid,uuid,character varying,character varying,numeric,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'billing wrapper ACL contract is incorrect';
    END IF;
    IF has_function_privilege('authenticated', 'public.engine_create_quote_internal(uuid,uuid,character varying,uuid[],uuid,integer,text,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.engine_approve_quote_internal(uuid,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.engine_activate_from_quote_internal(uuid,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.engine_cancel_internal(uuid,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.engine_extend_trial_internal(uuid,integer,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.engine_activate_internal(uuid,uuid,character varying,character varying,character varying,integer,uuid,uuid,character varying,character varying,numeric,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.engine_create_quote_internal(uuid,uuid,character varying,uuid[],uuid,integer,text,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.engine_approve_quote_internal(uuid,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.engine_activate_from_quote_internal(uuid,integer)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.engine_cancel_internal(uuid,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.engine_extend_trial_internal(uuid,integer,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.engine_activate_internal(uuid,uuid,character varying,character varying,character varying,integer,uuid,uuid,character varying,character varying,numeric,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Data API role can execute an unguarded billing implementation';
    END IF;
    SELECT pg_get_functiondef('public.engine_create_quote(uuid,uuid,character varying,uuid[],uuid,integer,text,text)'::regprocedure)
      INTO v_definition;
    IF position('billing_assert_platform_admin' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'billing quote wrapper lacks fail-closed platform authorization';
    END IF;
    SELECT pg_get_functiondef('public.engine_activate(uuid,uuid,character varying,character varying,character varying,integer,uuid,uuid,character varying,character varying,numeric,text)'::regprocedure)
      INTO v_definition;
    IF position('Active billing caller profile required' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'billing activation wrapper lacks active-profile fail-closed guard';
    END IF;
    IF position('is_active IS TRUE' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'billing activation accepts inactive or NULL-active profiles';
    END IF;
    IF position('Self-service activation requires the trusted payment service' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'browser callers can still claim self-service payment authority';
    END IF;
    IF position('pg_advisory_xact_lock' IN v_definition) = 0
       OR position('p_payment_reference := btrim(p_payment_reference)' IN v_definition) = 0
       OR position('Payment reference has conflicting invoice history' IN v_definition) = 0
       OR position('invoice_status IS DISTINCT FROM ''paid''' IN v_definition) = 0
       OR position('payment_method IS DISTINCT FROM ''tap''' IN v_definition) = 0
       OR position('subscription_status IS DISTINCT FROM ''active''' IN v_definition) = 0
       OR position('billing_cycle IS DISTINCT FROM p_billing_cycle' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'trusted payment activation lacks atomic idempotency and conflict detection';
    END IF;

    IF has_table_privilege('anon', 'public.asset_maintenance_history', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.asset_maintenance_history', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.asset_maintenance_history', 'SELECT') THEN
        RAISE EXCEPTION 'maintenance history view read ACL is incorrect';
    END IF;
    IF has_table_privilege('authenticated', 'public.asset_maintenance_history', 'INSERT')
       OR has_table_privilege('authenticated', 'public.asset_maintenance_history', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.asset_maintenance_history', 'DELETE')
       OR has_table_privilege('authenticated', 'public.asset_maintenance_history', 'TRUNCATE') THEN
        RAISE EXCEPTION 'authenticated retains write-like privileges on maintenance history view';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'asset_maintenance_history'
          AND 'security_invoker=true' = ANY (COALESCE(c.reloptions, ARRAY[]::text[]))
    ) THEN
        RAISE EXCEPTION 'asset_maintenance_history is not a security-invoker view';
    END IF;

    IF has_function_privilege('anon', 'public.broadcast_notification(uuid,text,text,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.broadcast_notification(uuid,text,text,text,text,uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'anonymous role retains notification broadcast authority';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.broadcast_notification(uuid,text,text,text,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.broadcast_notification(uuid,text,text,text,text,uuid[])', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.broadcast_notification(uuid,text,text,text,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.broadcast_notification(uuid,text,text,text,text,uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'notification wrapper ACL contract is incorrect';
    END IF;
    IF has_function_privilege('authenticated', 'public.broadcast_notification_all_internal(uuid,text,text,text,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.broadcast_notification_scoped_internal(uuid,text,text,text,text,uuid[])', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.broadcast_notification_all_internal(uuid,text,text,text,text)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.broadcast_notification_scoped_internal(uuid,text,text,text,text,uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'Data API role can execute unguarded notification internals';
    END IF;
    SELECT pg_get_functiondef('public.broadcast_notification(uuid,text,text,text,text,uuid[])'::regprocedure)
      INTO v_definition;
    IF position('Active platform administrator authorization required' IN v_definition) = 0
       OR position('Notification link must be an internal relative path' IN v_definition) = 0 THEN
        RAISE EXCEPTION 'notification wrapper lacks active-admin or link validation';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_proc p
         WHERE p.oid = ANY (ARRAY[
             'public.engine_activate(uuid,uuid,character varying,character varying,character varying,integer,uuid,uuid,character varying,character varying,numeric,text)'::regprocedure::oid,
             'public.engine_create_quote(uuid,uuid,character varying,uuid[],uuid,integer,text,text)'::regprocedure::oid,
             'public.engine_approve_quote(uuid,text)'::regprocedure::oid,
             'public.engine_activate_from_quote(uuid,integer)'::regprocedure::oid,
             'public.engine_cancel(uuid,text)'::regprocedure::oid,
             'public.engine_extend_trial(uuid,integer,text)'::regprocedure::oid,
             'public.broadcast_notification(uuid,text,text,text,text)'::regprocedure::oid,
             'public.broadcast_notification(uuid,text,text,text,text,uuid[])'::regprocedure::oid
         ])
           AND pg_get_userbyid(p.proowner) <> 'postgres'
    ) THEN
        RAISE EXCEPTION 'SECURITY DEFINER wrapper owner is not postgres';
    END IF;
END
$assert_acl$;

-- Runtime proof: an authenticated but unknown actor cannot revive the deprecated
-- p_skip_auth bypass. No production/test row is required for this denial branch.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
DO $assert_pm_denial$
BEGIN
    BEGIN
        PERFORM public.pm_build_task_execution_snapshot(
            '00000000-0000-4000-8000-000000000002'::uuid,
            true
        );
        RAISE EXCEPTION 'unauthorized authenticated caller bypassed PM authorization';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_pm_denial$;

DO $assert_billing_denial$
BEGIN
    BEGIN
        PERFORM public.engine_create_quote(
            '00000000-0000-4000-8000-000000000003'::uuid,
            '00000000-0000-4000-8000-000000000004'::uuid
        );
        RAISE EXCEPTION 'unknown authenticated actor reached billing quote creation';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_billing_denial$;
RESET ROLE;

-- Runtime proof: anonymous execution is denied before any secret can be read.
SET LOCAL ROLE anon;
DO $assert_secret_denial$
BEGIN
    BEGIN
        PERFORM public.get_runtime_secret('app.resend_email_secret');
        RAISE EXCEPTION 'anonymous caller reached get_runtime_secret';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_secret_denial$;

DO $assert_broadcast_denial$
BEGIN
    BEGIN
        PERFORM public.broadcast_notification(
            NULL, 'unsafe', 'unsafe', 'info', 'javascript:alert(1)', NULL
        );
        RAISE EXCEPTION 'anonymous caller reached notification broadcast';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$assert_broadcast_denial$;
RESET ROLE;

ROLLBACK;

-- Environment-specific follow-up (not expressible without fixtures):
-- 1. tenant A can snapshot an assigned/viewable task;
-- 2. tenant B receives SQLSTATE 42501 for the same task even with p_skip_auth=true;
-- 3. PM start, complete and work-order trigger paths persist a version-2 snapshot;
-- 4. snapshots retain historical label_snapshot values and never query asset_groups.
