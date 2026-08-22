-- =============================================================================
-- Migration: harden_start_work_order_team_authorization
-- Purpose:
--   Tighten start_work_order authorization for team-assigned work orders.
--
-- Rules:
--   - Direct assignee can start.
--   - Active member of assigned_team can start when no direct assignee exists.
--   - Tenant management / engineering override roles keep existing same-tenant authority.
--   - Cross-tenant actors and unrelated tenant users are denied.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.start_work_order(p_work_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id               UUID    := auth.uid();
    v_actor_role             TEXT;
    v_actor_tenant           UUID;
    v_actor_active           BOOLEAN := FALSE;
    v_is_super               BOOLEAN := FALSE;
    v_tenant_id              UUID;
    v_old_status             TEXT;
    v_assigned_to            UUID;
    v_assigned_team          UUID;
    v_is_platform_override   BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
    v_is_team_member         BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot start work orders' USING ERRCODE = '28000';
    END IF;

    SELECT tenant_id, status, assigned_to, assigned_team
      INTO v_tenant_id, v_old_status, v_assigned_to, v_assigned_team
      FROM public.work_orders
     WHERE id = p_work_order_id
     FOR UPDATE;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN (
        'tenant_admin',
        'maintenance_manager',
        'engineer'
    );

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin', 'maintenance_manager', 'engineer', 'technician',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: you are not allowed to start this work order'
            USING ERRCODE = '42501';
    END IF;

    IF v_old_status NOT IN ('pending', 'assigned') THEN
        RAISE EXCEPTION 'Cannot start work order in status: %', v_old_status
            USING ERRCODE = '22023';
    END IF;

    IF v_assigned_team IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.team_members tm
             WHERE tm.team_id = v_assigned_team
               AND tm.user_id = v_actor_id
               AND COALESCE(tm.is_active, TRUE) = TRUE
        )
          INTO v_is_team_member;
    END IF;

    IF NOT v_is_management_override THEN
        IF v_assigned_to IS NOT NULL THEN
            IF v_assigned_to IS DISTINCT FROM v_actor_id THEN
                RAISE EXCEPTION 'Only the assigned technician can start this work order'
                    USING ERRCODE = '42501';
            END IF;
        ELSIF v_assigned_team IS NOT NULL THEN
            IF NOT v_is_team_member THEN
                RAISE EXCEPTION 'Only an active member of the assigned team can start this work order'
                    USING ERRCODE = '42501';
            END IF;
        ELSE
            RAISE EXCEPTION 'Work order is not assigned to you or one of your teams'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status      = 'in_progress',
           start_time  = NOW(),
           assigned_to = COALESCE(v_assigned_to, v_actor_id),
           updated_at  = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance', 'Work started', v_actor_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_work_order(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_work_order(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_work_order(UUID) TO authenticated;

COMMENT ON FUNCTION public.start_work_order(UUID) IS
    'Starts a pending/assigned work order with tenant isolation, status guard, direct-assignee authorization, assigned-team membership authorization, and tenant management override.';
