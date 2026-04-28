-- =============================================================================
-- Migration: 122_create_work_order_rpc.sql
-- Purpose:
--   Route normal authenticated work-order creation through one audited authority
--   path. The RPC validates actor/tenant/location scope, accepts only
--   creation-safe fields, inserts the work order, and writes an operation log.
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_work_order(JSONB, UUID);

CREATE OR REPLACE FUNCTION public.create_work_order(
    p_work_order JSONB,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS public.work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id       UUID := auth.uid();
    v_actor_role     TEXT;
    v_actor_tenant   UUID;
    v_actor_active   BOOLEAN;
    v_is_super       BOOLEAN := FALSE;
    v_is_platform    BOOLEAN := FALSE;
    v_tenant_id      UUID;
    v_title          TEXT;
    v_code           TEXT;
    v_priority       TEXT;
    v_issue_type_id  UUID;
    v_reported_by    UUID;
    v_assigned_team  UUID;
    v_building_id    UUID;
    v_floor_id       UUID;
    v_department_id  UUID;
    v_room_id        UUID;
    v_asset_id       UUID;
    v_due_date       TIMESTAMPTZ;
    v_allowed_keys   TEXT[] := ARRAY[
        'code',
        'title',
        'description',
        'issue_type_id',
        'issue_type',
        'priority',
        'due_date',
        'building_id',
        'floor_id',
        'department_id',
        'room_id',
        'asset_id',
        'reported_by',
        'reporter_name',
        'reporter_phone',
        'assigned_team',
        'created_by',
        'source'
    ];
    v_key            TEXT;
    v_work_order     public.work_orders%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_work_order IS NULL OR jsonb_typeof(p_work_order) <> 'object' THEN
        RAISE EXCEPTION 'Work order payload must be a JSON object' USING ERRCODE = '22023';
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_work_order)
    LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
            RAISE EXCEPTION 'Field "%" is not allowed during work order creation', v_key
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot create work orders' USING ERRCODE = '28000';
    END IF;

    v_is_platform := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF p_tenant_id IS NOT NULL THEN
        IF NOT v_is_platform THEN
            RAISE EXCEPTION 'Only platform owner/admin can pass tenant_id explicitly'
                USING ERRCODE = '42501';
        END IF;
        v_tenant_id := p_tenant_id;
    ELSE
        v_tenant_id := v_actor_tenant;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant is required for work order creation' USING ERRCODE = '22023';
    END IF;

    IF NOT public.tenant_has_operational_access(v_tenant_id) THEN
        RAISE EXCEPTION 'Tenant does not currently have operational access'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_create_work_orders_scope(v_tenant_id) THEN
        RAISE EXCEPTION 'Insufficient permissions to create work orders'
            USING ERRCODE = '42501';
    END IF;

    v_title := NULLIF(BTRIM(p_work_order->>'title'), '');
    IF v_title IS NULL THEN
        RAISE EXCEPTION 'Work order title is required' USING ERRCODE = '23502';
    END IF;

    v_priority := COALESCE(NULLIF(BTRIM(p_work_order->>'priority'), ''), 'medium');
    IF v_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
        RAISE EXCEPTION 'Invalid work order priority: %', v_priority USING ERRCODE = '22023';
    END IF;

    v_code := NULLIF(BTRIM(p_work_order->>'code'), '');
    IF v_code IS NULL THEN
        v_code := 'WO-' || to_char(NOW(), 'YYMMDD-HH24MISS') || '-' || substring(gen_random_uuid()::text from 1 for 4);
    ELSIF v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$' THEN
        RAISE EXCEPTION 'Invalid work order code format' USING ERRCODE = '22023';
    END IF;

    v_issue_type_id := NULLIF(p_work_order->>'issue_type_id', '')::UUID;
    v_reported_by := COALESCE(NULLIF(p_work_order->>'reported_by', '')::UUID, v_actor_id);
    v_assigned_team := NULLIF(p_work_order->>'assigned_team', '')::UUID;
    v_building_id := NULLIF(p_work_order->>'building_id', '')::UUID;
    v_floor_id := NULLIF(p_work_order->>'floor_id', '')::UUID;
    v_department_id := NULLIF(p_work_order->>'department_id', '')::UUID;
    v_room_id := NULLIF(p_work_order->>'room_id', '')::UUID;
    v_asset_id := NULLIF(p_work_order->>'asset_id', '')::UUID;
    v_due_date := NULLIF(p_work_order->>'due_date', '')::TIMESTAMPTZ;

    IF v_issue_type_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.issue_types it
            WHERE it.id = v_issue_type_id
              AND (it.tenant_id IS NULL OR it.tenant_id = v_tenant_id)
       )
    THEN
        RAISE EXCEPTION 'Issue type does not belong to this tenant' USING ERRCODE = '42501';
    END IF;

    IF v_reported_by IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.profiles p
            WHERE p.id = v_reported_by
              AND p.tenant_id = v_tenant_id
       )
    THEN
        RAISE EXCEPTION 'Reporter does not belong to this tenant' USING ERRCODE = '42501';
    END IF;

    IF v_assigned_team IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.teams t
            WHERE t.id = v_assigned_team
              AND t.tenant_id = v_tenant_id
       )
    THEN
        RAISE EXCEPTION 'Assigned team does not belong to this tenant' USING ERRCODE = '42501';
    END IF;

    IF v_department_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.departments d
            WHERE d.id = v_department_id
              AND d.tenant_id = v_tenant_id
       )
    THEN
        RAISE EXCEPTION 'Department does not belong to this tenant' USING ERRCODE = '42501';
    END IF;

    IF NOT public.work_order_asset_location_is_valid(
        v_tenant_id, v_building_id, v_floor_id, v_room_id, v_asset_id
    ) THEN
        RAISE EXCEPTION 'Invalid asset or location for this tenant' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.work_orders (
        tenant_id,
        code,
        title,
        description,
        issue_type_id,
        issue_type,
        status,
        priority,
        reported_by,
        assigned_team,
        created_by,
        building_id,
        floor_id,
        department_id,
        room_id,
        asset_id,
        due_date,
        reporter_name,
        reporter_phone,
        reported_at,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        v_code,
        v_title,
        NULLIF(BTRIM(p_work_order->>'description'), ''),
        v_issue_type_id,
        NULLIF(BTRIM(p_work_order->>'issue_type'), ''),
        'pending',
        v_priority,
        v_reported_by,
        v_assigned_team,
        v_actor_id,
        v_building_id,
        v_floor_id,
        v_department_id,
        v_room_id,
        v_asset_id,
        v_due_date,
        NULLIF(BTRIM(p_work_order->>'reporter_name'), ''),
        NULLIF(BTRIM(p_work_order->>'reporter_phone'), ''),
        NOW(),
        NOW(),
        NOW()
    )
    RETURNING * INTO v_work_order;

    PERFORM public.create_operation_log(
        v_tenant_id,
        v_work_order.id,
        'create',
        CASE
            WHEN v_assigned_team IS NULL THEN 'Work order created'
            ELSE 'Work order created with initial team context'
        END,
        v_actor_id
    );

    RETURN v_work_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_work_order(JSONB, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_work_order(JSONB, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_work_order(JSONB, UUID) TO authenticated;

COMMENT ON FUNCTION public.create_work_order(JSONB, UUID) IS
    'Audited authenticated work-order creation authority. Tenant users create in their own tenant; platform owner/admin may pass p_tenant_id. Status always starts as pending. Initial assigned_team is accepted only as compatibility context; use assign_work_order for assignment/reassignment.';

-- Normal authenticated clients must use public.create_work_order so creation is
-- validated and logged. SECURITY DEFINER server-side intake/generation RPCs can
-- still insert internally as their owners; public portal intake remains separate.
DROP POLICY IF EXISTS "work_orders_insert_scoped" ON public.work_orders;
DROP POLICY IF EXISTS "Users can create work orders" ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_insert_disabled_direct" ON public.work_orders;

CREATE POLICY "work_orders_insert_disabled_direct"
ON public.work_orders
FOR INSERT
TO authenticated
WITH CHECK (FALSE);

COMMENT ON POLICY "work_orders_insert_disabled_direct" ON public.work_orders IS
    'Direct authenticated INSERT is disabled. Use public.create_work_order for audited normal creation; public portal and PM generation use their own server-side RPC paths.';
