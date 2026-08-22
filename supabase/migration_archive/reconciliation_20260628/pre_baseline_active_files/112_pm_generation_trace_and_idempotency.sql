-- =============================================================================
-- Migration: 112_pm_generation_trace_and_idempotency
-- Purpose:
--   Harden PM automatic generation for production cron and direct frontend RPC.
--   Adds lightweight trace fields to the RPC response and advances schedules
--   whose current due cycle is already covered by existing non-cancelled WOs.
--
-- Notes:
--   - Service-role / SQL admin contexts still generate for all tenants.
--   - Authenticated tenant users generate only for their own tenant.
--   - Anonymous users remain blocked.
--   - Existing covered cycles are treated as generated for schedule advancement,
--     but total_generated is not incremented again.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_generate_due_work_orders()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule            RECORD;
    v_plan                RECORD;
    v_asset               RECORD;
    v_item                RECORD;
    v_wo_id               UUID;
    v_wo_code             VARCHAR(50);
    v_next_due            DATE;
    v_generated_count     INTEGER := 0;
    v_schedule_generated  INTEGER := 0;
    v_schedules_scanned   INTEGER := 0;
    v_schedules_advanced  INTEGER := 0;
    v_existing_cycles     INTEGER := 0;
    v_skipped_no_assets   INTEGER := 0;
    v_expected_assets     INTEGER := 0;
    v_existing_assets     INTEGER := 0;
    v_job_plan_snapshot   JSONB;

    v_auth_role           TEXT := COALESCE(auth.role(), '');
    v_caller_id           UUID := auth.uid();
    v_profile_role        TEXT;
    v_profile_tenant_id   UUID;
    v_profile_is_super    BOOLEAN := FALSE;
    v_profile_is_active   BOOLEAN := TRUE;
    v_run_all_tenants     BOOLEAN := FALSE;
BEGIN
    IF v_auth_role = 'anon' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- SQL admin / service-role cron contexts have no end-user id and keep the
    -- original all-tenant generation behavior.
    IF v_caller_id IS NULL THEN
        v_run_all_tenants := TRUE;
    ELSE
        SELECT
            role,
            tenant_id,
            COALESCE(is_super_admin, FALSE),
            COALESCE(is_active, TRUE)
          INTO
            v_profile_role,
            v_profile_tenant_id,
            v_profile_is_super,
            v_profile_is_active
          FROM public.profiles
         WHERE id = v_caller_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caller profile not found';
        END IF;

        IF NOT v_profile_is_active THEN
            RAISE EXCEPTION 'Inactive users cannot generate PM work orders';
        END IF;

        IF v_profile_is_super
           OR v_profile_role IN ('platform_owner', 'platform_admin')
        THEN
            v_run_all_tenants := TRUE;
        ELSIF v_profile_role IN ('tenant_admin', 'tenant_owner', 'facility_manager', 'maintenance_manager') THEN
            IF v_profile_tenant_id IS NULL THEN
                RAISE EXCEPTION 'Caller tenant is required';
            END IF;
        ELSE
            RAISE EXCEPTION 'Insufficient permission to generate PM work orders';
        END IF;
    END IF;

    FOR v_schedule IN
        SELECT ps.*
          FROM public.pm_schedules ps
         WHERE ps.status = 'active'
           AND ps.trigger_type = 'calendar'
           AND ps.next_due_date IS NOT NULL
           AND (ps.next_due_date - COALESCE(ps.lead_time_days, 0)) <= CURRENT_DATE
           AND (ps.end_date IS NULL OR ps.next_due_date <= ps.end_date)
           AND (v_run_all_tenants OR ps.tenant_id = v_profile_tenant_id)
         ORDER BY ps.next_due_date, ps.created_at
    LOOP
        v_schedule_generated := 0;
        v_schedules_scanned := v_schedules_scanned + 1;

        SELECT * INTO v_plan
          FROM public.job_plans
         WHERE id = v_schedule.job_plan_id;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        v_job_plan_snapshot := jsonb_strip_nulls(jsonb_build_object(
            'id', v_plan.id,
            'code', v_plan.code,
            'name', v_plan.name,
            'name_ar', v_plan.name_ar,
            'version', v_plan.version,
            'category', v_plan.category,
            'estimated_duration_minutes', v_plan.estimated_duration_minutes,
            'requires_safety_checks', v_plan.requires_safety_checks,
            'safety_notes', v_plan.safety_notes,
            'safety_notes_ar', v_plan.safety_notes_ar,
            'required_parts', v_plan.required_parts,
            'required_tools', v_plan.required_tools,
            'required_materials', v_plan.required_materials,
            'reference_documents', v_plan.reference_documents,
            'required_skill', v_plan.required_skill,
            'required_role', v_plan.required_role
        ));

        -- If the current due cycle is already covered by existing, non-cancelled
        -- work orders, advance the schedule so manual and cron runs stay in sync.
        IF COALESCE(v_schedule.generation_mode, 'batch_route') = 'per_asset' THEN
            SELECT COUNT(*) INTO v_expected_assets
              FROM (
                  SELECT psa.asset_id
                    FROM public.pm_schedule_assets psa
                   WHERE psa.schedule_id = v_schedule.id

                  UNION

                  SELECT v_schedule.primary_asset_id AS asset_id
                   WHERE v_schedule.primary_asset_id IS NOT NULL
                     AND NOT EXISTS (
                         SELECT 1
                           FROM public.pm_schedule_assets psa
                          WHERE psa.schedule_id = v_schedule.id
                     )
              ) expected_assets;

            IF v_expected_assets = 0 THEN
                v_skipped_no_assets := v_skipped_no_assets + 1;
                CONTINUE;
            END IF;

            SELECT COUNT(DISTINCT woa.asset_id) INTO v_existing_assets
              FROM public.work_orders wo
              JOIN public.work_order_assets woa ON woa.work_order_id = wo.id
             WHERE wo.source_schedule_id = v_schedule.id
               AND wo.scheduled_date = v_schedule.next_due_date
               AND wo.status <> 'cancelled'
               AND woa.asset_id IN (
                   SELECT psa.asset_id
                     FROM public.pm_schedule_assets psa
                    WHERE psa.schedule_id = v_schedule.id

                   UNION

                   SELECT v_schedule.primary_asset_id AS asset_id
                    WHERE v_schedule.primary_asset_id IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1
                            FROM public.pm_schedule_assets psa
                           WHERE psa.schedule_id = v_schedule.id
                      )
               );

            IF v_existing_assets >= v_expected_assets THEN
                v_next_due := public.pm_calculate_next_due(
                    v_schedule.next_due_date,
                    v_schedule.frequency_type,
                    COALESCE(v_schedule.frequency_interval, 1)
                );

                UPDATE public.pm_schedules
                   SET next_due_date       = v_next_due,
                       last_generated_date = v_schedule.next_due_date,
                       updated_at          = NOW()
                 WHERE id = v_schedule.id;

                v_existing_cycles := v_existing_cycles + 1;
                v_schedules_advanced := v_schedules_advanced + 1;
                CONTINUE;
            END IF;
        ELSE
            IF v_schedule.primary_asset_id IS NULL
               AND NOT EXISTS (
                   SELECT 1
                     FROM public.pm_schedule_assets psa
                    WHERE psa.schedule_id = v_schedule.id
               ) THEN
                v_skipped_no_assets := v_skipped_no_assets + 1;
                CONTINUE;
            END IF;

            IF EXISTS (
                SELECT 1
                  FROM public.work_orders wo
                 WHERE wo.source_schedule_id = v_schedule.id
                   AND wo.source_schedule_asset_id IS NULL
                   AND wo.scheduled_date = v_schedule.next_due_date
                   AND wo.status <> 'cancelled'
            ) THEN
                v_next_due := public.pm_calculate_next_due(
                    v_schedule.next_due_date,
                    v_schedule.frequency_type,
                    COALESCE(v_schedule.frequency_interval, 1)
                );

                UPDATE public.pm_schedules
                   SET next_due_date       = v_next_due,
                       last_generated_date = v_schedule.next_due_date,
                       updated_at          = NOW()
                 WHERE id = v_schedule.id;

                v_existing_cycles := v_existing_cycles + 1;
                v_schedules_advanced := v_schedules_advanced + 1;
                CONTINUE;
            END IF;
        END IF;

        IF COALESCE(v_schedule.generation_mode, 'batch_route') = 'per_asset' THEN
            FOR v_asset IN
                SELECT
                    psa.id AS schedule_asset_id,
                    psa.asset_id,
                    psa.sort_order,
                    a.name AS asset_name,
                    a.name_ar AS asset_name_ar
                  FROM public.pm_schedule_assets psa
                  JOIN public.assets a ON a.id = psa.asset_id
                 WHERE psa.schedule_id = v_schedule.id

                UNION ALL

                SELECT
                    NULL::UUID AS schedule_asset_id,
                    v_schedule.primary_asset_id AS asset_id,
                    0 AS sort_order,
                    a.name AS asset_name,
                    a.name_ar AS asset_name_ar
                  FROM public.assets a
                 WHERE a.id = v_schedule.primary_asset_id
                   AND NOT EXISTS (
                       SELECT 1
                         FROM public.pm_schedule_assets psa
                        WHERE psa.schedule_id = v_schedule.id
                   )
                 ORDER BY sort_order
            LOOP
                IF EXISTS (
                    SELECT 1
                      FROM public.work_orders wo
                      JOIN public.work_order_assets woa ON woa.work_order_id = wo.id
                     WHERE wo.source_schedule_id = v_schedule.id
                       AND wo.scheduled_date = v_schedule.next_due_date
                       AND woa.asset_id = v_asset.asset_id
                       AND wo.status <> 'cancelled'
                ) THEN
                    CONTINUE;
                END IF;

                v_wo_code := 'WO-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
                             || '-' || LPAD(nextval('public.work_order_number_seq')::TEXT, 6, '0');

                INSERT INTO public.work_orders (
                    tenant_id,
                    code,
                    title,
                    description,
                    work_type,
                    source_schedule_id,
                    source_schedule_asset_id,
                    job_plan_id,
                    job_plan_snapshot,
                    status,
                    priority,
                    scheduled_date,
                    compliance_deadline,
                    assigned_to,
                    assigned_team,
                    asset_id,
                    created_at,
                    updated_at
                )
                VALUES (
                    v_schedule.tenant_id,
                    v_wo_code,
                    LEFT(COALESCE(v_schedule.name, v_plan.name) || ' - ' ||
                         COALESCE(v_asset.asset_name, v_asset.asset_id::TEXT), 255),
                    v_schedule.description,
                    'preventive',
                    v_schedule.id,
                    v_asset.schedule_asset_id,
                    v_schedule.job_plan_id,
                    v_job_plan_snapshot,
                    'pending',
                    CASE v_schedule.default_priority
                        WHEN 'critical' THEN 'urgent'
                        ELSE v_schedule.default_priority
                    END,
                    v_schedule.next_due_date,
                    v_schedule.next_due_date + COALESCE(
                        v_schedule.compliance_window_days,
                        public.pm_calculate_compliance_window(
                            v_schedule.frequency_type,
                            COALESCE(v_schedule.frequency_interval, 1)
                        )
                    ),
                    v_schedule.default_assignee_id,
                    v_schedule.default_team_id,
                    v_asset.asset_id,
                    NOW(),
                    NOW()
                )
                RETURNING id INTO v_wo_id;

                INSERT INTO public.work_order_assets (work_order_id, asset_id, sort_order)
                VALUES (v_wo_id, v_asset.asset_id, v_asset.sort_order)
                ON CONFLICT (work_order_id, asset_id) DO NOTHING;

                FOR v_item IN
                    SELECT *
                      FROM public.job_plan_items
                     WHERE job_plan_id = v_schedule.job_plan_id
                     ORDER BY sort_order, id
                LOOP
                    CONTINUE WHEN v_item.item_type = 'header';

                    INSERT INTO public.work_order_checks (
                        work_order_id,
                        asset_id,
                        job_plan_item_id,
                        item_snapshot,
                        sort_order,
                        status
                    )
                    VALUES (
                        v_wo_id,
                        v_asset.asset_id,
                        v_item.id,
                        jsonb_build_object(
                            'label', v_item.label,
                            'label_ar', v_item.label_ar,
                            'description', v_item.description,
                            'description_ar', v_item.description_ar,
                            'item_type', v_item.item_type,
                            'is_required', v_item.is_required,
                            'is_critical', v_item.is_critical,
                            'unit', v_item.unit,
                            'min_value', v_item.min_value,
                            'max_value', v_item.max_value,
                            'warning_min', v_item.warning_min,
                            'warning_max', v_item.warning_max,
                            'options', v_item.options,
                            'help_text', v_item.help_text,
                            'help_text_ar', v_item.help_text_ar
                        ),
                        v_item.sort_order,
                        'pending'
                    );
                END LOOP;

                v_generated_count := v_generated_count + 1;
                v_schedule_generated := v_schedule_generated + 1;
            END LOOP;
        ELSE
            IF v_schedule.primary_asset_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.pm_schedule_assets
                    WHERE schedule_id = v_schedule.id
               ) THEN
                CONTINUE;
            END IF;

            IF EXISTS (
                SELECT 1
                  FROM public.work_orders
                 WHERE source_schedule_id = v_schedule.id
                   AND source_schedule_asset_id IS NULL
                   AND scheduled_date = v_schedule.next_due_date
                   AND status <> 'cancelled'
            ) THEN
                CONTINUE;
            END IF;

            v_wo_code := 'WO-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
                         || '-' || LPAD(nextval('public.work_order_number_seq')::TEXT, 6, '0');

            INSERT INTO public.work_orders (
                tenant_id,
                code,
                title,
                description,
                work_type,
                source_schedule_id,
                source_schedule_asset_id,
                job_plan_id,
                job_plan_snapshot,
                status,
                priority,
                scheduled_date,
                compliance_deadline,
                assigned_to,
                assigned_team,
                asset_id,
                created_at,
                updated_at
            )
            VALUES (
                v_schedule.tenant_id,
                v_wo_code,
                LEFT(COALESCE(v_schedule.name, v_plan.name), 255),
                v_schedule.description,
                'preventive',
                v_schedule.id,
                NULL,
                v_schedule.job_plan_id,
                v_job_plan_snapshot,
                'pending',
                CASE v_schedule.default_priority
                    WHEN 'critical' THEN 'urgent'
                    ELSE v_schedule.default_priority
                END,
                v_schedule.next_due_date,
                v_schedule.next_due_date + COALESCE(
                    v_schedule.compliance_window_days,
                    public.pm_calculate_compliance_window(
                        v_schedule.frequency_type,
                        COALESCE(v_schedule.frequency_interval, 1)
                    )
                ),
                v_schedule.default_assignee_id,
                v_schedule.default_team_id,
                v_schedule.primary_asset_id,
                NOW(),
                NOW()
            )
            RETURNING id INTO v_wo_id;

            INSERT INTO public.work_order_assets (work_order_id, asset_id, sort_order)
            SELECT v_wo_id, asset_id, sort_order
              FROM public.pm_schedule_assets
             WHERE schedule_id = v_schedule.id
            ON CONFLICT (work_order_id, asset_id) DO NOTHING;

            INSERT INTO public.work_order_assets (work_order_id, asset_id, sort_order)
            SELECT v_wo_id, v_schedule.primary_asset_id, 0
             WHERE v_schedule.primary_asset_id IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1
                     FROM public.pm_schedule_assets
                    WHERE schedule_id = v_schedule.id
               )
            ON CONFLICT (work_order_id, asset_id) DO NOTHING;

            FOR v_asset IN
                SELECT asset_id, sort_order
                  FROM public.pm_schedule_assets
                 WHERE schedule_id = v_schedule.id

                UNION ALL

                SELECT v_schedule.primary_asset_id AS asset_id, 0 AS sort_order
                 WHERE v_schedule.primary_asset_id IS NOT NULL
                   AND NOT EXISTS (
                       SELECT 1
                         FROM public.pm_schedule_assets
                        WHERE schedule_id = v_schedule.id
                   )
                 ORDER BY sort_order
            LOOP
                FOR v_item IN
                    SELECT *
                      FROM public.job_plan_items
                     WHERE job_plan_id = v_schedule.job_plan_id
                     ORDER BY sort_order, id
                LOOP
                    CONTINUE WHEN v_item.item_type = 'header';

                    INSERT INTO public.work_order_checks (
                        work_order_id,
                        asset_id,
                        job_plan_item_id,
                        item_snapshot,
                        sort_order,
                        status
                    )
                    VALUES (
                        v_wo_id,
                        v_asset.asset_id,
                        v_item.id,
                        jsonb_build_object(
                            'label', v_item.label,
                            'label_ar', v_item.label_ar,
                            'description', v_item.description,
                            'description_ar', v_item.description_ar,
                            'item_type', v_item.item_type,
                            'is_required', v_item.is_required,
                            'is_critical', v_item.is_critical,
                            'unit', v_item.unit,
                            'min_value', v_item.min_value,
                            'max_value', v_item.max_value,
                            'warning_min', v_item.warning_min,
                            'warning_max', v_item.warning_max,
                            'options', v_item.options,
                            'help_text', v_item.help_text,
                            'help_text_ar', v_item.help_text_ar
                        ),
                        v_item.sort_order,
                        'pending'
                    );
                END LOOP;
            END LOOP;

            v_generated_count := v_generated_count + 1;
            v_schedule_generated := v_schedule_generated + 1;
        END IF;

        IF v_schedule_generated > 0 THEN
            v_next_due := public.pm_calculate_next_due(
                v_schedule.next_due_date,
                v_schedule.frequency_type,
                COALESCE(v_schedule.frequency_interval, 1)
            );

            UPDATE public.pm_schedules
                   SET next_due_date       = v_next_due,
                       last_generated_date = v_schedule.next_due_date,
                       total_generated     = total_generated + v_schedule_generated,
                       updated_at          = NOW()
             WHERE id = v_schedule.id;

            v_schedules_advanced := v_schedules_advanced + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'generated', v_generated_count,
        'schedules_scanned', v_schedules_scanned,
        'schedules_advanced', v_schedules_advanced,
        'existing_cycles_advanced', v_existing_cycles,
        'skipped_no_assets', v_skipped_no_assets,
        'scope', CASE WHEN v_run_all_tenants THEN 'all_tenants' ELSE 'tenant' END,
        'run_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pm_generate_due_work_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_generate_due_work_orders() FROM anon;
GRANT EXECUTE ON FUNCTION public.pm_generate_due_work_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_generate_due_work_orders() TO service_role;

COMMENT ON FUNCTION public.pm_generate_due_work_orders() IS
    'Generates due PM work orders. Direct frontend calls are scoped to the caller tenant; service/admin calls can generate all tenants.';
