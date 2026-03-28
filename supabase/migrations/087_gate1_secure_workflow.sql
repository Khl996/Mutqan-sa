-- ==============================================================================
-- Migration: 087_gate1_secure_workflow.sql
-- Purpose: Gate 1 — Secure work order workflow functions
--
-- 1. Harden start_work_order & complete_work_order_technician with tenant isolation
-- 2. Harden approve/reject/close with role checks + REVOKE/GRANT
-- 3. Safe parts consumption: deduct inline, disable require_approval_for_consumption
-- ==============================================================================

-- =========================================
-- 1. SECURE start_work_order
--    - Only allow if work order belongs to caller's tenant
--    - Only allow valid status transitions
-- =========================================

CREATE OR REPLACE FUNCTION start_work_order(p_work_order_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_caller_tenant UUID;
    v_old_status VARCHAR;
BEGIN
    -- Get caller's tenant
    SELECT tenant_id INTO v_caller_tenant FROM profiles WHERE id = auth.uid();

    -- Get work order info
    SELECT tenant_id, status INTO v_tenant_id, v_old_status
    FROM work_orders WHERE id = p_work_order_id;

    -- Tenant isolation: caller must belong to same tenant
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;
    IF v_caller_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    -- Status guard: only from assigned or pending
    IF v_old_status NOT IN ('assigned', 'pending') THEN
        RAISE EXCEPTION 'Cannot start work order in status: %', v_old_status;
    END IF;

    UPDATE work_orders
    SET
        status = 'in_progress',
        start_time = NOW(),
        assigned_to = p_user_id,
        updated_at = NOW()
    WHERE id = p_work_order_id;

    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change',
        'Work started by technician', p_user_id
    );
END;
$$;


-- =========================================
-- 2. SECURE complete_work_order_technician
--    - Tenant isolation
--    - Status guard (only in_progress)
--    - Safe parts consumption (inline deduction, no approval queue)
-- =========================================

DROP FUNCTION IF EXISTS complete_work_order_technician(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS complete_work_order_technician(UUID, UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION complete_work_order_technician(
    p_work_order_id UUID,
    p_technician_notes TEXT DEFAULT '',
    p_parts JSONB DEFAULT '[]'::JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_caller_tenant UUID;
    v_old_status VARCHAR;
    v_tenant_settings JSONB;
    v_require_supervisor BOOLEAN;
    v_require_engineer BOOLEAN;
    v_next_status TEXT;
    part JSONB;
    v_part_id UUID;
    v_part_quantity DECIMAL;
    v_item_cost DECIMAL;
    v_item_name VARCHAR;
    v_available_qty DECIMAL;
BEGIN
    -- Get caller's tenant
    SELECT tenant_id INTO v_caller_tenant FROM profiles WHERE id = auth.uid();

    -- Get work order info
    SELECT tenant_id, status INTO v_tenant_id, v_old_status
    FROM work_orders WHERE id = p_work_order_id;

    -- Tenant isolation
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;
    IF v_caller_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    -- Status guard
    IF v_old_status != 'in_progress' THEN
        RAISE EXCEPTION 'Cannot complete work order in status: %', v_old_status;
    END IF;

    -- Get tenant settings for routing
    SELECT settings INTO v_tenant_settings
    FROM tenants WHERE id = v_tenant_id;

    v_require_supervisor := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_supervisor_approval')::BOOLEAN,
        true
    );
    v_require_engineer := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_engineer_review')::BOOLEAN,
        true
    );

    -- Determine next status
    IF v_require_supervisor THEN
        v_next_status := 'pending_supervisor_approval';
    ELSIF v_require_engineer THEN
        v_next_status := 'pending_engineer_review';
    ELSE
        v_next_status := 'pending_reporter_closure';
    END IF;

    -- Update work order
    UPDATE work_orders
    SET
        status = v_next_status,
        technician_notes = p_technician_notes,
        technician_completed_at = NOW(),
        end_time = NOW(),
        updated_at = NOW()
    WHERE id = p_work_order_id;

    -- Log completion
    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change',
        'Work completed by technician. Next: ' || v_next_status || '. Notes: ' || COALESCE(p_technician_notes, '-'),
        auth.uid()
    );

    -- ===== Parts consumption (direct deduction — no approval queue) =====
    IF p_parts IS NOT NULL AND jsonb_array_length(p_parts) > 0 THEN
        FOR part IN SELECT * FROM jsonb_array_elements(p_parts)
        LOOP
            v_part_id := (part->>'part_id')::UUID;
            v_part_quantity := (part->>'quantity')::DECIMAL;

            -- Validate: part must exist and belong to same tenant
            SELECT unit_cost, name, quantity
              INTO v_item_cost, v_item_name, v_available_qty
              FROM inventory_items
             WHERE id = v_part_id AND tenant_id = v_tenant_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Part % not found or does not belong to this tenant', v_part_id;
            END IF;

            -- Validate: sufficient stock
            IF v_available_qty < v_part_quantity THEN
                RAISE EXCEPTION 'Insufficient stock for part "%": available=%, requested=%',
                    v_item_name, v_available_qty, v_part_quantity;
            END IF;

            -- Record usage
            INSERT INTO work_order_parts (
                tenant_id, work_order_id, part_id, quantity, unit_cost, created_by
            ) VALUES (
                v_tenant_id, p_work_order_id, v_part_id, v_part_quantity,
                COALESCE(v_item_cost, 0), auth.uid()
            );

            -- Deduct inventory
            UPDATE inventory_items
            SET quantity = quantity - v_part_quantity
            WHERE id = v_part_id;

            -- Log
            PERFORM create_operation_log(
                v_tenant_id, p_work_order_id, 'maintenance',
                'Used part: ' || COALESCE(v_item_name, 'Unknown') || ' (Qty: ' || v_part_quantity || ')',
                auth.uid()
            );
        END LOOP;
    END IF;
END;
$$;


-- =========================================
-- 3. SECURE approve_work_order_supervisor
--    - Tenant isolation + role check
--    - Status guard
-- =========================================

CREATE OR REPLACE FUNCTION approve_work_order_supervisor(
    p_work_order_id UUID,
    p_user_id UUID,
    p_notes TEXT DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_caller_tenant UUID;
    v_caller_role VARCHAR;
    v_old_status VARCHAR;
    v_tenant_settings JSONB;
    v_require_engineer BOOLEAN;
    v_next_status TEXT;
BEGIN
    -- Get caller info
    SELECT tenant_id, role INTO v_caller_tenant, v_caller_role
    FROM profiles WHERE id = auth.uid();

    -- Role check: only supervisors, managers, admins
    IF v_caller_role NOT IN ('supervisor', 'manager', 'tenant_admin', 'platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only supervisors or managers can approve';
    END IF;

    -- Get work order info
    SELECT tenant_id, status INTO v_tenant_id, v_old_status
    FROM work_orders WHERE id = p_work_order_id;

    -- Tenant isolation
    IF v_caller_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    -- Status guard
    IF v_old_status != 'pending_supervisor_approval' THEN
        RAISE EXCEPTION 'Cannot approve: work order is in status: %', v_old_status;
    END IF;

    -- Get tenant settings for routing
    SELECT settings INTO v_tenant_settings FROM tenants WHERE id = v_tenant_id;
    v_require_engineer := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_engineer_review')::BOOLEAN,
        true
    );

    IF v_require_engineer THEN
        v_next_status := 'pending_engineer_review';
    ELSE
        v_next_status := 'pending_reporter_closure';
    END IF;

    UPDATE work_orders
    SET
        status = v_next_status,
        supervisor_notes = p_notes,
        supervisor_approved_by = p_user_id,
        supervisor_approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_work_order_id;

    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change',
        'Approved by Supervisor. Next: ' || v_next_status || '. Notes: ' || COALESCE(p_notes, '-'),
        auth.uid()
    );
END;
$$;


-- =========================================
-- 4. SECURE approve_work_order_engineer
--    - Tenant isolation + role check
--    - Status guard
-- =========================================

CREATE OR REPLACE FUNCTION approve_work_order_engineer(
    p_work_order_id UUID,
    p_user_id UUID,
    p_notes TEXT DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_caller_tenant UUID;
    v_caller_role VARCHAR;
    v_old_status VARCHAR;
BEGIN
    -- Get caller info
    SELECT tenant_id, role INTO v_caller_tenant, v_caller_role
    FROM profiles WHERE id = auth.uid();

    -- Role check: only engineers, managers, admins
    IF v_caller_role NOT IN ('engineer', 'manager', 'tenant_admin', 'platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only engineers or managers can review';
    END IF;

    -- Get work order info
    SELECT tenant_id, status INTO v_tenant_id, v_old_status
    FROM work_orders WHERE id = p_work_order_id;

    -- Tenant isolation
    IF v_caller_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    -- Status guard
    IF v_old_status != 'pending_engineer_review' THEN
        RAISE EXCEPTION 'Cannot review: work order is in status: %', v_old_status;
    END IF;

    UPDATE work_orders
    SET
        status = 'pending_reporter_closure',
        engineer_notes = p_notes,
        engineer_approved_by = p_user_id,
        engineer_approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_work_order_id;

    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change',
        'Approved by Engineer. Notes: ' || COALESCE(p_notes, '-'),
        auth.uid()
    );
END;
$$;


-- =========================================
-- 5. SECURE close_work_order
--    - Tenant isolation
--    - Status guard (only pending_reporter_closure)
-- =========================================

CREATE OR REPLACE FUNCTION close_work_order(
    p_work_order_id UUID,
    p_user_id UUID,
    p_notes TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_caller_tenant UUID;
    v_old_status VARCHAR;
BEGIN
    SELECT tenant_id INTO v_caller_tenant FROM profiles WHERE id = auth.uid();

    SELECT tenant_id, status INTO v_tenant_id, v_old_status
    FROM work_orders WHERE id = p_work_order_id;

    -- Tenant isolation
    IF v_caller_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    -- Status guard
    IF v_old_status != 'pending_reporter_closure' THEN
        RAISE EXCEPTION 'Cannot close: work order is in status: %', v_old_status;
    END IF;

    UPDATE work_orders
    SET
        status = 'completed',
        completed_at = NOW(),
        customer_reviewed_by = p_user_id,
        customer_reviewed_at = NOW(),
        reporter_notes = p_notes,
        updated_at = NOW()
    WHERE id = p_work_order_id;

    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change',
        'Work Order Closed. Notes: ' || COALESCE(p_notes, '-'),
        auth.uid()
    );
END;
$$;


-- =========================================
-- 6. SECURE reject_work_order
--    - Tenant isolation + role check
--    - Status guard (only rejectable statuses)
-- =========================================

CREATE OR REPLACE FUNCTION reject_work_order(
    p_work_order_id UUID,
    p_user_id UUID,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_caller_tenant UUID;
    v_caller_role VARCHAR;
    v_old_status VARCHAR;
BEGIN
    -- Get caller info
    SELECT tenant_id, role INTO v_caller_tenant, v_caller_role
    FROM profiles WHERE id = auth.uid();

    -- Role check
    IF v_caller_role NOT IN ('supervisor', 'engineer', 'manager', 'tenant_admin', 'platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only supervisors, engineers, or managers can reject';
    END IF;

    -- Get work order info
    SELECT tenant_id, status INTO v_tenant_id, v_old_status
    FROM work_orders WHERE id = p_work_order_id;

    -- Tenant isolation
    IF v_caller_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    -- Status guard: only from approval/review stages
    IF v_old_status NOT IN ('pending_supervisor_approval', 'pending_engineer_review', 'pending_reporter_closure') THEN
        RAISE EXCEPTION 'Cannot reject work order in status: %', v_old_status;
    END IF;

    UPDATE work_orders
    SET
        status = 'in_progress',
        updated_at = NOW()
    WHERE id = p_work_order_id;

    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change',
        'Rejected/Returned. Reason: ' || COALESCE(p_reason, '-'),
        p_user_id,
        'completed'
    );
END;
$$;


-- =========================================
-- 7. REVOKE / GRANT EXECUTE
--    Only authenticated users can call these RPCs
-- =========================================

-- Revoke from public (anon)
REVOKE EXECUTE ON FUNCTION start_work_order(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION complete_work_order_technician(UUID, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION approve_work_order_supervisor(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION approve_work_order_engineer(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION close_work_order(UUID, UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION reject_work_order(UUID, UUID, TEXT) FROM anon;

-- Grant to authenticated only
GRANT EXECUTE ON FUNCTION start_work_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_work_order_technician(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_work_order_supervisor(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_work_order_engineer(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION close_work_order(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_work_order(UUID, UUID, TEXT) TO authenticated;


-- =========================================
-- 8. Disable require_approval_for_consumption for Early Launch
--    Since no approval queue exists yet, force it to false
-- =========================================

UPDATE tenants
SET settings = jsonb_set(
    COALESCE(settings, '{}'::JSONB),
    '{inventory,require_approval_for_consumption}',
    'false'::JSONB
)
WHERE settings->'inventory'->'require_approval_for_consumption' = 'true'::JSONB;

-- Comments
COMMENT ON FUNCTION start_work_order IS 'Gate 1: Secured — tenant isolation + status guard';
COMMENT ON FUNCTION complete_work_order_technician IS 'Gate 1: Secured — tenant isolation + status guard + safe parts consumption';
COMMENT ON FUNCTION approve_work_order_supervisor IS 'Gate 1: Secured — tenant isolation + role check + status guard';
COMMENT ON FUNCTION approve_work_order_engineer IS 'Gate 1: Secured — tenant isolation + role check + status guard';
COMMENT ON FUNCTION close_work_order IS 'Gate 1: Secured — tenant isolation + status guard';
COMMENT ON FUNCTION reject_work_order IS 'Gate 1: Secured — tenant isolation + role check + status guard';
