-- =============================================================================
-- Hospital Lite — Phase 1 demo tenant seed (staging-only, idempotent).
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
-- Run via Supabase MCP execute_sql or psql against staging.
-- =============================================================================

DO $$
DECLARE
    v_tenant_id UUID := 'd0000000-0000-4000-8000-000000000020';
    v_plan_id   UUID := '33333333-3333-4333-8333-333333333333'; -- fixture-professional
    v_token     TEXT := 'hl_demo_5f9c2a8d4b7e1036a9c5e2d8b4f60a1c3e7d9b08f2c4e6d1';
    v_modules   JSONB;
BEGIN
    -- Canonical module map from the plan, then force public_portal on so the
    -- public submission RPC (has_public_portal_access) accepts this tenant.
    BEGIN
        v_modules := public.plan_enabled_modules_json(v_plan_id);
    EXCEPTION WHEN OTHERS THEN
        v_modules := '{}'::JSONB;
    END;

    v_modules := COALESCE(v_modules, '{}'::JSONB);
    v_modules := jsonb_set(
        v_modules,
        '{public_portal}',
        '{"enabled": true, "features": {"qr_portal": true, "public_submission": true}}'::JSONB,
        TRUE
    );

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
        v_modules, TRUE,
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
            enabled_modules  = EXCLUDED.enabled_modules,
            is_active        = TRUE,
            updated_at       = NOW();

    -- ----- Force public_portal entitlement ON -----
    -- The tenants.on_tenant_plan_change trigger recomputes enabled_modules from
    -- the plan whenever plan_id is written (INSERT/UPDATE OF plan_id), which
    -- disables public_portal because the plan does not grant it. We enable it
    -- with a follow-up UPDATE that touches enabled_modules ONLY (not plan_id),
    -- so the sync trigger does not fire and the override persists. Same pattern
    -- as migration 098_enable_maintenance_plans_feature.sql.
    UPDATE public.tenants
       SET enabled_modules = jsonb_set(
                COALESCE(enabled_modules, '{}'::JSONB),
                '{public_portal}',
                '{"enabled": true, "features": {"qr_portal": true, "public_submission": true}}'::JSONB,
                TRUE
           ),
           updated_at = NOW()
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
