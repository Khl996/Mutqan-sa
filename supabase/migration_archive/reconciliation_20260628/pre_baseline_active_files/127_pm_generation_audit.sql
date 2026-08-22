-- =============================================================================
-- Migration: 127_pm_generation_audit.sql
-- Purpose:
--   Closes the operational-memory gap in PM work-order generation.
--
--   Changes:
--     1. Create public.pm_generation_runs — persistent per-call batch audit table.
--     2. Expand operation_logs.type constraint to include 'pm_generate'.
--     3. Replace pm_generate_due_work_orders() with a hardened version that:
--        a. Writes one operation_log row per generated work order.
--        b. Inserts one pm_generation_runs row per call.
--        c. Guards total_generated increment with COALESCE(..., 0).
--        d. Validates default_assignee_id (active, same-tenant, allowed role)
--           before setting assigned_to; falls back to NULL if invalid.
--        e. Skips tenants that fail tenant_has_operational_access().
--        f. Filters out inactive tenants at query time via JOIN on tenants.
--        g. Adds run_id to the return JSONB shape (additive, non-breaking).
--
-- Existing callers (api/pm-generate-wos.ts, usePMFoundation.generateDueWorkOrders)
-- are not broken: all new keys in the return shape are additive.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — pm_generation_runs: persistent batch audit table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pm_generation_runs (
    id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id           UUID        NOT NULL,
    tenant_id        UUID        REFERENCES public.tenants(id) ON DELETE SET NULL,
    requested_by     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    requested_by_role TEXT,
    run_scope        TEXT        NOT NULL,   -- 'tenant' | 'all_tenants'
    generated_count  INTEGER     NOT NULL DEFAULT 0,
    skipped_count    INTEGER     NOT NULL DEFAULT 0,
    status           TEXT        NOT NULL DEFAULT 'completed',
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    error_message    TEXT,
    metadata         JSONB       NOT NULL DEFAULT '{}'::JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pgr_run_scope_check  CHECK (run_scope IN ('tenant', 'all_tenants')),
    CONSTRAINT pgr_status_check     CHECK (status    IN ('completed', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_pgr_tenant     ON public.pm_generation_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pgr_run_id     ON public.pm_generation_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_pgr_started_at ON public.pm_generation_runs(started_at DESC);

COMMENT ON TABLE public.pm_generation_runs IS
    'Persistent per-call audit record for pm_generate_due_work_orders(). '
    'One row per RPC call. Added by migration 127.';


-- =============================================================================
-- SECTION 2 — RLS on pm_generation_runs
--
-- INSERT/UPDATE/DELETE: no authenticated policy — the SECURITY DEFINER function
-- bypasses RLS and can write regardless. Authenticated users cannot write directly.
--
-- SELECT: platform admin sees all; tenant user sees own-tenant rows only.
--   All-tenant runs (tenant_id IS NULL) are visible to platform admin only.
-- =============================================================================

ALTER TABLE public.pm_generation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pgr_select_platform ON public.pm_generation_runs;
CREATE POLICY pgr_select_platform ON public.pm_generation_runs
    FOR SELECT TO authenticated
    USING (public.is_platform_admin());

DROP POLICY IF EXISTS pgr_select_tenant ON public.pm_generation_runs;
CREATE POLICY pgr_select_tenant ON public.pm_generation_runs
    FOR SELECT TO authenticated
    USING (
        tenant_id IS NOT NULL
        AND tenant_id = public.get_user_tenant_id()
    );

GRANT SELECT ON public.pm_generation_runs TO authenticated;


-- =============================================================================
-- SECTION 3 — Expand operation_logs.type to include 'pm_generate'
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
        'pm_generate'
    )
);

COMMENT ON CONSTRAINT operation_logs_type_check ON public.operation_logs IS
    'Allowed operation log types. pm_generate added by migration 127.';


-- =============================================================================
-- SECTION 4 — Hardened pm_generate_due_work_orders()
--
-- Behaviour changes vs migration 112:
--   + Validates default_assignee_id before setting assigned_to.
--   + Calls tenant_has_operational_access() per schedule; skips inactive tenants.
--   + Joins tenants table to filter is_active = TRUE at query time.
--   + Calls create_operation_log(..., 'pm_generate', ...) per generated WO.
--   + Inserts pm_generation_runs row at function end (same transaction).
--   + Fixes COALESCE(total_generated, 0) to guard against NULL counter.
--   + Adds run_id to return JSONB (additive).
--
-- All existing idempotency logic, generation modes, and schedule-advance
-- behaviour are preserved without change.
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
    v_existing_assets         INTEGER := 0;
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
BEGIN
    -- -------------------------------------------------------------------------
    -- 1. Authentication and authority check
    -- -------------------------------------------------------------------------
    IF v_auth_role = 'anon' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Service-role / SQL admin have no auth.uid() — all-tenant generation.
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
    --    JOIN tenants to skip is_active = FALSE tenants at query time.
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
        -- Belt-and-suspenders: also check subscription / operational access.
        IF NOT public.tenant_has_operational_access(v_schedule.tenant_id) THEN
            v_skipped_inactive_tenant := v_skipped_inactive_tenant + 1;
            CONTINUE;
        END IF;

        v_schedule_generated := 0;
        v_schedules_scanned  := v_schedules_scanned + 1;

        -- Load job plan.
        SELECT * INTO v_plan
          FROM public.job_plans
         WHERE id = v_schedule.job_plan_id;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        -- Freeze job plan snapshot.
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

        -- Validate default_assignee_id: must be active, same tenant, allowed role.
        -- If invalid, generate the WO with assigned_to = NULL (pending-unassigned).
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

        -- -----------------------------------------------------------------------
        -- Idempotency: if the current due cycle is already fully covered by
        -- existing non-cancelled WOs, advance the schedule and skip generation.
        -- (Unchanged from migration 112.)
        -- -----------------------------------------------------------------------
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
               AND wo.scheduled_date     = v_schedule.next_due_date
               AND wo.status            <> 'cancelled'
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

                v_existing_cycles    := v_existing_cycles + 1;
                v_schedules_advanced := v_schedules_advanced + 1;
                CONTINUE;
            END IF;

        ELSE  -- batch_route
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
                 WHERE wo.source_schedule_id       = v_schedule.id
                   AND wo.source_schedule_asset_id IS NULL
                   AND wo.scheduled_date           = v_schedule.next_due_date
                   AND wo.status                  <> 'cancelled'
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

                v_existing_cycles    := v_existing_cycles + 1;
                v_schedules_advanced := v_schedules_advanced + 1;
                CONTINUE;
            END IF;
        END IF;

        -- -----------------------------------------------------------------------
        -- Generation: per_asset mode — one WO per asset
        -- -----------------------------------------------------------------------
        IF COALESCE(v_schedule.generation_mode, 'batch_route') = 'per_asset' THEN

            FOR v_asset IN
                SELECT
                    psa.id        AS schedule_asset_id,
                    psa.asset_id,
                    psa.sort_order,
                    a.name        AS asset_name,
                    a.name_ar     AS asset_name_ar
                  FROM public.pm_schedule_assets psa
                  JOIN public.assets a ON a.id = psa.asset_id
                 WHERE psa.schedule_id = v_schedule.id

                UNION ALL

                SELECT
                    NULL::UUID     AS schedule_asset_id,
                    v_schedule.primary_asset_id AS asset_id,
                    0              AS sort_order,
                    a.name         AS asset_name,
                    a.name_ar      AS asset_name_ar
                  FROM public.assets a
                 WHERE a.id = v_schedule.primary_asset_id
                   AND NOT EXISTS (
                       SELECT 1
                         FROM public.pm_schedule_assets psa
                        WHERE psa.schedule_id = v_schedule.id
                   )
                 ORDER BY sort_order
            LOOP
                -- Skip asset if this cycle already has a non-cancelled WO.
                IF EXISTS (
                    SELECT 1
                      FROM public.work_orders wo
                      JOIN public.work_order_assets woa ON woa.work_order_id = wo.id
                     WHERE wo.source_schedule_id = v_schedule.id
                       AND wo.scheduled_date     = v_schedule.next_due_date
                       AND woa.asset_id          = v_asset.asset_id
                       AND wo.status            <> 'cancelled'
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
                    v_assignee_id,
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
                            'label',         v_item.label,
                            'label_ar',      v_item.label_ar,
                            'description',   v_item.description,
                            'description_ar',v_item.description_ar,
                            'item_type',     v_item.item_type,
                            'is_required',   v_item.is_required,
                            'is_critical',   v_item.is_critical,
                            'unit',          v_item.unit,
                            'min_value',     v_item.min_value,
                            'max_value',     v_item.max_value,
                            'warning_min',   v_item.warning_min,
                            'warning_max',   v_item.warning_max,
                            'options',       v_item.options,
                            'help_text',     v_item.help_text,
                            'help_text_ar',  v_item.help_text_ar
                        ),
                        v_item.sort_order,
                        'pending'
                    );
                END LOOP;

                -- Audit: one operation_log per generated WO.
                PERFORM public.create_operation_log(
                    v_schedule.tenant_id,
                    v_wo_id,
                    'pm_generate',
                    'PM work order generated from schedule ' ||
                        COALESCE(v_schedule.code, v_schedule.id::TEXT),
                    v_caller_id
                );

                v_generated_count    := v_generated_count + 1;
                v_schedule_generated := v_schedule_generated + 1;
            END LOOP;

        ELSE
        -- -----------------------------------------------------------------------
        -- Generation: batch_route mode — one WO for all schedule assets
        -- -----------------------------------------------------------------------
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
                 WHERE source_schedule_id       = v_schedule.id
                   AND source_schedule_asset_id IS NULL
                   AND scheduled_date           = v_schedule.next_due_date
                   AND status                  <> 'cancelled'
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
                v_assignee_id,
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
                            'label',         v_item.label,
                            'label_ar',      v_item.label_ar,
                            'description',   v_item.description,
                            'description_ar',v_item.description_ar,
                            'item_type',     v_item.item_type,
                            'is_required',   v_item.is_required,
                            'is_critical',   v_item.is_critical,
                            'unit',          v_item.unit,
                            'min_value',     v_item.min_value,
                            'max_value',     v_item.max_value,
                            'warning_min',   v_item.warning_min,
                            'warning_max',   v_item.warning_max,
                            'options',       v_item.options,
                            'help_text',     v_item.help_text,
                            'help_text_ar',  v_item.help_text_ar
                        ),
                        v_item.sort_order,
                        'pending'
                    );
                END LOOP;
            END LOOP;

            -- Audit: one operation_log for the batch WO.
            PERFORM public.create_operation_log(
                v_schedule.tenant_id,
                v_wo_id,
                'pm_generate',
                'PM work order generated from schedule ' ||
                    COALESCE(v_schedule.code, v_schedule.id::TEXT),
                v_caller_id
            );

            v_generated_count    := v_generated_count + 1;
            v_schedule_generated := v_schedule_generated + 1;
        END IF;

        -- Advance schedule after successful generation.
        IF v_schedule_generated > 0 THEN
            v_next_due := public.pm_calculate_next_due(
                v_schedule.next_due_date,
                v_schedule.frequency_type,
                COALESCE(v_schedule.frequency_interval, 1)
            );

            UPDATE public.pm_schedules
               SET next_due_date       = v_next_due,
                   last_generated_date = v_schedule.next_due_date,
                   total_generated     = COALESCE(total_generated, 0) + v_schedule_generated,
                   updated_at          = NOW()
             WHERE id = v_schedule.id;

            v_schedules_advanced := v_schedules_advanced + 1;
        END IF;
    END LOOP;

    -- -------------------------------------------------------------------------
    -- 3. Insert pm_generation_runs record (same transaction as WO INSERTs).
    --    If the function rolls back, this row also rolls back — intentional.
    -- -------------------------------------------------------------------------
    INSERT INTO public.pm_generation_runs (
        run_id,
        tenant_id,
        requested_by,
        requested_by_role,
        run_scope,
        generated_count,
        skipped_count,
        status,
        started_at,
        completed_at,
        metadata
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
            'schedules_scanned',         v_schedules_scanned,
            'schedules_advanced',        v_schedules_advanced,
            'existing_cycles_advanced',  v_existing_cycles,
            'skipped_no_assets',         v_skipped_no_assets,
            'skipped_inactive_tenants',  v_skipped_inactive_tenant
        )
    );

    -- -------------------------------------------------------------------------
    -- 4. Return — shape is a superset of the migration 112 shape (additive only).
    -- -------------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success',                  TRUE,
        'generated',                v_generated_count,
        'schedules_scanned',        v_schedules_scanned,
        'schedules_advanced',       v_schedules_advanced,
        'existing_cycles_advanced', v_existing_cycles,
        'skipped_no_assets',        v_skipped_no_assets,
        'scope',                    CASE WHEN v_run_all_tenants THEN 'all_tenants' ELSE 'tenant' END,
        'run_at',                   NOW(),
        'run_id',                   v_run_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pm_generate_due_work_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_generate_due_work_orders() FROM anon;
GRANT EXECUTE ON FUNCTION public.pm_generate_due_work_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_generate_due_work_orders() TO service_role;

COMMENT ON FUNCTION public.pm_generate_due_work_orders() IS
    'Generates due PM work orders. '
    'Tenant-scoped for authenticated users; all-tenant for service/platform. '
    'Writes one operation_log per generated WO (type=pm_generate) and one '
    'pm_generation_runs row per call. Updated by migration 127.';


-- =============================================================================
-- SECTION 5 — Smoke-test queries (run against staging after applying)
-- =============================================================================
-- A. Confirm pm_generation_runs table exists:
--    SELECT table_name FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'pm_generation_runs';
--    Expected: 1 row
--
-- B. Confirm operation_logs constraint includes pm_generate:
--    SELECT conname, pg_get_constraintdef(oid)
--      FROM pg_constraint
--     WHERE conrelid = 'public.operation_logs'::regclass
--       AND conname = 'operation_logs_type_check';
--    Expected: definition includes 'pm_generate'
--
-- C. Call the function as an authenticated manager:
--    SELECT pm_generate_due_work_orders();
--    Expected: {"success":true,"run_id":"<uuid>",...}
--
-- D. Verify pm_generation_runs has a row for the run:
--    SELECT * FROM pm_generation_runs ORDER BY created_at DESC LIMIT 1;
--    Expected: 1 row with run_id matching the response
--
-- E. Verify operation_log with type='pm_generate' was written for any new WO:
--    SELECT type, description FROM operation_logs
--     WHERE type = 'pm_generate' ORDER BY timestamp DESC LIMIT 5;
-- =============================================================================
