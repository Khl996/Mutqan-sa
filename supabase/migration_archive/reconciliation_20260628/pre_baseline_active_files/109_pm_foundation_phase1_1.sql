-- =============================================================================
-- Migration: 109_pm_foundation_phase1_1.sql
-- Purpose: Phase 1.1 hardening before Frontend Phase 2.
--
-- Adds:
--   1. Explicit PM generation modes:
--      - per_asset   : one Work Order per asset
--      - batch_route : one route/batch Work Order for all schedule assets
--   2. Job Plan execution metadata beyond checklist-only usage.
--   3. A frozen job_plan_snapshot on generated Work Orders.
--
-- Notes:
--   - asset_groups are intentionally retained as a legacy operational layer.
--   - This migration does not drop legacy PM tables.
-- =============================================================================

-- =============================================================================
-- SECTION 1 - Job Plan execution metadata
-- =============================================================================

ALTER TABLE public.job_plans
    ADD COLUMN IF NOT EXISTS required_tools JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS required_materials JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS reference_documents JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS required_skill VARCHAR(100),
    ADD COLUMN IF NOT EXISTS required_role VARCHAR(50);

COMMENT ON COLUMN public.job_plans.required_tools IS
    'Array of required tools. Example: [{"name":"Clamp meter","qty":1}].';

COMMENT ON COLUMN public.job_plans.required_parts IS
    'Array of required inventory parts/spares. Kept separate from consumable materials.';

COMMENT ON COLUMN public.job_plans.required_materials IS
    'Array of required consumable materials. Example: [{"name":"Cleaning chemical","qty":2,"unit":"L"}].';

COMMENT ON COLUMN public.job_plans.reference_documents IS
    'Array of reference docs/SOPs/attachments. Example: [{"label":"OEM manual","url":"..."}].';

COMMENT ON COLUMN public.job_plans.required_skill IS
    'Optional skill/certification hint required to execute this job plan.';

COMMENT ON COLUMN public.job_plans.required_role IS
    'Optional role hint required to execute this job plan.';

-- =============================================================================
-- SECTION 2 - Generation mode and per-asset traceability
-- =============================================================================

ALTER TABLE public.pm_schedules
    ADD COLUMN IF NOT EXISTS generation_mode VARCHAR(20) NOT NULL DEFAULT 'batch_route';

ALTER TABLE public.pm_schedules
    DROP CONSTRAINT IF EXISTS pm_schedules_generation_mode_check;

ALTER TABLE public.pm_schedules
    ADD CONSTRAINT pm_schedules_generation_mode_check
    CHECK (generation_mode IN ('per_asset', 'batch_route'));

COMMENT ON COLUMN public.pm_schedules.generation_mode IS
    'per_asset = one WO per asset; batch_route = one WO covering all assets on the schedule.';

ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS source_schedule_asset_id UUID REFERENCES public.pm_schedule_assets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS job_plan_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.work_orders.source_schedule_asset_id IS
    'Set for per_asset PM generation; identifies which schedule asset produced this WO.';

COMMENT ON COLUMN public.work_orders.job_plan_snapshot IS
    'Frozen copy of execution metadata from job_plans at WO generation time.';

CREATE INDEX IF NOT EXISTS idx_pm_schedules_generation_mode
    ON public.pm_schedules(generation_mode);

CREATE INDEX IF NOT EXISTS idx_work_orders_source_schedule_asset
    ON public.work_orders(source_schedule_asset_id);

CREATE INDEX IF NOT EXISTS idx_work_orders_pm_cycle_asset
    ON public.work_orders(source_schedule_id, scheduled_date, source_schedule_asset_id)
    WHERE work_type = 'preventive';

-- =============================================================================
-- SECTION 3 - Generation function supporting both modes
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
    v_job_plan_snapshot   JSONB;
BEGIN
    FOR v_schedule IN
        SELECT *
          FROM public.pm_schedules
         WHERE status = 'active'
           AND trigger_type = 'calendar'
           AND next_due_date IS NOT NULL
           AND (next_due_date - COALESCE(lead_time_days, 0)) <= CURRENT_DATE
           AND (end_date IS NULL OR next_due_date <= end_date)
         ORDER BY next_due_date, created_at
    LOOP
        v_schedule_generated := 0;

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
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'generated', v_generated_count,
        'run_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pm_generate_due_work_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_generate_due_work_orders() FROM anon;
-- Called by service-role cron / SQL admin only.
