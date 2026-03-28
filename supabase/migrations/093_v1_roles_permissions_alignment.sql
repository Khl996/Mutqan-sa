-- ==============================================================================
-- Migration: 093_v1_roles_permissions_alignment.sql
-- Purpose:
--   1) Align active roles with the approved v1 model
--   2) Remove tenant_owner from operational authorization paths
--   3) Keep user as a transitional non-operational role only
--   4) Harden teams, facilities, assets, subscriptions, workflow RPCs, and tenant access
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Normalize legacy role data and enforce the active role set
-- ------------------------------------------------------------------------------

UPDATE public.profiles
SET role = 'tenant_admin',
    updated_at = NOW()
WHERE role = 'tenant_owner';

UPDATE public.profiles
SET role = 'reporter',
    updated_at = NOW()
WHERE role = 'user'
  AND tenant_id IS NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN (
    'platform_owner',
    'platform_admin',
    'platform_support',
    'platform_finance',
    'platform_hr',
    'tenant_admin',
    'facility_manager',
    'maintenance_manager',
    'supervisor',
    'engineer',
    'technician',
    'reporter',
    'user'
));

-- ------------------------------------------------------------------------------
-- 2) Helpers aligned with the approved v1 model
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_is_super BOOLEAN;
BEGIN
    SELECT role, is_super_admin
      INTO v_role, v_is_super
      FROM public.profiles
     WHERE id = auth.uid();

    RETURN COALESCE(v_is_super, FALSE)
        OR COALESCE(v_role, '') LIKE 'platform_%';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_platform_tenants()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_is_super BOOLEAN;
BEGIN
    SELECT role, is_super_admin
      INTO v_role, v_is_super
      FROM public.profiles
     WHERE id = auth.uid();

    RETURN COALESCE(v_is_super, FALSE)
        OR v_role IN ('platform_owner', 'platform_admin', 'platform_support');
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_facilities(p_tenant_id UUID)
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
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (
                p.tenant_id = p_tenant_id
                AND public.tenant_has_operational_access(p_tenant_id)
                AND p.role IN ('tenant_admin', 'facility_manager')
            )
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_assets_scope(p_tenant_id UUID)
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
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (
                p.tenant_id = p_tenant_id
                AND public.tenant_has_operational_access(p_tenant_id)
                AND p.role IN ('tenant_admin', 'facility_manager')
            )
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_work_teams(p_tenant_id UUID)
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
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (
                p.tenant_id = p_tenant_id
                AND public.tenant_has_operational_access(p_tenant_id)
                AND p.role IN ('tenant_admin', 'maintenance_manager')
            )
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_work_orders_scope(p_tenant_id UUID)
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
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (
                p.tenant_id = p_tenant_id
                AND public.tenant_has_operational_access(p_tenant_id)
                AND p.role IN ('tenant_admin', 'maintenance_manager')
            )
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
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (
                p.tenant_id = p_tenant_id
                AND public.tenant_has_operational_access(p_tenant_id)
                AND p.role IN ('tenant_admin', 'maintenance_manager')
            )
          )
    );
$$;

-- ------------------------------------------------------------------------------
-- 3) Profiles policy and trigger hardening
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Platform staff can view all profiles" ON public.profiles;

CREATE POLICY "Platform staff can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    public.is_platform_staff()
    OR id = auth.uid()
);

CREATE OR REPLACE FUNCTION public.enforce_profile_update_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_tenant UUID;
BEGIN
    IF current_setting('app.bypass_profile_guard', true) = '1' THEN
        RETURN NEW;
    END IF;

    IF auth.role() = 'service_role' OR v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT role, tenant_id
      INTO v_caller_role, v_caller_tenant
      FROM public.profiles
     WHERE id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    IF OLD.id = v_caller_id THEN
        IF NEW.role IS DISTINCT FROM OLD.role
            OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR COALESCE(NEW.is_super_admin, FALSE) IS DISTINCT FROM COALESCE(OLD.is_super_admin, FALSE)
            OR COALESCE(NEW.is_active, TRUE) IS DISTINCT FROM COALESCE(OLD.is_active, TRUE)
            OR COALESCE(NEW.email, '') IS DISTINCT FROM COALESCE(OLD.email, '')
        THEN
            RAISE EXCEPTION 'You are not allowed to modify protected profile fields directly';
        END IF;

        RETURN NEW;
    END IF;

    IF v_caller_role IN ('platform_owner', 'platform_admin') THEN
        IF OLD.role = 'platform_owner' OR NEW.role = 'platform_owner' THEN
            RAISE EXCEPTION 'Platform owner accounts cannot be changed through direct client updates';
        END IF;

        IF v_caller_role = 'platform_admin'
            AND NEW.role = 'platform_admin'
            AND OLD.role IS DISTINCT FROM 'platform_admin'
        THEN
            RAISE EXCEPTION 'Only platform owners can assign platform_admin';
        END IF;

        RETURN NEW;
    END IF;

    IF v_caller_role = 'tenant_admin' THEN
        IF OLD.tenant_id IS DISTINCT FROM v_caller_tenant OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
            RAISE EXCEPTION 'You can only manage profiles inside your own organization';
        END IF;

        IF COALESCE(NEW.email, '') IS DISTINCT FROM COALESCE(OLD.email, '')
            OR COALESCE(NEW.is_super_admin, FALSE) IS DISTINCT FROM COALESCE(OLD.is_super_admin, FALSE)
        THEN
            RAISE EXCEPTION 'You are not allowed to change protected identity fields';
        END IF;

        IF OLD.role LIKE 'platform_%' OR NEW.role LIKE 'platform_%' THEN
            RAISE EXCEPTION 'Tenant administrators cannot assign platform roles';
        END IF;

        IF NEW.role NOT IN (
            'tenant_admin',
            'facility_manager',
            'maintenance_manager',
            'supervisor',
            'engineer',
            'technician',
            'reporter'
        ) THEN
            RAISE EXCEPTION 'Invalid tenant-scoped role assignment';
        END IF;

        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'You are not allowed to update this profile';
END;
$$;

-- ------------------------------------------------------------------------------
-- 4) Subscription activation, tenants, and tenant access tokens
-- ------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.activate_subscription_after_payment FROM authenticated;

CREATE OR REPLACE FUNCTION public.activate_subscription_after_payment(
    p_tenant_id UUID,
    p_plan_id UUID,
    p_billing_cycle VARCHAR DEFAULT 'yearly',
    p_amount DECIMAL DEFAULT 0,
    p_currency VARCHAR DEFAULT 'SAR',
    p_payment_reference VARCHAR DEFAULT NULL,
    p_plan_name VARCHAR DEFAULT 'Subscription'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_end_date TIMESTAMPTZ;
    v_invoice_number VARCHAR;
    v_result JSONB;
    v_caller_role TEXT;
    v_existing_ref INT;
BEGIN
    IF auth.uid() IS NOT NULL THEN
        SELECT role
          INTO v_caller_role
          FROM public.profiles
         WHERE id = auth.uid()
           AND (
               role IN ('platform_owner', 'platform_admin')
               OR (role = 'tenant_admin' AND tenant_id = p_tenant_id)
           );

        IF v_caller_role IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized: You do not have permission to activate this subscription'
            );
        END IF;
    END IF;

    IF p_payment_reference IS NOT NULL AND p_payment_reference <> '' THEN
        SELECT COUNT(*)
          INTO v_existing_ref
          FROM public.platform_invoices
         WHERE payment_reference = p_payment_reference
           AND status = 'paid';

        IF v_existing_ref > 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'This payment reference has already been processed',
                'duplicate', true
            );
        END IF;
    END IF;

    IF p_billing_cycle = 'yearly' THEN
        v_end_date := NOW() + INTERVAL '1 year';
    ELSE
        v_end_date := NOW() + INTERVAL '1 month';
    END IF;

    v_invoice_number := 'INV-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 5));

    INSERT INTO public.tenant_subscriptions (
        tenant_id,
        plan_id,
        status,
        billing_cycle,
        current_period_start,
        current_period_end,
        amount,
        currency,
        cancel_at_period_end,
        updated_at
    ) VALUES (
        p_tenant_id,
        p_plan_id,
        'active',
        p_billing_cycle,
        NOW(),
        v_end_date,
        p_amount,
        p_currency,
        false,
        NOW()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = 'active',
        billing_cycle = EXCLUDED.billing_cycle,
        current_period_start = NOW(),
        current_period_end = v_end_date,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        cancel_at_period_end = false,
        updated_at = NOW();

    UPDATE public.tenants
    SET subscription_status = 'active',
        subscription_ends_at = v_end_date,
        plan_id = p_plan_id,
        updated_at = NOW()
    WHERE id = p_tenant_id;

    BEGIN
        INSERT INTO public.platform_invoices (
            invoice_number,
            tenant_id,
            plan_id,
            plan_name,
            subtotal,
            total,
            currency,
            status,
            payment_method,
            payment_reference,
            paid_at,
            due_date,
            billing_period_start,
            billing_period_end
        ) VALUES (
            v_invoice_number,
            p_tenant_id,
            p_plan_id,
            p_plan_name,
            p_amount,
            p_amount,
            p_currency,
            'paid',
            'tap',
            p_payment_reference,
            NOW(),
            CURRENT_DATE,
            CURRENT_DATE,
            v_end_date::DATE
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Invoice logging failed: %', SQLERRM;
    END;

    v_result := jsonb_build_object(
        'success', true,
        'plan_id', p_plan_id,
        'billing_cycle', p_billing_cycle,
        'period_end', v_end_date
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_subscription_after_payment TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_subscription_after_payment TO authenticated;

DROP POLICY IF EXISTS "tenants_select_secure" ON public.tenants;
DROP POLICY IF EXISTS "tenants_insert_secure" ON public.tenants;
DROP POLICY IF EXISTS "tenants_update_secure" ON public.tenants;
DROP POLICY IF EXISTS "tenants_delete_secure" ON public.tenants;

CREATE POLICY "tenants_select_secure"
ON public.tenants
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.tenant_id = tenants.id
    )
    OR public.can_view_platform_tenants()
);

CREATE POLICY "tenants_insert_secure"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (public.is_platform_admin());

CREATE POLICY "tenants_update_secure"
ON public.tenants
FOR UPDATE
TO authenticated
USING (
    public.is_platform_admin()
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.tenant_id = tenants.id
          AND p.role = 'tenant_admin'
    )
)
WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.tenant_id = tenants.id
          AND p.role = 'tenant_admin'
    )
);

CREATE POLICY "tenants_delete_secure"
ON public.tenants
FOR DELETE
TO authenticated
USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage tokens" ON public.tenant_access_tokens;

CREATE POLICY "Admins can manage tokens"
ON public.tenant_access_tokens
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (p.tenant_id = tenant_access_tokens.tenant_id AND p.role = 'tenant_admin')
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (p.tenant_id = tenant_access_tokens.tenant_id AND p.role = 'tenant_admin')
          )
    )
);

-- ------------------------------------------------------------------------------
-- 5) Facilities and asset authorization alignment
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "buildings_select_tenant" ON public.buildings;
DROP POLICY IF EXISTS "buildings_insert_admin" ON public.buildings;
DROP POLICY IF EXISTS "buildings_update_admin" ON public.buildings;
DROP POLICY IF EXISTS "buildings_delete_admin" ON public.buildings;

CREATE POLICY "buildings_select_tenant"
ON public.buildings
FOR SELECT
TO authenticated
USING (
    tenant_id = public.get_user_tenant_id()
    OR public.is_platform_admin()
);

CREATE POLICY "buildings_insert_admin"
ON public.buildings
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_facilities(tenant_id));

CREATE POLICY "buildings_update_admin"
ON public.buildings
FOR UPDATE
TO authenticated
USING (public.can_manage_facilities(tenant_id))
WITH CHECK (public.can_manage_facilities(tenant_id));

CREATE POLICY "buildings_delete_admin"
ON public.buildings
FOR DELETE
TO authenticated
USING (public.can_manage_facilities(tenant_id));

DROP POLICY IF EXISTS "floors_select_tenant" ON public.floors;
DROP POLICY IF EXISTS "floors_insert_admin" ON public.floors;
DROP POLICY IF EXISTS "floors_update_admin" ON public.floors;
DROP POLICY IF EXISTS "floors_delete_admin" ON public.floors;

CREATE POLICY "floors_select_tenant"
ON public.floors
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.buildings b
        WHERE b.id = floors.building_id
          AND (b.tenant_id = public.get_user_tenant_id() OR public.is_platform_admin())
    )
);

CREATE POLICY "floors_insert_admin"
ON public.floors
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.buildings b
        WHERE b.id = floors.building_id
          AND public.can_manage_facilities(b.tenant_id)
    )
);

CREATE POLICY "floors_update_admin"
ON public.floors
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.buildings b
        WHERE b.id = floors.building_id
          AND public.can_manage_facilities(b.tenant_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.buildings b
        WHERE b.id = floors.building_id
          AND public.can_manage_facilities(b.tenant_id)
    )
);

CREATE POLICY "floors_delete_admin"
ON public.floors
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.buildings b
        WHERE b.id = floors.building_id
          AND public.can_manage_facilities(b.tenant_id)
    )
);

DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;
CREATE POLICY "Admins can manage departments"
ON public.departments
FOR ALL
TO authenticated
USING (public.can_manage_facilities(tenant_id))
WITH CHECK (public.can_manage_facilities(tenant_id));

DROP POLICY IF EXISTS "Platform admins can view departments" ON public.departments;
CREATE POLICY "Platform admins can view departments"
ON public.departments
FOR SELECT
TO authenticated
USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage rooms" ON public.rooms;
CREATE POLICY "Admins can manage rooms"
ON public.rooms
FOR ALL
TO authenticated
USING (public.can_manage_facilities(tenant_id))
WITH CHECK (public.can_manage_facilities(tenant_id));

DROP POLICY IF EXISTS "Platform admins can view rooms" ON public.rooms;
CREATE POLICY "Platform admins can view rooms"
ON public.rooms
FOR SELECT
TO authenticated
USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Admins can manage assets" ON public.assets;
CREATE POLICY "Admins can manage assets"
ON public.assets
FOR ALL
TO authenticated
USING (public.can_manage_assets_scope(tenant_id))
WITH CHECK (public.can_manage_assets_scope(tenant_id));

DROP POLICY IF EXISTS "Platform admins can view assets" ON public.assets;
CREATE POLICY "Platform admins can view assets"
ON public.assets
FOR SELECT
TO authenticated
USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can view asset activity logs" ON public.asset_activity_logs;
CREATE POLICY "Platform admins can view asset activity logs"
ON public.asset_activity_logs
FOR SELECT
TO authenticated
USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage asset categories" ON public.asset_categories;
CREATE POLICY "Platform admins can manage asset categories"
ON public.asset_categories
FOR ALL
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage issue types" ON public.issue_types;
CREATE POLICY "Platform admins can manage issue types"
ON public.issue_types
FOR ALL
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- ------------------------------------------------------------------------------
-- 6) Teams and work teams are operational only
-- ------------------------------------------------------------------------------

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_select_policy" ON public.teams;
DROP POLICY IF EXISTS "teams_insert_policy" ON public.teams;
DROP POLICY IF EXISTS "teams_update_policy" ON public.teams;
DROP POLICY IF EXISTS "teams_delete_policy" ON public.teams;

CREATE POLICY "teams_select_policy"
ON public.teams
FOR SELECT
TO authenticated
USING (
    tenant_id = public.get_user_tenant_id()
    OR public.is_platform_admin()
);

CREATE POLICY "teams_insert_policy"
ON public.teams
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_work_teams(tenant_id));

CREATE POLICY "teams_update_policy"
ON public.teams
FOR UPDATE
TO authenticated
USING (public.can_manage_work_teams(tenant_id))
WITH CHECK (public.can_manage_work_teams(tenant_id));

CREATE POLICY "teams_delete_policy"
ON public.teams
FOR DELETE
TO authenticated
USING (public.can_manage_work_teams(tenant_id));

DROP POLICY IF EXISTS "team_members_select_policy" ON public.team_members;
DROP POLICY IF EXISTS "team_members_insert_policy" ON public.team_members;
DROP POLICY IF EXISTS "team_members_update_policy" ON public.team_members;
DROP POLICY IF EXISTS "team_members_delete_policy" ON public.team_members;

CREATE POLICY "team_members_select_policy"
ON public.team_members
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE t.id = team_members.team_id
          AND (t.tenant_id = public.get_user_tenant_id() OR public.is_platform_admin())
    )
);

CREATE POLICY "team_members_insert_policy"
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.teams t
        JOIN public.profiles p
          ON p.id = team_members.user_id
        WHERE t.id = team_members.team_id
          AND p.tenant_id = t.tenant_id
          AND public.can_manage_work_teams(t.tenant_id)
    )
);

CREATE POLICY "team_members_update_policy"
ON public.team_members
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE t.id = team_members.team_id
          AND public.can_manage_work_teams(t.tenant_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.teams t
        JOIN public.profiles p
          ON p.id = team_members.user_id
        WHERE t.id = team_members.team_id
          AND p.tenant_id = t.tenant_id
          AND public.can_manage_work_teams(t.tenant_id)
    )
);

CREATE POLICY "team_members_delete_policy"
ON public.team_members
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE t.id = team_members.team_id
          AND public.can_manage_work_teams(t.tenant_id)
    )
);

-- ------------------------------------------------------------------------------
-- 7) Inventory and maintenance alignment
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Platform admins can manage maintenance plans" ON public.maintenance_plans;
CREATE POLICY "Platform admins can manage maintenance plans"
ON public.maintenance_plans
FOR ALL
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can manage maintenance tasks" ON public.maintenance_tasks;
CREATE POLICY "Platform admins can manage maintenance tasks"
ON public.maintenance_tasks
FOR ALL
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- ------------------------------------------------------------------------------
-- 8) Work order table access alignment
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Managers can manage work orders" ON public.work_orders;
CREATE POLICY "Managers can manage work orders"
ON public.work_orders
FOR UPDATE
TO authenticated
USING (public.can_manage_work_orders_scope(tenant_id))
WITH CHECK (public.can_manage_work_orders_scope(tenant_id));

DROP POLICY IF EXISTS "Managers can delete work orders" ON public.work_orders;
CREATE POLICY "Managers can delete work orders"
ON public.work_orders
FOR DELETE
TO authenticated
USING (public.can_manage_work_orders_scope(tenant_id));

DROP POLICY IF EXISTS "Platform admins can view work orders" ON public.work_orders;
CREATE POLICY "Platform admins can view work orders"
ON public.work_orders
FOR SELECT
TO authenticated
USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can create work orders" ON public.work_orders;
CREATE POLICY "Platform admins can create work orders"
ON public.work_orders
FOR INSERT
TO authenticated
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can view operation logs" ON public.operation_logs;
CREATE POLICY "Platform admins can view operation logs"
ON public.operation_logs
FOR SELECT
TO authenticated
USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins can create operation logs" ON public.operation_logs;
CREATE POLICY "Platform admins can create operation logs"
ON public.operation_logs
FOR INSERT
TO authenticated
WITH CHECK (public.is_platform_admin());

-- ------------------------------------------------------------------------------
-- 9) Secure workflow RPCs aligned to the approved role model
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.start_work_order(UUID, UUID);
DROP FUNCTION IF EXISTS public.start_work_order(UUID);

CREATE OR REPLACE FUNCTION public.start_work_order(p_work_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor_role TEXT;
    v_actor_tenant UUID;
    v_is_super BOOLEAN := FALSE;
    v_tenant_id UUID;
    v_old_status TEXT;
    v_assigned_to UUID;
    v_is_platform_override BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, assigned_to
      INTO v_tenant_id, v_old_status, v_assigned_to
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin',
        'maintenance_manager',
        'engineer',
        'technician',
        'platform_owner',
        'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: you are not allowed to start this work order';
    END IF;

    IF v_old_status NOT IN ('pending', 'assigned') THEN
        RAISE EXCEPTION 'Cannot start work order in status: %', v_old_status;
    END IF;

    IF NOT v_is_management_override
       AND v_assigned_to IS NOT NULL
       AND v_assigned_to <> v_actor_id
    THEN
        RAISE EXCEPTION 'Only the assigned technician can start this work order';
    END IF;

    UPDATE public.work_orders
    SET status = 'in_progress',
        start_time = NOW(),
        assigned_to = COALESCE(v_assigned_to, v_actor_id),
        updated_at = NOW()
    WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id,
        p_work_order_id,
        'maintenance',
        'Work started',
        v_actor_id
    );
END;
$$;

DROP FUNCTION IF EXISTS public.complete_work_order_technician(UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.complete_work_order_technician(UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.complete_work_order_technician(
    p_work_order_id UUID,
    p_technician_notes TEXT DEFAULT '',
    p_parts JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor_role TEXT;
    v_actor_tenant UUID;
    v_is_super BOOLEAN := FALSE;
    v_tenant_id UUID;
    v_old_status TEXT;
    v_assigned_to UUID;
    v_tenant_settings JSONB;
    v_require_supervisor BOOLEAN;
    v_require_engineer BOOLEAN;
    v_next_status TEXT;
    v_is_platform_override BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
    v_part JSONB;
    v_part_id UUID;
    v_part_quantity DECIMAL;
    v_item_cost DECIMAL;
    v_item_name VARCHAR;
    v_available_qty DECIMAL;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, assigned_to
      INTO v_tenant_id, v_old_status, v_assigned_to
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin',
        'maintenance_manager',
        'engineer',
        'technician',
        'platform_owner',
        'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: you are not allowed to complete this work order';
    END IF;

    IF v_old_status <> 'in_progress' THEN
        RAISE EXCEPTION 'Cannot complete work order in status: %', v_old_status;
    END IF;

    IF NOT v_is_management_override AND v_assigned_to IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the assigned technician can complete this work order';
    END IF;

    SELECT settings
      INTO v_tenant_settings
      FROM public.tenants
     WHERE id = v_tenant_id;

    v_require_supervisor := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_supervisor_approval')::BOOLEAN,
        TRUE
    );
    v_require_engineer := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_engineer_review')::BOOLEAN,
        TRUE
    );

    IF v_require_supervisor THEN
        v_next_status := 'pending_supervisor_approval';
    ELSIF v_require_engineer THEN
        v_next_status := 'pending_engineer_review';
    ELSE
        v_next_status := 'pending_reporter_closure';
    END IF;

    UPDATE public.work_orders
    SET status = v_next_status,
        technician_notes = p_technician_notes,
        technician_completed_at = NOW(),
        end_time = NOW(),
        updated_at = NOW()
    WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id,
        p_work_order_id,
        'maintenance',
        'Work completed by technician. Next status: ' || v_next_status,
        v_actor_id
    );

    IF p_parts IS NOT NULL AND jsonb_typeof(p_parts) = 'array' AND jsonb_array_length(p_parts) > 0 THEN
        FOR v_part IN SELECT * FROM jsonb_array_elements(p_parts)
        LOOP
            v_part_id := (v_part->>'part_id')::UUID;
            v_part_quantity := (v_part->>'quantity')::DECIMAL;

            IF v_part_id IS NULL OR COALESCE(v_part_quantity, 0) <= 0 THEN
                RAISE EXCEPTION 'Invalid part usage payload';
            END IF;

            SELECT unit_cost, name, quantity
              INTO v_item_cost, v_item_name, v_available_qty
              FROM public.inventory_items
             WHERE id = v_part_id
               AND tenant_id = v_tenant_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Part % not found or does not belong to this tenant', v_part_id;
            END IF;

            IF v_available_qty < v_part_quantity THEN
                RAISE EXCEPTION 'Insufficient stock for part "%": available=%, requested=%',
                    v_item_name, v_available_qty, v_part_quantity;
            END IF;

            INSERT INTO public.work_order_parts (
                tenant_id,
                work_order_id,
                part_id,
                quantity,
                unit_cost,
                created_by
            ) VALUES (
                v_tenant_id,
                p_work_order_id,
                v_part_id,
                v_part_quantity,
                COALESCE(v_item_cost, 0),
                v_actor_id
            );

            UPDATE public.inventory_items
            SET quantity = quantity - v_part_quantity
            WHERE id = v_part_id;

            PERFORM public.create_operation_log(
                v_tenant_id,
                p_work_order_id,
                'maintenance',
                'Used part: ' || COALESCE(v_item_name, 'Unknown') || ' (Qty: ' || v_part_quantity || ')',
                v_actor_id
            );
        END LOOP;
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.approve_work_order_supervisor(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.approve_work_order_supervisor(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.approve_work_order_supervisor(
    p_work_order_id UUID,
    p_notes TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor_role TEXT;
    v_actor_tenant UUID;
    v_is_super BOOLEAN := FALSE;
    v_tenant_id UUID;
    v_old_status TEXT;
    v_tenant_settings JSONB;
    v_require_engineer BOOLEAN;
    v_next_status TEXT;
    v_is_platform_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status
      INTO v_tenant_id, v_old_status
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin',
        'maintenance_manager',
        'supervisor',
        'platform_owner',
        'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: only supervisors or managers can approve';
    END IF;

    IF v_old_status <> 'pending_supervisor_approval' THEN
        RAISE EXCEPTION 'Cannot approve work order in status: %', v_old_status;
    END IF;

    SELECT settings
      INTO v_tenant_settings
      FROM public.tenants
     WHERE id = v_tenant_id;

    v_require_engineer := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_engineer_review')::BOOLEAN,
        TRUE
    );

    IF v_require_engineer THEN
        v_next_status := 'pending_engineer_review';
    ELSE
        v_next_status := 'pending_reporter_closure';
    END IF;

    UPDATE public.work_orders
    SET status = v_next_status,
        supervisor_notes = p_notes,
        supervisor_approved_by = v_actor_id,
        supervisor_approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id,
        p_work_order_id,
        'maintenance',
        'Approved by supervisor. Next status: ' || v_next_status,
        v_actor_id
    );
END;
$$;

DROP FUNCTION IF EXISTS public.approve_work_order_engineer(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.approve_work_order_engineer(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.approve_work_order_engineer(
    p_work_order_id UUID,
    p_notes TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor_role TEXT;
    v_actor_tenant UUID;
    v_is_super BOOLEAN := FALSE;
    v_tenant_id UUID;
    v_old_status TEXT;
    v_is_platform_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status
      INTO v_tenant_id, v_old_status
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin',
        'maintenance_manager',
        'engineer',
        'platform_owner',
        'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: only engineers or managers can review';
    END IF;

    IF v_old_status <> 'pending_engineer_review' THEN
        RAISE EXCEPTION 'Cannot review work order in status: %', v_old_status;
    END IF;

    UPDATE public.work_orders
    SET status = 'pending_reporter_closure',
        engineer_notes = p_notes,
        engineer_approved_by = v_actor_id,
        engineer_approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id,
        p_work_order_id,
        'maintenance',
        'Approved by engineer',
        v_actor_id
    );
END;
$$;

DROP FUNCTION IF EXISTS public.close_work_order(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.close_work_order(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.close_work_order(
    p_work_order_id UUID,
    p_notes TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor_role TEXT;
    v_actor_tenant UUID;
    v_is_super BOOLEAN := FALSE;
    v_tenant_id UUID;
    v_old_status TEXT;
    v_reported_by UUID;
    v_is_platform_override BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, reported_by
      INTO v_tenant_id, v_old_status, v_reported_by
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF NOT v_is_management_override AND v_reported_by IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the original reporter can close this work order';
    END IF;

    IF v_old_status <> 'pending_reporter_closure' THEN
        RAISE EXCEPTION 'Cannot close work order in status: %', v_old_status;
    END IF;

    UPDATE public.work_orders
    SET status = 'completed',
        completed_at = NOW(),
        customer_reviewed_by = v_actor_id,
        customer_reviewed_at = NOW(),
        reporter_notes = p_notes,
        updated_at = NOW()
    WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id,
        p_work_order_id,
        'maintenance',
        'Work order closed',
        v_actor_id
    );
END;
$$;

DROP FUNCTION IF EXISTS public.reject_work_order(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.reject_work_order(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.reject_work_order(
    p_work_order_id UUID,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor_role TEXT;
    v_actor_tenant UUID;
    v_is_super BOOLEAN := FALSE;
    v_tenant_id UUID;
    v_old_status TEXT;
    v_assigned_to UUID;
    v_reported_by UUID;
    v_is_platform_override BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF COALESCE(BTRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Rejection reason is required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, assigned_to, reported_by
      INTO v_tenant_id, v_old_status, v_assigned_to, v_reported_by
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    CASE v_old_status
        WHEN 'assigned' THEN
            IF v_actor_role NOT IN (
                'tenant_admin',
                'maintenance_manager',
                'engineer',
                'technician',
                'platform_owner',
                'platform_admin'
            ) AND NOT v_is_super THEN
                RAISE EXCEPTION 'Unauthorized: only assigned technicians, engineers, or managers can reject this assignment';
            END IF;

            IF NOT v_is_management_override AND v_assigned_to IS DISTINCT FROM v_actor_id THEN
                RAISE EXCEPTION 'Only the assigned technician can reject this assignment';
            END IF;

            UPDATE public.work_orders
            SET status = 'pending',
                assigned_to = NULL,
                start_time = NULL,
                updated_at = NOW()
            WHERE id = p_work_order_id;

        WHEN 'pending_supervisor_approval' THEN
            IF v_actor_role NOT IN (
                'tenant_admin',
                'maintenance_manager',
                'supervisor',
                'platform_owner',
                'platform_admin'
            ) AND NOT v_is_super THEN
                RAISE EXCEPTION 'Unauthorized: only supervisors or managers can reject at this stage';
            END IF;

            UPDATE public.work_orders
            SET status = 'in_progress',
                updated_at = NOW()
            WHERE id = p_work_order_id;

        WHEN 'pending_engineer_review' THEN
            IF v_actor_role NOT IN (
                'tenant_admin',
                'maintenance_manager',
                'engineer',
                'platform_owner',
                'platform_admin'
            ) AND NOT v_is_super THEN
                RAISE EXCEPTION 'Unauthorized: only engineers or managers can reject at this stage';
            END IF;

            UPDATE public.work_orders
            SET status = 'in_progress',
                updated_at = NOW()
            WHERE id = p_work_order_id;

        WHEN 'pending_reporter_closure' THEN
            IF NOT v_is_management_override AND v_reported_by IS DISTINCT FROM v_actor_id THEN
                RAISE EXCEPTION 'Only the original reporter can reject closure for this work order';
            END IF;

            UPDATE public.work_orders
            SET status = 'in_progress',
                updated_at = NOW()
            WHERE id = p_work_order_id;

        ELSE
            RAISE EXCEPTION 'Cannot reject work order in status: %', v_old_status;
    END CASE;

    PERFORM public.create_operation_log(
        v_tenant_id,
        p_work_order_id,
        'maintenance',
        'Workflow rejected/returned. Reason: ' || p_reason,
        v_actor_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_work_order(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_work_order_technician(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_work_order_supervisor(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_work_order_engineer(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_work_order(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_work_order(UUID, TEXT) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.start_work_order(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_work_order_technician(UUID, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_work_order_supervisor(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_work_order_engineer(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_work_order(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_work_order(UUID, TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.start_work_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_work_order_technician(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_work_order_supervisor(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_work_order_engineer(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_work_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_work_order(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.start_work_order(UUID) IS
'Aligned with v1 roles: auth.uid actor only, no manager legacy role, tenant-safe start.';
COMMENT ON FUNCTION public.complete_work_order_technician(UUID, TEXT, JSONB) IS
'Aligned with v1 roles: auth.uid actor only, approved technician/engineer/admin completion path.';
COMMENT ON FUNCTION public.approve_work_order_supervisor(UUID, TEXT) IS
'Aligned with v1 roles: supervisor approval uses approved roles only.';
COMMENT ON FUNCTION public.approve_work_order_engineer(UUID, TEXT) IS
'Aligned with v1 roles: engineer review uses approved roles only.';
COMMENT ON FUNCTION public.close_work_order(UUID, TEXT) IS
'Aligned with v1 roles: only original reporter or management override can close.';
COMMENT ON FUNCTION public.reject_work_order(UUID, TEXT) IS
'Aligned with v1 roles: rejection path varies by current workflow stage and approved actor.';
