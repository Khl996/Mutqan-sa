-- =============================================================================
-- Smoke Test: 108_pm_rebuild_foundation
-- Purpose: End-to-end validation of the new PM data model without any
--          permanent changes. The entire script runs inside a transaction
--          that is ROLLED BACK at the end.
--
-- How to run:
--   Paste into Supabase SQL Editor and execute.
--   All results appear as NOTICE / WARNING messages in the output panel.
--   Nothing is committed — the transaction is rolled back at the very end.
--
-- Expected output (pass):
--   ✓ PASS  × 8 assertions
--   0 × WARNING (✗ FAIL)
-- =============================================================================

BEGIN;

DO $smoke$
DECLARE
    -- ── IDs ──────────────────────────────────────────────────────────────────
    v_tenant_id     UUID;
    v_system_id     UUID;
    v_chiller1_id   UUID;
    v_chiller2_id   UUID;
    v_jp_id         UUID;
    v_item_temp_id  UUID;
    v_item_vis_id   UUID;
    v_item_note_id  UUID;
    v_sch_id        UUID;
    v_wo_id         UUID;

    -- ── Counters / values ────────────────────────────────────────────────────
    v_result            JSONB;
    v_wo_count          INTEGER;
    v_asset_count       INTEGER;
    v_check_count       INTEGER;
    v_checks_per_asset  INTEGER;
    v_next_due          DATE;
    v_wo_work_type      VARCHAR;
    v_wo_status         VARCHAR;
    v_wo_sched_date     DATE;
    v_wo_compliance     DATE;
    v_wo_code           VARCHAR;
    v_snapshot_sample   JSONB;
    v_stats_ok          BOOLEAN;

    -- ── Unique code suffix to avoid collisions ───────────────────────────────
    v_suffix  TEXT := 'SMKT-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;

    -- ── Counters for summary ─────────────────────────────────────────────────
    v_pass  INTEGER := 0;
    v_fail  INTEGER := 0;

    -- For the check-breakdown loop
    r       RECORD;

BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- 0. Pick an existing tenant
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'No tenants found — cannot run smoke test';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  SMOKE TEST — Migration 108: PM Rebuild Foundation       ║';
    RAISE NOTICE '╚══════════════════════════════════════════════════════════╝';
    RAISE NOTICE 'Tenant  : %', v_tenant_id;
    RAISE NOTICE 'Run at  : %', NOW();
    RAISE NOTICE 'Suffix  : %  (unique codes collision guard)', v_suffix;
    RAISE NOTICE '';

    -- =========================================================================
    -- STEP 1 — Create asset hierarchy
    -- =========================================================================
    RAISE NOTICE '── STEP 1: Create Assets ──────────────────────────────────';

    INSERT INTO public.assets (
        tenant_id, code, name, name_ar,
        asset_level, status, criticality
    )
    VALUES (
        v_tenant_id,
        v_suffix || '-SYS',
        'HVAC System (smoke)',
        'نظام التكييف',
        'system',
        'operational',
        'high'
    )
    RETURNING id INTO v_system_id;
    RAISE NOTICE '  Created [system]    نظام التكييف  id=%', v_system_id;

    INSERT INTO public.assets (
        tenant_id, code, name, name_ar,
        asset_level, parent_asset_id, status, criticality
    )
    VALUES (
        v_tenant_id,
        v_suffix || '-CHI-1',
        'Chiller 1 (smoke)',
        'تشيلر 1',
        'equipment',
        v_system_id,
        'operational',
        'high'
    )
    RETURNING id INTO v_chiller1_id;
    RAISE NOTICE '  Created [equipment] تشيلر 1  id=%  parent=%', v_chiller1_id, v_system_id;

    INSERT INTO public.assets (
        tenant_id, code, name, name_ar,
        asset_level, parent_asset_id, status, criticality
    )
    VALUES (
        v_tenant_id,
        v_suffix || '-CHI-2',
        'Chiller 2 (smoke)',
        'تشيلر 2',
        'equipment',
        v_system_id,
        'operational',
        'high'
    )
    RETURNING id INTO v_chiller2_id;
    RAISE NOTICE '  Created [equipment] تشيلر 2  id=%  parent=%', v_chiller2_id, v_system_id;

    -- =========================================================================
    -- STEP 2 — Create Job Plan + 3 items
    -- =========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '── STEP 2: Create Job Plan ────────────────────────────────';

    INSERT INTO public.job_plans (
        tenant_id, code, name, name_ar,
        category, status, estimated_duration_minutes
    )
    VALUES (
        v_tenant_id,
        v_suffix || '-JP',
        'Daily Chiller Inspection (smoke)',
        'فحص يومي للتشيلرات',
        'hvac',
        'active',
        30
    )
    RETURNING id INTO v_jp_id;
    RAISE NOTICE '  Created job_plan  id=%', v_jp_id;

    -- Item 1: numeric temperature reading
    INSERT INTO public.job_plan_items (
        job_plan_id, sort_order,
        label, label_ar,
        item_type, is_required,
        unit, min_value, max_value, warning_min, warning_max
    )
    VALUES (
        v_jp_id, 10,
        'Temperature Reading', 'قياس حرارة المياه',
        'numeric', TRUE,
        '°C', 4.0, 14.0, 5.0, 12.0
    )
    RETURNING id INTO v_item_temp_id;

    -- Item 2: yes/no visual inspection
    INSERT INTO public.job_plan_items (
        job_plan_id, sort_order,
        label, label_ar,
        item_type, is_required
    )
    VALUES (
        v_jp_id, 20,
        'Visual Inspection (no leaks / abnormal noise)', 'فحص بصري (بدون تسريب / ضوضاء)',
        'yes_no', TRUE
    )
    RETURNING id INTO v_item_vis_id;

    -- Item 3: free-text notes (optional)
    INSERT INTO public.job_plan_items (
        job_plan_id, sort_order,
        label, label_ar,
        item_type, is_required
    )
    VALUES (
        v_jp_id, 30,
        'General Notes', 'ملاحظات عامة',
        'text', FALSE
    )
    RETURNING id INTO v_item_note_id;

    RAISE NOTICE '  Items: temp_id=% | vis_id=% | note_id=%',
        v_item_temp_id, v_item_vis_id, v_item_note_id;

    -- =========================================================================
    -- STEP 3 — Create PM Schedule (both chillers, daily, due today)
    -- =========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '── STEP 3: Create PM Schedule ─────────────────────────────';

    INSERT INTO public.pm_schedules (
        tenant_id, code, name, name_ar,
        job_plan_id, primary_asset_id,
        trigger_type, frequency_type, frequency_interval,
        start_date, next_due_date,
        lead_time_days, status, default_priority
    )
    VALUES (
        v_tenant_id,
        v_suffix || '-SCH',
        'Daily Chiller PM (smoke)',
        'الصيانة اليومية للتشيلرات',
        v_jp_id,
        v_chiller1_id,            -- primary asset (shortcut)
        'calendar', 'daily', 1,
        CURRENT_DATE, CURRENT_DATE,
        0, 'active', 'medium'
    )
    RETURNING id INTO v_sch_id;
    RAISE NOTICE '  Created pm_schedule  id=%  next_due_date=%', v_sch_id, CURRENT_DATE;

    -- Link both chillers
    INSERT INTO public.pm_schedule_assets (schedule_id, asset_id, sort_order)
    VALUES (v_sch_id, v_chiller1_id, 1),
           (v_sch_id, v_chiller2_id, 2);
    RAISE NOTICE '  Linked: تشيلر 1 (sort=1) + تشيلر 2 (sort=2)';

    -- =========================================================================
    -- STEP 4 — Call pm_generate_due_work_orders()
    -- =========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '── STEP 4: pm_generate_due_work_orders() ──────────────────';

    SELECT public.pm_generate_due_work_orders() INTO v_result;
    RAISE NOTICE '  RPC return: %', v_result;

    -- =========================================================================
    -- STEP 5 — Assertions
    -- =========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '── STEP 5: Assertions ─────────────────────────────────────';

    -- ── A1: Exactly 1 Work Order created ─────────────────────────────────────
    SELECT COUNT(*) INTO v_wo_count
      FROM public.work_orders
     WHERE source_schedule_id = v_sch_id;

    IF v_wo_count = 1 THEN
        v_pass := v_pass + 1;
        RAISE NOTICE '  ✓ A1  work_orders count = 1';
    ELSE
        v_fail := v_fail + 1;
        RAISE WARNING '  ✗ A1  work_orders count = % (expected 1)', v_wo_count;
    END IF;

    -- Grab the WO for subsequent assertions
    SELECT id, code, work_type, status, scheduled_date, compliance_deadline
      INTO v_wo_id, v_wo_code, v_wo_work_type, v_wo_status, v_wo_sched_date, v_wo_compliance
      FROM public.work_orders
     WHERE source_schedule_id = v_sch_id
     LIMIT 1;

    RAISE NOTICE '       WO id=%  code=%', v_wo_id, v_wo_code;
    RAISE NOTICE '       work_type=%  status=%', v_wo_work_type, v_wo_status;
    RAISE NOTICE '       scheduled_date=%  compliance_deadline=%',
        v_wo_sched_date, v_wo_compliance;

    -- ── A2: work_type = 'preventive' ─────────────────────────────────────────
    IF v_wo_work_type = 'preventive' THEN
        v_pass := v_pass + 1;
        RAISE NOTICE '  ✓ A2  work_type = preventive';
    ELSE
        v_fail := v_fail + 1;
        RAISE WARNING '  ✗ A2  work_type = % (expected preventive)', v_wo_work_type;
    END IF;

    -- ── A3: WO covers exactly 2 assets ───────────────────────────────────────
    SELECT COUNT(*) INTO v_asset_count
      FROM public.work_order_assets
     WHERE work_order_id = v_wo_id;

    IF v_asset_count = 2 THEN
        v_pass := v_pass + 1;
        RAISE NOTICE '  ✓ A3  work_order_assets count = 2';
    ELSE
        v_fail := v_fail + 1;
        RAISE WARNING '  ✗ A3  work_order_assets count = % (expected 2)', v_asset_count;
    END IF;

    -- ── A4: Total checks = 6 (3 items × 2 assets) ────────────────────────────
    SELECT COUNT(*) INTO v_check_count
      FROM public.work_order_checks
     WHERE work_order_id = v_wo_id;

    IF v_check_count = 6 THEN
        v_pass := v_pass + 1;
        RAISE NOTICE '  ✓ A4  work_order_checks total = 6  (3 items × 2 assets)';
    ELSE
        v_fail := v_fail + 1;
        RAISE WARNING '  ✗ A4  work_order_checks total = % (expected 6)', v_check_count;
    END IF;

    -- ── A4b: Each chiller has exactly 3 checks ───────────────────────────────
    SELECT COUNT(*) INTO v_checks_per_asset
      FROM public.work_order_checks
     WHERE work_order_id = v_wo_id
       AND asset_id      = v_chiller1_id;

    IF v_checks_per_asset = 3 THEN
        v_pass := v_pass + 1;
        RAISE NOTICE '  ✓ A4b تشيلر 1 has 3 checks';
    ELSE
        v_fail := v_fail + 1;
        RAISE WARNING '  ✗ A4b تشيلر 1 has % checks (expected 3)', v_checks_per_asset;
    END IF;

    SELECT COUNT(*) INTO v_checks_per_asset
      FROM public.work_order_checks
     WHERE work_order_id = v_wo_id
       AND asset_id      = v_chiller2_id;

    IF v_checks_per_asset = 3 THEN
        v_pass := v_pass + 1;
        RAISE NOTICE '  ✓ A4c تشيلر 2 has 3 checks';
    ELSE
        v_fail := v_fail + 1;
        RAISE WARNING '  ✗ A4c تشيلر 2 has % checks (expected 3)', v_checks_per_asset;
    END IF;

    -- ── A5: item_snapshot populated correctly on the numeric item ─────────────
    SELECT item_snapshot INTO v_snapshot_sample
      FROM public.work_order_checks
     WHERE work_order_id    = v_wo_id
       AND job_plan_item_id = v_item_temp_id
     LIMIT 1;

    RAISE NOTICE '  item_snapshot (temp check): %', v_snapshot_sample;

    IF v_snapshot_sample IS NOT NULL
       AND v_snapshot_sample->>'item_type' = 'numeric'
       AND v_snapshot_sample->>'label'     = 'Temperature Reading'
       AND (v_snapshot_sample->>'is_required')::BOOLEAN = TRUE
       AND v_snapshot_sample->>'unit' = '°C'
    THEN
        v_pass := v_pass + 1;
        RAISE NOTICE '  ✓ A5  item_snapshot has correct type / label / unit / is_required';
    ELSE
        v_fail := v_fail + 1;
        RAISE WARNING '  ✗ A5  item_snapshot fields unexpected: %', v_snapshot_sample;
    END IF;

    -- ── A6: next_due_date advanced to CURRENT_DATE + 1 ───────────────────────
    SELECT next_due_date INTO v_next_due
      FROM public.pm_schedules
     WHERE id = v_sch_id;

    IF v_next_due = CURRENT_DATE + 1 THEN
        v_pass := v_pass + 1;
        RAISE NOTICE '  ✓ A6  next_due_date advanced to % (tomorrow)', v_next_due;
    ELSE
        v_fail := v_fail + 1;
        RAISE WARNING '  ✗ A6  next_due_date = % (expected %)', v_next_due, CURRENT_DATE + 1;
    END IF;

    -- ── A7: No duplicate WO on second call (idempotency guard) ────────────────
    -- Calling the function again must not create a second WO for the same cycle
    PERFORM public.pm_generate_due_work_orders();

    SELECT COUNT(*) INTO v_wo_count
      FROM public.work_orders
     WHERE source_schedule_id = v_sch_id;

    IF v_wo_count = 1 THEN
        v_pass := v_pass + 1;
        RAISE NOTICE '  ✓ A7  Idempotency: second call did NOT create a duplicate WO';
    ELSE
        v_fail := v_fail + 1;
        RAISE WARNING '  ✗ A7  Idempotency FAIL: %  WOs exist after 2 calls', v_wo_count;
    END IF;

    -- ── Detailed check breakdown ──────────────────────────────────────────────
    RAISE NOTICE '';
    RAISE NOTICE '  ── Check breakdown by asset × item_type ──';
    -- Print each check row summary
    FOR r IN
        SELECT
            a.name_ar                             AS asset_name,
            woc.item_snapshot->>'item_type'       AS itype,
            woc.item_snapshot->>'label'           AS ilabel,
            woc.item_snapshot->>'is_required'     AS ireq,
            woc.status
          FROM public.work_order_checks woc
          JOIN public.assets a ON a.id = woc.asset_id
         WHERE woc.work_order_id = v_wo_id
         ORDER BY a.name_ar, woc.sort_order
    LOOP
        RAISE NOTICE '    [%]  %-12s  req=%-5s  status=%',
            r.asset_name, r.itype, r.ireq, r.status;
    END LOOP;

    -- =========================================================================
    -- STEP 6 — pm_calculate_compliance_stats
    -- =========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '── STEP 6: pm_calculate_compliance_stats ──────────────────';

    SELECT public.pm_calculate_compliance_stats(v_tenant_id) INTO v_result;
    RAISE NOTICE '  Stats JSON: %', v_result;

    v_stats_ok :=
        v_result ? 'total'
        AND v_result ? 'completed_on_time'
        AND v_result ? 'overdue'
        AND v_result ? 'due_soon'
        AND v_result ? 'compliance_rate';

    IF v_stats_ok THEN
        v_pass := v_pass + 1;
        RAISE NOTICE '  ✓ A8  compliance_stats has all 5 expected keys';
        RAISE NOTICE '       total=%  overdue=%  due_soon=%  compliance_rate=%',
            v_result->>'total',
            v_result->>'overdue',
            v_result->>'due_soon',
            v_result->>'compliance_rate';
    ELSE
        v_fail := v_fail + 1;
        RAISE WARNING '  ✗ A8  compliance_stats missing keys — got: %', v_result;
    END IF;

    -- =========================================================================
    -- Summary
    -- =========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  RESULTS: % passed  |  % failed                          ║',
        LPAD(v_pass::TEXT, 2), LPAD(v_fail::TEXT, 2);
    IF v_fail = 0 THEN
        RAISE NOTICE '║  ✓ ALL ASSERTIONS PASSED — migration 108 is functional   ║';
    ELSE
        RAISE NOTICE '║  ✗ SOME ASSERTIONS FAILED — review WARNINGs above        ║';
    END IF;
    RAISE NOTICE '╚══════════════════════════════════════════════════════════╝';
    RAISE NOTICE '(Transaction is about to ROLLBACK — no data persisted)';

END;
$smoke$;

ROLLBACK;
