-- ==============================================================================
-- Migration: 089_subscription_enforcement.sql
-- Purpose: Enforce plan limits and remove permissive module fallbacks
-- ==============================================================================

-- 1) Allow trusted provisioning flow to bypass profile guard explicitly
CREATE OR REPLACE FUNCTION provision_tenant(
    p_name         TEXT,
    p_name_ar      TEXT DEFAULT NULL,
    p_slug         TEXT DEFAULT NULL,
    p_email        TEXT DEFAULT NULL,
    p_phone        TEXT DEFAULT NULL,
    p_address      TEXT DEFAULT NULL,
    p_cr_number    TEXT DEFAULT NULL,
    p_tax_number   TEXT DEFAULT NULL,
    p_country      TEXT DEFAULT NULL,
    p_city         TEXT DEFAULT NULL,
    p_postal_code  TEXT DEFAULT NULL,
    p_website      TEXT DEFAULT NULL,
    p_timezone     TEXT DEFAULT 'Asia/Riyadh',
    p_plan_code    TEXT DEFAULT NULL,
    p_trial_days   INTEGER DEFAULT NULL,
    p_assign_caller_as_admin BOOLEAN DEFAULT FALSE,
    p_caller_full_name       TEXT DEFAULT NULL,
    p_caller_phone           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id      UUID;
    v_tenant_id    UUID;
    v_plan_id      UUID;
    v_plan_code    TEXT;
    v_plan_price   DECIMAL(10, 2);
    v_plan_currency VARCHAR(3) := 'SAR';
    v_trial_days   INTEGER;
    v_slug         TEXT;
    v_base_slug    TEXT;
    v_count        INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT id, code, price_monthly, COALESCE(currency, 'SAR'), COALESCE(trial_days, 14)
      INTO v_plan_id, v_plan_code, v_plan_price, v_plan_currency, v_trial_days
      FROM subscription_plans
     WHERE is_default = true AND is_active = true
     LIMIT 1;

    IF v_plan_id IS NULL AND p_plan_code IS NOT NULL THEN
        SELECT id, code, price_monthly, COALESCE(currency, 'SAR'), COALESCE(trial_days, 14)
          INTO v_plan_id, v_plan_code, v_plan_price, v_plan_currency, v_trial_days
          FROM subscription_plans
         WHERE code = p_plan_code AND is_active = true
         LIMIT 1;
    END IF;

    IF v_plan_id IS NULL THEN
        SELECT id, code, price_monthly, COALESCE(currency, 'SAR'), COALESCE(trial_days, 14)
          INTO v_plan_id, v_plan_code, v_plan_price, v_plan_currency, v_trial_days
          FROM subscription_plans
         WHERE is_active = true
         ORDER BY price_monthly ASC
         LIMIT 1;
    END IF;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'No active subscription plan found. Cannot create tenant without a plan.';
    END IF;

    IF p_trial_days IS NOT NULL THEN
        v_trial_days := p_trial_days;
    END IF;

    IF p_slug IS NOT NULL AND length(trim(p_slug)) >= 3 THEN
        v_base_slug := lower(regexp_replace(trim(p_slug), '[^a-z0-9\-]', '', 'g'));
    ELSE
        v_base_slug := lower(regexp_replace(coalesce(p_name, 'tenant'), '[^a-zA-Z0-9]', '', 'g'));
    END IF;

    IF v_base_slug IS NULL OR length(v_base_slug) < 3 THEN
        v_base_slug := 'tenant' || floor(random() * 10000)::text;
    END IF;

    v_slug := v_base_slug;

    LOOP
        SELECT count(*) INTO v_count FROM tenants WHERE slug = v_slug;
        EXIT WHEN v_count = 0;
        v_slug := v_base_slug || floor(random() * 10000)::text;
    END LOOP;

    INSERT INTO tenants (
        name, name_ar, slug, plan_id, subscription_status, subscription_tier,
        cr_number, tax_number, address, country, city, postal_code,
        email, phone, website, timezone,
        trial_ends_at,
        created_at, updated_at
    ) VALUES (
        p_name, p_name_ar, v_slug, v_plan_id, 'trial', v_plan_code,
        p_cr_number, p_tax_number, p_address, p_country, p_city, p_postal_code,
        p_email, p_phone, p_website, p_timezone,
        NOW() + (v_trial_days || ' days')::INTERVAL,
        NOW(), NOW()
    )
    RETURNING id INTO v_tenant_id;

    INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        current_period_start, current_period_end,
        trial_ends_at, amount, currency
    ) VALUES (
        v_tenant_id, v_plan_id, 'trial', 'monthly',
        NOW(),
        NOW() + (v_trial_days || ' days')::INTERVAL,
        NOW() + (v_trial_days || ' days')::INTERVAL,
        0,
        v_plan_currency
    );

    IF p_assign_caller_as_admin THEN
        PERFORM set_config('app.bypass_profile_guard', '1', true);

        UPDATE profiles
        SET tenant_id   = v_tenant_id,
            full_name   = coalesce(p_caller_full_name, full_name),
            full_name_ar = coalesce(p_caller_full_name, full_name_ar),
            phone       = coalesce(p_caller_phone, phone),
            role        = 'tenant_admin',
            is_active   = true,
            updated_at  = NOW()
        WHERE id = v_user_id;

        UPDATE auth.users
        SET email_confirmed_at = NOW()
        WHERE id = v_user_id AND email_confirmed_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'slug', v_slug,
        'plan_id', v_plan_id,
        'plan_code', v_plan_code,
        'trial_days', v_trial_days,
        'success', true
    );
END;
$$;


-- 2) Build a deterministic modules configuration from plan + defaults
CREATE OR REPLACE FUNCTION public.default_enabled_modules_json()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
SELECT jsonb_build_object(
    'dashboard', jsonb_build_object('enabled', true, 'features', jsonb_build_object('quick_stats', true, 'charts', true, 'recent_activity', true)),
    'facilities', jsonb_build_object('enabled', true, 'features', jsonb_build_object('buildings', true, 'floors', true, 'departments', true, 'rooms', true)),
    'assets', jsonb_build_object('enabled', true, 'features', jsonb_build_object('asset_tracking', true, 'qr_codes', true, 'asset_history', true, 'warranty_tracking', true)),
    'work_orders', jsonb_build_object('enabled', true, 'features', jsonb_build_object('create_wo', true, 'workflow', true, 'assignment', true, 'parts_tracking', true)),
    'maintenance', jsonb_build_object('enabled', true, 'features', jsonb_build_object('maintenance_plans', true, 'schedules', true, 'auto_generation', true)),
    'inventory', jsonb_build_object('enabled', true, 'features', jsonb_build_object('stock_tracking', true, 'low_stock_alerts', true, 'consumption_reports', true)),
    'employees', jsonb_build_object('enabled', true, 'features', jsonb_build_object('user_management', true, 'role_assignment', true)),
    'work_teams', jsonb_build_object('enabled', true, 'features', jsonb_build_object('team_creation', true, 'member_assignment', true)),
    'reports', jsonb_build_object('enabled', true, 'features', jsonb_build_object('operational_reports', true, 'export', true)),
    'public_portal', jsonb_build_object('enabled', false, 'features', jsonb_build_object('public_submission', true, 'qr_portal', true))
);
$$;

CREATE OR REPLACE FUNCTION public.plan_enabled_modules_json(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_features JSONB := '[]'::jsonb;
    v_modules JSONB := public.default_enabled_modules_json();
    v_module TEXT;
    v_recognized_count INTEGER := 0;
BEGIN
    IF p_plan_id IS NULL THEN
        RETURN v_modules;
    END IF;

    SELECT COALESCE(features, '[]'::jsonb)
      INTO v_features
      FROM public.subscription_plans
     WHERE id = p_plan_id;

    IF v_features IS NULL OR jsonb_typeof(v_features) <> 'array' THEN
        RETURN v_modules;
    END IF;

    FOR v_module IN SELECT jsonb_array_elements_text(v_features)
    LOOP
        IF v_modules ? v_module THEN
            v_recognized_count := v_recognized_count + 1;
        END IF;
    END LOOP;

    IF v_recognized_count = 0 THEN
        RETURN v_modules;
    END IF;

    v_modules := jsonb_set(v_modules, '{facilities,enabled}', 'false'::jsonb);
    v_modules := jsonb_set(v_modules, '{assets,enabled}', 'false'::jsonb);
    v_modules := jsonb_set(v_modules, '{work_orders,enabled}', 'false'::jsonb);
    v_modules := jsonb_set(v_modules, '{maintenance,enabled}', 'false'::jsonb);
    v_modules := jsonb_set(v_modules, '{inventory,enabled}', 'false'::jsonb);
    v_modules := jsonb_set(v_modules, '{work_teams,enabled}', 'false'::jsonb);
    v_modules := jsonb_set(v_modules, '{reports,enabled}', 'false'::jsonb);
    v_modules := jsonb_set(v_modules, '{public_portal,enabled}', 'false'::jsonb);

    FOR v_module IN SELECT jsonb_array_elements_text(v_features)
    LOOP
        IF v_modules ? v_module THEN
            v_modules := jsonb_set(v_modules, ARRAY[v_module, 'enabled'], 'true'::jsonb);
        END IF;
    END LOOP;

    RETURN v_modules;
END;
$$;


-- 3) Sync enabled_modules from plan_id instead of obsolete subscription_plan_id
CREATE OR REPLACE FUNCTION public.sync_tenant_modules_from_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.enabled_modules := public.plan_enabled_modules_json(NEW.plan_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_plan_change ON public.tenants;
CREATE TRIGGER on_tenant_plan_change
BEFORE INSERT OR UPDATE OF plan_id ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.sync_tenant_modules_from_plan();

UPDATE public.tenants
SET enabled_modules = public.plan_enabled_modules_json(plan_id)
WHERE enabled_modules IS NULL OR enabled_modules = '{}'::jsonb;


-- 4) Enforce limits using plan_id as the source of truth
CREATE OR REPLACE FUNCTION public.check_subscription_limits(p_tenant_id UUID, p_resource_type VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER;
    v_current INTEGER;
    v_plan_id UUID;
BEGIN
    SELECT COALESCE(ts.plan_id, t.plan_id)
      INTO v_plan_id
      FROM public.tenants t
      LEFT JOIN public.tenant_subscriptions ts ON ts.tenant_id = t.id
     WHERE t.id = p_tenant_id;

    IF v_plan_id IS NULL THEN
        SELECT id INTO v_plan_id
        FROM public.subscription_plans
        WHERE is_default = true AND is_active = true
        LIMIT 1;
    END IF;

    SELECT CASE p_resource_type
        WHEN 'users' THEN max_users
        WHEN 'buildings' THEN max_buildings
        WHEN 'assets' THEN max_assets
        WHEN 'work_orders' THEN max_work_orders_monthly
        ELSE -1
    END
    INTO v_limit
    FROM public.subscription_plans
    WHERE id = v_plan_id;

    IF v_limit IS NULL OR v_limit = -1 THEN
        RETURN TRUE;
    END IF;

    IF p_resource_type = 'users' THEN
        SELECT COUNT(*) INTO v_current
        FROM public.profiles
        WHERE tenant_id = p_tenant_id
          AND COALESCE(is_active, TRUE) = TRUE;
    ELSIF p_resource_type = 'buildings' THEN
        SELECT COUNT(*) INTO v_current FROM public.buildings WHERE tenant_id = p_tenant_id;
    ELSIF p_resource_type = 'assets' THEN
        SELECT COUNT(*) INTO v_current FROM public.assets WHERE tenant_id = p_tenant_id;
    ELSIF p_resource_type = 'work_orders' THEN
        SELECT COUNT(*) INTO v_current
        FROM public.work_orders
        WHERE tenant_id = p_tenant_id
          AND created_at >= date_trunc('month', CURRENT_DATE);
    ELSE
        RETURN TRUE;
    END IF;

    RETURN v_current < v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_subscription_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_TABLE_NAME = 'profiles' THEN
        IF NEW.tenant_id IS NULL OR COALESCE(NEW.is_active, TRUE) = FALSE THEN
            RETURN NEW;
        END IF;

        IF TG_OP = 'UPDATE'
            AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
            AND NOT (COALESCE(OLD.is_active, FALSE) = FALSE AND COALESCE(NEW.is_active, TRUE) = TRUE)
        THEN
            RETURN NEW;
        END IF;

        IF NOT public.check_subscription_limits(NEW.tenant_id, 'users') THEN
            RAISE EXCEPTION 'User limit reached for this subscription plan';
        END IF;
    ELSIF TG_TABLE_NAME = 'buildings' THEN
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'buildings') THEN
            RAISE EXCEPTION 'Building limit reached for this subscription plan';
        END IF;
    ELSIF TG_TABLE_NAME = 'assets' THEN
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'assets') THEN
            RAISE EXCEPTION 'Asset limit reached for this subscription plan';
        END IF;
    ELSIF TG_TABLE_NAME = 'work_orders' THEN
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'work_orders') THEN
            RAISE EXCEPTION 'Monthly work order limit reached for this subscription plan';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_profile_limits ON public.profiles;
DROP TRIGGER IF EXISTS check_building_limits ON public.buildings;
DROP TRIGGER IF EXISTS check_asset_limits ON public.assets;
DROP TRIGGER IF EXISTS check_work_order_limits ON public.work_orders;

CREATE TRIGGER check_profile_limits
BEFORE INSERT OR UPDATE OF tenant_id, is_active ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_subscription_limits();

CREATE TRIGGER check_building_limits
BEFORE INSERT ON public.buildings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_subscription_limits();

CREATE TRIGGER check_asset_limits
BEFORE INSERT ON public.assets
FOR EACH ROW
EXECUTE FUNCTION public.enforce_subscription_limits();

CREATE TRIGGER check_work_order_limits
BEFORE INSERT ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_subscription_limits();
