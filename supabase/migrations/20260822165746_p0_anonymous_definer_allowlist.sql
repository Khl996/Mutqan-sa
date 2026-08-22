-- P0: make the anonymous SECURITY DEFINER boundary deny-by-default.
--
-- Historical functions were created with EXECUTE granted to PUBLIC, which
-- made every postgres-owned SECURITY DEFINER function reachable through the
-- Data API. Preserve the explicitly granted authenticated/service callers,
-- remove inherited/public execution, and restore only the reviewed
-- capability-token endpoints for anonymous callers.

DO $revoke_unreviewed_anonymous_definers$
DECLARE
    v_function record;
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prosecdef
           AND pg_get_userbyid(p.proowner) <> 'postgres'
    ) THEN
        RAISE EXCEPTION
            'Anonymous definer closure requires review of non-postgres function owners';
    END IF;

    FOR v_function IN
        SELECT p.oid::regprocedure AS signature
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prosecdef
         ORDER BY p.oid::regprocedure::text
    LOOP
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
            v_function.signature
        );
    END LOOP;
END;
$revoke_unreviewed_anonymous_definers$;

-- New postgres-owned public functions must be explicitly published. This
-- applies to all future functions so a later SECURITY DEFINER cannot inherit a
-- callable PUBLIC surface by accident.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Reviewed capability-token allowlist. Each function derives tenant/object
-- authority from a server-validated high-entropy token and rejects invalid,
-- revoked, expired, reused, or cross-tenant inputs as appropriate.
GRANT EXECUTE ON FUNCTION public.get_public_tenant_data(text)
    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_public_work_order(
    text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text
) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_work_order_status(text)
    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_intake_report_from_public_token(
    text, text, text, text, text, jsonb
) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_intake_report(
    uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid,
    text, text, text
) TO anon, authenticated, service_role;

-- Close the mutable search-path findings already recorded by the staging
-- review. public is safe here because CREATE is revoked from all API roles;
-- pg_catalog is resolved first and pg_temp last.
DO $pin_reviewed_function_paths$
DECLARE
    v_signature text;
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'public.broadcast_notification_all_internal(uuid,text,text,text,text)',
        'public.broadcast_notification_scoped_internal(uuid,text,text,text,text,uuid[])',
        'public.default_enabled_modules_json()',
        'public.governance_actor_can_decide(text,text,boolean)',
        'public.governance_criticality_rank(text)',
        'public.governance_next_escalation_role(text)',
        'public.governance_role_rank(text)',
        'public.governance_scope_level_name(integer)',
        'public.governance_severity_rank(text)',
        'public.normalize_plan_module_codes(jsonb)',
        'public.notify_on_work_order_assignment()',
        'public.notify_on_work_order_status_change()',
        'public.plan_feature_to_module_codes(text)',
        'public.pm_calculate_compliance_window(character varying,integer)',
        'public.pm_calculate_next_due(date,character varying,integer)',
        'public.pm_schedules_master_lock()',
        'public.pm_sync_execution_status()',
        'public.restricted_enabled_modules_json()',
        'public.set_updated_at()',
        'public.update_job_plan_total_items()',
        'public.update_modified_column()'
    ]
    LOOP
        IF to_regprocedure(v_signature) IS NULL THEN
            RAISE EXCEPTION 'Expected function is missing: %', v_signature;
        END IF;

        EXECUTE format(
            'ALTER FUNCTION %s SET search_path TO pg_catalog, public, auth, extensions, pg_temp',
            to_regprocedure(v_signature)
        );
    END LOOP;
END;
$pin_reviewed_function_paths$;

COMMENT ON FUNCTION public.get_public_tenant_data(text) IS
    'Anonymous allowlist: validates a public portal capability token and returns only its tenant-scoped public context.';
COMMENT ON FUNCTION public.submit_public_work_order(
    text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text
) IS
    'Anonymous allowlist: creates a tenant-scoped public work order only through a validated portal capability token.';
COMMENT ON FUNCTION public.get_public_work_order_status(text) IS
    'Anonymous allowlist: returns minimal status bound to a high-entropy work-order tracking token.';
COMMENT ON FUNCTION public.create_intake_report_from_public_token(
    text, text, text, text, text, jsonb
) IS
    'Anonymous allowlist: creates an intake report after validating a tenant-scoped public intake token.';
COMMENT ON FUNCTION public.submit_intake_report(
    uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid,
    text, text, text
) IS
    'Anonymous allowlist: submits an intake report through its server-validated report token and tenant/object checks.';
