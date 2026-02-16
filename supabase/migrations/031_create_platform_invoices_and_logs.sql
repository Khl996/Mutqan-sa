-- ==============================================================================
-- Migration: 031_create_platform_invoices_and_logs.sql
-- Purpose: Ensure subscription tables exist, then create invoices and audit logs
-- ==============================================================================

-- 1. Ensure 'subscription_plans' exists (Dependency for tenant_subscriptions & invoices)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100),
    description TEXT,
    description_ar TEXT,
    price_monthly DECIMAL(10, 2) DEFAULT 0,
    price_yearly DECIMAL(10, 2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'SAR',
    max_users INTEGER DEFAULT 5,
    max_buildings INTEGER DEFAULT 1,
    max_assets INTEGER DEFAULT 100,
    max_work_orders_monthly INTEGER DEFAULT 100,
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Default Plans if table is empty
INSERT INTO public.subscription_plans (code, name, name_ar, description, description_ar, price_monthly, price_yearly, max_users, max_buildings, max_assets, max_work_orders_monthly, features, display_order)
SELECT 'free', 'Free', 'مجاني', 'For small teams getting started', 'للفرق الصغيرة في البداية', 0, 0, 3, 1, 50, 50, '["basic_reporting", "email_support"]'::jsonb, 1
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE code = 'free');

INSERT INTO public.subscription_plans (code, name, name_ar, description, description_ar, price_monthly, price_yearly, max_users, max_buildings, max_assets, max_work_orders_monthly, features, display_order)
SELECT 'basic', 'Basic', 'أساسي', 'For growing organizations', 'للمنظمات النامية', 299, 2990, 10, 3, 200, 200, '["basic_reporting", "email_support", "inventory_management", "maintenance_calendar"]'::jsonb, 2
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE code = 'basic');

INSERT INTO public.subscription_plans (code, name, name_ar, description, description_ar, price_monthly, price_yearly, max_users, max_buildings, max_assets, max_work_orders_monthly, features, display_order)
SELECT 'professional', 'Professional', 'احترافي', 'For professional facilities management', 'لإدارة المرافق الاحترافية', 599, 5990, 25, 10, 1000, 1000, '["advanced_reporting", "priority_support", "inventory_management", "maintenance_calendar", "api_access", "custom_workflows"]'::jsonb, 3
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE code = 'professional');


-- 2. Ensure 'tenant_subscriptions' exists (Dependency for invoices)
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
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

-- 3. Create platform_audit_logs table
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_email TEXT,
    user_name TEXT,
    user_role TEXT,
    action TEXT NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- 'auth', 'create', 'update', 'delete', etc.
    target_type VARCHAR(50), -- 'tenant', 'user', 'subscription', etc.
    target_id TEXT,
    target_name TEXT,
    old_values JSONB,
    new_values JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create platform_invoices table
CREATE TABLE IF NOT EXISTS public.platform_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,
    plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    plan_name VARCHAR(100),
    billing_period_start DATE,
    billing_period_end DATE,
    subtotal DECIMAL(10, 2) DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    discount_code VARCHAR(50),
    tax_rate DECIMAL(5, 2) DEFAULT 15.0, -- Default VAT 15%
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'SAR',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded')),
    due_date DATE,
    paid_at TIMESTAMPTZ,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(100),
    notes TEXT,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.platform_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.platform_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.platform_audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_platform_invoices_tenant_id ON public.platform_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_invoices_status ON public.platform_invoices(status);
CREATE INDEX IF NOT EXISTS idx_platform_invoices_invoice_number ON public.platform_invoices(invoice_number);

-- 6. Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

-- 7. Policies

-- Plans Policies
DROP POLICY IF EXISTS "Plans are viewable by authenticated users" ON public.subscription_plans;
CREATE POLICY "Plans are viewable by authenticated users" ON public.subscription_plans FOR SELECT TO authenticated USING (true);

-- Subscriptions Policies
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

-- Audit Logs Policies
DROP POLICY IF EXISTS "Platform admins can view all audit logs" ON public.platform_audit_logs;
CREATE POLICY "Platform admins can view all audit logs" ON public.platform_audit_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin', 'platform_support'))
    );

DROP POLICY IF EXISTS "Platform admins can insert audit logs" ON public.platform_audit_logs;
CREATE POLICY "Platform admins can insert audit logs" ON public.platform_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Invoices Policies
DROP POLICY IF EXISTS "Platform admins can view all invoices" ON public.platform_invoices;
CREATE POLICY "Platform admins can view all invoices" ON public.platform_invoices
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin', 'platform_finance'))
    );

DROP POLICY IF EXISTS "Platform admins can manage invoices" ON public.platform_invoices;
CREATE POLICY "Platform admins can manage invoices" ON public.platform_invoices
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin', 'platform_finance'))
    );

DROP POLICY IF EXISTS "Tenants can view their own invoices" ON public.platform_invoices;
CREATE POLICY "Tenants can view their own invoices" ON public.platform_invoices
    FOR SELECT TO authenticated
    USING (
        tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    );
