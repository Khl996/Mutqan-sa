-- =====================================================
-- Migration: 012_subscription_system.sql
-- Purpose: Create subscription plans and tenant subscriptions
-- =====================================================

-- 1. Subscription Plans Table
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

-- 2. Tenant Subscriptions Table
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
    UNIQUE(tenant_id)  -- One active subscription per tenant
);

-- 3. Payment History Table
CREATE TABLE IF NOT EXISTS public.payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.tenant_subscriptions(id),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'SAR',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255),
    invoice_number VARCHAR(100),
    invoice_url TEXT,
    description TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Seed Default Subscription Plans
INSERT INTO public.subscription_plans (code, name, name_ar, description, description_ar, price_monthly, price_yearly, max_users, max_buildings, max_assets, max_work_orders_monthly, features, display_order)
VALUES 
    ('free', 'Free', 'مجاني', 'For small teams getting started', 'للفرق الصغيرة في البداية', 0, 0, 3, 1, 50, 50, '["basic_reporting", "email_support"]'::jsonb, 1),
    ('basic', 'Basic', 'أساسي', 'For growing organizations', 'للمنظمات النامية', 299, 2990, 10, 3, 200, 200, '["basic_reporting", "email_support", "inventory_management", "maintenance_calendar"]'::jsonb, 2),
    ('professional', 'Professional', 'احترافي', 'For professional facilities management', 'لإدارة المرافق الاحترافية', 599, 5990, 25, 10, 1000, 1000, '["advanced_reporting", "priority_support", "inventory_management", "maintenance_calendar", "api_access", "custom_workflows"]'::jsonb, 3),
    ('enterprise', 'Enterprise', 'مؤسسي', 'For large enterprises', 'للمؤسسات الكبيرة', 1499, 14990, -1, -1, -1, -1, '["advanced_reporting", "dedicated_support", "inventory_management", "maintenance_calendar", "api_access", "custom_workflows", "sla_management", "multi_location", "white_label"]'::jsonb, 4)
ON CONFLICT (code) DO NOTHING;

-- 5. Add subscription columns to tenants table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'subscription_tier') THEN
        ALTER TABLE public.tenants ADD COLUMN subscription_tier VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'subscription_status') THEN
        ALTER TABLE public.tenants ADD COLUMN subscription_status VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'subscription_expires_at') THEN
        ALTER TABLE public.tenants ADD COLUMN subscription_expires_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'max_users') THEN
        ALTER TABLE public.tenants ADD COLUMN max_users INTEGER DEFAULT 5;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'max_buildings') THEN
        ALTER TABLE public.tenants ADD COLUMN max_buildings INTEGER DEFAULT 1;
    END IF;
END $$;

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON public.tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON public.tenant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_tenant ON public.payment_history(tenant_id);

-- 7. RLS Policies
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- Plans are readable by everyone
CREATE POLICY "Plans are viewable by authenticated users" ON public.subscription_plans
    FOR SELECT TO authenticated USING (true);

-- Subscriptions viewable by tenant members or platform admins
CREATE POLICY "Subscriptions viewable by tenant members" ON public.tenant_subscriptions
    FOR SELECT TO authenticated
    USING (
        tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin'))
    );

-- Platform admins can manage subscriptions
CREATE POLICY "Platform admins can manage subscriptions" ON public.tenant_subscriptions
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin'))
    );

-- Payment history viewable by tenant admins or platform admins
CREATE POLICY "Payment history viewable by authorized users" ON public.payment_history
    FOR SELECT TO authenticated
    USING (
        tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND role IN ('tenant_admin', 'platform_owner', 'platform_admin'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner', 'platform_admin'))
    );

-- 8. Function to check subscription limits
CREATE OR REPLACE FUNCTION check_subscription_limits(p_tenant_id UUID, p_resource_type VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_limit INTEGER;
    v_current INTEGER;
    v_plan_code VARCHAR;
BEGIN
    -- Get tenant's current plan
    SELECT subscription_tier INTO v_plan_code FROM public.tenants WHERE id = p_tenant_id;
    
    IF v_plan_code IS NULL THEN
        v_plan_code := 'free';
    END IF;
    
    -- Get limit from plan
    SELECT 
        CASE p_resource_type
            WHEN 'users' THEN max_users
            WHEN 'buildings' THEN max_buildings
            WHEN 'assets' THEN max_assets
            WHEN 'work_orders' THEN max_work_orders_monthly
            ELSE -1
        END INTO v_limit
    FROM public.subscription_plans 
    WHERE code = v_plan_code;
    
    -- -1 means unlimited
    IF v_limit = -1 THEN
        RETURN TRUE;
    END IF;
    
    -- Get current count
    IF p_resource_type = 'users' THEN
        SELECT COUNT(*) INTO v_current FROM public.profiles WHERE tenant_id = p_tenant_id;
    ELSIF p_resource_type = 'buildings' THEN
        SELECT COUNT(*) INTO v_current FROM public.buildings WHERE tenant_id = p_tenant_id;
    ELSIF p_resource_type = 'assets' THEN
        SELECT COUNT(*) INTO v_current FROM public.assets WHERE tenant_id = p_tenant_id;
    ELSIF p_resource_type = 'work_orders' THEN
        SELECT COUNT(*) INTO v_current FROM public.work_orders 
        WHERE tenant_id = p_tenant_id 
        AND created_at >= date_trunc('month', CURRENT_DATE);
    ELSE
        RETURN TRUE;
    END IF;
    
    RETURN v_current < v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Trigger to check limits before insert
CREATE OR REPLACE FUNCTION enforce_subscription_limits()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if tenant has reached limits
    IF TG_TABLE_NAME = 'profiles' AND NOT check_subscription_limits(NEW.tenant_id, 'users') THEN
        RAISE EXCEPTION 'User limit reached for this subscription plan';
    END IF;
    
    IF TG_TABLE_NAME = 'buildings' AND NOT check_subscription_limits(NEW.tenant_id, 'buildings') THEN
        RAISE EXCEPTION 'Building limit reached for this subscription plan';
    END IF;
    
    IF TG_TABLE_NAME = 'assets' AND NOT check_subscription_limits(NEW.tenant_id, 'assets') THEN
        RAISE EXCEPTION 'Asset limit reached for this subscription plan';
    END IF;
    
    IF TG_TABLE_NAME = 'work_orders' AND NOT check_subscription_limits(NEW.tenant_id, 'work_orders') THEN
        RAISE EXCEPTION 'Monthly work order limit reached for this subscription plan';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers (commented out by default - enable if you want strict enforcement)
-- CREATE TRIGGER check_profile_limits BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION enforce_subscription_limits();
-- CREATE TRIGGER check_building_limits BEFORE INSERT ON public.buildings FOR EACH ROW EXECUTE FUNCTION enforce_subscription_limits();
-- CREATE TRIGGER check_asset_limits BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION enforce_subscription_limits();
-- CREATE TRIGGER check_work_order_limits BEFORE INSERT ON public.work_orders FOR EACH ROW EXECUTE FUNCTION enforce_subscription_limits();

COMMENT ON TABLE public.subscription_plans IS 'Available subscription plans for the platform';
COMMENT ON TABLE public.tenant_subscriptions IS 'Tenant subscription records';
COMMENT ON TABLE public.payment_history IS 'Payment transaction history';
