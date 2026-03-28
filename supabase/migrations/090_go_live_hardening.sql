-- ==============================================================================
-- Migration: 090_go_live_hardening.sql
-- Purpose:
--   1) Fail closed on tenant module entitlements and normalize legacy plan features
--   2) Prevent tenant-side edits of subscription-controlled tenant fields
--   3) Add explicit inventory RLS and tighten inventory transaction writes
-- ==============================================================================

-- 1) Restricted modules baseline: only core modules remain enabled without a valid plan mapping
CREATE OR REPLACE FUNCTION public.restricted_enabled_modules_json()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
SELECT jsonb_build_object(
    'dashboard', jsonb_build_object('enabled', true, 'features', jsonb_build_object('quick_stats', true, 'charts', true, 'recent_activity', true)),
    'facilities', jsonb_build_object('enabled', false, 'features', jsonb_build_object('buildings', false, 'floors', false, 'departments', false, 'rooms', false)),
    'assets', jsonb_build_object('enabled', false, 'features', jsonb_build_object('asset_tracking', false, 'qr_codes', false, 'asset_history', false, 'warranty_tracking', false)),
    'work_orders', jsonb_build_object('enabled', false, 'features', jsonb_build_object('create_wo', false, 'workflow', false, 'assignment', false, 'parts_tracking', false)),
    'maintenance', jsonb_build_object('enabled', false, 'features', jsonb_build_object('maintenance_plans', false, 'schedules', false, 'auto_generation', false)),
    'inventory', jsonb_build_object('enabled', false, 'features', jsonb_build_object('stock_tracking', false, 'low_stock_alerts', false, 'consumption_reports', false)),
    'employees', jsonb_build_object('enabled', true, 'features', jsonb_build_object('user_management', true, 'role_assignment', true)),
    'work_teams', jsonb_build_object('enabled', false, 'features', jsonb_build_object('team_creation', false, 'member_assignment', false)),
    'reports', jsonb_build_object('enabled', false, 'features', jsonb_build_object('operational_reports', false, 'export', false)),
    'public_portal', jsonb_build_object('enabled', false, 'features', jsonb_build_object('public_submission', false, 'qr_portal', false))
);
$$;

CREATE OR REPLACE FUNCTION public.plan_feature_to_module_codes(p_feature TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_feature TEXT := lower(trim(coalesce(p_feature, '')));
BEGIN
    CASE v_feature
        WHEN 'all_features' THEN
            RETURN ARRAY['dashboard', 'facilities', 'assets', 'work_orders', 'maintenance', 'inventory', 'employees', 'work_teams', 'reports', 'public_portal'];

        WHEN 'dashboard', 'basic_dashboard', 'full_dashboard', 'quick_stats', 'charts', 'recent_activity' THEN
            RETURN ARRAY['dashboard'];

        WHEN 'facilities', 'multi_location', 'buildings', 'floors', 'departments', 'rooms' THEN
            RETURN ARRAY['facilities'];

        WHEN 'assets', 'basic_assets', 'asset_tracking', 'qr_codes', 'asset_history', 'warranty_tracking' THEN
            RETURN ARRAY['facilities', 'assets'];

        WHEN 'work_orders', 'basic_work_orders', 'custom_workflows', 'create_wo', 'workflow', 'assignment', 'parts_tracking' THEN
            RETURN ARRAY['facilities', 'work_orders'];

        WHEN 'maintenance', 'maintenance_calendar', 'maintenance_plans', 'schedules', 'auto_generation' THEN
            RETURN ARRAY['facilities', 'maintenance'];

        WHEN 'inventory', 'inventory_management', 'stock_tracking', 'low_stock_alerts', 'consumption_reports' THEN
            RETURN ARRAY['facilities', 'inventory'];

        WHEN 'employees', 'user_management', 'role_assignment' THEN
            RETURN ARRAY['employees'];

        WHEN 'teams', 'work_teams', 'team_creation', 'member_assignment' THEN
            RETURN ARRAY['work_teams'];

        WHEN 'reports', 'basic_reporting', 'advanced_reporting', 'operational_reports', 'export' THEN
            RETURN ARRAY['reports'];

        WHEN 'public_portal', 'public_submission', 'qr_portal' THEN
            RETURN ARRAY['public_portal'];

        ELSE
            IF v_feature = ANY (ARRAY['dashboard', 'facilities', 'assets', 'work_orders', 'maintenance', 'inventory', 'employees', 'work_teams', 'reports', 'public_portal']) THEN
                RETURN ARRAY[v_feature];
            END IF;

            RETURN ARRAY[]::TEXT[];
    END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_plan_module_codes(p_features JSONB)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_feature TEXT;
    v_module TEXT;
    v_result TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF p_features IS NULL OR jsonb_typeof(p_features) <> 'array' THEN
        RETURN v_result;
    END IF;

    FOR v_feature IN SELECT jsonb_array_elements_text(p_features)
    LOOP
        FOREACH v_module IN ARRAY public.plan_feature_to_module_codes(v_feature)
        LOOP
            IF NOT (v_module = ANY (v_result)) THEN
                v_result := array_append(v_result, v_module);
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.plan_enabled_modules_json(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_features JSONB := '[]'::jsonb;
    v_modules JSONB := public.restricted_enabled_modules_json();
    v_default_modules JSONB := public.default_enabled_modules_json();
    v_enabled_codes TEXT[] := ARRAY[]::TEXT[];
    v_module TEXT;
BEGIN
    IF p_plan_id IS NULL THEN
        RETURN v_modules;
    END IF;

    SELECT features
      INTO v_features
      FROM public.subscription_plans
     WHERE id = p_plan_id;

    IF NOT FOUND THEN
        RETURN v_modules;
    END IF;

    v_enabled_codes := public.normalize_plan_module_codes(v_features);

    IF COALESCE(array_length(v_enabled_codes, 1), 0) = 0 THEN
        RETURN v_modules;
    END IF;

    FOREACH v_module IN ARRAY v_enabled_codes
    LOOP
        IF v_default_modules ? v_module THEN
            v_modules := jsonb_set(v_modules, ARRAY[v_module], v_default_modules -> v_module);
        END IF;
    END LOOP;

    RETURN v_modules;
END;
$$;

UPDATE public.tenants
SET enabled_modules = public.plan_enabled_modules_json(plan_id);

-- 2) Prevent direct tenant-side edits of subscription-controlled tenant fields
CREATE OR REPLACE FUNCTION public.enforce_tenant_subscription_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_has_protected_change BOOLEAN := FALSE;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF current_setting('app.bypass_tenant_subscription_guard', true) = '1' THEN
        RETURN NEW;
    END IF;

    IF auth.role() = 'service_role' OR v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_has_protected_change :=
        NEW.plan_id IS DISTINCT FROM OLD.plan_id
        OR COALESCE(NEW.enabled_modules, '{}'::jsonb) IS DISTINCT FROM COALESCE(OLD.enabled_modules, '{}'::jsonb)
        OR COALESCE(NEW.subscription_status, '') IS DISTINCT FROM COALESCE(OLD.subscription_status, '')
        OR COALESCE(NEW.subscription_tier, '') IS DISTINCT FROM COALESCE(OLD.subscription_tier, '')
        OR COALESCE(NEW.billing_cycle, '') IS DISTINCT FROM COALESCE(OLD.billing_cycle, '')
        OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
        OR NEW.subscription_ends_at IS DISTINCT FROM OLD.subscription_ends_at
        OR COALESCE(NEW.is_active, TRUE) IS DISTINCT FROM COALESCE(OLD.is_active, TRUE);

    IF NOT v_has_protected_change THEN
        RETURN NEW;
    END IF;

    SELECT role
      INTO v_caller_role
      FROM public.profiles
     WHERE id = v_caller_id;

    IF v_caller_role IN ('platform_owner', 'platform_admin') THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Tenant subscription fields are managed by billing and platform workflows only';
END;
$$;

DROP TRIGGER IF EXISTS enforce_tenant_subscription_guard ON public.tenants;
CREATE TRIGGER enforce_tenant_subscription_guard
BEFORE UPDATE OF plan_id, enabled_modules, subscription_status, subscription_tier, billing_cycle, trial_ends_at, subscription_ends_at, is_active
ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.enforce_tenant_subscription_guard();

-- 3) Explicit inventory RLS with stricter write access
CREATE OR REPLACE FUNCTION public.can_view_inventory(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            public.is_platform_admin()
            OR p.tenant_id = p_tenant_id
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_inventory(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            public.is_platform_admin()
            OR (
                p.tenant_id = p_tenant_id
                AND p.role IN ('tenant_owner', 'tenant_admin', 'maintenance_manager')
            )
          )
    );
$$;

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_categories_select_secure" ON public.inventory_categories;
DROP POLICY IF EXISTS "inventory_categories_insert_secure" ON public.inventory_categories;
DROP POLICY IF EXISTS "inventory_categories_update_secure" ON public.inventory_categories;
DROP POLICY IF EXISTS "inventory_categories_delete_secure" ON public.inventory_categories;

CREATE POLICY "inventory_categories_select_secure"
ON public.inventory_categories
FOR SELECT
TO authenticated
USING (public.can_view_inventory(tenant_id));

CREATE POLICY "inventory_categories_insert_secure"
ON public.inventory_categories
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_categories_update_secure"
ON public.inventory_categories
FOR UPDATE
TO authenticated
USING (public.can_manage_inventory(tenant_id))
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_categories_delete_secure"
ON public.inventory_categories
FOR DELETE
TO authenticated
USING (public.can_manage_inventory(tenant_id));

DROP POLICY IF EXISTS "inventory_items_select_secure" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_insert_secure" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_update_secure" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_delete_secure" ON public.inventory_items;

CREATE POLICY "inventory_items_select_secure"
ON public.inventory_items
FOR SELECT
TO authenticated
USING (public.can_view_inventory(tenant_id));

CREATE POLICY "inventory_items_insert_secure"
ON public.inventory_items
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_items_update_secure"
ON public.inventory_items
FOR UPDATE
TO authenticated
USING (public.can_manage_inventory(tenant_id))
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_items_delete_secure"
ON public.inventory_items
FOR DELETE
TO authenticated
USING (public.can_manage_inventory(tenant_id));

DROP POLICY IF EXISTS "Tenant users can view transactions" ON public.inventory_transactions;
DROP POLICY IF EXISTS "Tenant users can create transactions" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_select_secure" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_insert_secure" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_update_secure" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_delete_secure" ON public.inventory_transactions;

CREATE POLICY "inventory_transactions_select_secure"
ON public.inventory_transactions
FOR SELECT
TO authenticated
USING (public.can_view_inventory(tenant_id));

CREATE POLICY "inventory_transactions_insert_secure"
ON public.inventory_transactions
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_transactions_update_secure"
ON public.inventory_transactions
FOR UPDATE
TO authenticated
USING (public.can_manage_inventory(tenant_id))
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_transactions_delete_secure"
ON public.inventory_transactions
FOR DELETE
TO authenticated
USING (public.can_manage_inventory(tenant_id));
