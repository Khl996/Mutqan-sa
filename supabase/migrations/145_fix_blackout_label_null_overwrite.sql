-- =============================================================================
-- Migration: 145_fix_blackout_label_null_overwrite
-- Purpose:
--   Fix a bug in migration 144's blackout-deferral loops (pm_generate_due_-
--   work_orders and pm_schedule_forecast): the loop re-runs the blackout
--   lookup after a successful match to check whether the *new* due date also
--   falls inside another window. When it doesn't (the common case), that
--   final SELECT ... INTO finds zero rows, and per plpgsql semantics a
--   no-match SELECT INTO resets its target variables to NULL — clobbering
--   v_blackout_label right before it's used.
--
--   In pm_generate_due_work_orders() this is fatal: the operation_log
--   description is built with string concatenation ('... (blackout: ' ||
--   v_blackout_label || ')'), and `text || NULL` is NULL in SQL, so the
--   whole description collapses to NULL and the INSERT fails the NOT NULL
--   constraint on operation_logs.description. Net effect: ANY blackout
--   deferral crashes the generator for that tenant's whole run.
--
--   In pm_schedule_forecast() it's silent: deferred_by_blackout correctly
--   comes back TRUE, but blackout_label always comes back NULL instead of
--   naming the window, even on a deferred occurrence.
--
-- Fix:
--   Capture (end_date, label) into separate v_last_blackout_* variables
--   immediately after a successful match, before the loop's next iteration
--   can overwrite the lookup scratch variables with a no-match NULL. Use
--   the v_last_blackout_* variables wherever the label is consumed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_generate_due_work_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_schedule                RECORD;
    v_plan                    RECORD;
    v_asset                   RECORD;
    v_item                    RECORD;
    v_wo_id                   UUID;
    v_wo_code                 VARCHAR(50);
    v_next_due                DATE;
    v_generated_count         INTEGER := 0;
    v_schedule_generated      INTEGER := 0;
    v_schedules_scanned       INTEGER := 0;
    v_schedules_advanced      INTEGER := 0;
    v_existing_cycles         INTEGER := 0;
    v_skipped_no_assets       INTEGER := 0;
    v_skipped_inactive_tenant INTEGER := 0;
    v_expected_assets         INTEGER := 0;
    v_job_plan_snapshot       JSONB;
    v_assignee_id             UUID;
    v_run_id                  UUID        := gen_random_uuid();
    v_started_at              TIMESTAMPTZ := NOW();

    v_auth_role               TEXT    := COALESCE(auth.role(), '');
    v_caller_id               UUID    := auth.uid();
    v_profile_role            TEXT;
    v_profile_tenant_id       UUID;
    v_profile_is_super        BOOLEAN := FALSE;
    v_profile_is_active       BOOLEAN := TRUE;
    v_run_all_tenants         BOOLEAN := FALSE;

    -- Blackout deferral (Decision 4)
    v_blackout_end            DATE;
    v_blackout_label          VARCHAR(100);
    v_last_blackout_label     VARCHAR(100);
    v_deferred_this_schedule  BOOLEAN;
    v_blackout_deferred_count INTEGER := 0;
BEGIN
    -- -------------------------------------------------------------------------
    -- 1. Authentication and authority check (unchanged from migration 127)
    -- -------------------------------------------------------------------------
    IF v_auth_role = 'anon' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

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
        ELSIF v_profile_role IN (
            'tenant_admin', 'tenant_owner', 'facility_manager', 'maintenance_manager'
        ) THEN
            IF v_profile_tenant_id IS NULL THEN
                RAISE EXCEPTION 'Caller tenant is required';
            END IF;
        ELSE
            RAISE EXCEPTION 'Insufficient permission to generate PM work orders';
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. Main generation loop
    -- -------------------------------------------------------------------------
    FOR v_schedule IN
        SELECT ps.*
          FROM public.pm_schedules ps
          JOIN public.tenants t ON t.id = ps.tenant_id
         WHERE ps.status = 'active'
           AND ps.trigger_type = 'calendar'
           AND ps.next_due_date IS NOT NULL
           AND (ps.next_due_date - COALESCE(ps.lead_time_days, 0)) <= CURRENT_DATE
           AND (ps.end_date IS NULL OR ps.next_due_date <= ps.end_date)
           AND t.is_active = TRUE
           AND (v_run_all_tenants OR ps.tenant_id = v_profile_tenant_id)
         ORDER BY ps.next_due_date, ps.created_at
    LOOP
        IF NOT public.tenant_has_operational_access(v_schedule.tenant_id) THEN
            v_skipped_inactive_tenant := v_skipped_inactive_tenant + 1;
            CONTINUE;
        END IF;

        v_schedule_generated := 0;
        v_schedules_scanned  := v_schedules_scanned + 1;

        -- -------------------------------------------------------------------
        -- Blackout deferral (Invariant 5, Decision 4). Runs before the
        -- per-asset/batch_route logic and before re-checking readiness,
        -- because deferring can push the effective due date back into the
        -- future, in which case this schedule should not generate this run.
        -- -------------------------------------------------------------------
        v_deferred_this_schedule := FALSE;

        LOOP
            SELECT bw.end_date, bw.label
              INTO v_blackout_end, v_blackout_label
              FROM public.pm_blackout_windows bw
             WHERE bw.behavior = 'skip'
               AND (bw.tenant_id IS NULL OR bw.tenant_id = v_schedule.tenant_id)
               AND v_schedule.next_due_date BETWEEN bw.start_date AND bw.end_date
             ORDER BY bw.end_date DESC
             LIMIT 1;

            IF NOT FOUND THEN
                EXIT;
            END IF;

            -- Capture before the next iteration's no-match lookup nulls
            -- v_blackout_label back out from under us.
            v_last_blackout_label := v_blackout_label;

            v_schedule.next_due_date := v_blackout_end + 1;
            v_deferred_this_schedule := TRUE;
        END LOOP;

        IF v_deferred_this_schedule THEN
            UPDATE public.pm_schedules
               SET next_due_date = v_schedule.next_due_date,
                   updated_at    = NOW()
             WHERE id = v_schedule.id;

            v_blackout_deferred_count := v_blackout_deferred_count + 1;

            PERFORM public.create_operation_log(
                v_schedule.tenant_id,
                NULL,
                'pm_blackout_defer',
                'PM schedule ' || COALESCE(v_schedule.code, v_schedule.id::TEXT) ||
                    ' deferred to ' || v_schedule.next_due_date ||
                    ' (blackout: ' || v_last_blackout_label || ')',
                v_caller_id
            );

            -- Re-check readiness against the deferred date. If it's now in
            -- the future, this schedule isn't due this run — try again later.
            IF (v_schedule.next_due_date - COALESCE(v_schedule.lead_time_days, 0)) > CURRENT_DATE THEN
                CONTINUE;
            END IF;
        END IF;

        -- Load job plan.
        SELECT * INTO v_plan
          FROM public.job_plans
         WHERE id = v_schedule.job_plan_id;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        v_job_plan_snapshot := jsonb_strip_nulls(jsonb_build_object(
            'id',                          v_plan.id,
            'code',                        v_plan.code,
            'name',                        v_plan.name,
            'name_ar',                     v_plan.name_ar,
            'version',                     v_plan.version,
            'category',                    v_plan.category,
            'estimated_duration_minutes',  v_plan.estimated_duration_minutes,
            'requires_safety_checks',      v_plan.requires_safety_checks,
            'safety_notes',                v_plan.safety_notes,
            'safety_notes_ar',             v_plan.safety_notes_ar,
            'required_parts',              v_plan.required_parts,
            'required_tools',              v_plan.required_tools,
            'required_materials',          v_plan.required_materials,
            'reference_documents',         v_plan.reference_documents,
            'required_skill',              v_plan.required_skill,
            'required_role',               v_plan.required_role
        ));

        v_assignee_id := NULL;
        IF v_schedule.default_assignee_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1
                  FROM public.profiles
                 WHERE id        = v_schedule.default_assignee_id
                   AND tenant_id = v_schedule.tenant_id
                   AND COALESCE(is_active, TRUE) = TRUE
                   AND role IN ('technician', 'engineer', 'maintenance_manager')
            ) THEN
                v_assignee_id := v_schedule.default_assignee_id;
            END IF;
        END IF;

        -- ---------------------------------------------------------------------
        -- Generation: per_asset mode — one WO per asset, ON CONFLICT DO
        -- NOTHING against uq_pm_wo_cycle_per_asset (migration 142).
        -- ---------------------------------------------------------------------
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

            FOR v_asset IN
                SELECT
                    psa.id        AS schedule_asset_id,
                    psa.asset_id,
                    psa.sort_order,
                    a.name        AS asset_name
                  FROM public.pm_schedule_assets psa
                  JOIN public.assets a ON a.id = psa.asset_id
                 WHERE psa.schedule_id = v_schedule.id

                UNION ALL

                SELECT
                    NULL::UUID     AS schedule_asset_id,
                    v_schedule.primary_asset_id AS asset_id,
                    0              AS sort_order,
                    a.name         AS asset_name
                  FROM public.assets a
                 WHERE a.id = v_schedule.primary_asset_id
                   AND NOT EXISTS (
                       SELECT 1
                         FROM public.pm_schedule_assets psa
                        WHERE psa.schedule_id = v_schedule.id
                   )
                 ORDER BY sort_order
            LOOP
                v_wo_id   := NULL;
                v_wo_code := 'WO-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
                             || '-' || LPAD(nextval('public.work_order_number_seq')::TEXT, 6, '0');

                INSERT INTO public.work_orders (
                    tenant_id, code, title, description, work_type,
                    source_schedule_id, source_schedule_asset_id,
                    job_plan_id, job_plan_snapshot, status, priority,
                    scheduled_date, compliance_deadline, assigned_to,
                    assigned_team, asset_id, created_at, updated_at
                )
                VALUES (
                    v_schedule.tenant_id,
                    v_wo_code,
                    LEFT(
                        COALESCE(v_schedule.name, v_plan.name) || ' - ' ||
                        COALESCE(v_asset.asset_name, v_asset.asset_id::TEXT),
                        255
                    ),
                    v_schedule.description,
                    'preventive',
                    v_schedule.id,
                    v_asset.schedule_asset_id,
                    v_schedule.job_plan_id,
                    v_job_plan_snapshot,
                    'pending',
                    CASE v_schedule.default_priority WHEN 'critical' THEN 'urgent' ELSE v_schedule.default_priority END,
                    v_schedule.next_due_date,
                    v_schedule.next_due_date + COALESCE(
                        v_schedule.compliance_window_days,
                        public.pm_calculate_compliance_window(
                            v_schedule.frequency_type, COALESCE(v_schedule.frequency_interval, 1)
                        )
                    ),
                    v_assignee_id,
                    v_schedule.default_team_id,
                    v_asset.asset_id,
                    NOW(),
                    NOW()
                )
                ON CONFLICT (source_schedule_id, scheduled_date, asset_id)
                    WHERE work_type = 'preventive'
                      AND source_schedule_asset_id IS NOT NULL
                      AND source_schedule_id IS NOT NULL
                DO NOTHING
                RETURNING id INTO v_wo_id;

                IF v_wo_id IS NULL THEN
                    -- Slot already covered by a prior run (or a manual WO
                    -- landed on it first) — nothing to do for this asset.
                    CONTINUE;
                END IF;

                INSERT INTO public.work_order_assets (work_order_id, asset_id, sort_order)
                VALUES (v_wo_id, v_asset.asset_id, v_asset.sort_order)
                ON CONFLICT (work_order_id, asset_id) DO NOTHING;

                FOR v_item IN
                    SELECT * FROM public.job_plan_items
                     WHERE job_plan_id = v_schedule.job_plan_id
                     ORDER BY sort_order, id
                LOOP
                    CONTINUE WHEN v_item.item_type = 'header';

                    INSERT INTO public.work_order_checks (
                        work_order_id, asset_id, job_plan_item_id, item_snapshot, sort_order, status
                    )
                    VALUES (
                        v_wo_id, v_asset.asset_id, v_item.id,
                        jsonb_build_object(
                            'label', v_item.label, 'label_ar', v_item.label_ar,
                            'description', v_item.description, 'description_ar', v_item.description_ar,
                            'item_type', v_item.item_type, 'is_required', v_item.is_required,
                            'is_critical', v_item.is_critical, 'unit', v_item.unit,
                            'min_value', v_item.min_value, 'max_value', v_item.max_value,
                            'warning_min', v_item.warning_min, 'warning_max', v_item.warning_max,
                            'options', v_item.options, 'help_text', v_item.help_text,
                            'help_text_ar', v_item.help_text_ar
                        ),
                        v_item.sort_order, 'pending'
                    );
                END LOOP;

                PERFORM public.create_operation_log(
                    v_schedule.tenant_id, v_wo_id, 'pm_generate',
                    'PM work order generated from schedule ' || COALESCE(v_schedule.code, v_schedule.id::TEXT),
                    v_caller_id
                );

                v_generated_count    := v_generated_count + 1;
                v_schedule_generated := v_schedule_generated + 1;
            END LOOP;

        ELSE
        -- ---------------------------------------------------------------------
        -- Generation: batch_route mode — one WO for all schedule assets,
        -- ON CONFLICT DO NOTHING against uq_pm_wo_cycle_batch (migration 142).
        -- ---------------------------------------------------------------------
            IF v_schedule.primary_asset_id IS NULL
               AND NOT EXISTS (SELECT 1 FROM public.pm_schedule_assets WHERE schedule_id = v_schedule.id)
            THEN
                CONTINUE;
            END IF;

            v_wo_id   := NULL;
            v_wo_code := 'WO-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
                         || '-' || LPAD(nextval('public.work_order_number_seq')::TEXT, 6, '0');

            INSERT INTO public.work_orders (
                tenant_id, code, title, description, work_type,
                source_schedule_id, source_schedule_asset_id,
                job_plan_id, job_plan_snapshot, status, priority,
                scheduled_date, compliance_deadline, assigned_to,
                assigned_team, asset_id, created_at, updated_at
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
                CASE v_schedule.default_priority WHEN 'critical' THEN 'urgent' ELSE v_schedule.default_priority END,
                v_schedule.next_due_date,
                v_schedule.next_due_date + COALESCE(
                    v_schedule.compliance_window_days,
                    public.pm_calculate_compliance_window(
                        v_schedule.frequency_type, COALESCE(v_schedule.frequency_interval, 1)
                    )
                ),
                v_assignee_id,
                v_schedule.default_team_id,
                v_schedule.primary_asset_id,
                NOW(),
                NOW()
            )
            ON CONFLICT (source_schedule_id, scheduled_date)
                WHERE work_type = 'preventive'
                  AND source_schedule_asset_id IS NULL
                  AND source_schedule_id IS NOT NULL
            DO NOTHING
            RETURNING id INTO v_wo_id;

            IF v_wo_id IS NOT NULL THEN
                INSERT INTO public.work_order_assets (work_order_id, asset_id, sort_order)
                SELECT v_wo_id, asset_id, sort_order
                  FROM public.pm_schedule_assets
                 WHERE schedule_id = v_schedule.id
                ON CONFLICT (work_order_id, asset_id) DO NOTHING;

                INSERT INTO public.work_order_assets (work_order_id, asset_id, sort_order)
                SELECT v_wo_id, v_schedule.primary_asset_id, 0
                 WHERE v_schedule.primary_asset_id IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM public.pm_schedule_assets WHERE schedule_id = v_schedule.id)
                ON CONFLICT (work_order_id, asset_id) DO NOTHING;

                FOR v_asset IN
                    SELECT asset_id, sort_order FROM public.pm_schedule_assets WHERE schedule_id = v_schedule.id
                    UNION ALL
                    SELECT v_schedule.primary_asset_id AS asset_id, 0 AS sort_order
                     WHERE v_schedule.primary_asset_id IS NOT NULL
                       AND NOT EXISTS (SELECT 1 FROM public.pm_schedule_assets WHERE schedule_id = v_schedule.id)
                     ORDER BY sort_order
                LOOP
                    FOR v_item IN
                        SELECT * FROM public.job_plan_items
                         WHERE job_plan_id = v_schedule.job_plan_id
                         ORDER BY sort_order, id
                    LOOP
                        CONTINUE WHEN v_item.item_type = 'header';

                        INSERT INTO public.work_order_checks (
                            work_order_id, asset_id, job_plan_item_id, item_snapshot, sort_order, status
                        )
                        VALUES (
                            v_wo_id, v_asset.asset_id, v_item.id,
                            jsonb_build_object(
                                'label', v_item.label, 'label_ar', v_item.label_ar,
                                'description', v_item.description, 'description_ar', v_item.description_ar,
                                'item_type', v_item.item_type, 'is_required', v_item.is_required,
                                'is_critical', v_item.is_critical, 'unit', v_item.unit,
                                'min_value', v_item.min_value, 'max_value', v_item.max_value,
                                'warning_min', v_item.warning_min, 'warning_max', v_item.warning_max,
                                'options', v_item.options, 'help_text', v_item.help_text,
                                'help_text_ar', v_item.help_text_ar
                            ),
                            v_item.sort_order, 'pending'
                        );
                    END LOOP;
                END LOOP;

                PERFORM public.create_operation_log(
                    v_schedule.tenant_id, v_wo_id, 'pm_generate',
                    'PM work order generated from schedule ' || COALESCE(v_schedule.code, v_schedule.id::TEXT),
                    v_caller_id
                );

                v_generated_count    := v_generated_count + 1;
                v_schedule_generated := v_schedule_generated + 1;
            ELSE
                v_existing_cycles := v_existing_cycles + 1;
            END IF;
        END IF;

        -- ---------------------------------------------------------------------
        -- Bookkeeping (Decision 1/2): last_generated_date/total_generated
        -- track "did this run create anything new", independent of whether
        -- next_due_date moves. next_due_date only advances for fixed mode.
        -- ---------------------------------------------------------------------
        IF v_schedule_generated > 0 THEN
            UPDATE public.pm_schedules
               SET last_generated_date = v_schedule.next_due_date,
                   total_generated     = COALESCE(total_generated, 0) + v_schedule_generated,
                   updated_at          = NOW()
             WHERE id = v_schedule.id;
        END IF;

        IF v_schedule.anchor_mode = 'fixed' THEN
            v_next_due := public.pm_calculate_next_due(
                v_schedule.next_due_date,
                v_schedule.frequency_type,
                COALESCE(v_schedule.frequency_interval, 1)
            );

            UPDATE public.pm_schedules
               SET next_due_date = v_next_due,
                   updated_at    = NOW()
             WHERE id = v_schedule.id;

            v_schedules_advanced := v_schedules_advanced + 1;
        END IF;
        -- anchor_mode = 'floating': next_due_date is deliberately left
        -- untouched here. wo_complete() / cancel_work_order() advance it.
    END LOOP;

    -- -------------------------------------------------------------------------
    -- 3. Audit run record (same transaction as WO INSERTs — rolls back together)
    -- -------------------------------------------------------------------------
    INSERT INTO public.pm_generation_runs (
        run_id, tenant_id, requested_by, requested_by_role, run_scope,
        generated_count, skipped_count, status, started_at, completed_at, metadata
    ) VALUES (
        v_run_id,
        CASE WHEN NOT v_run_all_tenants THEN v_profile_tenant_id ELSE NULL END,
        v_caller_id,
        COALESCE(v_profile_role, 'service_role'),
        CASE WHEN v_run_all_tenants THEN 'all_tenants' ELSE 'tenant' END,
        v_generated_count,
        v_skipped_no_assets + v_skipped_inactive_tenant,
        'completed',
        v_started_at,
        NOW(),
        jsonb_build_object(
            'schedules_scanned',        v_schedules_scanned,
            'schedules_advanced',       v_schedules_advanced,
            'existing_cycles_skipped',  v_existing_cycles,
            'skipped_no_assets',        v_skipped_no_assets,
            'skipped_inactive_tenants', v_skipped_inactive_tenant,
            'blackout_deferred',        v_blackout_deferred_count
        )
    );

    RETURN jsonb_build_object(
        'success',             TRUE,
        'generated',           v_generated_count,
        'schedules_scanned',   v_schedules_scanned,
        'schedules_advanced',  v_schedules_advanced,
        'existing_cycles_skipped', v_existing_cycles,
        'skipped_no_assets',   v_skipped_no_assets,
        'blackout_deferred',   v_blackout_deferred_count,
        'scope',               CASE WHEN v_run_all_tenants THEN 'all_tenants' ELSE 'tenant' END,
        'run_at',               NOW(),
        'run_id',               v_run_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pm_schedule_forecast(p_schedule_id uuid, p_occurrences integer DEFAULT 6)
 RETURNS TABLE(occurrence_number integer, due_date date, deferred_by_blackout boolean, blackout_label character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_schedule    RECORD;
    v_cursor      DATE;
    v_blackout_end   DATE;
    v_blackout_label VARCHAR(100);
    v_last_blackout_label VARCHAR(100);
    v_deferred       BOOLEAN;
    i             INTEGER;
BEGIN
    IF p_occurrences IS NULL OR p_occurrences < 1 OR p_occurrences > 60 THEN
        RAISE EXCEPTION 'p_occurrences must be between 1 and 60';
    END IF;

    SELECT * INTO v_schedule FROM public.pm_schedules WHERE id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PM schedule not found';
    END IF;

    IF NOT public.pm_can_view_tenant(v_schedule.tenant_id) THEN
        RAISE EXCEPTION 'Insufficient permission to view this PM schedule''s forecast'
            USING ERRCODE = '42501';
    END IF;

    IF v_schedule.next_due_date IS NULL THEN
        RETURN;  -- no rows; nothing to forecast (e.g. meter/condition-triggered schedule)
    END IF;

    v_cursor := v_schedule.next_due_date;

    FOR i IN 1..p_occurrences LOOP
        EXIT WHEN v_schedule.end_date IS NOT NULL AND v_cursor > v_schedule.end_date;

        v_deferred := FALSE;
        LOOP
            SELECT bw.end_date, bw.label
              INTO v_blackout_end, v_blackout_label
              FROM public.pm_blackout_windows bw
             WHERE bw.behavior = 'skip'
               AND (bw.tenant_id IS NULL OR bw.tenant_id = v_schedule.tenant_id)
               AND v_cursor BETWEEN bw.start_date AND bw.end_date
             ORDER BY bw.end_date DESC
             LIMIT 1;

            IF NOT FOUND THEN
                EXIT;
            END IF;

            -- Capture before the next iteration's no-match lookup nulls
            -- v_blackout_label back out from under us.
            v_last_blackout_label := v_blackout_label;

            v_cursor   := v_blackout_end + 1;
            v_deferred := TRUE;
        END LOOP;

        occurrence_number    := i;
        due_date             := v_cursor;
        deferred_by_blackout := v_deferred;
        blackout_label       := CASE WHEN v_deferred THEN v_last_blackout_label ELSE NULL END;
        RETURN NEXT;

        -- Best-effort projection only: assumes on-time completion for every
        -- future occurrence regardless of anchor_mode. Floating schedules
        -- can shift in reality based on actual completion/cancellation
        -- timing — this function does not and cannot predict that.
        v_cursor := public.pm_calculate_next_due(
            v_cursor, v_schedule.frequency_type, COALESCE(v_schedule.frequency_interval, 1)
        );
    END LOOP;

    RETURN;
END;
$function$;
