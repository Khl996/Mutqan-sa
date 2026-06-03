-- =============================================================================
-- Hospital Lite — Phase 1+2+3+4 demo tenant seed (staging-only, idempotent).
--
-- Creates: tenant, public-portal token, Lite-only enabled_modules, demo
-- buildings/floors/departments for the intake form, demo technician account
-- (auth.users + profile) and a pre-assigned work order for RLS testing.
--
-- Fixed UUIDs → safe to re-run; no drift between runs.
-- No real patient data (per roadmap: no real data before phase 7 full RLS).
--
-- Demo technician credentials (staging only):
--   Email:    tech1@hospital-lite.test
--   Password: TechDemo@2026
--
-- Run via Supabase MCP execute_sql or psql against staging.
-- =============================================================================

DO $$
DECLARE
    v_tenant_id  UUID := 'd0000000-0000-4000-8000-000000000020';
    v_plan_id    UUID := '33333333-3333-4333-8333-333333333333';
    v_token      TEXT := 'hl_demo_5f9c2a8d4b7e1036a9c5e2d8b4f60a1c3e7d9b08f2c4e6d1';
    v_lite_mods  JSONB;

    -- Building UUIDs
    v_bld_main   UUID := 'd0000000-0000-4000-8000-b00000000001';
    v_bld_emg    UUID := 'd0000000-0000-4000-8000-b00000000002';
    v_bld_diag   UUID := 'd0000000-0000-4000-8000-b00000000003';

    -- Floor UUIDs — Main Building
    v_fl_main_g  UUID := 'd0000000-0000-4000-8000-f00000000001'; -- ground
    v_fl_main_1  UUID := 'd0000000-0000-4000-8000-f00000000002'; -- 1st
    v_fl_main_2  UUID := 'd0000000-0000-4000-8000-f00000000003'; -- 2nd

    -- Floor UUIDs — Emergency Building
    v_fl_emg_g   UUID := 'd0000000-0000-4000-8000-f00000000004';
    v_fl_emg_1   UUID := 'd0000000-0000-4000-8000-f00000000005';

    -- Floor UUIDs — Diagnostics Building
    v_fl_diag_g  UUID := 'd0000000-0000-4000-8000-f00000000006';
    v_fl_diag_1  UUID := 'd0000000-0000-4000-8000-f00000000007';

    -- Department UUIDs
    v_dept_recep UUID := 'd0000000-0000-4000-8000-d00000000001'; -- استقبال
    v_dept_out   UUID := 'd0000000-0000-4000-8000-d00000000002'; -- عيادات خارجية
    v_dept_admin UUID := 'd0000000-0000-4000-8000-d00000000003'; -- إدارة
    v_dept_icu   UUID := 'd0000000-0000-4000-8000-d00000000004'; -- العناية المركزة
    v_dept_surg  UUID := 'd0000000-0000-4000-8000-d00000000005'; -- غرف العمليات
    v_dept_emg   UUID := 'd0000000-0000-4000-8000-d00000000006'; -- طوارئ
    v_dept_lab   UUID := 'd0000000-0000-4000-8000-d00000000007'; -- مختبر
    v_dept_rad   UUID := 'd0000000-0000-4000-8000-d00000000008'; -- أشعة
    v_dept_pharm UUID := 'd0000000-0000-4000-8000-d00000000009'; -- صيدلية

    -- Phase 4: demo technician + test work order (fixed UUIDs for idempotency)
    v_tech1_id   UUID := 'd0000000-0000-4000-8000-000000000031';
    v_wo_test_id UUID := 'd0000000-0000-4000-8000-000000000041';
BEGIN

    -- ── Tenant ──────────────────────────────────────────────────────────────────
    INSERT INTO public.tenants (
        id, name, name_ar, slug,
        plan_id, subscription_status, trial_ends_at,
        enabled_modules, is_active,
        language, timezone, currency,
        created_at, updated_at
    ) VALUES (
        v_tenant_id,
        'Hospital Lite Demo',
        'مستشفى متقن (النسخة المبسطة)',
        'hospital-lite-demo',
        v_plan_id, 'active', NOW() + INTERVAL '3650 days',
        '{}'::JSONB, TRUE,
        'ar', 'Asia/Riyadh', 'SAR',
        NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE
        SET name                = EXCLUDED.name,
            name_ar             = EXCLUDED.name_ar,
            slug                = EXCLUDED.slug,
            plan_id             = EXCLUDED.plan_id,
            subscription_status = EXCLUDED.subscription_status,
            trial_ends_at       = EXCLUDED.trial_ends_at,
            is_active           = TRUE,
            updated_at          = NOW();

    -- ── Lite-only enabled_modules ────────────────────────────────────────────────
    -- UPDATE only enabled_modules (not plan_id) so on_tenant_plan_change
    -- trigger does NOT fire and the override persists.
    v_lite_mods := jsonb_build_object(
        'dashboard',     jsonb_build_object('enabled', TRUE,  'features', jsonb_build_object('quick_stats', TRUE, 'charts', TRUE, 'recent_activity', TRUE)),
        'work_orders',   jsonb_build_object('enabled', TRUE,  'features', jsonb_build_object('create_wo', TRUE, 'workflow', TRUE, 'assignment', TRUE, 'parts_tracking', TRUE)),
        'employees',     jsonb_build_object('enabled', TRUE,  'features', jsonb_build_object('user_management', TRUE, 'role_assignment', TRUE)),
        'public_portal', jsonb_build_object('enabled', TRUE,  'features', jsonb_build_object('qr_portal', TRUE, 'public_submission', TRUE)),
        'facilities',    jsonb_build_object('enabled', FALSE, 'features', jsonb_build_object('buildings', FALSE, 'floors', FALSE, 'departments', FALSE, 'rooms', FALSE)),
        'assets',        jsonb_build_object('enabled', FALSE, 'features', jsonb_build_object('asset_tracking', FALSE, 'qr_codes', FALSE, 'asset_history', FALSE, 'warranty_tracking', FALSE)),
        'maintenance',   jsonb_build_object('enabled', FALSE, 'features', jsonb_build_object('maintenance_plans', FALSE, 'schedules', FALSE)),
        'inventory',     jsonb_build_object('enabled', FALSE, 'features', jsonb_build_object('stock_tracking', FALSE, 'low_stock_alerts', FALSE, 'consumption_reports', FALSE)),
        'work_teams',    jsonb_build_object('enabled', FALSE, 'features', jsonb_build_object('team_creation', FALSE, 'member_assignment', FALSE)),
        'reports',       jsonb_build_object('enabled', FALSE, 'features', jsonb_build_object('operational_reports', FALSE, 'export', FALSE)),
        'billing',       jsonb_build_object('enabled', FALSE)
    );

    UPDATE public.tenants
       SET enabled_modules = v_lite_mods,
           updated_at      = NOW()
     WHERE id = v_tenant_id;

    -- ── Public access token ──────────────────────────────────────────────────────
    INSERT INTO public.tenant_access_tokens (tenant_id, token, name, is_active, created_at)
    VALUES (v_tenant_id, v_token, 'Hospital Lite Public Portal', TRUE, NOW())
    ON CONFLICT (token) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            name      = EXCLUDED.name,
            is_active = TRUE;

    -- ── Buildings ────────────────────────────────────────────────────────────────
    INSERT INTO public.buildings (id, tenant_id, code, name, name_ar, is_active, created_at, updated_at)
    VALUES
        (v_bld_main, v_tenant_id, 'MAIN', 'Main Building',      'المبنى الرئيسي', TRUE, NOW(), NOW()),
        (v_bld_emg,  v_tenant_id, 'EMG',  'Emergency Building', 'مبنى الطوارئ',   TRUE, NOW(), NOW()),
        (v_bld_diag, v_tenant_id, 'DIAG', 'Diagnostics Block',  'مجمع التشخيص',  TRUE, NOW(), NOW())
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name = EXCLUDED.name, name_ar = EXCLUDED.name_ar,
            is_active = TRUE, updated_at = NOW();

    -- ── Floors ───────────────────────────────────────────────────────────────────
    INSERT INTO public.floors (id, building_id, code, name, name_ar, level, is_active, created_at, updated_at)
    VALUES
        (v_fl_main_g, v_bld_main, 'G', 'Ground Floor', 'الدور الأرضي', 0, TRUE, NOW(), NOW()),
        (v_fl_main_1, v_bld_main, '1', 'First Floor',  'الدور الأول',  1, TRUE, NOW(), NOW()),
        (v_fl_main_2, v_bld_main, '2', 'Second Floor', 'الدور الثاني', 2, TRUE, NOW(), NOW()),
        (v_fl_emg_g,  v_bld_emg,  'G', 'Ground Floor', 'الدور الأرضي', 0, TRUE, NOW(), NOW()),
        (v_fl_emg_1,  v_bld_emg,  '1', 'First Floor',  'الدور الأول',  1, TRUE, NOW(), NOW()),
        (v_fl_diag_g, v_bld_diag, 'G', 'Ground Floor', 'الدور الأرضي', 0, TRUE, NOW(), NOW()),
        (v_fl_diag_1, v_bld_diag, '1', 'First Floor',  'الدور الأول',  1, TRUE, NOW(), NOW())
    ON CONFLICT (building_id, code) DO UPDATE
        SET name = EXCLUDED.name, name_ar = EXCLUDED.name_ar,
            is_active = TRUE, updated_at = NOW();

    -- ── Departments ──────────────────────────────────────────────────────────────
    INSERT INTO public.departments (id, tenant_id, building_id, floor_id, code, name, name_ar, is_active, created_at, updated_at)
    VALUES
        (v_dept_recep, v_tenant_id, v_bld_main, v_fl_main_g, 'RECEP', 'Reception',          'الاستقبال',        TRUE, NOW(), NOW()),
        (v_dept_pharm, v_tenant_id, v_bld_main, v_fl_main_g, 'PHARM', 'Pharmacy',            'الصيدلية',         TRUE, NOW(), NOW()),
        (v_dept_out,   v_tenant_id, v_bld_main, v_fl_main_1, 'OUT',   'Outpatient Clinics',  'العيادات الخارجية', TRUE, NOW(), NOW()),
        (v_dept_admin, v_tenant_id, v_bld_main, v_fl_main_1, 'ADMIN', 'Administration',       'الإدارة',          TRUE, NOW(), NOW()),
        (v_dept_icu,   v_tenant_id, v_bld_main, v_fl_main_2, 'ICU',   'Intensive Care Unit', 'العناية المركزة',   TRUE, NOW(), NOW()),
        (v_dept_surg,  v_tenant_id, v_bld_main, v_fl_main_2, 'SURG',  'Operating Rooms',     'غرف العمليات',     TRUE, NOW(), NOW()),
        (v_dept_emg,   v_tenant_id, v_bld_emg,  v_fl_emg_g,  'EMG',   'Emergency Dept',      'قسم الطوارئ',      TRUE, NOW(), NOW()),
        (v_dept_lab,   v_tenant_id, v_bld_diag, v_fl_diag_g, 'LAB',   'Laboratory',          'المختبر',          TRUE, NOW(), NOW()),
        (v_dept_rad,   v_tenant_id, v_bld_diag, v_fl_diag_1, 'RAD',   'Radiology',           'الأشعة',           TRUE, NOW(), NOW())
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name = EXCLUDED.name, name_ar = EXCLUDED.name_ar,
            building_id = EXCLUDED.building_id, floor_id = EXCLUDED.floor_id,
            is_active = TRUE, updated_at = NOW();

    -- ── Phase 4: Demo technician auth account ────────────────────────────────────
    -- Creates a real login-capable auth.users entry for E2E testing of:
    --   • deep link redirect-after-login
    --   • RLS: technician sees only assigned/reported/created orders
    --   • WorkOrderActions: start → in_progress → complete flow
    --
    -- pgcrypto lives in extensions schema; qualified call prevents search_path
    -- issues (same guard as SECURITY DEFINER RPCs).
    -- ON CONFLICT (id): idempotent re-run updates password + confirms email.
    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        is_super_admin, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_tech1_id,
        'authenticated', 'authenticated',
        'tech1@hospital-lite.test',
        extensions.crypt('TechDemo@2026', extensions.gen_salt('bf')),
        NOW(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        '{"full_name": "Ahmed Al-Fanni"}'::jsonb,
        FALSE, NOW(), NOW(),
        '', '', '', ''
    )
    ON CONFLICT (id) DO UPDATE
        SET email              = EXCLUDED.email,
            encrypted_password = EXCLUDED.encrypted_password,
            email_confirmed_at = COALESCE(auth.users.email_confirmed_at, NOW()),
            updated_at         = NOW();

    -- Profile for the demo technician
    INSERT INTO public.profiles (
        id, tenant_id, full_name, full_name_ar, email,
        role, is_active, created_at, updated_at
    ) VALUES (
        v_tech1_id,
        v_tenant_id,
        'Ahmed Al-Fanni',
        'أحمد الفني',
        'tech1@hospital-lite.test',
        'technician', TRUE, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE
        SET full_name    = EXCLUDED.full_name,
            full_name_ar = EXCLUDED.full_name_ar,
            tenant_id    = EXCLUDED.tenant_id,
            role         = EXCLUDED.role,
            is_active    = TRUE,
            updated_at   = NOW();

    -- ── Phase 4: Pre-assigned work order for RLS regression testing ──────────────
    -- status = 'assigned' so the technician can start it immediately.
    -- ON CONFLICT: preserve status if already progressed (don't reset to 'assigned').
    INSERT INTO public.work_orders (
        id, tenant_id, code, title, description,
        status, priority,
        building_id, department_id,
        assigned_to,
        reporter_name, reporter_phone,
        reported_at, created_at, updated_at
    ) VALUES (
        v_wo_test_id,
        v_tenant_id,
        'TEST-TECH-001',
        'بلاغ تجريبي — فني أحمد',
        'أمر عمل تجريبي لاختبار مسار الفني: deep link، تحديث الحالة، إقفال الأمر.',
        'assigned', 'medium',
        v_bld_main,
        v_dept_recep,
        v_tech1_id,
        'نظام الاختبار', '0500000000',
        NOW(), NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE
        SET assigned_to = EXCLUDED.assigned_to,
            -- Don't reset a completed/rejected/cancelled order back to assigned
            status      = CASE
                            WHEN work_orders.status IN ('completed', 'rejected', 'cancelled')
                            THEN work_orders.status
                            ELSE EXCLUDED.status
                          END,
            updated_at  = NOW();

    RAISE NOTICE 'Hospital Lite seed complete: tenant=% buildings=3 floors=7 departments=9 tech1=% test_wo=%',
        v_tenant_id, v_tech1_id, v_wo_test_id;
END $$;
