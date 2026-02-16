-- Create function to update timestamp (if not exists)
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create logs table
CREATE TABLE IF NOT EXISTS public.asset_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, -- e.g., 'status_change', 'edit', 'maintenance', 'create'
    previous_status TEXT,
    new_status TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb, -- For storing extra details if needed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.asset_activity_logs ENABLE ROW LEVEL SECURITY;

-- Policies for Row Level Security
-- 1. View logs: Users can view logs belonging to their tenant
CREATE POLICY "Users can view asset logs of their tenant"
    ON public.asset_activity_logs FOR SELECT
    USING (auth.uid() IN (SELECT id FROM public.profiles WHERE tenant_id = asset_activity_logs.tenant_id));

-- 2. Insert logs: Users can insert logs for their tenant
CREATE POLICY "Users can insert asset logs for their tenant"
    ON public.asset_activity_logs FOR INSERT
    WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE tenant_id = asset_activity_logs.tenant_id));

-- Add triggers for updated_at (standard)
CREATE TRIGGER update_asset_activity_logs_modtime
    BEFORE UPDATE ON public.asset_activity_logs
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();
