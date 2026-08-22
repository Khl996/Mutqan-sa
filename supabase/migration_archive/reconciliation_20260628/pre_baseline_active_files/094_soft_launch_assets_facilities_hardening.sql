-- ==============================================================================
-- Migration: 094_soft_launch_assets_facilities_hardening.sql
-- Purpose:
--   1) Harden early-launch facilities/assets/work-orders scope
--   2) Unify asset status update + activity logging in a single atomic RPC
--   3) Remove overlapping legacy RLS policies in this flow
--   4) Enforce basic building/floor/asset consistency for assets and work orders
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.can_create_work_orders_scope(p_tenant_id UUID)
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
                AND p.role IN ('tenant_admin', 'facility_manager', 'maintenance_manager', 'supervisor', 'engineer', 'reporter')
            )
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.facility_location_is_valid(
    p_tenant_id UUID,
    p_building_id UUID,
    p_floor_id UUID,
    p_room_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        p_tenant_id IS NOT NULL
        AND (
            p_building_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.buildings b
                WHERE b.id = p_building_id
                  AND b.tenant_id = p_tenant_id
            )
        )
        AND (
            p_floor_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.floors f
                JOIN public.buildings b
                  ON b.id = f.building_id
                WHERE f.id = p_floor_id
                  AND b.tenant_id = p_tenant_id
                  AND (p_building_id IS NULL OR f.building_id = p_building_id)
            )
        )
        AND (
            p_room_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.rooms r
                WHERE r.id = p_room_id
                  AND r.tenant_id = p_tenant_id
                  AND (p_building_id IS NULL OR r.building_id = p_building_id)
                  AND (p_floor_id IS NULL OR r.floor_id = p_floor_id)
            )
        );
$$;

CREATE OR REPLACE FUNCTION public.work_order_asset_location_is_valid(
    p_tenant_id UUID,
    p_building_id UUID,
    p_floor_id UUID,
    p_room_id UUID,
    p_asset_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        public.facility_location_is_valid(
            p_tenant_id,
            p_building_id,
            p_floor_id,
            p_room_id
        )
        AND (
            p_asset_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.assets a
                WHERE a.id = p_asset_id
                  AND a.tenant_id = p_tenant_id
                  AND (p_building_id IS NULL OR a.building_id = p_building_id)
                  AND (p_floor_id IS NULL OR a.floor_id = p_floor_id)
                  AND (p_room_id IS NULL OR a.room_id = p_room_id)
            )
        );
$$;

DROP FUNCTION IF EXISTS public.update_asset_status_with_log(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_asset_status_with_log(
    p_asset_id UUID,
    p_new_status TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_asset public.assets%ROWTYPE;
    v_old_status TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_new_status IS NULL OR p_new_status NOT IN ('operational', 'under_maintenance', 'out_of_service', 'retired') THEN
        RAISE EXCEPTION 'Invalid asset status';
    END IF;

    SELECT *
      INTO v_asset
      FROM public.assets
     WHERE id = p_asset_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found';
    END IF;

    IF NOT public.can_manage_assets_scope(v_asset.tenant_id) THEN
        RAISE EXCEPTION 'Insufficient permissions to update asset status';
    END IF;

    v_old_status := v_asset.status;

    IF v_old_status = p_new_status THEN
        RETURN v_asset;
    END IF;

    UPDATE public.assets
       SET status = p_new_status,
           updated_at = now()
     WHERE id = p_asset_id
     RETURNING * INTO v_asset;

    INSERT INTO public.asset_activity_logs (
        tenant_id,
        asset_id,
        performed_by,
        action_type,
        previous_status,
        new_status,
        notes
    ) VALUES (
        v_asset.tenant_id,
        v_asset.id,
        v_actor_id,
        'status_change',
        v_old_status,
        p_new_status,
        NULLIF(BTRIM(p_notes), '')
    );

    RETURN v_asset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_asset_status_with_log(UUID, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- buildings / floors
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow all actions for authenticated users on buildings" ON public.buildings;
DROP POLICY IF EXISTS "Users can view buildings in their tenant" ON public.buildings;
DROP POLICY IF EXISTS "Admins can manage buildings" ON public.buildings;
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

DROP POLICY IF EXISTS "Allow all actions for authenticated users on floors" ON public.floors;
DROP POLICY IF EXISTS "Users can view floors in their tenant" ON public.floors;
DROP POLICY IF EXISTS "Admins can manage floors" ON public.floors;
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

-- ------------------------------------------------------------------------------
-- assets / asset logs
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view assets in their tenant" ON public.assets;
DROP POLICY IF EXISTS "Users can view assets of same tenant" ON public.assets;
DROP POLICY IF EXISTS "View assets of same tenant" ON public.assets;
DROP POLICY IF EXISTS "Admins can manage assets" ON public.assets;
DROP POLICY IF EXISTS "Platform admins can view assets" ON public.assets;
DROP POLICY IF EXISTS "assets_select_tenant" ON public.assets;
DROP POLICY IF EXISTS "assets_insert_scoped" ON public.assets;
DROP POLICY IF EXISTS "assets_update_scoped" ON public.assets;
DROP POLICY IF EXISTS "assets_delete_scoped" ON public.assets;

CREATE POLICY "assets_select_tenant"
ON public.assets
FOR SELECT
TO authenticated
USING (
    tenant_id = public.get_user_tenant_id()
    OR public.is_platform_admin()
);

CREATE POLICY "assets_insert_scoped"
ON public.assets
FOR INSERT
TO authenticated
WITH CHECK (
    public.can_manage_assets_scope(tenant_id)
    AND public.facility_location_is_valid(tenant_id, building_id, floor_id, room_id)
);

CREATE POLICY "assets_update_scoped"
ON public.assets
FOR UPDATE
TO authenticated
USING (public.can_manage_assets_scope(tenant_id))
WITH CHECK (
    public.can_manage_assets_scope(tenant_id)
    AND public.facility_location_is_valid(tenant_id, building_id, floor_id, room_id)
);

CREATE POLICY "assets_delete_scoped"
ON public.assets
FOR DELETE
TO authenticated
USING (public.can_manage_assets_scope(tenant_id));

DROP POLICY IF EXISTS "Users can view asset logs of their tenant" ON public.asset_activity_logs;
DROP POLICY IF EXISTS "View asset logs of same tenant" ON public.asset_activity_logs;
DROP POLICY IF EXISTS "Users can insert asset logs for their tenant" ON public.asset_activity_logs;
DROP POLICY IF EXISTS "Platform admins can view asset activity logs" ON public.asset_activity_logs;
DROP POLICY IF EXISTS "asset_activity_logs_select_scoped" ON public.asset_activity_logs;
DROP POLICY IF EXISTS "asset_activity_logs_insert_scoped" ON public.asset_activity_logs;

CREATE POLICY "asset_activity_logs_select_scoped"
ON public.asset_activity_logs
FOR SELECT
TO authenticated
USING (
    tenant_id = public.get_user_tenant_id()
    OR public.is_platform_admin()
);

CREATE POLICY "asset_activity_logs_insert_scoped"
ON public.asset_activity_logs
FOR INSERT
TO authenticated
WITH CHECK (
    public.can_manage_assets_scope(tenant_id)
    AND EXISTS (
        SELECT 1
        FROM public.assets a
        WHERE a.id = asset_activity_logs.asset_id
          AND a.tenant_id = asset_activity_logs.tenant_id
    )
);

-- ------------------------------------------------------------------------------
-- work orders / operation logs
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view work orders in their tenant" ON public.work_orders;
DROP POLICY IF EXISTS "Users can create work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Users can update assigned work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Admins can delete work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Managers can manage work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Managers can delete work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Platform admins can view work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Platform admins can create work orders" ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_select_scoped" ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_insert_scoped" ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_update_scoped" ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_delete_scoped" ON public.work_orders;

CREATE POLICY "work_orders_select_scoped"
ON public.work_orders
FOR SELECT
TO authenticated
USING (
    tenant_id = public.get_user_tenant_id()
    OR public.is_platform_admin()
);

CREATE POLICY "work_orders_insert_scoped"
ON public.work_orders
FOR INSERT
TO authenticated
WITH CHECK (
    public.can_create_work_orders_scope(tenant_id)
    AND public.work_order_asset_location_is_valid(tenant_id, building_id, floor_id, room_id, asset_id)
);

CREATE POLICY "work_orders_update_scoped"
ON public.work_orders
FOR UPDATE
TO authenticated
USING (public.can_manage_work_orders_scope(tenant_id))
WITH CHECK (
    public.can_manage_work_orders_scope(tenant_id)
    AND public.work_order_asset_location_is_valid(tenant_id, building_id, floor_id, room_id, asset_id)
);

CREATE POLICY "work_orders_delete_scoped"
ON public.work_orders
FOR DELETE
TO authenticated
USING (public.can_manage_work_orders_scope(tenant_id));

DROP POLICY IF EXISTS "Users can view operation logs in their tenant" ON public.operation_logs;
DROP POLICY IF EXISTS "Users can create operation logs" ON public.operation_logs;
DROP POLICY IF EXISTS "Platform admins can view operation logs" ON public.operation_logs;
DROP POLICY IF EXISTS "Platform admins can create operation logs" ON public.operation_logs;
DROP POLICY IF EXISTS "operation_logs_select_scoped" ON public.operation_logs;
DROP POLICY IF EXISTS "operation_logs_insert_scoped" ON public.operation_logs;

CREATE POLICY "operation_logs_select_scoped"
ON public.operation_logs
FOR SELECT
TO authenticated
USING (
    tenant_id = public.get_user_tenant_id()
    OR public.is_platform_admin()
);

CREATE POLICY "operation_logs_insert_scoped"
ON public.operation_logs
FOR INSERT
TO authenticated
WITH CHECK (
    public.can_create_work_orders_scope(tenant_id)
    OR public.can_manage_work_orders_scope(tenant_id)
);
