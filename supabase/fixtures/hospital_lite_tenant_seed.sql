-- =============================================================================
-- Hospital Lite — Phase 1+2 demo tenant seed (staging-only, idempotent).
--
-- Creates the hospital tenant and its public-portal access token used by the
-- Hospital Lite roadmap. Uses fixed UUIDs and a fixed demo token so the seed
-- is reproducible and safe to re-run. No real patient data — per the roadmap,
-- no real data enters before full RLS (phase 7).
--
-- It does NOT create auth.users; the hospital's staff users are added later
-- (phase 4). Phase 1 only needs the tenant + an active public token + the
-- public_portal entitlement so the public submission RPC accepts reports.
--
-- Phase 2 addition: enabled_modules is set to the Lite scope after INSERT
-- (separate UPDATE, same plan-trigger-bypass pattern as migrations 097/098).
-- billing.enabled=false signals the sidebar to hide the subscription link.
--
-- Run via Supabase MCP execute_sql or psql against staging.
-- =============================================================================

DO $$
DECLARE
    v_tenant_id UUID := 'd0000000-0000-4000-8000-000000000020';
    v_plan_id   UUID := '33333333-3333-4333-8333-333333333333'; -- fixture-professional
    v_token     TEXT := 'hl_demo_5f9c2a8d4b7e1036a9c5e2d8b4f60a1c3e7d9b08f2c4e6d1';
    v_lite_modules JSONB;
BEGIN
    -- ----- Tenant (idempotent) -----
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
        SET name             = EXCLUDED.name,
            name_ar          = EXCLUDED.name_ar,
            slug             = EXCLUDED.slug,
            plan_id          = EXCLUDED.plan_id,
            subscription_status = EXCLUDED.subscription_status,
            trial_ends_at    = EXCLUDED.trial_ends_at,
            is_active        = TRUE,
            updated_at       = NOW();

    -- ----- Force Lite-only enabled_modules -----
    -- This UPDATE touches only enabled_modules (not plan_id), so the
    -- on_tenant_plan_change trigger does NOT fire and these overrides persist.
    -- billing.enabled=false → sidebar hides subscription link for this tenant.
    v_lite_modules := jsonb_build_object(
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
       SET enabled_modules = v_lite_modules,
           updated_at      = NOW()
     WHERE id = v_tenant_id;

    -- ----- Public access token (idempotent on the unique token) -----
    INSERT INTO public.tenant_access_tokens (
        tenant_id, token, name, is_active, created_at
    ) VALUES (
        v_tenant_id, v_token, 'Hospital Lite Public Portal', TRUE, NOW()
    )
    ON CONFLICT (token) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            name      = EXCLUDED.name,
            is_active = TRUE;

    RAISE NOTICE 'Hospital Lite tenant ready: % (token: %)', v_tenant_id, v_token;
END $$;
