-- =============================================
-- Update Workflow Functions to Respect Tenant Settings
-- =============================================
-- This migration updates the work order workflow functions to check tenant settings
-- and skip supervisor/engineer approval steps if disabled

-- Drop existing functions first to avoid overload conflicts
DROP FUNCTION IF EXISTS complete_work_order_technician(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS complete_work_order_technician(UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS approve_work_order_supervisor(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS approve_work_order_engineer(UUID, UUID, TEXT);

-- Update complete_work_order_technician to check settings
CREATE OR REPLACE FUNCTION complete_work_order_technician(
    p_work_order_id UUID,
    p_technician_notes TEXT DEFAULT '',
    p_parts JSONB DEFAULT '[]'::JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_tenant_settings JSONB;
    v_require_supervisor BOOLEAN;
    v_require_engineer BOOLEAN;
    v_next_status TEXT;
BEGIN
    -- Get tenant_id from work order
    SELECT tenant_id INTO v_tenant_id
    FROM work_orders
    WHERE id = p_work_order_id;
    
    -- Get tenant settings
    SELECT settings INTO v_tenant_settings
    FROM tenants
    WHERE id = v_tenant_id;
    
    -- Check settings with defaults
    v_require_supervisor := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_supervisor_approval')::BOOLEAN, 
        true
    );
    v_require_engineer := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_engineer_review')::BOOLEAN, 
        true
    );
    
    -- Determine next status based on settings
    IF v_require_supervisor THEN
        v_next_status := 'pending_supervisor_approval';
    ELSIF v_require_engineer THEN
        v_next_status := 'pending_engineer_review';
    ELSE
        -- Skip both, go directly to pending reporter closure
        v_next_status := 'pending_reporter_closure';
    END IF;
    
    -- Update work order
    UPDATE work_orders
    SET 
        status = v_next_status,
        technician_notes = p_technician_notes,
        end_time = NOW(),
        updated_at = NOW()
    WHERE id = p_work_order_id;
    
    -- Process parts if any
    IF jsonb_array_length(p_parts) > 0 THEN
        INSERT INTO work_order_parts (work_order_id, inventory_item_id, quantity_used, tenant_id)
        SELECT 
            p_work_order_id,
            (part->>'part_id')::UUID,
            (part->>'quantity')::INTEGER,
            v_tenant_id
        FROM jsonb_array_elements(p_parts) AS part;
        
        -- Deduct from inventory
        UPDATE inventory_items i
        SET current_stock = current_stock - (part->>'quantity')::INTEGER
        FROM jsonb_array_elements(p_parts) AS part
        WHERE i.id = (part->>'part_id')::UUID;
    END IF;
END;
$$;

-- Update approve_work_order_supervisor to check settings
CREATE OR REPLACE FUNCTION approve_work_order_supervisor(
    p_work_order_id UUID,
    p_user_id UUID,
    p_notes TEXT DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_tenant_settings JSONB;
    v_require_engineer BOOLEAN;
    v_next_status TEXT;
BEGIN
    -- Get tenant_id from work order
    SELECT tenant_id INTO v_tenant_id
    FROM work_orders
    WHERE id = p_work_order_id;
    
    -- Get tenant settings
    SELECT settings INTO v_tenant_settings
    FROM tenants
    WHERE id = v_tenant_id;
    
    -- Check if engineer review is required
    v_require_engineer := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_engineer_review')::BOOLEAN, 
        true
    );
    
    -- Determine next status
    IF v_require_engineer THEN
        v_next_status := 'pending_engineer_review';
    ELSE
        v_next_status := 'pending_reporter_closure';
    END IF;
    
    -- Update work order
    UPDATE work_orders
    SET 
        status = v_next_status,
        supervisor_notes = p_notes,
        supervisor_id = p_user_id,
        supervisor_approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_work_order_id;
END;
$$;

-- Update approve_work_order_engineer to go to pending_reporter_closure
CREATE OR REPLACE FUNCTION approve_work_order_engineer(
    p_work_order_id UUID,
    p_user_id UUID,
    p_notes TEXT DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Engineer approval always goes to pending_reporter_closure
    UPDATE work_orders
    SET 
        status = 'pending_reporter_closure',
        engineer_notes = p_notes,
        engineer_id = p_user_id,
        engineer_approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_work_order_id;
END;
$$;

-- Comment
COMMENT ON FUNCTION complete_work_order_technician IS 'Completes work order and routes to next step based on tenant settings';
COMMENT ON FUNCTION approve_work_order_supervisor IS 'Approves work order and routes based on whether engineer review is required';
