-- Create Maintenance Tasks Table (Lighter than Work Orders)
CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    maintenance_plan_id UUID REFERENCES maintenance_plans(id) ON DELETE SET NULL,
    
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    assigned_to UUID REFERENCES profiles(id),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium',
    due_date DATE,
    
    -- Link to optional Work Order
    related_work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
    
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view tenant tasks" ON maintenance_tasks
    FOR SELECT USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins and Managers can manage tasks" ON maintenance_tasks
    FOR ALL USING (
        tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
        AND EXISTS (
             SELECT 1 FROM profiles 
             WHERE id = auth.uid() 
             AND role IN ('tenant_admin', 'maintenance_manager', 'supervisor', 'facility_manager')
        )
    );

CREATE POLICY "Technicians can update their tasks" ON maintenance_tasks
    FOR UPDATE USING (
        assigned_to = auth.uid()
    );

-- Index
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_tenant ON maintenance_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_assigned ON maintenance_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_plan ON maintenance_tasks(maintenance_plan_id);
