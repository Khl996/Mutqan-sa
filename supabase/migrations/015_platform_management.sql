-- =====================================================
-- Migration: 015_platform_management.sql
-- Purpose: Create tables for platform staff, audit logs, and invoices
-- =====================================================

-- 1. Platform Staff Table (for staff management separate from profiles)
CREATE TABLE IF NOT EXISTS public.platform_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('platform_owner', 'platform_admin', 'platform_support', 'platform_finance', 'platform_hr')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    tenants_access VARCHAR(20) DEFAULT 'none' CHECK (tenants_access IN ('all', 'assigned', 'none')),
    assigned_tenants UUID[] DEFAULT '{}',
    permissions JSONB DEFAULT '[]'::jsonb,
    custom_permissions JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    hired_at DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- 2. Platform Audit Logs Table
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    user_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('auth', 'create', 'read', 'update', 'delete', 'export', 'import', 'config', 'warning', 'error')),
    target_type VARCHAR(100), -- e.g., 'tenant', 'user', 'subscription', 'settings'
    target_id UUID,
    target_name VARCHAR(255),
    old_values JSONB,
    new_values JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Platform Invoices Table (enhanced from payment_history)
-- Note: subscription_id and plan_id references removed - add FK later if tables exist
CREATE TABLE IF NOT EXISTS public.platform_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    subscription_id UUID, -- Reference to tenant_subscriptions if exists
    plan_id UUID, -- Reference to subscription_plans if exists
    plan_name VARCHAR(100),
    billing_period_start DATE,
    billing_period_end DATE,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    discount_code VARCHAR(50),
    tax_rate DECIMAL(5, 2) DEFAULT 15.00, -- VAT in KSA
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'SAR',
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded')),
    due_date DATE,
    paid_at TIMESTAMPTZ,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    notes TEXT,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- 4. Platform Financial Summary (materialized view would be better, but simple table for now)
CREATE TABLE IF NOT EXISTS public.platform_financial_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'yearly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_revenue DECIMAL(12, 2) DEFAULT 0,
    total_invoices INTEGER DEFAULT 0,
    paid_invoices INTEGER DEFAULT 0,
    pending_invoices INTEGER DEFAULT 0,
    overdue_invoices INTEGER DEFAULT 0,
    new_subscriptions INTEGER DEFAULT 0,
    cancelled_subscriptions INTEGER DEFAULT 0,
    active_tenants INTEGER DEFAULT 0,
    total_users INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(period_type, period_start)
);

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_platform_staff_user ON public.platform_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_staff_role ON public.platform_staff(role);
CREATE INDEX IF NOT EXISTS idx_platform_staff_status ON public.platform_staff(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.platform_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.platform_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.platform_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.platform_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON public.platform_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.platform_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON public.platform_invoices(due_date);

-- 6. RLS Policies
ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_financial_summary ENABLE ROW LEVEL SECURITY;

-- Platform staff only accessible by platform admins
DROP POLICY IF EXISTS "Platform admins can view staff" ON public.platform_staff;
CREATE POLICY "Platform admins can view staff" ON public.platform_staff
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin')
    ));

DROP POLICY IF EXISTS "Platform owner can manage staff" ON public.platform_staff;
CREATE POLICY "Platform owner can manage staff" ON public.platform_staff
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'platform_owner'
    ));

-- Audit logs readable by platform admins
DROP POLICY IF EXISTS "Platform admins can view audit logs" ON public.platform_audit_logs;
CREATE POLICY "Platform admins can view audit logs" ON public.platform_audit_logs
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin')
    ));

-- Anyone can insert audit logs (for tracking)
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.platform_audit_logs;
CREATE POLICY "Authenticated users can insert audit logs" ON public.platform_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Platform invoices accessible by platform admins and finance
DROP POLICY IF EXISTS "Platform staff can view invoices" ON public.platform_invoices;
CREATE POLICY "Platform staff can view invoices" ON public.platform_invoices
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin', 'platform_finance')
    ));

DROP POLICY IF EXISTS "Platform finance can manage invoices" ON public.platform_invoices;
CREATE POLICY "Platform finance can manage invoices" ON public.platform_invoices
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_finance')
    ));

-- Financial summary accessible by platform admins
DROP POLICY IF EXISTS "Platform admins can view financial summary" ON public.platform_financial_summary;
CREATE POLICY "Platform admins can view financial summary" ON public.platform_financial_summary
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin', 'platform_finance')
    ));

-- 7. Function to log platform actions
CREATE OR REPLACE FUNCTION log_platform_action(
    p_action VARCHAR,
    p_action_type VARCHAR,
    p_target_type VARCHAR DEFAULT NULL,
    p_target_id UUID DEFAULT NULL,
    p_target_name VARCHAR DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
    v_user_email VARCHAR;
    v_user_name VARCHAR;
    v_user_role VARCHAR;
BEGIN
    -- Get user info
    SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
    SELECT full_name, role INTO v_user_name, v_user_role FROM public.profiles WHERE id = auth.uid();
    
    INSERT INTO public.platform_audit_logs (
        user_id, user_email, user_name, user_role,
        action, action_type, target_type, target_id, target_name,
        old_values, new_values, metadata
    ) VALUES (
        auth.uid(), v_user_email, v_user_name, v_user_role,
        p_action, p_action_type, p_target_type, p_target_id, p_target_name,
        p_old_values, p_new_values, p_metadata
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS VARCHAR AS $$
DECLARE
    v_year VARCHAR(4);
    v_sequence INTEGER;
    v_invoice_number VARCHAR(20);
BEGIN
    v_year := to_char(CURRENT_DATE, 'YYYY');
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 10) AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM public.platform_invoices
    WHERE invoice_number LIKE 'INV-' || v_year || '-%';
    
    v_invoice_number := 'INV-' || v_year || '-' || LPAD(v_sequence::TEXT, 4, '0');
    
    RETURN v_invoice_number;
END;
$$ LANGUAGE plpgsql;

-- 9. Keep production replays free from sample staff or billing data
DO $$
BEGIN
    RAISE NOTICE '015_platform_management.sql applied without sample platform staff or invoice seed data.';
END $$;

COMMENT ON TABLE public.platform_staff IS 'Platform staff members with roles and permissions';
COMMENT ON TABLE public.platform_audit_logs IS 'Audit log for all platform actions';
COMMENT ON TABLE public.platform_invoices IS 'Platform invoices for tenant subscriptions';
COMMENT ON TABLE public.platform_financial_summary IS 'Pre-calculated financial summaries';
