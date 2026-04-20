-- Mutqan staging launch-gate fixtures.
--
-- Use this only if Auth users already exist. The faster path is:
--   npm run prepare:staging-fixtures
--
-- This SQL is intentionally staging-only, idempotent, and uses fixed UUIDs.
-- It does not create auth.users, passwords, or JWTs.

DO $$
DECLARE
    v_tenant_a uuid := '11111111-1111-4111-8111-111111111111';
    v_tenant_b uuid := '22222222-2222-4222-8222-222222222222';
    v_plan_id uuid := '33333333-3333-4333-8333-333333333333';
    v_platform_admin uuid;
    v_tenant_a_admin uuid;
    v_manager uuid;
    v_supervisor uuid;
    v_technician uuid;
    v_reporter uuid;
    v_tenant_b_user uuid;
BEGIN
    SELECT id INTO v_platform_admin FROM auth.users WHERE email = 'fixture.platform.admin@mutqan.test';
    SELECT id INTO v_tenant_a_admin FROM auth.users WHERE email = 'fixture.tenant.a.admin@mutqan.test';
    SELECT id INTO v_manager FROM auth.users WHERE email = 'fixture.tenant.a.manager@mutqan.test';
    SELECT id INTO v_supervisor FROM auth.users WHERE email = 'fixture.tenant.a.supervisor@mutqan.test';
    SELECT id INTO v_technician FROM auth.users WHERE email = 'fixture.tenant.a.technician@mutqan.test';
    SELECT id INTO v_reporter FROM auth.users WHERE email = 'fixture.tenant.a.reporter@mutqan.test';
    SELECT id INTO v_tenant_b_user FROM auth.users WHERE email = 'fixture.tenant.b.user@mutqan.test';

    IF v_platform_admin IS NULL OR v_tenant_a_admin IS NULL OR v_manager IS NULL
       OR v_supervisor IS NULL OR v_technician IS NULL OR v_reporter IS NULL
       OR v_tenant_b_user IS NULL THEN
        RAISE EXCEPTION 'Missing fixture auth.users. Create them first or run scripts/prepare-staging-fixtures.ts.';
    END IF;

    INSERT INTO public.subscription_plans (
        id, code, name, name_ar, description, description_ar,
        price_monthly, price_yearly, max_users, max_buildings,
        max_assets, max_work_orders_monthly, features,
        is_active, is_default, trial_days, display_order
    )
    VALUES (
        v_plan_id, 'fixture-professional', 'Fixture Professional', 'باقة احترافية اختبارية',
        'Fixture plan for staging validation', 'باقة اختبارية للتحقق من staging',
        10, 100, 50, 10, 500, 500,
        '["reports","inventory","maintenance"]'::jsonb,
        true, false, 14, 999
    )
    ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        name_ar = EXCLUDED.name_ar,
        price_monthly = EXCLUDED.price_monthly,
        price_yearly = EXCLUDED.price_yearly,
        is_active = true;

    INSERT INTO public.tenants (
        id, name, name_ar, slug, subscription_status, subscription_tier,
        plan_id, billing_cycle, subscription_starts_at, subscription_ends_at,
        max_users, max_assets, max_work_orders_per_month, enabled_modules,
        email, is_active
    )
    VALUES
        (
            v_tenant_a, 'Mutqan Fixture Tenant A', 'مستأجر متقن الاختباري أ',
            'mutqan-fixture-tenant-a', 'active', 'fixture-professional',
            v_plan_id, 'yearly', now(), now() + interval '365 days',
            50, 500, 500,
            '{"work_orders":true,"assets":true,"inventory":true,"reports":true,"maintenance":true,"billing":true}'::jsonb,
            'fixture-a@mutqan.test', true
        ),
        (
            v_tenant_b, 'Mutqan Fixture Tenant B', 'مستأجر متقن الاختباري ب',
            'mutqan-fixture-tenant-b', 'active', 'fixture-professional',
            v_plan_id, 'yearly', now(), now() + interval '365 days',
            20, 100, 100,
            '{"work_orders":true,"assets":true,"inventory":true,"reports":true,"maintenance":true,"billing":true}'::jsonb,
            'fixture-b@mutqan.test', true
        )
    ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        name_ar = EXCLUDED.name_ar,
        subscription_status = 'active',
        plan_id = EXCLUDED.plan_id,
        is_active = true;

    INSERT INTO public.profiles (id, tenant_id, full_name, full_name_ar, email, role, is_super_admin, is_active)
    VALUES
        (v_platform_admin, NULL, 'Fixture Platform Admin', 'مسؤول منصة اختباري', 'fixture.platform.admin@mutqan.test', 'platform_admin', true, true),
        (v_tenant_a_admin, v_tenant_a, 'Fixture Tenant A Admin', 'مسؤول المستأجر أ', 'fixture.tenant.a.admin@mutqan.test', 'tenant_admin', false, true),
        (v_manager, v_tenant_a, 'Fixture Maintenance Manager', 'مدير صيانة اختباري', 'fixture.tenant.a.manager@mutqan.test', 'maintenance_manager', false, true),
        (v_supervisor, v_tenant_a, 'Fixture Supervisor', 'مشرف اختباري', 'fixture.tenant.a.supervisor@mutqan.test', 'supervisor', false, true),
        (v_technician, v_tenant_a, 'Fixture Technician', 'فني اختباري', 'fixture.tenant.a.technician@mutqan.test', 'technician', false, true),
        (v_reporter, v_tenant_a, 'Fixture Reporter', 'مبلغ اختباري', 'fixture.tenant.a.reporter@mutqan.test', 'reporter', false, true),
        (v_tenant_b_user, v_tenant_b, 'Fixture Tenant B User', 'مستخدم المستأجر ب', 'fixture.tenant.b.user@mutqan.test', 'tenant_admin', false, true)
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        full_name = EXCLUDED.full_name,
        full_name_ar = EXCLUDED.full_name_ar,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        is_super_admin = EXCLUDED.is_super_admin,
        is_active = true;

    INSERT INTO public.buildings (id, tenant_id, code, name, name_ar, address, is_active)
    VALUES
        ('44444444-4444-4444-8444-444444444441', v_tenant_a, 'FX-A-BLDG-01', 'Fixture A Main Building', 'المبنى الرئيسي أ', 'Fixture A', true),
        ('44444444-4444-4444-8444-444444444442', v_tenant_b, 'FX-B-BLDG-01', 'Fixture B Main Building', 'المبنى الرئيسي ب', 'Fixture B', true)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, is_active = true;

    RAISE NOTICE 'Base fixture tenants/profiles/buildings ready. Run prepare-staging-fixtures.ts for the complete data and JWT env file.';
END;
$$;
