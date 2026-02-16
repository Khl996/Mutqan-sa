-- Create Maintenance Plans Table
CREATE TABLE IF NOT EXISTS maintenance_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    year INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    description TEXT,
    budget DECIMAL(12, 2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- Enable RLS for maintenance_plans
ALTER TABLE maintenance_plans ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to allow re-running the script
DROP POLICY IF EXISTS "Users can view their tenant plans" ON maintenance_plans;
DROP POLICY IF EXISTS "Admins/Managers can manage plans" ON maintenance_plans;

CREATE POLICY "Users can view their tenant plans" ON maintenance_plans
    FOR SELECT USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins/Managers can manage plans" ON maintenance_plans
    FOR ALL USING (
        tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role IN ('tenant_admin', 'maintenance_manager', 'facility_manager')
        )
    );

-- Add maintenance_plan_id to work_orders
ALTER TABLE work_orders 
ADD COLUMN IF NOT EXISTS maintenance_plan_id UUID REFERENCES maintenance_plans(id) ON DELETE SET NULL;

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_work_orders_plan ON work_orders(maintenance_plan_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_plans_tenant ON maintenance_plans(tenant_id);
