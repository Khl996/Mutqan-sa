-- =====================================================
-- FIX WORKFLOW LOGS & PERMISSIONS
-- =====================================================

-- Helper Function to Create Log
CREATE OR REPLACE FUNCTION create_operation_log(
    p_tenant_id UUID,
    p_work_order_id UUID,
    p_type VARCHAR,
    p_description VARCHAR,
    p_performed_by UUID,
    p_status VARCHAR DEFAULT 'completed'
) RETURNS VOID AS $$
DECLARE
    v_code VARCHAR;
    v_asset_id UUID;
    v_building_id UUID;
BEGIN
    -- Get related info from work order
    SELECT asset_id, building_id INTO v_asset_id, v_building_id
    FROM work_orders WHERE id = p_work_order_id;

    -- Generate a simple code (timestamp based)
    v_code := 'LOG-' || to_char(NOW(), 'YYMMDDHH24MISS') || '-' || substring(gen_random_uuid()::text from 1 for 4);

    INSERT INTO operation_logs (
        tenant_id, code, type, description, 
        work_order_id, asset_id, building_id, 
        performed_by, timestamp, status
    ) VALUES (
        p_tenant_id, v_code, p_type, p_description,
        p_work_order_id, v_asset_id, v_building_id,
        p_performed_by, NOW(), p_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 1. Start Work (Fixed with Logs & Security Definer)
CREATE OR REPLACE FUNCTION start_work_order(p_work_order_id UUID, p_user_id UUID)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_old_status VARCHAR;
BEGIN
    SELECT tenant_id, status INTO v_tenant_id, v_old_status 
    FROM work_orders WHERE id = p_work_order_id;

    -- Only update if status is valid
    IF v_old_status IN ('assigned', 'pending') THEN
        UPDATE work_orders
        SET 
            status = 'in_progress',
            start_time = NOW()
        WHERE id = p_work_order_id;

        -- Log it
        PERFORM create_operation_log(
            v_tenant_id, p_work_order_id, 'status_change', 
            'Work started by technician', p_user_id
        );
    END IF;
END;
$$ LANGUAGE plpgsql;


-- 2. Complete Work (Fixed with Logs & Security Definer)
CREATE OR REPLACE FUNCTION complete_work_order_technician(
    p_work_order_id UUID, 
    p_user_id UUID, 
    p_notes TEXT,
    p_parts JSONB DEFAULT '[]'::JSONB 
)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    part JSONB;
    v_item_cost DECIMAL;
    v_tenant_id UUID;
    v_part_quantity DECIMAL;
    v_item_name VARCHAR;
BEGIN
    SELECT tenant_id INTO v_tenant_id FROM work_orders WHERE id = p_work_order_id;

    -- Update Status
    UPDATE work_orders
    SET 
        status = 'pending_supervisor_approval',
        technician_completed_at = NOW(),
        technician_notes = p_notes
    WHERE id = p_work_order_id;

    -- Log Completion
    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change', 
        'Work completed by technician. Notes: ' || COALESCE(p_notes, '-'), p_user_id
    );

    -- Process Parts
    IF p_parts IS NOT NULL AND jsonb_array_length(p_parts) > 0 THEN
        FOR part IN SELECT * FROM jsonb_array_elements(p_parts)
        LOOP
            v_part_quantity := (part->>'quantity')::DECIMAL;
            
            -- Get item info
            SELECT unit_cost, name INTO v_item_cost, v_item_name
            FROM inventory_items 
            WHERE id = (part->>'item_id')::UUID;

            -- Record Usage
            INSERT INTO work_order_parts (
                tenant_id, work_order_id, item_id, quantity, unit_cost, created_by
            ) VALUES (
                v_tenant_id, p_work_order_id, (part->>'item_id')::UUID, v_part_quantity, v_item_cost, p_user_id
            );

            -- Deduct Inventory
            -- (Assuming inventory table exists, otherwise skip)
            UPDATE inventory_items
            SET quantity = quantity - v_part_quantity
            WHERE id = (part->>'item_id')::UUID;

            -- Log Part Usage
            PERFORM create_operation_log(
                v_tenant_id, p_work_order_id, 'maintenance', 
                'Used part: ' || v_item_name || ' (Qty: ' || v_part_quantity || ')', p_user_id
            );
            
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- 3. Supervisor Approve (Fixed)
CREATE OR REPLACE FUNCTION approve_work_order_supervisor(
    p_work_order_id UUID, 
    p_user_id UUID, 
    p_notes TEXT
)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT tenant_id INTO v_tenant_id FROM work_orders WHERE id = p_work_order_id;

    UPDATE work_orders
    SET 
        status = 'pending_engineer_review',
        supervisor_approved_at = NOW(),
        supervisor_approved_by = p_user_id,
        supervisor_notes = p_notes
    WHERE id = p_work_order_id;

    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change', 
        'Approved by Supervisor. Notes: ' || COALESCE(p_notes, '-'), p_user_id
    );
END;
$$ LANGUAGE plpgsql;


-- 4. Engineer Approve (Fixed)
CREATE OR REPLACE FUNCTION approve_work_order_engineer(
    p_work_order_id UUID, 
    p_user_id UUID, 
    p_notes TEXT
)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT tenant_id INTO v_tenant_id FROM work_orders WHERE id = p_work_order_id;

    UPDATE work_orders
    SET 
        status = 'pending_reporter_closure',
        engineer_approved_at = NOW(),
        engineer_approved_by = p_user_id,
        engineer_notes = p_notes
    WHERE id = p_work_order_id;

    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change', 
        'Approved by Engineer. Notes: ' || COALESCE(p_notes, '-'), p_user_id
    );
END;
$$ LANGUAGE plpgsql;


-- 5. Close Work Order (Fixed)
CREATE OR REPLACE FUNCTION close_work_order(
    p_work_order_id UUID, 
    p_user_id UUID, 
    p_notes TEXT
)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT tenant_id INTO v_tenant_id FROM work_orders WHERE id = p_work_order_id;

    UPDATE work_orders
    SET 
        status = 'completed',
        completed_at = NOW(),
        customer_reviewed_by = p_user_id,
        customer_reviewed_at = NOW(),
        reporter_notes = p_notes
    WHERE id = p_work_order_id;

    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change', 
        'Work Order Closed. Notes: ' || COALESCE(p_notes, '-'), p_user_id
    );
END;
$$ LANGUAGE plpgsql;
