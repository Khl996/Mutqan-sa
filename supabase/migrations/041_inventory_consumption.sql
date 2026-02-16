-- 1. Handle Table Schema Changes (Safe Migration)
DO $$ 
BEGIN
    -- Check if work_order_parts exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'work_order_parts') THEN
        -- Rename item_id to part_id if it exists (legacy support)
        IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'work_order_parts' AND column_name = 'item_id') THEN
            ALTER TABLE work_order_parts RENAME COLUMN item_id TO part_id;
        END IF;
    ELSE
        -- Create table if it doesn't exist
        CREATE TABLE work_order_parts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
            part_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
            quantity NUMERIC NOT NULL CHECK (quantity > 0),
            unit_cost NUMERIC NOT NULL DEFAULT 0,
            total_cost NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            created_by UUID REFERENCES auth.users(id),
            tenant_id UUID REFERENCES tenants(id) -- Ensure tenant_id exists
        );
    END IF;

    -- Ensure tenant_id column exists (if table existed but lacked it in my new definition context)
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'work_order_parts' AND column_name = 'tenant_id') THEN
         ALTER TABLE work_order_parts ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    END IF;
END $$;

-- 2. Enable RLS
ALTER TABLE work_order_parts ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies to allow re-running
DROP POLICY IF EXISTS "Users can view parts for their tenant work orders" ON work_order_parts;
DROP POLICY IF EXISTS "Technicians and Managers can add parts" ON work_order_parts;
DROP POLICY IF EXISTS "Enable all for authenticated" ON work_order_parts; -- Drop legacy policy from 011

-- 4. Create Policies
CREATE POLICY "Users can view parts for their tenant work orders" ON work_order_parts
    FOR SELECT USING (
        work_order_id IN (
            SELECT id FROM work_orders 
            WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Technicians and Managers can add parts" ON work_order_parts
    FOR INSERT WITH CHECK (
        work_order_id IN (
            SELECT id FROM work_orders 
            WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
        )
    );

-- 5. Update complete_work_order_technician function
CREATE OR REPLACE FUNCTION complete_work_order_technician(
    p_work_order_id UUID,
    p_technician_notes TEXT,
    p_parts JSONB DEFAULT '[]'::JSONB -- Array of {part_id, quantity}
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_status TEXT;
    v_old_status TEXT;
    v_part JSONB;
    v_part_id UUID;
    v_qty NUMERIC;
    v_current_stock NUMERIC;
    v_unit_cost NUMERIC;
    v_total_parts_cost NUMERIC := 0;
BEGIN
    -- 1. Check Work Order Status & Ownership
    SELECT tenant_id, status INTO v_tenant_id, v_old_status
    FROM work_orders
    WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work Order not found';
    END IF;
    
    -- Verify Tenant Access
    IF v_tenant_id != (SELECT tenant_id FROM profiles WHERE id = auth.uid()) THEN
         RAISE EXCEPTION 'Unauthorized access';
    END IF;

    IF v_old_status != 'in_progress' THEN
        RAISE EXCEPTION 'Work order must be in progress to complete';
    END IF;

    -- 2. Process Parts Consumption
    IF jsonb_array_length(p_parts) > 0 THEN
        FOR v_part IN SELECT * FROM jsonb_array_elements(p_parts)
        LOOP
            v_part_id := (v_part->>'part_id')::UUID;
            v_qty := (v_part->>'quantity')::NUMERIC;
            
            -- Check Stock
            SELECT quantity, unit_cost INTO v_current_stock, v_unit_cost
            FROM inventory_items
            WHERE id = v_part_id AND tenant_id = v_tenant_id;

            IF v_current_stock IS NULL THEN
                RAISE EXCEPTION 'Part not found';
            END IF;

            IF v_current_stock < v_qty THEN
                RAISE EXCEPTION 'Insufficient stock for part %', v_part_id;
            END IF;

            -- Deduct Stock
            UPDATE inventory_items
            SET quantity = quantity - v_qty
            WHERE id = v_part_id;

            -- Record Part Usage (Including tenant_id)
            INSERT INTO work_order_parts (work_order_id, part_id, quantity, unit_cost, created_by, tenant_id)
            VALUES (p_work_order_id, v_part_id, v_qty, v_unit_cost, auth.uid(), v_tenant_id);
            
            v_total_parts_cost := v_total_parts_cost + (v_qty * v_unit_cost);

            -- Log Inventory Transaction
            INSERT INTO inventory_transactions (
                tenant_id, item_id, transaction_type, quantity, 
                unit_price, total_price, notes, created_by
            ) VALUES (
                v_tenant_id, v_part_id, 'usage', v_qty,
                v_unit_cost, (v_qty * v_unit_cost), 
                'Used in Work Order ' || (SELECT code FROM work_orders WHERE id = p_work_order_id),
                auth.uid()
            );

        END LOOP;
    END IF;

    -- 3. Determine New Status
    v_status := 'pending_supervisor_approval';

    -- 4. Update Work Order
    UPDATE work_orders
    SET 
        status = v_status,
        technician_notes = p_technician_notes,
        technician_completed_at = NOW(),
        actual_cost = COALESCE(actual_cost, 0) + v_total_parts_cost, -- Add parts cost
        updated_at = NOW()
    WHERE id = p_work_order_id;

    -- 5. Log Operation
    PERFORM create_operation_log(
        v_tenant_id, 
        p_work_order_id, 
        'status_change', 
        'Technician marked work as complete. Status: ' || v_status, 
        NULL
    );

END;
$$ LANGUAGE plpgsql;
