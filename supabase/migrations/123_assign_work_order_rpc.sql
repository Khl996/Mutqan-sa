-- =============================================================================
-- Migration: 123_assign_work_order_rpc.sql
-- Purpose:
--   Add an audited authority path for work-order assignment and reassignment.
--   Direct assigned_to / assigned_team updates remain blocked by migration 120.
-- =============================================================================

DROP FUNCTION IF EXISTS public.assign_work_order(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.assign_work_order(
    p_work_order_id UUID,
    p_assigned_to UUID DEFAULT NULL,
    p_assigned_team UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id          UUID := auth.uid();
    v_actor_role        TEXT;
    v_actor_tenant      UUID;
    v_actor_active      BOOLEAN;
    v_actor_super       BOOLEAN := FALSE;
    v_wo                public.work_orders%ROWTYPE;
    v_assignee_role     TEXT;
    v_assignee_tenant   UUID;
    v_assignee_active   BOOLEAN;
    v_team_tenant       UUID;
    v_team_status       TEXT;
    v_reason            TEXT := NULLIF(BTRIM(p_reason), '');
    v_target_to         UUID;
    v_target_team       UUID;
    v_reassignment      BOOLEAN := FALSE;
    v_new_status        TEXT;
    v_log_code          TEXT;
    v_description       TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_work_order_id IS NULL THEN
        RAISE EXCEPTION 'Work order id is required' USING ERRCODE = '22023';
    END IF;

    IF p_assigned_to IS NULL AND p_assigned_team IS NULL THEN
        RAISE EXCEPTION 'At least one assignee or team is required'
            USING ERRCODE = '22023';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot assign work orders' USING ERRCODE = '28000';
    END IF;

    SELECT *
      INTO v_wo
      FROM public.work_orders
     WHERE id = p_work_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_role NOT IN ('tenant_admin', 'maintenance_manager') THEN
        RAISE EXCEPTION 'Insufficient permissions to assign work orders'
            USING ERRCODE = '42501';
    END IF;

    IF v_wo.status NOT IN ('pending', 'assigned', 'on_hold') THEN
        RAISE EXCEPTION 'Cannot assign work order in status: %', v_wo.status
            USING ERRCODE = '22023';
    END IF;

    IF p_assigned_to IS NOT NULL THEN
        SELECT role, tenant_id, COALESCE(is_active, TRUE)
          INTO v_assignee_role, v_assignee_tenant, v_assignee_active
          FROM public.profiles
         WHERE id = p_assigned_to;

        IF v_assignee_role IS NULL THEN
            RAISE EXCEPTION 'Assignee user not found' USING ERRCODE = '22023';
        END IF;

        IF NOT COALESCE(v_assignee_active, FALSE) THEN
            RAISE EXCEPTION 'Assignee user is inactive' USING ERRCODE = '42501';
        END IF;

        IF v_assignee_tenant IS DISTINCT FROM v_wo.tenant_id THEN
            RAISE EXCEPTION 'Assignee does not belong to this tenant'
                USING ERRCODE = '42501';
        END IF;

        IF v_assignee_role NOT IN ('technician', 'engineer') THEN
            RAISE EXCEPTION 'Assignee role is not allowed for work-order assignment'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_assigned_team IS NOT NULL THEN
        SELECT tenant_id, status
          INTO v_team_tenant, v_team_status
          FROM public.teams
         WHERE id = p_assigned_team;

        IF v_team_tenant IS NULL THEN
            RAISE EXCEPTION 'Assigned team not found' USING ERRCODE = '22023';
        END IF;

        IF v_team_tenant IS DISTINCT FROM v_wo.tenant_id THEN
            RAISE EXCEPTION 'Assigned team does not belong to this tenant'
                USING ERRCODE = '42501';
        END IF;

        IF COALESCE(v_team_status, 'active') <> 'active' THEN
            RAISE EXCEPTION 'Assigned team is not active' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_assigned_to IS NOT NULL
       AND p_assigned_team IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.team_members tm
            WHERE tm.team_id = p_assigned_team
              AND tm.user_id = p_assigned_to
              AND COALESCE(tm.is_active, TRUE) = TRUE
       )
    THEN
        RAISE EXCEPTION 'Assignee is not an active member of the assigned team'
            USING ERRCODE = '42501';
    END IF;

    v_target_to := COALESCE(p_assigned_to, v_wo.assigned_to);
    v_target_team := COALESCE(p_assigned_team, v_wo.assigned_team);

    v_reassignment := (
        (v_wo.assigned_to IS NOT NULL AND v_wo.assigned_to IS DISTINCT FROM v_target_to)
        OR (v_wo.assigned_team IS NOT NULL AND v_wo.assigned_team IS DISTINCT FROM v_target_team)
        OR (v_wo.status <> 'pending' AND (
            (v_wo.assigned_to IS NULL AND v_target_to IS NOT NULL)
            OR (v_wo.assigned_team IS NULL AND v_target_team IS NOT NULL)
        ))
    );

    IF v_reassignment
       AND v_wo.status <> 'pending'
       AND v_reason IS NULL
    THEN
        RAISE EXCEPTION 'Reassignment reason is required'
            USING ERRCODE = '22023';
    END IF;

    v_new_status := CASE WHEN v_wo.status = 'pending' THEN 'assigned' ELSE v_wo.status END;

    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET assigned_to = v_target_to,
           assigned_team = v_target_team,
           status = v_new_status,
           updated_at = NOW()
     WHERE id = p_work_order_id
     RETURNING * INTO v_wo;

    v_description := 'Work order assigned'
        || CASE WHEN p_assigned_to IS NULL THEN '' ELSE '; assigned_to=' || p_assigned_to::TEXT END
        || CASE WHEN p_assigned_team IS NULL THEN '' ELSE '; assigned_team=' || p_assigned_team::TEXT END
        || CASE WHEN v_reason IS NULL THEN '' ELSE '; reason=' || v_reason END;

    v_log_code := 'LOG-' || to_char(NOW(), 'YYMMDDHH24MISS') || '-' || substring(gen_random_uuid()::TEXT FROM 1 FOR 4);

    INSERT INTO public.operation_logs (
        tenant_id,
        code,
        type,
        description,
        reason,
        work_order_id,
        asset_id,
        building_id,
        performed_by,
        team_id,
        timestamp,
        status
    ) VALUES (
        v_wo.tenant_id,
        v_log_code,
        'assignment',
        v_description,
        v_reason,
        v_wo.id,
        v_wo.asset_id,
        v_wo.building_id,
        v_actor_id,
        v_wo.assigned_team,
        NOW(),
        'completed'
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', v_wo.id,
        'assigned_to', v_wo.assigned_to,
        'assigned_team', v_wo.assigned_team,
        'status', v_wo.status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_work_order(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_work_order(UUID, UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_work_order(UUID, UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.assign_work_order(UUID, UUID, UUID, TEXT) IS
    'Audited tenant work-order assignment authority. Tenant admin and maintenance manager may assign pending, assigned, or on_hold work orders to active same-tenant technicians/engineers and active same-tenant teams. Reassignment after pending requires a reason.';
