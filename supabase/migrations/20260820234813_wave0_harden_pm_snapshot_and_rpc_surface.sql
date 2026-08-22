-- Mutqan 2.0 Wave 0: repair the PM execution snapshot and harden only the
-- confirmed RPC surfaces reviewed on 2026-08-21.
--
-- This migration is intentionally prepared but must not be pushed until the
-- migration-ledger gap documented in docs/architecture/DB_MIGRATION_BASELINE.md
-- has been reconciled.

BEGIN;
SET LOCAL check_function_bodies = on;

DO $require_postgres_executor$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            'Wave 0 RPC hardening must be applied by postgres so SECURITY DEFINER wrappers have the intended owner';
    END IF;
END
$require_postgres_executor$;

CREATE OR REPLACE FUNCTION public.pm_build_task_execution_snapshot(
    p_task_id uuid,
    p_skip_auth boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_task RECORD;
    v_sections jsonb := '[]'::jsonb;
    v_items jsonb := '[]'::jsonb;
    v_targets jsonb := '[]'::jsonb;
    v_is_service_role boolean := COALESCE(auth.role() = 'service_role', false);
    v_is_trusted_trigger boolean := pg_trigger_depth() > 0;
BEGIN
    -- p_skip_auth is retained only for ABI compatibility with existing callers.
    -- It never changes authorization. Trigger execution and service-role calls
    -- are the explicit trusted paths; every user call must pass pm_can_view_task.
    IF NOT v_is_trusted_trigger AND NOT v_is_service_role THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.is_active IS TRUE
        ) THEN
            RAISE EXCEPTION 'Active profile required' USING ERRCODE = '42501';
        END IF;

        IF public.pm_can_view_task(p_task_id) IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'Unauthorized to build execution snapshot'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT
        mt.*,
        mp.name AS plan_name,
        mp.name_ar AS plan_name_ar,
        mfb.name AS bundle_name,
        mfb.name_ar AS bundle_name_ar,
        mfb.frequency_type AS bundle_frequency_type,
        mfb.interval_count AS bundle_interval_count,
        mfb.instructions AS bundle_instructions,
        ct.name AS template_name,
        ct.name_ar AS template_name_ar,
        ct.category AS template_category,
        ct.asset_type AS template_asset_type,
        ct.version AS template_version,
        ct.status AS template_status,
        ct.template_type AS template_type,
        ct.metadata AS template_metadata
      INTO v_task
      FROM public.maintenance_tasks mt
      LEFT JOIN public.maintenance_plans mp ON mp.id = mt.maintenance_plan_id
      LEFT JOIN public.maintenance_frequency_bundles mfb ON mfb.id = mt.frequency_bundle_id
      LEFT JOIN public.checklist_templates ct ON ct.id = mt.checklist_template_id
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF v_task.checklist_template_id IS NOT NULL THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', cts.id,
                    'code', cts.code,
                    'title', cts.title,
                    'title_ar', cts.title_ar,
                    'description', cts.description,
                    'description_ar', cts.description_ar,
                    'section_type', cts.section_type,
                    'sort_order', cts.sort_order,
                    'is_collapsible', cts.is_collapsible,
                    'metadata', cts.metadata
                )
                ORDER BY cts.sort_order, cts.created_at
            ),
            '[]'::jsonb
        )
        INTO v_sections
        FROM public.checklist_template_sections cts
        WHERE cts.template_id = v_task.checklist_template_id;

        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', cti.id,
                    'template_id', cti.template_id,
                    'section_id', cti.section_id,
                    'sort_order', cti.sort_order,
                    'label', cti.label,
                    'label_ar', cti.label_ar,
                    'item_type', cti.item_type,
                    'is_required', cti.is_required,
                    'is_critical', cti.is_critical,
                    'unit', cti.unit,
                    'min_value', cti.min_value,
                    'max_value', cti.max_value,
                    'warning_min_value', cti.warning_min_value,
                    'warning_max_value', cti.warning_max_value,
                    'placeholder', cti.placeholder,
                    'placeholder_ar', cti.placeholder_ar,
                    'help_text', cti.help_text,
                    'help_text_ar', cti.help_text_ar,
                    'applies_to_target_type', cti.applies_to_target_type,
                    'options', cti.options,
                    'description', cti.description,
                    'description_ar', cti.description_ar,
                    'metadata', cti.metadata,
                    'created_at', cti.created_at
                )
                ORDER BY COALESCE(cts.sort_order, 0), cti.sort_order, cti.created_at
            ),
            '[]'::jsonb
        )
        INTO v_items
        FROM public.checklist_template_items cti
        LEFT JOIN public.checklist_template_sections cts ON cts.id = cti.section_id
        WHERE cti.template_id = v_task.checklist_template_id;
    END IF;

    IF v_task.maintenance_plan_id IS NOT NULL THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', mpt.id,
                    'target_type', mpt.target_type,
                    'asset_id', mpt.asset_id,
                    'building_id', mpt.building_id,
                    -- Retained as historical identity only. The retired
                    -- public.asset_groups relation must not be resurrected.
                    'asset_group_id', mpt.asset_group_id,
                    'is_primary', mpt.is_primary,
                    'role', mpt.role,
                    'notes', mpt.notes,
                    'label_snapshot', COALESCE(
                        NULLIF(mpt.label_snapshot, '{}'::jsonb),
                        jsonb_strip_nulls(jsonb_build_object(
                            'asset_code', a.code,
                            'asset_name', a.name,
                            'asset_name_ar', a.name_ar,
                            'building_name', b.name,
                            'building_name_ar', b.name_ar
                        ))
                    )
                )
                ORDER BY mpt.is_primary DESC, mpt.created_at
            ),
            '[]'::jsonb
        )
        INTO v_targets
        FROM public.maintenance_plan_targets mpt
        LEFT JOIN public.assets a ON a.id = mpt.asset_id
        LEFT JOIN public.buildings b ON b.id = mpt.building_id
        WHERE mpt.plan_id = v_task.maintenance_plan_id;
    END IF;

    RETURN jsonb_build_object(
        'version', 2,
        'snapshot_type', 'pm_execution',
        'created_at', NOW(),
        'task', jsonb_build_object(
            'id', v_task.id,
            'title', v_task.title,
            'description', v_task.description,
            'asset_id', v_task.asset_id,
            'building_id', v_task.building_id,
            'assigned_to', v_task.assigned_to,
            'assigned_team_id', v_task.assigned_team_id,
            'requires_photo', v_task.requires_photo,
            'requires_signature', v_task.requires_signature,
            'estimated_duration_minutes', v_task.estimated_duration_minutes
        ),
        'plan', jsonb_build_object(
            'id', v_task.maintenance_plan_id,
            'name', v_task.plan_name,
            'name_ar', v_task.plan_name_ar
        ),
        'frequency_bundle', jsonb_build_object(
            'id', v_task.frequency_bundle_id,
            'name', v_task.bundle_name,
            'name_ar', v_task.bundle_name_ar,
            'frequency_type', v_task.bundle_frequency_type,
            'interval_count', v_task.bundle_interval_count,
            'instructions', v_task.bundle_instructions
        ),
        'template', jsonb_build_object(
            'id', v_task.checklist_template_id,
            'name', v_task.template_name,
            'name_ar', v_task.template_name_ar,
            'category', v_task.template_category,
            'asset_type', v_task.template_asset_type,
            'version', v_task.template_version,
            'status', v_task.template_status,
            'template_type', v_task.template_type,
            'metadata', v_task.template_metadata
        ),
        'targets', v_targets,
        'sections', v_sections,
        'items', v_items
    );
END;
$function$;

COMMENT ON FUNCTION public.pm_build_task_execution_snapshot(uuid, boolean) IS
'Builds a frozen PM execution snapshot. p_skip_auth is deprecated and ignored; trusted trigger/service paths are explicit.';

REVOKE ALL ON FUNCTION public.pm_build_task_execution_snapshot(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pm_build_task_execution_snapshot(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.pm_build_task_execution_snapshot(uuid, boolean) TO authenticated, service_role;

-- Tenant-scoped inventory aggregation: preserve the client contract while
-- enforcing the same operational-access predicate used by inventory RLS.
CREATE OR REPLACE FUNCTION public.get_inventory_stats(check_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    total_count integer;
    low_stock_count integer;
    total_val numeric(15, 2);
    v_threshold_percent integer;
    v_settings jsonb;
BEGIN
    IF COALESCE(auth.role() = 'service_role', false) IS NOT TRUE THEN
        IF auth.uid() IS NULL
           OR NOT EXISTS (
               SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.is_active IS TRUE
           )
           OR public.can_view_inventory(check_tenant_id) IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'Unauthorized to view inventory statistics'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT settings INTO v_settings
      FROM public.tenants
     WHERE id = check_tenant_id;

    v_threshold_percent := COALESCE(
        (v_settings->'inventory'->>'low_stock_threshold_percent')::integer,
        20
    );

    SELECT COUNT(*) INTO total_count
      FROM public.inventory_items
     WHERE tenant_id = check_tenant_id AND is_active = TRUE;

    SELECT COUNT(*) INTO low_stock_count
      FROM public.inventory_items
     WHERE tenant_id = check_tenant_id
       AND is_active = TRUE
       AND (
           quantity <= min_quantity
           OR (min_quantity > 0 AND quantity <= (min_quantity * v_threshold_percent / 100))
       );

    SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO total_val
      FROM public.inventory_items
     WHERE tenant_id = check_tenant_id AND is_active = TRUE;

    RETURN jsonb_build_object(
        'total_items', total_count,
        'low_stock', low_stock_count,
        'total_value', total_val,
        'threshold_percent', v_threshold_percent
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_inventory_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_inventory_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_stats(uuid) TO authenticated, service_role;

-- Platform audit entries are authoritative. Tenant users must not be able to
-- forge platform-level audit history through this SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.log_platform_action(
    p_action character varying,
    p_action_type character varying,
    p_target_type character varying DEFAULT NULL,
    p_target_id uuid DEFAULT NULL,
    p_target_name character varying DEFAULT NULL,
    p_old_values jsonb DEFAULT NULL,
    p_new_values jsonb DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_log_id uuid;
    v_user_email character varying;
    v_user_name character varying;
    v_user_role character varying;
BEGIN
    IF COALESCE(auth.role() = 'service_role', false) IS NOT TRUE THEN
        IF auth.uid() IS NULL
           OR NOT EXISTS (
               SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.is_active IS TRUE
           )
           OR public.can_view_platform_tenants() IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'Platform staff authorization required'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
    SELECT full_name, role INTO v_user_name, v_user_role
      FROM public.profiles WHERE id = auth.uid();

    INSERT INTO public.platform_audit_logs (
        user_id, user_email, user_name, user_role,
        action, action_type, target_type, target_id, target_name,
        old_values, new_values, metadata
    ) VALUES (
        auth.uid(), v_user_email, v_user_name, v_user_role,
        p_action, p_action_type, p_target_type, p_target_id, p_target_name,
        p_old_values, p_new_values, p_metadata
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_platform_action(
    character varying, character varying, character varying, uuid,
    character varying, jsonb, jsonb, jsonb
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_platform_action(
    character varying, character varying, character varying, uuid,
    character varying, jsonb, jsonb, jsonb
) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_platform_action(
    character varying, character varying, character varying, uuid,
    character varying, jsonb, jsonb, jsonb
) TO authenticated, service_role;

-- These two routines are global maintenance jobs, not Data API endpoints.
ALTER FUNCTION public.check_and_escalate_priority()
    SET search_path TO 'public', 'pg_temp';
REVOKE ALL ON FUNCTION public.check_and_escalate_priority() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_and_escalate_priority() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_escalate_priority() TO service_role;

ALTER FUNCTION public.cleanup_expired_otps()
    SET search_path TO 'public', 'pg_temp';
REVOKE ALL ON FUNCTION public.cleanup_expired_otps() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_otps() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_otps() TO service_role;

-- The consolidated baseline omits the archived migration's explicit revoke for
-- this secret reader. Production is already restricted, but a fresh replay must
-- converge on the same service-only ACL.
ALTER FUNCTION public.get_runtime_secret(text)
    SET search_path TO 'public', 'internal', 'pg_temp';
REVOKE ALL ON FUNCTION public.get_runtime_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_runtime_secret(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_runtime_secret(text) TO postgres, service_role;

-- Same baseline regression class: internal notification creation must never
-- inherit PostgreSQL's default PUBLIC function EXECUTE.
ALTER FUNCTION public.create_notification(uuid, uuid, text, text, text, text, jsonb)
    SET search_path TO 'public', 'pg_temp';
REVOKE ALL ON FUNCTION public.create_notification(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, uuid, text, text, text, text, jsonb)
    FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, uuid, text, text, text, text, jsonb)
    TO postgres, service_role;

-- The archived hardening migrations revoked these evidence/checklist helpers,
-- but the consolidated baseline kept only their positive grants. Repeat the
-- negative ACLs explicitly so a fresh database cannot inherit PUBLIC EXECUTE.
ALTER FUNCTION public.create_operation_log(
    uuid, uuid, character varying, character varying, uuid, character varying
) SET search_path TO 'public', 'pg_temp';
REVOKE ALL ON FUNCTION public.create_operation_log(
    uuid, uuid, character varying, character varying, uuid, character varying
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_operation_log(
    uuid, uuid, character varying, character varying, uuid, character varying
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_operation_log(
    uuid, uuid, character varying, character varying, uuid, character varying
) TO postgres, service_role;

ALTER FUNCTION public.pm_write_audit_log(text, text, text, uuid, jsonb, jsonb)
    SET search_path TO 'public', 'pg_temp';
REVOKE ALL ON FUNCTION public.pm_write_audit_log(text, text, text, uuid, jsonb, jsonb)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pm_write_audit_log(text, text, text, uuid, jsonb, jsonb)
    FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_write_audit_log(text, text, text, uuid, jsonb, jsonb)
    TO postgres, service_role;

ALTER FUNCTION public.pm_populate_task_checks_internal(uuid)
    SET search_path TO 'public', 'pg_temp';
REVOKE ALL ON FUNCTION public.pm_populate_task_checks_internal(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pm_populate_task_checks_internal(uuid)
    FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_populate_task_checks_internal(uuid)
    TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Profile authority: the legacy FOR ALL self-policy allowed DELETE followed by
-- a privileged INSERT. Keep self SELECT/UPDATE policies, but make profile
-- creation an internal Auth/provisioning operation. The existing Auth trigger
-- still inserts as the table owner during signup.
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.handle_new_user() SET search_path TO 'public', 'pg_temp';

DO $ensure_profile_signup_trigger$
BEGIN
    IF to_regclass('auth.users') IS NULL THEN
        RAISE EXCEPTION 'auth.users is required before profile signup hardening';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_trigger t
         WHERE t.tgrelid = 'auth.users'::regclass
           AND t.tgname = 'on_auth_user_created'
           AND NOT t.tgisinternal
           AND (t.tgfoid <> 'public.handle_new_user()'::regprocedure
                OR t.tgtype <> 5
                OR t.tgenabled NOT IN ('O', 'A'))
    ) THEN
        RAISE EXCEPTION 'Existing on_auth_user_created trigger is incompatible or disabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_trigger t
         WHERE t.tgrelid = 'auth.users'::regclass
           AND t.tgname = 'on_auth_user_created'
           AND NOT t.tgisinternal
    ) THEN
        EXECUTE 'CREATE TRIGGER on_auth_user_created '
             || 'AFTER INSERT ON auth.users FOR EACH ROW '
             || 'EXECUTE FUNCTION public.handle_new_user()';
    END IF;
END
$ensure_profile_signup_trigger$;

DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert profile on signup" ON public.profiles;

REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
    ON TABLE public.profiles FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Billing authority: preserve every public signature used by the application,
-- but place the existing implementations behind fail-closed wrappers. The
-- previous `NULL NOT IN (...)` checks let an anonymous/no-profile caller pass.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.billing_assert_platform_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN;
    END IF;

    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND p.is_active IS TRUE
           AND p.role IN ('platform_owner', 'platform_admin')
    ) THEN
        RAISE EXCEPTION 'Platform billing administrator authorization required'
            USING ERRCODE = '42501';
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.billing_assert_platform_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.billing_assert_platform_admin() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_assert_platform_admin() TO postgres, service_role;

ALTER FUNCTION public.engine_activate(
    uuid, uuid, character varying, character varying, character varying,
    integer, uuid, uuid, character varying, character varying, numeric, text
) RENAME TO engine_activate_internal;

REVOKE ALL ON FUNCTION public.engine_activate_internal(
    uuid, uuid, character varying, character varying, character varying,
    integer, uuid, uuid, character varying, character varying, numeric, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.engine_activate_internal(
    uuid, uuid, character varying, character varying, character varying,
    integer, uuid, uuid, character varying, character varying, numeric, text
) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.engine_activate_internal(
    uuid, uuid, character varying, character varying, character varying,
    integer, uuid, uuid, character varying, character varying, numeric, text
) TO postgres;

CREATE OR REPLACE FUNCTION public.engine_activate(
    p_tenant_id uuid,
    p_plan_id uuid,
    p_billing_cycle character varying DEFAULT 'monthly',
    p_source character varying DEFAULT 'admin',
    p_status character varying DEFAULT 'active',
    p_trial_days integer DEFAULT NULL,
    p_discount_policy_id uuid DEFAULT NULL,
    p_quote_id uuid DEFAULT NULL,
    p_payment_method character varying DEFAULT NULL,
    p_payment_reference character varying DEFAULT NULL,
    p_amount numeric DEFAULT NULL,
    p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_caller_role text;
    v_existing_count bigint;
    v_existing_invoice record;
BEGIN
    -- The trusted payment verifier is the only caller allowed to activate a
    -- captured self-service payment. Serialize on the gateway reference so a
    -- verify request racing the webhook cannot create two paid invoices.
    IF auth.role() = 'service_role' AND p_source = 'self_service' THEN
        IF p_status IS DISTINCT FROM 'active'
           OR p_payment_method IS DISTINCT FROM 'tap'
           OR NULLIF(btrim(p_payment_reference), '') IS NULL
           OR p_amount IS NULL
           OR p_amount <= 0 THEN
            RAISE EXCEPTION 'Verified self-service payment fields are required'
                USING ERRCODE = '22023';
        END IF;

        p_payment_reference := btrim(p_payment_reference);

        PERFORM pg_advisory_xact_lock(
            hashtextextended('mutqan:payment:' || p_payment_reference, 0)
        );

        SELECT count(*)
          INTO v_existing_count
          FROM public.billing_invoices
         WHERE btrim(payment_reference) = p_payment_reference;

        IF v_existing_count > 1 THEN
            RAISE EXCEPTION 'Payment reference has conflicting invoice history'
                USING ERRCODE = '21000';
        END IF;

        IF v_existing_count = 1 THEN
            SELECT i.id AS invoice_id,
                   i.invoice_number,
                   i.tenant_id,
                   i.subscription_id,
                   i.total,
                   i.status AS invoice_status,
                   i.payment_method,
                   i.paid_at,
                   i.billing_period_start,
                   i.billing_period_end,
                   s.plan_id,
                   s.status AS subscription_status,
                   s.billing_cycle
              INTO STRICT v_existing_invoice
              FROM public.billing_invoices i
              LEFT JOIN public.tenant_subscriptions s
                ON s.id = i.subscription_id
             WHERE btrim(i.payment_reference) = p_payment_reference;

            IF v_existing_invoice.tenant_id IS DISTINCT FROM p_tenant_id
               OR v_existing_invoice.plan_id IS DISTINCT FROM p_plan_id
               OR v_existing_invoice.total IS DISTINCT FROM p_amount
               OR v_existing_invoice.invoice_status IS DISTINCT FROM 'paid'
               OR v_existing_invoice.payment_method IS DISTINCT FROM 'tap'
               OR v_existing_invoice.paid_at IS NULL
               OR v_existing_invoice.subscription_status IS DISTINCT FROM 'active'
               OR v_existing_invoice.billing_cycle IS DISTINCT FROM p_billing_cycle THEN
                RAISE EXCEPTION 'Payment reference is already bound to different billing data'
                    USING ERRCODE = '23505';
            END IF;

            RETURN jsonb_build_object(
                'subscription_id', v_existing_invoice.subscription_id,
                'invoice_id', v_existing_invoice.invoice_id,
                'invoice_number', v_existing_invoice.invoice_number,
                'status', v_existing_invoice.subscription_status,
                'period_start', v_existing_invoice.billing_period_start,
                'period_end', v_existing_invoice.billing_period_end,
                'amount', v_existing_invoice.total,
                'idempotent_replay', true
            );
        END IF;
    END IF;

    IF auth.role() <> 'service_role' OR auth.role() IS NULL THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authenticated billing caller required'
                USING ERRCODE = '42501';
        END IF;

        SELECT role
          INTO v_caller_role
          FROM public.profiles
         WHERE id = auth.uid()
           AND is_active IS TRUE;

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Active billing caller profile required'
                USING ERRCODE = '42501';
        END IF;

        -- Self-service payment activation is owned by the server-side payment
        -- verifier using service_role. Browser callers must never supply their
        -- own payment status/reference/amount.
        IF p_source = 'self_service' THEN
            RAISE EXCEPTION 'Self-service activation requires the trusted payment service'
                USING ERRCODE = '42501';
        END IF;

        IF v_caller_role NOT IN ('platform_owner', 'platform_admin') THEN
            RAISE EXCEPTION 'Platform billing administrator authorization required'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN public.engine_activate_internal(
        p_tenant_id, p_plan_id, p_billing_cycle, p_source, p_status,
        p_trial_days, p_discount_policy_id, p_quote_id, p_payment_method,
        p_payment_reference, p_amount, p_admin_note
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.engine_activate(
    uuid, uuid, character varying, character varying, character varying,
    integer, uuid, uuid, character varying, character varying, numeric, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.engine_activate(
    uuid, uuid, character varying, character varying, character varying,
    integer, uuid, uuid, character varying, character varying, numeric, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.engine_activate(
    uuid, uuid, character varying, character varying, character varying,
    integer, uuid, uuid, character varying, character varying, numeric, text
) TO authenticated, service_role;

ALTER FUNCTION public.engine_create_quote(
    uuid, uuid, character varying, uuid[], uuid, integer, text, text
) RENAME TO engine_create_quote_internal;
ALTER FUNCTION public.engine_approve_quote(uuid, text)
    RENAME TO engine_approve_quote_internal;
ALTER FUNCTION public.engine_activate_from_quote(uuid, integer)
    RENAME TO engine_activate_from_quote_internal;
ALTER FUNCTION public.engine_cancel(uuid, text)
    RENAME TO engine_cancel_internal;
ALTER FUNCTION public.engine_extend_trial(uuid, integer, text)
    RENAME TO engine_extend_trial_internal;

REVOKE ALL ON FUNCTION public.engine_create_quote_internal(
    uuid, uuid, character varying, uuid[], uuid, integer, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.engine_approve_quote_internal(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.engine_activate_from_quote_internal(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.engine_cancel_internal(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.engine_extend_trial_internal(uuid, integer, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.engine_create_quote_internal(
    uuid, uuid, character varying, uuid[], uuid, integer, text, text
) FROM anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.engine_approve_quote_internal(uuid, text) FROM anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.engine_activate_from_quote_internal(uuid, integer) FROM anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.engine_cancel_internal(uuid, text) FROM anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.engine_extend_trial_internal(uuid, integer, text) FROM anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.engine_create_quote_internal(
    uuid, uuid, character varying, uuid[], uuid, integer, text, text
) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_approve_quote_internal(uuid, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_activate_from_quote_internal(uuid, integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_cancel_internal(uuid, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_extend_trial_internal(uuid, integer, text) TO postgres;

CREATE OR REPLACE FUNCTION public.engine_create_quote(
    p_tenant_id uuid,
    p_plan_id uuid,
    p_billing_cycle character varying DEFAULT 'yearly',
    p_add_on_ids uuid[] DEFAULT '{}',
    p_discount_policy_id uuid DEFAULT NULL,
    p_valid_days integer DEFAULT 30,
    p_admin_notes text DEFAULT NULL,
    p_client_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    PERFORM public.billing_assert_platform_admin();
    RETURN public.engine_create_quote_internal(
        p_tenant_id, p_plan_id, p_billing_cycle, p_add_on_ids,
        p_discount_policy_id, p_valid_days, p_admin_notes, p_client_notes
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.engine_approve_quote(
    p_quote_id uuid,
    p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    PERFORM public.billing_assert_platform_admin();
    RETURN public.engine_approve_quote_internal(p_quote_id, p_admin_notes);
END;
$function$;

CREATE OR REPLACE FUNCTION public.engine_activate_from_quote(
    p_quote_id uuid,
    p_period_months integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    PERFORM public.billing_assert_platform_admin();
    RETURN public.engine_activate_from_quote_internal(p_quote_id, p_period_months);
END;
$function$;

CREATE OR REPLACE FUNCTION public.engine_cancel(
    p_tenant_id uuid,
    p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    PERFORM public.billing_assert_platform_admin();
    RETURN public.engine_cancel_internal(p_tenant_id, p_admin_note);
END;
$function$;

CREATE OR REPLACE FUNCTION public.engine_extend_trial(
    p_tenant_id uuid,
    p_extra_days integer,
    p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    PERFORM public.billing_assert_platform_admin();
    RETURN public.engine_extend_trial_internal(p_tenant_id, p_extra_days, p_admin_note);
END;
$function$;

REVOKE ALL ON FUNCTION public.engine_create_quote(
    uuid, uuid, character varying, uuid[], uuid, integer, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.engine_approve_quote(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.engine_activate_from_quote(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.engine_cancel(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.engine_extend_trial(uuid, integer, text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.engine_create_quote(
    uuid, uuid, character varying, uuid[], uuid, integer, text, text
) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.engine_approve_quote(uuid, text) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.engine_activate_from_quote(uuid, integer) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.engine_cancel(uuid, text) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.engine_extend_trial(uuid, integer, text) FROM anon, service_role;

GRANT EXECUTE ON FUNCTION public.engine_create_quote(
    uuid, uuid, character varying, uuid[], uuid, integer, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_approve_quote(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_activate_from_quote(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_cancel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_extend_trial(uuid, integer, text) TO authenticated;

-- The consolidated baseline also lost the security-invoker option from this
-- tenant view. Production already has the option, but still exposes SELECT to
-- anon. Converge both replay and live ACLs on authenticated RLS evaluation.
ALTER VIEW public.asset_maintenance_history SET (security_invoker = true);
REVOKE ALL ON TABLE public.asset_maintenance_history
    FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.asset_maintenance_history TO authenticated, service_role;

-- Notification broadcast is a platform-admin write surface. Preserve both
-- overloads behind active-admin wrappers and accept internal relative links only.
ALTER FUNCTION public.broadcast_notification(uuid, text, text, text, text)
    RENAME TO broadcast_notification_all_internal;
ALTER FUNCTION public.broadcast_notification(uuid, text, text, text, text, uuid[])
    RENAME TO broadcast_notification_scoped_internal;

REVOKE ALL ON FUNCTION public.broadcast_notification_all_internal(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_notification_scoped_internal(uuid, text, text, text, text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.broadcast_notification_all_internal(uuid, text, text, text, text)
    FROM anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.broadcast_notification_scoped_internal(uuid, text, text, text, text, uuid[])
    FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_notification_all_internal(uuid, text, text, text, text)
    TO postgres;
GRANT EXECUTE ON FUNCTION public.broadcast_notification_scoped_internal(uuid, text, text, text, text, uuid[])
    TO postgres;

CREATE OR REPLACE FUNCTION public.broadcast_notification(
    p_target_tenant_id uuid,
    p_title text,
    p_message text,
    p_type text DEFAULT 'info',
    p_link text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF auth.role() <> 'service_role' OR auth.role() IS NULL THEN
        IF auth.uid() IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.is_active IS TRUE
               AND p.role IN ('platform_owner', 'platform_admin')
        ) THEN
            RAISE EXCEPTION 'Active platform administrator authorization required'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NULLIF(btrim(p_title), '') IS NULL OR length(p_title) > 200
       OR NULLIF(btrim(p_message), '') IS NULL OR length(p_message) > 4000 THEN
        RAISE EXCEPTION 'Notification title or message is invalid';
    END IF;

    IF p_link IS NOT NULL AND (
        left(p_link, 1) <> '/'
        OR left(p_link, 2) = '//'
        OR p_link !~ '^/[A-Za-z0-9/_?&=#.+\-]*$'
        OR position(chr(92) IN p_link) > 0
        OR p_link ~ '[[:cntrl:]]'
    ) THEN
        RAISE EXCEPTION 'Notification link must be an internal relative path';
    END IF;

    RETURN public.broadcast_notification_scoped_internal(
        p_target_tenant_id, p_title, p_message, p_type, p_link, NULL::uuid[]
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.broadcast_notification(
    p_target_tenant_id uuid,
    p_title text,
    p_message text,
    p_type text DEFAULT 'info',
    p_link text DEFAULT NULL,
    p_specific_user_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF auth.role() <> 'service_role' OR auth.role() IS NULL THEN
        IF auth.uid() IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.is_active IS TRUE
               AND p.role IN ('platform_owner', 'platform_admin')
        ) THEN
            RAISE EXCEPTION 'Active platform administrator authorization required'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NULLIF(btrim(p_title), '') IS NULL OR length(p_title) > 200
       OR NULLIF(btrim(p_message), '') IS NULL OR length(p_message) > 4000 THEN
        RAISE EXCEPTION 'Notification title or message is invalid';
    END IF;

    IF p_link IS NOT NULL AND (
        left(p_link, 1) <> '/'
        OR left(p_link, 2) = '//'
        OR p_link !~ '^/[A-Za-z0-9/_?&=#.+\-]*$'
        OR position(chr(92) IN p_link) > 0
        OR p_link ~ '[[:cntrl:]]'
    ) THEN
        RAISE EXCEPTION 'Notification link must be an internal relative path';
    END IF;

    RETURN public.broadcast_notification_scoped_internal(
        p_target_tenant_id, p_title, p_message, p_type, p_link,
        p_specific_user_ids
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.broadcast_notification(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_notification(uuid, text, text, text, text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.broadcast_notification(uuid, text, text, text, text)
    FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.broadcast_notification(uuid, text, text, text, text, uuid[])
    FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(uuid, text, text, text, text)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(uuid, text, text, text, text, uuid[])
    TO authenticated;

COMMIT;
