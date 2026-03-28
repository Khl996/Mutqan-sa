-- =====================================================
-- Quick Fix: Add missing columns to subscription_plans
-- Run this in SQL Editor first
-- =====================================================

-- Add missing columns to subscription_plans if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'max_users') THEN
        ALTER TABLE public.subscription_plans ADD COLUMN max_users INTEGER DEFAULT 5;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'max_buildings') THEN
        ALTER TABLE public.subscription_plans ADD COLUMN max_buildings INTEGER DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'max_assets') THEN
        ALTER TABLE public.subscription_plans ADD COLUMN max_assets INTEGER DEFAULT 100;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'max_work_orders_monthly') THEN
        ALTER TABLE public.subscription_plans ADD COLUMN max_work_orders_monthly INTEGER DEFAULT 100;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'features') THEN
        ALTER TABLE public.subscription_plans ADD COLUMN features JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'display_order') THEN
        ALTER TABLE public.subscription_plans ADD COLUMN display_order INTEGER DEFAULT 0;
    END IF;
END $$;

-- Create tenant_subscriptions if not exists
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.subscription_plans(id),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'trial', 'expired', 'cancelled', 'suspended')),
    billing_cycle VARCHAR(20) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    current_period_start TIMESTAMPTZ DEFAULT now(),
    current_period_end TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    amount DECIMAL(10, 2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'SAR',
    payment_method JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id)
);

-- Enable RLS
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS for tenant_subscriptions
DROP POLICY IF EXISTS "Subscriptions viewable by tenant members" ON public.tenant_subscriptions;
CREATE POLICY "Subscriptions viewable by tenant members" ON public.tenant_subscriptions
    FOR SELECT TO authenticated
    USING (
        tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin'))
    );

DROP POLICY IF EXISTS "Platform admins can manage subscriptions" ON public.tenant_subscriptions;
CREATE POLICY "Platform admins can manage subscriptions" ON public.tenant_subscriptions
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin'))
    );

-- =====================================================
-- Now create the platform management tables
-- =====================================================

-- 1. Platform Audit Logs Table
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    user_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('auth', 'create', 'read', 'update', 'delete', 'export', 'import', 'config', 'warning', 'error')),
    target_type VARCHAR(100),
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

-- 2. Platform Invoices Table
CREATE TABLE IF NOT EXISTS public.platform_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    subscription_id UUID,
    plan_id UUID,
    plan_name VARCHAR(100),
    billing_period_start DATE,
    billing_period_end DATE,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    discount_code VARCHAR(50),
    tax_rate DECIMAL(5, 2) DEFAULT 15.00,
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

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.platform_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.platform_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.platform_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON public.platform_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.platform_invoices(status);

-- 4. RLS Policies
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

-- Audit logs policies
DROP POLICY IF EXISTS "Platform admins can view audit logs" ON public.platform_audit_logs;
CREATE POLICY "Platform admins can view audit logs" ON public.platform_audit_logs
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin')
    ));

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.platform_audit_logs;
CREATE POLICY "Authenticated users can insert audit logs" ON public.platform_audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

-- Invoice policies
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

-- 5. Keep production replays free from sample invoice data
DO $$
BEGIN
    RAISE NOTICE '016_quick_fix.sql applied without sample invoice seed data.';
END $$;

SELECT 'Migration completed successfully!' as result;
