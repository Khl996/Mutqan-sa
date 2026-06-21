-- =============================================================================
-- Migration: 144_pm_engine_generator_rewrite
--
-- *** STATUS: DRAFT — NOT APPLIED ANYWHERE. Awaiting review per the standing
-- process (inspect -> propose DDL -> apply only after explicit approval).
-- "Nothing live until reviewed" — do not run apply_migration against this
-- file without a separate, explicit go-ahead. ***
--
-- Purpose:
--   PM Engine Phase 1 — generator rewrite. Builds on the schema foundation
--   from migration 142 (anchor_mode, the two partial unique indexes,
--   pm_master_templates + lock trigger, pm_blackout_windows) which is
--   already applied to production. This migration changes BEHAVIOR, not
--   schema: it rewrites pm_generate_due_work_orders(), wo_complete(), and
--   cancel_work_order() to actually use anchor_mode and pm_blackout_windows,
--   and adds two new RPCs (master propagation, pure-read forecast).
--
-- Carried forward from the review thread (do not relitigate without going
-- back to Khalid):
--   1. Floating-anchor cancellation advancement must be tested alongside the
--      fixed-cancelled and completion paths, not in isolation. See "Test
--      plan" at the bottom of this file.
--   2. The generator's INSERT must use ON CONFLICT DO NOTHING against the
--      migration-142 partial unique indexes — this replaces the old
--      app-level "IF EXISTS ... CONTINUE" idempotency checks entirely.
--   3. RLS isolation tests already run against production for the three
--      migration-142 tables (13/13 passing) count toward this migration's
--      DoD; no new RLS policies are introduced here, so no new RLS tests
--      are required for the tables this migration touches (it only adds
--      functions and a CHECK constraint widening).
--
-- Decisions baked into this version:
--   1. anchor_mode = 'fixed': next_due_date advances unconditionally once
--      the current cycle's work order slot is confirmed to exist (whether
--      pre-existing via ON CONFLICT or freshly inserted) — same as the old
--      generator's behavior, now gated explicitly by anchor_mode instead of
--      being the only behavior available.
--   2. anchor_mode = 'floating': the generator NEVER advances next_due_date.
--      The schedule's single open WO for the current cycle is left in place
--      (ON CONFLICT DO NOTHING means re-running the generator while it's
--      still open is a safe no-op) until it resolves. Advancement happens
--      in wo_complete() (next_due = completion's CURRENT_DATE + interval)
--      or cancel_work_order() (next_due = the cancelled WO's own
--      scheduled_date + interval, NOT today — "the schedule never freezes"
--      per the anchor_mode column comment in migration 142).
--   3. For per_asset schedules, "the current cycle is resolved" means every
--      non-cancelled WO sourced from that schedule for that scheduled_date
--      has reached a terminal state (completed or cancelled). Only the LAST
--      asset's WO to resolve triggers the floating advancement — checked
--      via a NOT EXISTS guard against sibling WOs for the same
--      (source_schedule_id, scheduled_date), so multi-asset floating
--      schedules don't advance prematurely while siblings are still open.
--   4. Blackout deferral is applied once per schedule per generator run,
--      BEFORE the readiness/eligibility check, and is persisted immediately
--      (UPDATE pm_schedules.next_due_date) regardless of whether generation
--      actually happens this run. This means a schedule can be deferred
--      across a holiday without ever entering the per-asset/batch_route
--      generation logic, and the deferral survives even if nothing is
--      generated this run because the deferred date is still in the future.
--   5. Master PM propagation only ever writes pm_schedules.frequency_type /
--      frequency_interval / anchor_mode — never next_due_date, never
--      work_orders — via the app.master_pm_propagation_authorized bypass
--      flag already wired into the migration-142 lock trigger. This is a
--      one-shot, explicit-call RPC (no automatic propagation on UPDATE of
--      pm_master_templates) so propagation is always an audited, deliberate
--      action.
--   6. pm_schedule_forecast() is pure-read: no INSERT/UPDATE/DELETE anywhere
--      in its body. It projects assuming on-time completion (next iteration
--      = pm_calculate_next_due(this iteration, ...) regardless of
--      anchor_mode) — for floating schedules this is a best-effort estimate,
--      not a guarantee, and the function's COMMENT says so explicitly.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — Widen operation_logs.type for the two new audit event kinds
-- this migration introduces (additive, same pattern as migration 127).
-- =============================================================================

ALTER TABLE public.operation_logs DROP CONSTRAINT IF EXISTS operation_logs_type_check;

ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_type_check CHECK (
    type IN (
        'maintenance',
        'repair',
        'inspection',
        'emergency',
        'routine',
        'installation',
        'calibration',
        'other',
        'status_change',
        'comment',
        'assignment',
        'create',
        'update',
        'cancellation',
        'pm_generate',
        'pm_master_propagate',
        'pm_blackout_defer'
    )
);


-- =============================================================================
-- SECTION 2 — pm_propagate_master_template() (Invariant 4: forward-only
-- Master PM propagation)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_propagate_master_template(
    p_master_template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_template      RECORD;
    v_caller_id     UUID := auth.uid();
    v_updated_count INTEGER := 0;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_template
      FROM public.pm_master_templates
     WHERE id = p_master_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Master PM template not found';
    END IF;

    IF NOT public.pm_can_manage_tenant(v_template.tenant_id) THEN
        RAISE EXCEPTION 'Insufficient permission to propagate this Master PM template'
            USING ERRCODE = '42501';
    END IF;

    -- Authorize the upcoming UPDATE to bypass trg_pm_schedules_master_lock
    -- (migration 142). Transaction-scoped (is_local = TRUE).
    PERFORM set_config('app.master_pm_propagation_authorized', 'true', TRUE);

    UPDATE public.pm_schedules
       SET frequency_type     = v_template.frequency_type,
           frequency_interval = v_template.frequency_interval,
           anchor_mode        = v_template.anchor_mode,
           updated_at         = NOW()
     WHERE master_template_id = p_master_template_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    PERFORM public.create_operation_log(
        v_template.tenant_id,
        NULL,
        'pm_master_propagate',
        'Master PM template ' || COALESCE(v_template.name, v_template.id::TEXT) ||
            ' propagated to ' || v_updated_count || ' linked schedule(s)',
        v_caller_id
    );

    RETURN jsonb_build_object(
        'success',         TRUE,
        'master_template_id', p_master_template_id,
        'schedules_updated', v_updated_count,
        'run_at',           NOW()
    );
END;
$$;

COMMENT ON FUNCTION public.pm_propagate_master_template(UUID) IS
    'Invariant 4: one-shot, explicit propagation of a Master PM template''s '
    'frequency_type / frequency_interval / anchor_mode to every pm_schedules '
    'row linked via master_template_id. Never touches next_due_date or '
    'work_orders. Not triggered automatically on template UPDATE — the '
    'caller must invoke this RPC deliberately, so propagation is always an '
    'audited, intentional action (logged as operation_logs.type = '
    '''pm_master_propagate'').';

REVOKE ALL ON FUNCTION public.pm_propagate_master_template(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_propagate_master_template(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.pm_propagate_master_template(UUID) TO authenticated;


-- =============================================================================
-- SECTION 3 — pm_generate_due_work_orders() rewrite (Invariants 1, 2, 5)
--
-- Same signature/return-shape contract as migration 127's version (additive
-- superset of fields), so existing callers (cron, manual trigger endpoints)
-- are unaffected. What changes is internal behavior:
--   - Blackout-window deferral runs before the readiness check.
--   - Idempotency is DB-enforced via ON CONFLICT DO NOTHING against the
--     migration-142 partial unique indexes, not app-level IF EXISTS checks.
--   - next_due_date advancement is gated on anchor_mode (Decision 1/2 above).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_generate_due_work_orders()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
                    ' (blackout: ' || v_blackout_label || ')',
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
$$;

-- Grants unchanged from migration 108/127 (CREATE OR REPLACE preserves them);
-- restated here for clarity/auditability of this file in isolation.
REVOKE ALL ON FUNCTION public.pm_generate_due_work_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_generate_due_work_orders() FROM anon;
GRANT EXECUTE ON FUNCTION public.pm_generate_due_work_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_generate_due_work_orders() TO service_role;


-- =============================================================================
-- SECTION 4 — wo_complete() — floating-anchor completion advancement
-- (Decision 2/3). Signature unchanged from migration 121.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.wo_complete(
    p_wo_id            UUID,
    p_completion_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id       UUID    := auth.uid();
    v_actor_role     TEXT;
    v_actor_tenant   UUID;
    v_is_super       BOOLEAN := FALSE;
    v_wo             RECORD;
    v_is_platform    BOOLEAN := FALSE;
    v_is_mgmt        BOOLEAN := FALSE;
    v_missing_labels TEXT;

    -- Floating-anchor advancement (new in this migration)
    v_sched_anchor   VARCHAR(10);
    v_sched_freq     VARCHAR(20);
    v_sched_interval INTEGER;
    v_sched_next_due DATE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_wo_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_mgmt     := v_is_platform OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_actor_role NOT IN (
        'technician', 'engineer', 'maintenance_manager', 'tenant_admin',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to complete a work order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_wo.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress work orders can be completed; current status: %', v_wo.status;
    END IF;

    IF NOT v_is_mgmt AND v_wo.assigned_to IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the assigned technician can complete this work order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT string_agg(
        (item_snapshot->>'label')
        || CASE WHEN asset_id IS NOT NULL THEN
               ' (' || COALESCE((SELECT name FROM public.assets WHERE id = asset_id), 'Asset') || ')'
           ELSE '' END,
        ', ' ORDER BY sort_order
    )
    INTO v_missing_labels
    FROM public.work_order_checks
    WHERE work_order_id = p_wo_id
      AND COALESCE((item_snapshot->>'is_required')::BOOLEAN, FALSE) = TRUE
      AND status = 'pending';

    IF v_missing_labels IS NOT NULL THEN
        RAISE EXCEPTION 'Required checks incomplete: %', v_missing_labels;
    END IF;

    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status                  = 'completed',
           completed_at            = NOW(),
           completion_notes        = COALESCE(p_completion_notes, completion_notes),
           actual_duration_minutes = CASE
               WHEN started_at IS NOT NULL THEN GREATEST(0, (EXTRACT(EPOCH FROM (NOW() - started_at)) / 60.0)::INTEGER)
               WHEN start_time IS NOT NULL THEN GREATEST(0, (EXTRACT(EPOCH FROM (NOW() - start_time)) / 60.0)::INTEGER)
               ELSE NULL
           END,
           updated_at = NOW()
     WHERE id = p_wo_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order update failed unexpectedly';
    END IF;

    IF v_wo.source_schedule_id IS NOT NULL THEN
        UPDATE public.pm_schedules
           SET total_completed = total_completed + 1,
               compliance_rate = CASE
                   WHEN total_generated > 0 THEN ((total_completed + 1)::DECIMAL / total_generated * 100.0)
                   ELSE 0
               END,
               updated_at = NOW()
         WHERE id = v_wo.source_schedule_id;

        -- Floating-anchor advancement (Decision 2/3): next_due = today +
        -- interval, but only once every sibling WO for this exact cycle has
        -- also reached a terminal state (handles per_asset multi-WO cycles).
        SELECT anchor_mode, frequency_type, frequency_interval, next_due_date
          INTO v_sched_anchor, v_sched_freq, v_sched_interval, v_sched_next_due
          FROM public.pm_schedules
         WHERE id = v_wo.source_schedule_id;

        IF v_sched_anchor = 'floating' AND v_wo.scheduled_date = v_sched_next_due THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.work_orders
                 WHERE source_schedule_id = v_wo.source_schedule_id
                   AND scheduled_date     = v_wo.scheduled_date
                   AND id                <> v_wo.id
                   AND status NOT IN ('completed', 'cancelled')
            ) THEN
                UPDATE public.pm_schedules
                   SET next_due_date = public.pm_calculate_next_due(
                           CURRENT_DATE, v_sched_freq, COALESCE(v_sched_interval, 1)
                       ),
                       updated_at = NOW()
                 WHERE id = v_wo.source_schedule_id;
            END IF;
        END IF;
    END IF;

    PERFORM public.create_operation_log(
        v_wo.tenant_id, p_wo_id, 'maintenance', 'PM work order completed', v_actor_id
    );

    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_wo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.wo_complete(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wo_complete(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.wo_complete(UUID, TEXT) TO authenticated;


-- =============================================================================
-- SECTION 5 — cancel_work_order() — floating-anchor cancellation fallback
-- (Decision 2/3: "the schedule never freezes"). Signature unchanged from
-- migration 124.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_work_order(
    p_work_order_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id     UUID := auth.uid();
    v_actor_role   TEXT;
    v_actor_tenant UUID;
    v_actor_active BOOLEAN;
    v_actor_super  BOOLEAN := FALSE;
    v_wo           public.work_orders%ROWTYPE;
    v_reason       TEXT := NULLIF(BTRIM(p_reason), '');
    v_log_code     TEXT;
    v_description  TEXT;

    -- Floating-anchor cancellation fallback (new in this migration)
    v_sched_anchor   VARCHAR(10);
    v_sched_freq     VARCHAR(20);
    v_sched_interval INTEGER;
    v_sched_next_due DATE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_work_order_id IS NULL THEN
        RAISE EXCEPTION 'Work order id is required' USING ERRCODE = '22023';
    END IF;

    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'Cancellation reason is required' USING ERRCODE = '22023';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot cancel work orders' USING ERRCODE = '28000';
    END IF;

    IF v_actor_role NOT IN ('tenant_admin', 'maintenance_manager') THEN
        RAISE EXCEPTION 'Insufficient permissions to cancel work orders' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501';
    END IF;

    IF v_wo.status NOT IN ('pending', 'assigned', 'on_hold') THEN
        RAISE EXCEPTION 'Cannot cancel work order in status: %', v_wo.status USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancellation_reason = v_reason,
           updated_at = NOW()
     WHERE id = p_work_order_id
     RETURNING * INTO v_wo;

    -- Floating-anchor fallback (Decision 2/3): next_due = the CANCELLED
    -- due date + interval (not today), so a cancelled cycle still pushes
    -- the schedule forward instead of freezing it. Same sibling-WO guard
    -- as wo_complete() for multi-asset cycles.
    IF v_wo.source_schedule_id IS NOT NULL THEN
        SELECT anchor_mode, frequency_type, frequency_interval, next_due_date
          INTO v_sched_anchor, v_sched_freq, v_sched_interval, v_sched_next_due
          FROM public.pm_schedules
         WHERE id = v_wo.source_schedule_id;

        IF v_sched_anchor = 'floating' AND v_wo.scheduled_date = v_sched_next_due THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.work_orders
                 WHERE source_schedule_id = v_wo.source_schedule_id
                   AND scheduled_date     = v_wo.scheduled_date
                   AND id                <> v_wo.id
                   AND status NOT IN ('completed', 'cancelled')
            ) THEN
                UPDATE public.pm_schedules
                   SET next_due_date = public.pm_calculate_next_due(
                           v_wo.scheduled_date, v_sched_freq, COALESCE(v_sched_interval, 1)
                       ),
                       updated_at = NOW()
                 WHERE id = v_wo.source_schedule_id;
            END IF;
        END IF;
    END IF;

    v_description := 'Work order cancelled; reason=' || v_reason;
    v_log_code := 'LOG-' || to_char(NOW(), 'YYMMDDHH24MISS') || '-' || substring(gen_random_uuid()::TEXT FROM 1 FOR 4);

    INSERT INTO public.operation_logs (
        tenant_id, code, type, description, reason, work_order_id,
        asset_id, building_id, performed_by, team_id, timestamp, status
    ) VALUES (
        v_wo.tenant_id, v_log_code, 'cancellation', v_description, v_reason,
        v_wo.id, v_wo.asset_id, v_wo.building_id, v_actor_id, v_wo.assigned_team, NOW(), 'completed'
    );

    RETURN jsonb_build_object(
        'success', TRUE, 'work_order_id', v_wo.id, 'status', v_wo.status, 'reason', v_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_work_order(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_work_order(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_work_order(UUID, TEXT) TO authenticated;


-- =============================================================================
-- SECTION 6 — pm_schedule_forecast() — pure-read Forecast RPC (Invariant 3)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_schedule_forecast(
    p_schedule_id  UUID,
    p_occurrences  INTEGER DEFAULT 6
)
RETURNS TABLE (
    occurrence_number      INTEGER,
    due_date               DATE,
    deferred_by_blackout   BOOLEAN,
    blackout_label         VARCHAR(100)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule    RECORD;
    v_cursor      DATE;
    v_blackout_end   DATE;
    v_blackout_label VARCHAR(100);
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

            v_cursor   := v_blackout_end + 1;
            v_deferred := TRUE;
        END LOOP;

        occurrence_number    := i;
        due_date             := v_cursor;
        deferred_by_blackout := v_deferred;
        blackout_label       := CASE WHEN v_deferred THEN v_blackout_label ELSE NULL END;
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
$$;

COMMENT ON FUNCTION public.pm_schedule_forecast(UUID, INTEGER) IS
    'Invariant 3: pure-read forecast. No INSERT/UPDATE/DELETE anywhere in '
    'this function. Projects forward assuming on-time completion; for '
    'anchor_mode = floating schedules this is a best-effort estimate only, '
    'since real advancement depends on actual completion/cancellation '
    'timing which cannot be known in advance.';

REVOKE ALL ON FUNCTION public.pm_schedule_forecast(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_schedule_forecast(UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.pm_schedule_forecast(UUID, INTEGER) TO authenticated;


-- =============================================================================
-- TEST PLAN (not executed by this file — for the review/approval step before
-- any apply_migration call against this file):
--
-- 1. Fixed-mode generation: create a fixed-anchor calendar schedule due
--    today, run pm_generate_due_work_orders(), confirm one WO is created
--    and next_due_date advances by exactly one interval. Re-run the
--    generator immediately: confirm ON CONFLICT DO NOTHING produces zero
--    new WOs and no duplicate-key error.
-- 2. Floating-mode generation + completion: create a floating-anchor
--    schedule due today, generate, confirm next_due_date does NOT move.
--    Complete the WO via wo_complete(): confirm next_due_date becomes
--    CURRENT_DATE + interval (not old_due_date + interval).
-- 3. Floating-mode cancellation fallback: same setup, but cancel the WO via
--    cancel_work_order() instead of completing it. Confirm next_due_date
--    becomes the WO's own scheduled_date + interval (not today's date) —
--    this is the specific path flagged for testing "alongside" 1 and 2,
--    not in isolation, since the formulas (CURRENT_DATE vs scheduled_date)
--    are easy to accidentally swap.
-- 4. Floating-mode per_asset multi-WO cycle: a floating per_asset schedule
--    with 2+ assets — complete/cancel all but the last sibling WO, confirm
--    next_due_date does NOT move until the LAST sibling resolves.
-- 5. Blackout deferral: a schedule whose next_due_date falls inside a
--    seeded Eid window (migration 143) — run the generator, confirm
--    next_due_date is deferred to end_date + 1 and no WO is generated this
--    run; confirm a 'pm_blackout_defer' operation_log row is written.
-- 6. Master propagation: edit a pm_master_templates row's frequency/anchor,
--    call pm_propagate_master_template(), confirm all linked pm_schedules
--    rows update those 3 columns and nothing else (next_due_date, status,
--    total_generated unchanged); confirm a direct UPDATE to a linked
--    schedule's frequency_type (bypassing the RPC) still raises via
--    trg_pm_schedules_master_lock.
-- 7. Forecast: call pm_schedule_forecast() for both a fixed and a floating
--    schedule spanning a seeded Eid window; confirm the projected
--    occurrence inside the window is reported with deferred_by_blackout =
--    TRUE and the correct label, and confirm the function makes zero writes
--    (re-run twice, diff pm_schedules/work_orders row counts before/after —
--    must be identical).
-- =============================================================================
