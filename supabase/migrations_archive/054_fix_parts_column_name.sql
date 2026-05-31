-- =============================================
-- FIX: Complete work order with correct settings check AND column names
-- =============================================

-- Drop all versions of the function first
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
    v_tenant_settings JSONB;
    v_require_supervisor BOOLEAN;
    v_require_engineer BOOLEAN;
    v_next_status TEXT;
    part JSONB;
    v_part_id UUID;
    v_part_quantity DECIMAL;
    v_item_cost DECIMAL;
    v_item_name VARCHAR;
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
        technician_completed_at = NOW(),
        end_time = NOW(),
        updated_at = NOW()
    WHERE id = p_work_order_id;
    
    -- Log the completion
    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change', 
        'Work completed by technician. Next: ' || v_next_status || '. Notes: ' || COALESCE(p_technician_notes, '-'), 
        auth.uid()
    );
    
    -- Process parts if any
    IF p_parts IS NOT NULL AND jsonb_array_length(p_parts) > 0 THEN
        FOR part IN SELECT * FROM jsonb_array_elements(p_parts)
        LOOP
            v_part_id := (part->>'part_id')::UUID;
            v_part_quantity := (part->>'quantity')::DECIMAL;
            
            -- Get item info
            SELECT unit_cost, name INTO v_item_cost, v_item_name
            FROM inventory_items WHERE id = v_part_id;

            -- Record Usage - use correct column name 'part_id'
            INSERT INTO work_order_parts (
                tenant_id, work_order_id, part_id, quantity, unit_cost, created_by
            ) VALUES (
                v_tenant_id, p_work_order_id, v_part_id, v_part_quantity, COALESCE(v_item_cost, 0), auth.uid()
            );

            -- Deduct Inventory
            UPDATE inventory_items
            SET quantity = quantity - v_part_quantity
            WHERE id = v_part_id;

            -- Log Part Usage
            PERFORM create_operation_log(
                v_tenant_id, p_work_order_id, 'maintenance', 
                'Used part: ' || COALESCE(v_item_name, 'Unknown') || ' (Qty: ' || v_part_quantity || ')', auth.uid()
            );
        END LOOP;
    END IF;
END;
$$;

COMMENT ON FUNCTION complete_work_order_technician IS 'Completes work order, routes to next step based on tenant settings, and processes parts';
