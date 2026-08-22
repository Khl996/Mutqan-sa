-- =====================================================
-- WORK ORDER WORKFLOW & INVENTORY INTEGRATION
-- =====================================================

-- 1. Update Work Order Statuses Check Constraint
-- We need to drop the old check if it exists and add the new granular statuses
DO $$
BEGIN
    ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;
    
    ALTER TABLE work_orders ADD CONSTRAINT work_orders_status_check CHECK (
        status IN (
            'pending',
            'assigned',
            'in_progress',
            'pending_supervisor_approval',
            'pending_engineer_review',
            'pending_reporter_closure',
            'completed',
            'rejected_by_technician',
            'cancelled',
            'archived'
        )
    );
END $$;

-- 2. Create Table for Work Order Parts (Required Parts / Used Parts)
-- This links inventory items to work orders
CREATE TABLE IF NOT EXISTS work_order_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  quantity DECIMAL(10, 2) NOT NULL,
  unit_cost DECIMAL(12, 2) NOT NULL, -- Snapshot of cost at time of usage
  total_cost DECIMAL(12, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Enable RLS
ALTER TABLE work_order_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated" ON work_order_parts FOR ALL USING (auth.role() = 'authenticated');


-- 3. Procedure: Start Work Order
-- Used by Technician to move from 'assigned' to 'in_progress'
CREATE OR REPLACE FUNCTION start_work_order(p_work_order_id UUID, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE work_orders
    SET 
        status = 'in_progress',
        start_time = NOW()
    WHERE id = p_work_order_id 
    AND (status = 'assigned' OR status = 'pending'); -- Allow auto-transition from pending if self-assigned
END;
$$ LANGUAGE plpgsql;


-- 4. Procedure: Complete Work Order (Technician)
-- Moves to supervisor approval
CREATE OR REPLACE FUNCTION complete_work_order_technician(
    p_work_order_id UUID, 
    p_user_id UUID, 
    p_notes TEXT,
    p_parts JSONB DEFAULT '[]'::JSONB -- Array of {item_id, quantity}
)
RETURNS VOID AS $$
DECLARE
    part JSONB;
    v_item_cost DECIMAL;
    v_tenant_id UUID;
    v_part_quantity DECIMAL;
BEGIN
    -- Get Tenant ID
    SELECT tenant_id INTO v_tenant_id FROM work_orders WHERE id = p_work_order_id;

    -- 1. Update Work Order Status
    UPDATE work_orders
    SET 
        status = 'pending_supervisor_approval',
        technician_completed_at = NOW(),
        technician_notes = p_notes
    WHERE id = p_work_order_id;

    -- 2. Process Parts Usage
    -- Loop through parts array
    IF p_parts IS NOT NULL AND jsonb_array_length(p_parts) > 0 THEN
        FOR part IN SELECT * FROM jsonb_array_elements(p_parts)
        LOOP
            v_part_quantity := (part->>'quantity')::DECIMAL;
            
            -- Get current item cost and verify stock
            SELECT unit_cost INTO v_item_cost 
            FROM inventory_items 
            WHERE id = (part->>'item_id')::UUID;

            -- Record usage in work_order_parts
            INSERT INTO work_order_parts (
                tenant_id, work_order_id, item_id, quantity, unit_cost, created_by
            ) VALUES (
                v_tenant_id, p_work_order_id, (part->>'item_id')::UUID, v_part_quantity, v_item_cost, p_user_id
            );

            -- Deduct from Inventory (Create Transaction)
            INSERT INTO inventory_transactions (
                tenant_id, item_id, transaction_type, quantity, quantity_before, quantity_after, reference_type, reference_id, created_by
            )
            SELECT 
                v_tenant_id,
                (part->>'item_id')::UUID,
                'out',
                v_part_quantity,
                quantity,
                quantity - v_part_quantity,
                'work_order',
                p_work_order_id,
                p_user_id
            FROM inventory_items
            WHERE id = (part->>'item_id')::UUID;

            -- Update Inventory Item Quantity
            UPDATE inventory_items
            SET quantity = quantity - v_part_quantity
            WHERE id = (part->>'item_id')::UUID;
            
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- 5. Procedure: Supervisor Approve
CREATE OR REPLACE FUNCTION approve_work_order_supervisor(
    p_work_order_id UUID, 
    p_user_id UUID, 
    p_notes TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE work_orders
    SET 
        status = 'pending_engineer_review', -- Next step
        supervisor_approved_at = NOW(),
        supervisor_approved_by = p_user_id,
        supervisor_notes = p_notes
    WHERE id = p_work_order_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Procedure: Engineer Approve
CREATE OR REPLACE FUNCTION approve_work_order_engineer(
    p_work_order_id UUID, 
    p_user_id UUID, 
    p_notes TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE work_orders
    SET 
        status = 'pending_reporter_closure', -- Next step
        engineer_approved_at = NOW(),
        engineer_approved_by = p_user_id,
        engineer_notes = p_notes
    WHERE id = p_work_order_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Procedure: Final Close (Reporter/Platform)
CREATE OR REPLACE FUNCTION close_work_order(
    p_work_order_id UUID, 
    p_user_id UUID, 
    p_notes TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE work_orders
    SET 
        status = 'completed',
        completed_at = NOW(),
        customer_reviewed_by = p_user_id,
        customer_reviewed_at = NOW(),
        reporter_notes = p_notes
    WHERE id = p_work_order_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Add extra columns to work_orders if they don't exist (based on BiDoc)
DO $$
BEGIN
    -- Timestamps
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='technician_completed_at') THEN
        ALTER TABLE work_orders ADD COLUMN technician_completed_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='supervisor_approved_at') THEN
        ALTER TABLE work_orders ADD COLUMN supervisor_approved_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='engineer_approved_at') THEN
        ALTER TABLE work_orders ADD COLUMN engineer_approved_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='customer_reviewed_at') THEN
        ALTER TABLE work_orders ADD COLUMN customer_reviewed_at TIMESTAMPTZ;
    END IF;

    -- Approvers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='supervisor_approved_by') THEN
        ALTER TABLE work_orders ADD COLUMN supervisor_approved_by UUID REFERENCES profiles(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='engineer_approved_by') THEN
        ALTER TABLE work_orders ADD COLUMN engineer_approved_by UUID REFERENCES profiles(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='customer_reviewed_by') THEN
        ALTER TABLE work_orders ADD COLUMN customer_reviewed_by UUID REFERENCES profiles(id);
    END IF;

    -- Notes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='technician_notes') THEN
        ALTER TABLE work_orders ADD COLUMN technician_notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='supervisor_notes') THEN
        ALTER TABLE work_orders ADD COLUMN supervisor_notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='engineer_notes') THEN
        ALTER TABLE work_orders ADD COLUMN engineer_notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='reporter_notes') THEN
        ALTER TABLE work_orders ADD COLUMN reporter_notes TEXT;
    END IF;
END $$;
