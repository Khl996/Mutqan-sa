-- =============================================================================
-- Smoke Test: 109_pm_foundation_phase1_1
-- Purpose: End-to-end validation for PM Foundation Phase 1.1 without permanent
--          data changes. The script runs inside a transaction and rolls back.
--
-- How to run:
--   Paste into Supabase SQL Editor and execute after migrations 108 and 109.
--
-- What it validates:
--   - batch_route mode creates one WO covering two assets.
--   - per_asset mode creates one WO per asset.
--   - each generated WO/check set is populated from the Job Plan.
--   - next_due_date advances to tomorrow for both modes.
--   - pm_calculate_compliance_stats(tenant_id) returns the expected shape.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE pm_smoke_results (
    id        INTEGER GENERATED ALWAYS AS IDENTITY,
    assertion TEXT NOT NULL,
    passed    BOOLEAN NOT NULL,
    details   JSONB NOT NULL DEFAULT '{}'::JSONB
) ON COMMIT DROP;

DO $smoke$
DECLARE
    v_tenant_id        UUID;
    v_system_id        UUID;
    v_chiller1_id      UUID;
    v_chiller2_id      UUID;
    v_jp_id            UUID;
    v_item_temp_id     UUID;
    v_item_vis_id      UUID;
    v_item_note_id     UUID;
    v_batch_sch_id     UUID;
    v_per_asset_sch_id UUID;
    v_batch_wo_id      UUID;

    v_result           JSONB;
    v_stats            JSONB;
    v_snapshot         JSONB;
    v_count            INTEGER;
    v_next_due         DATE;
    v_pass             INTEGER := 0;
    v_fail             INTEGER := 0;
    v_ok               BOOLEAN;
    v_suffix           TEXT := 'SMK109-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;
BEGIN
    SELECT id INTO v_tenant_id
      FROM public.tenants
     ORDER BY created_at
     LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'No tenants found; cannot run smoke test';
    END IF;

    RAISE NOTICE 'Smoke 109 tenant=% suffix=%', v_tenant_id, v_suffix;

    INSERT INTO public.assets (
        tenant_id, code, name, name_ar, asset_level, status, criticality
    )
    VALUES (
        v_tenant_id, v_suffix || '-SYS', 'HVAC System smoke 109',
        'نظام التكييف', 'system', 'operational', 'high'
    )
    RETURNING id INTO v_system_id;

    INSERT INTO public.assets (
        tenant_id, code, name, name_ar, asset_level, parent_asset_id, status, criticality
    )
    VALUES (
        v_tenant_id, v_suffix || '-CHI-1', 'Chiller 1 smoke 109',
        'تشيلر 1', 'equipment', v_system_id, 'operational', 'high'
    )
    RETURNING id INTO v_chiller1_id;

    INSERT INTO public.assets (
        tenant_id, code, name, name_ar, asset_level, parent_asset_id, status, criticality
    )
    VALUES (
        v_tenant_id, v_suffix || '-CHI-2', 'Chiller 2 smoke 109',
        'تشيلر 2', 'equipment', v_system_id, 'operational', 'high'
    )
    RETURNING id INTO v_chiller2_id;

    INSERT INTO public.job_plans (
        tenant_id, code, name, name_ar,
        category, status, estimated_duration_minutes,
        requires_safety_checks, safety_notes,
        required_parts, required_tools, required_materials,
        reference_documents, required_skill, required_role
    )
    VALUES (
        v_tenant_id,
        v_suffix || '-JP',
        'Daily Chiller Inspection smoke 109',
        'فحص يومي للتشيلرات',
        'hvac',
        'active',
        30,
        TRUE,
        'Lock out panel before inspection.',
        '[{"name":"Filter kit","qty":1}]'::JSONB,
        '[{"name":"Thermometer","qty":1}]'::JSONB,
        '[{"name":"Inspection tag","qty":2}]'::JSONB,
        '[{"label":"OEM manual","url":"https://example.com/manual.pdf"}]'::JSONB,
        'HVAC',
        'technician'
    )
    RETURNING id INTO v_jp_id;

    INSERT INTO public.job_plan_items (
        job_plan_id, sort_order, label, label_ar,
        item_type, is_required, unit, min_value, max_value, warning_min, warning_max
    )
    VALUES (
        v_jp_id, 10, 'Temperature Reading', 'قياس حرارة',
        'numeric', TRUE, 'C', 4.0, 14.0, 5.0, 12.0
    )
    RETURNING id INTO v_item_temp_id;

    INSERT INTO public.job_plan_items (
        job_plan_id, sort_order, label, label_ar, item_type, is_required
    )
    VALUES (
        v_jp_id, 20, 'Visual Inspection', 'فحص بصري', 'yes_no', TRUE
    )
    RETURNING id INTO v_item_vis_id;

    INSERT INTO public.job_plan_items (
        job_plan_id, sort_order, label, label_ar, item_type, is_required
    )
    VALUES (
        v_jp_id, 30, 'General Notes', 'ملاحظات', 'text', FALSE
    )
    RETURNING id INTO v_item_note_id;

    -- -------------------------------------------------------------------------
    -- Mode B: batch_route - one route WO covering both assets.
    -- -------------------------------------------------------------------------
    INSERT INTO public.pm_schedules (
        tenant_id, code, name, name_ar,
        job_plan_id, primary_asset_id,
        generation_mode,
        trigger_type, frequency_type, frequency_interval,
        start_date, next_due_date,
        lead_time_days, status, default_priority
    )
    VALUES (
        v_tenant_id,
        v_suffix || '-BATCH',
        'Daily Chiller PM batch smoke 109',
        'الصيانة اليومية للتشيلرات - دفعة',
        v_jp_id,
        v_chiller1_id,
        'batch_route',
        'calendar', 'daily', 1,
        CURRENT_DATE, CURRENT_DATE,
        0, 'active', 'medium'
    )
    RETURNING id INTO v_batch_sch_id;

    INSERT INTO public.pm_schedule_assets (schedule_id, asset_id, sort_order)
    VALUES
        (v_batch_sch_id, v_chiller1_id, 1),
        (v_batch_sch_id, v_chiller2_id, 2);

    SELECT public.pm_generate_due_work_orders() INTO v_result;
    RAISE NOTICE 'batch_route generator result=%', v_result;

    SELECT COUNT(*) INTO v_count
      FROM public.work_orders
     WHERE source_schedule_id = v_batch_sch_id;

    v_ok := v_count = 1;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('B1 batch_route generated exactly one WO', v_ok, jsonb_build_object('actual', v_count, 'expected', 1));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    SELECT id INTO v_batch_wo_id
      FROM public.work_orders
     WHERE source_schedule_id = v_batch_sch_id
     LIMIT 1;

    SELECT COUNT(*) INTO v_count
      FROM public.work_order_assets
     WHERE work_order_id = v_batch_wo_id;

    v_ok := v_count = 2;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('B2 batch_route WO covers two assets', v_ok, jsonb_build_object('actual', v_count, 'expected', 2));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.work_order_checks
     WHERE work_order_id = v_batch_wo_id;

    v_ok := v_count = 6;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('B3 batch_route generated six checks', v_ok, jsonb_build_object('actual', v_count, 'expected', 6));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    SELECT next_due_date INTO v_next_due
      FROM public.pm_schedules
     WHERE id = v_batch_sch_id;

    v_ok := v_next_due = CURRENT_DATE + 1;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('B4 batch_route advanced next_due_date to tomorrow', v_ok, jsonb_build_object('actual', v_next_due, 'expected', CURRENT_DATE + 1));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    SELECT job_plan_snapshot INTO v_snapshot
      FROM public.work_orders
     WHERE id = v_batch_wo_id;

    v_ok :=
        v_snapshot ? 'required_tools'
        AND v_snapshot ? 'required_materials'
        AND v_snapshot ? 'reference_documents'
        AND v_snapshot->>'required_skill' = 'HVAC'
        AND v_snapshot->>'required_role' = 'technician';

    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('B5 WO has enriched job_plan_snapshot', v_ok, jsonb_build_object('snapshot', v_snapshot));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    PERFORM public.pm_generate_due_work_orders();

    SELECT COUNT(*) INTO v_count
      FROM public.work_orders
     WHERE source_schedule_id = v_batch_sch_id;

    v_ok := v_count = 1;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('B6 batch_route second call did not duplicate', v_ok, jsonb_build_object('actual', v_count, 'expected', 1));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    -- -------------------------------------------------------------------------
    -- Mode A: per_asset - one WO for each asset.
    -- -------------------------------------------------------------------------
    INSERT INTO public.pm_schedules (
        tenant_id, code, name, name_ar,
        job_plan_id, primary_asset_id,
        generation_mode,
        trigger_type, frequency_type, frequency_interval,
        start_date, next_due_date,
        lead_time_days, status, default_priority
    )
    VALUES (
        v_tenant_id,
        v_suffix || '-PER-ASSET',
        'Daily Chiller PM per asset smoke 109',
        'الصيانة اليومية للتشيلرات - لكل أصل',
        v_jp_id,
        v_chiller1_id,
        'per_asset',
        'calendar', 'daily', 1,
        CURRENT_DATE, CURRENT_DATE,
        0, 'active', 'medium'
    )
    RETURNING id INTO v_per_asset_sch_id;

    INSERT INTO public.pm_schedule_assets (schedule_id, asset_id, sort_order)
    VALUES
        (v_per_asset_sch_id, v_chiller1_id, 1),
        (v_per_asset_sch_id, v_chiller2_id, 2);

    SELECT public.pm_generate_due_work_orders() INTO v_result;
    RAISE NOTICE 'per_asset generator result=%', v_result;

    SELECT COUNT(*) INTO v_count
      FROM public.work_orders
     WHERE source_schedule_id = v_per_asset_sch_id;

    v_ok := v_count = 2;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('A1 per_asset generated two WOs', v_ok, jsonb_build_object('actual', v_count, 'expected', 2));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    SELECT COUNT(*) INTO v_count
      FROM (
          SELECT wo.id
            FROM public.work_orders wo
            JOIN public.work_order_assets woa ON woa.work_order_id = wo.id
           WHERE wo.source_schedule_id = v_per_asset_sch_id
           GROUP BY wo.id
          HAVING COUNT(*) = 1
      ) q;

    v_ok := v_count = 2;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('A2 each per_asset WO covers one asset', v_ok, jsonb_build_object('actual', v_count, 'expected', 2));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    SELECT COUNT(*) INTO v_count
      FROM public.work_order_checks woc
      JOIN public.work_orders wo ON wo.id = woc.work_order_id
     WHERE wo.source_schedule_id = v_per_asset_sch_id;

    v_ok := v_count = 6;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('A3 per_asset generated six checks total', v_ok, jsonb_build_object('actual', v_count, 'expected', 6));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    SELECT COUNT(DISTINCT source_schedule_asset_id) INTO v_count
      FROM public.work_orders
     WHERE source_schedule_id = v_per_asset_sch_id
       AND source_schedule_asset_id IS NOT NULL;

    v_ok := v_count = 2;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('A4 per_asset WOs retain schedule-asset traceability', v_ok, jsonb_build_object('actual', v_count, 'expected', 2));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    SELECT next_due_date INTO v_next_due
      FROM public.pm_schedules
     WHERE id = v_per_asset_sch_id;

    v_ok := v_next_due = CURRENT_DATE + 1;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('A5 per_asset advanced next_due_date to tomorrow', v_ok, jsonb_build_object('actual', v_next_due, 'expected', CURRENT_DATE + 1));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    PERFORM public.pm_generate_due_work_orders();

    SELECT COUNT(*) INTO v_count
      FROM public.work_orders
     WHERE source_schedule_id = v_per_asset_sch_id;

    v_ok := v_count = 2;
    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('A6 per_asset second call did not duplicate', v_ok, jsonb_build_object('actual', v_count, 'expected', 2));
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    SELECT public.pm_calculate_compliance_stats(v_tenant_id) INTO v_stats;

    v_ok :=
        v_stats ? 'total'
        AND v_stats ? 'completed_on_time'
        AND v_stats ? 'overdue'
        AND v_stats ? 'due_soon'
        AND v_stats ? 'compliance_rate';

    INSERT INTO pm_smoke_results(assertion, passed, details)
    VALUES ('S1 compliance stats returns expected keys', v_ok, v_stats);
    IF v_ok THEN v_pass := v_pass + 1; ELSE v_fail := v_fail + 1; END IF;

    RAISE NOTICE 'Smoke 109 complete: passed=% failed=%', v_pass, v_fail;
END;
$smoke$;

SELECT
    id,
    CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result,
    assertion,
    details
FROM pm_smoke_results
ORDER BY id;

SELECT
    COUNT(*) FILTER (WHERE passed) AS passed,
    COUNT(*) FILTER (WHERE NOT passed) AS failed
FROM pm_smoke_results;

ROLLBACK;
