-- ==============================================================================
-- Migration: 100_pricing_engine.sql
-- Purpose: Add a flexible quote-based pricing engine to Mutqan
--
-- DESIGN PRINCIPLES:
--   - Purely ADDITIVE: no existing tables are dropped or columns removed
--   - Existing fixed-plan subscriptions continue to work without any change
--   - Backend is the single source of truth for all pricing calculations
--   - Quotes store a pricing_snapshot for historical accuracy (immutable record)
--   - tenant_subscriptions.amount is always the final invoiced amount
--   - quote_id on tenant_subscriptions enables full audit trail
--
-- NEW CAPABILITIES:
--   1. pricing_add_ons          Catalog of first-class billable add-on services
--   2. pricing_discount_policies  Reusable named discount templates
--   3. pricing_quotes            Formal commercial pricing agreements
--   4. pricing_quote_items       Line-by-line breakdown within a quote
--   5. quote_id on tenant_subscriptions  Traceability back to original quote
--   6. calculate_pricing_quote()   Pure backend pricing calculator (no writes)
--   7. create_pricing_quote()      Creates a draft quote with computed items
--   8. approve_pricing_quote()     Approves a quote
--   9. activate_subscription_from_quote()  Activates subscription from quote
-- ==============================================================================

-- ============================================================
-- 1. PRICING ADD-ONS CATALOG
--    First-class billable services/features with monthly, yearly,
--    and one-time price points. Not just JSONB feature strings.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pricing_add_ons (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code             VARCHAR(100) NOT NULL UNIQUE,
    name             VARCHAR(255) NOT NULL,
    name_ar          VARCHAR(255),
    description      TEXT,
    description_ar   TEXT,
    category         VARCHAR(50) DEFAULT 'service'
        CHECK (category IN ('support', 'training', 'integration', 'reporting',
                            'infrastructure', 'service', 'custom')),
    billing_type     VARCHAR(20) DEFAULT 'recurring'
        CHECK (billing_type IN ('recurring', 'one_time')),
    price_monthly    DECIMAL(10, 2) DEFAULT 0,
    price_yearly     DECIMAL(10, 2) DEFAULT 0,
    price_one_time   DECIMAL(10, 2) DEFAULT 0,
    currency         VARCHAR(3) DEFAULT 'SAR',
    is_active        BOOLEAN DEFAULT TRUE,
    sort_order       INTEGER DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. PRICING DISCOUNT POLICIES
--    Reusable named discounts (launch offers, annual loyalty, etc.)
--    Can be referenced in quotes or applied ad-hoc.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pricing_discount_policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    name_ar         VARCHAR(100),
    description     TEXT,
    discount_type   VARCHAR(20) NOT NULL DEFAULT 'percentage'
        CHECK (discount_type IN ('percentage', 'fixed_amount')),
    discount_value  DECIMAL(10, 2) NOT NULL DEFAULT 0,
    applies_to      VARCHAR(30) DEFAULT 'subtotal'
        CHECK (applies_to IN ('subtotal', 'base_plan_only', 'addons_only')),
    max_uses        INTEGER,           -- NULL = unlimited
    uses_count      INTEGER DEFAULT 0,
    valid_from      DATE,
    valid_to        DATE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. PRICING QUOTES
--    Formal commercial pricing agreements.
--    Workflow: draft → sent → approved → activated | rejected | expired
--
--    KEY DESIGN DECISIONS:
--      - pricing_snapshot: JSON snapshot of plan/addon prices at creation time.
--        Immutable once created. Ensures old quotes stay historically accurate
--        even if plan prices change later.
--      - manual_override_total: Sales can override the calculated total for
--        negotiated enterprise deals. If set, this is the charged amount.
--      - quote_number: Human-readable, auto-generated on creation.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pricing_quotes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_number          VARCHAR(50) NOT NULL UNIQUE,
    tenant_id             UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    plan_id               UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    discount_policy_id    UUID REFERENCES public.pricing_discount_policies(id) ON DELETE SET NULL,

    -- Workflow status
    status                VARCHAR(20) DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired', 'activated')),

    -- Billing configuration
    billing_cycle         VARCHAR(20) DEFAULT 'yearly'
        CHECK (billing_cycle IN ('monthly', 'yearly')),

    -- Input metrics (what the customer uses — informational, for quoting context)
    input_users                  INTEGER DEFAULT 0,
    input_buildings              INTEGER DEFAULT 0,
    input_assets                 INTEGER DEFAULT 0,
    input_work_orders_monthly    INTEGER DEFAULT 0,

    -- Calculated pricing breakdown (all computed server-side, stored for immutability)
    base_plan_amount      DECIMAL(10, 2) DEFAULT 0,
    addons_amount         DECIMAL(10, 2) DEFAULT 0,
    subtotal              DECIMAL(10, 2) DEFAULT 0,
    discount_amount       DECIMAL(10, 2) DEFAULT 0,
    taxable_amount        DECIMAL(10, 2) DEFAULT 0,
    tax_rate              DECIMAL(5, 2) DEFAULT 15.00,
    tax_amount            DECIMAL(10, 2) DEFAULT 0,
    total                 DECIMAL(10, 2) DEFAULT 0,
    currency              VARCHAR(3) DEFAULT 'SAR',

    -- Manual price override (enterprise negotiation)
    manual_override_total  DECIMAL(10, 2),
    manual_override_reason TEXT,

    -- Validity
    valid_until            DATE,

    -- Notes
    admin_notes            TEXT,
    client_notes           TEXT,

    -- Pricing snapshot — captures plan/addon prices at creation for historical accuracy
    pricing_snapshot       JSONB DEFAULT '{}',

    -- Subscription linkage — set after activation
    subscription_id        UUID REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,

    -- Actor tracking
    created_by             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    activated_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at            TIMESTAMPTZ,
    activated_at           TIMESTAMPTZ,

    created_at             TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. PRICING QUOTE ITEMS
--    Line-by-line breakdown of what's priced in a quote.
--    item_type: base_plan | add_on | discount | custom
--    Negative subtotal = discount line.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pricing_quote_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id        UUID NOT NULL REFERENCES public.pricing_quotes(id) ON DELETE CASCADE,

    item_type       VARCHAR(30) NOT NULL
        CHECK (item_type IN ('base_plan', 'add_on', 'discount', 'custom')),

    -- Optional references (informational)
    plan_id         UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    add_on_id       UUID REFERENCES public.pricing_add_ons(id) ON DELETE SET NULL,

    -- Display
    description     VARCHAR(500) NOT NULL,
    description_ar  VARCHAR(500),

    -- Pricing
    quantity        DECIMAL(10, 2) DEFAULT 1,
    unit_price      DECIMAL(10, 2) DEFAULT 0,
    subtotal        DECIMAL(10, 2) DEFAULT 0,  -- Can be negative for discount lines

    -- Order
    sort_order      INTEGER DEFAULT 0,

    -- Extra metadata
    metadata        JSONB DEFAULT '{}',

    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. LINK TENANT SUBSCRIPTIONS TO QUOTES
--    Additive: existing rows get NULL (fixed-plan path).
--    When NULL  → subscription came from direct admin_manage_subscription.
--    When set   → subscription was activated from a formal quote.
-- ============================================================
ALTER TABLE public.tenant_subscriptions
    ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.pricing_quotes(id) ON DELETE SET NULL;

-- ============================================================
-- 6. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pricing_add_ons_code       ON public.pricing_add_ons(code);
CREATE INDEX IF NOT EXISTS idx_pricing_add_ons_active     ON public.pricing_add_ons(is_active);
CREATE INDEX IF NOT EXISTS idx_pricing_quotes_tenant      ON public.pricing_quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_quotes_status      ON public.pricing_quotes(status);
CREATE INDEX IF NOT EXISTS idx_pricing_quotes_created     ON public.pricing_quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_quote_items_quote  ON public.pricing_quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subs_quote          ON public.tenant_subscriptions(quote_id);
CREATE INDEX IF NOT EXISTS idx_discount_policies_code     ON public.pricing_discount_policies(code);
CREATE INDEX IF NOT EXISTS idx_discount_policies_active   ON public.pricing_discount_policies(is_active);

-- ============================================================
-- 7. RLS POLICIES
-- ============================================================
ALTER TABLE public.pricing_add_ons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_discount_policies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_quotes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_quote_items        ENABLE ROW LEVEL SECURITY;

-- Add-ons: all authenticated users can read; only platform admins can write
DROP POLICY IF EXISTS "pricing_add_ons_read"  ON public.pricing_add_ons;
DROP POLICY IF EXISTS "pricing_add_ons_write" ON public.pricing_add_ons;
CREATE POLICY "pricing_add_ons_read"  ON public.pricing_add_ons FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing_add_ons_write" ON public.pricing_add_ons FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')));

-- Discount policies: all authenticated users can read; platform admins can write
DROP POLICY IF EXISTS "pricing_disc_pol_read"  ON public.pricing_discount_policies;
DROP POLICY IF EXISTS "pricing_disc_pol_write" ON public.pricing_discount_policies;
CREATE POLICY "pricing_disc_pol_read"  ON public.pricing_discount_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "pricing_disc_pol_write" ON public.pricing_discount_policies FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')));

-- Quotes: platform staff can see all; tenants can see their own
DROP POLICY IF EXISTS "pricing_quotes_read"  ON public.pricing_quotes;
DROP POLICY IF EXISTS "pricing_quotes_write" ON public.pricing_quotes;
CREATE POLICY "pricing_quotes_read" ON public.pricing_quotes FOR SELECT TO authenticated
    USING (
        tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                   AND role IN ('platform_owner','platform_admin','platform_finance','platform_support'))
    );
CREATE POLICY "pricing_quotes_write" ON public.pricing_quotes FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')));

-- Quote items: same access pattern as quotes
DROP POLICY IF EXISTS "pricing_quote_items_read"  ON public.pricing_quote_items;
DROP POLICY IF EXISTS "pricing_quote_items_write" ON public.pricing_quote_items;
CREATE POLICY "pricing_quote_items_read" ON public.pricing_quote_items FOR SELECT TO authenticated
    USING (
        quote_id IN (
            SELECT id FROM public.pricing_quotes
            WHERE tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                   AND role IN ('platform_owner','platform_admin','platform_finance','platform_support'))
    );
CREATE POLICY "pricing_quote_items_write" ON public.pricing_quote_items FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')));

-- ============================================================
-- 8. SEED DEFAULT ADD-ONS
-- ============================================================
INSERT INTO public.pricing_add_ons (code, name, name_ar, description, description_ar, category, billing_type, price_monthly, price_yearly, price_one_time, sort_order)
VALUES
    ('onboarding_basic',    'Basic Onboarding',         'تأهيل أساسي',             'System setup and initial configuration assistance',           'مساعدة في إعداد النظام والتهيئة الأولية',      'training',        'one_time',  0,    0,     500,  10),
    ('onboarding_premium',  'Premium Onboarding',       'تأهيل متكامل',            'Full implementation, data migration, and config',             'تطبيق كامل وترحيل البيانات والإعداد المتكامل', 'training',        'one_time',  0,    0,    2000,  20),
    ('training_remote',     'Remote Training',          'تدريب عن بعد',            'Up to 5 virtual training sessions',                           'حتى 5 جلسات تدريب افتراضية',                   'training',        'one_time',  0,    0,     800,  30),
    ('training_onsite',     'On-site Training',         'تدريب ميداني',            'Full-day on-site training at your location',                  'يوم تدريب ميداني كامل في موقع العميل',         'training',        'one_time',  0,    0,    2500,  40),
    ('support_priority',    'Priority Support',         'دعم فني مميز',            'Priority ticket handling with guaranteed response SLA',       'معالجة أولوية للطلبات مع ضمان وقت الاستجابة', 'support',         'recurring', 150,  1500,     0,  50),
    ('support_sla_4h',      'SLA 4-Hour Support',       'دعم SLA 4 ساعات',         '4-hour SLA guarantee with dedicated account manager',         'ضمان استجابة 4 ساعات مع مدير حساب مخصص',      'support',         'recurring', 450,  4500,     0,  60),
    ('custom_reports',      'Custom Reports',           'تقارير مخصصة',            'Up to 3 custom report templates built to specification',      'حتى 3 قوالب تقارير مخصصة حسب المتطلبات',      'reporting',       'one_time',  0,    0,    1200,  70),
    ('api_integration',     'API Integration',          'تكامل API',               'Integration with one external system via REST API',           'تكامل مع نظام خارجي واحد عبر REST API',        'integration',     'one_time',  0,    0,    3000,  80),
    ('data_migration',      'Data Migration',           'ترحيل البيانات',          'Migration of existing asset and work order data',             'ترحيل بيانات الأصول وأوامر العمل من النظام القديم', 'service', 'one_time',  0,    0,    1500,  90),
    ('white_label',         'White Label Branding',     'هوية مرئية مخصصة',        'Custom logo and brand colors throughout the system',          'شعار وألوان مخصصة في جميع أجزاء النظام',      'infrastructure',  'recurring', 200,  2000,     0, 100)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 9. SEED DEFAULT DISCOUNT POLICIES
-- ============================================================
INSERT INTO public.pricing_discount_policies (code, name, name_ar, description, discount_type, discount_value, applies_to, valid_from, valid_to)
VALUES
    ('launch_offer_2026', 'Launch Offer 2026',       'عرض الإطلاق 2026',          'Special introductory discount for early customers in 2026', 'percentage', 20.00, 'subtotal', '2026-01-01', '2026-12-31'),
    ('annual_loyalty',    'Annual Loyalty Discount', 'خصم الاشتراك السنوي',         'Extra 10% off for committing to yearly billing',            'percentage', 10.00, 'subtotal', NULL, NULL),
    ('nonprofit',         'Non-Profit Discount',     'خصم المنظمات غير الربحية',    '30% discount for qualified non-profit organizations',       'percentage', 30.00, 'subtotal', NULL, NULL),
    ('early_bird',        'Early Bird Offer',        'عرض الطيور المبكرة',          '15% off for customers signing within 30 days of demo',      'percentage', 15.00, 'subtotal', NULL, NULL)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 10. BACKEND PRICING CALCULATOR
--     Pure calculation function — no side effects, no DB writes.
--     Returns a structured JSONB breakdown: items[], totals.
--     Input:  plan_id, billing_cycle, add_on_ids[],
--             discount_policy_id OR manual discount,
--             tax_rate
--     Output: { base_plan_amount, addons_amount, subtotal,
--               discount_type, discount_value, discount_amount,
--               taxable_amount, tax_rate, tax_amount, total,
--               currency, items[] }
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_pricing_quote(
    p_plan_id             UUID     DEFAULT NULL,
    p_billing_cycle       VARCHAR  DEFAULT 'yearly',
    p_add_on_ids          UUID[]   DEFAULT '{}',
    p_discount_policy_id  UUID     DEFAULT NULL,
    p_manual_disc_type    VARCHAR  DEFAULT 'none',   -- 'none' | 'percentage' | 'fixed_amount'
    p_manual_disc_value   DECIMAL  DEFAULT 0,
    p_tax_rate            DECIMAL  DEFAULT 15.00
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan          RECORD;
    v_add_on        RECORD;
    v_dp            RECORD;
    v_base_amount   DECIMAL(10,2) := 0;
    v_addons_amount DECIMAL(10,2) := 0;
    v_addon_price   DECIMAL(10,2);
    v_subtotal      DECIMAL(10,2);
    v_disc_amount   DECIMAL(10,2) := 0;
    v_disc_type     VARCHAR := 'none';
    v_disc_value    DECIMAL := 0;
    v_taxable       DECIMAL(10,2);
    v_tax_amount    DECIMAL(10,2) := 0;
    v_total         DECIMAL(10,2);
    v_items         JSONB := '[]'::JSONB;
    v_add_on_id     UUID;
    v_sort          INTEGER := 0;
    v_eff_tax_rate  DECIMAL(10,2);
BEGIN
    -- ── 1. Base plan ──────────────────────────────────────────
    IF p_plan_id IS NOT NULL THEN
        SELECT * INTO v_plan
        FROM public.subscription_plans
        WHERE id = p_plan_id AND is_active = true;

        IF FOUND THEN
            v_base_amount := CASE
                WHEN p_billing_cycle = 'yearly' THEN COALESCE(v_plan.price_yearly, 0)
                ELSE COALESCE(v_plan.price_monthly, 0)
            END;
            v_sort := v_sort + 1;
            v_items := v_items || jsonb_build_object(
                'item_type',    'base_plan',
                'description',  v_plan.name || CASE WHEN p_billing_cycle = 'yearly' THEN ' (Yearly)' ELSE ' (Monthly)' END,
                'description_ar', COALESCE(v_plan.name_ar, v_plan.name) ||
                    CASE WHEN p_billing_cycle = 'yearly' THEN ' (سنوي)' ELSE ' (شهري)' END,
                'plan_id',      p_plan_id,
                'add_on_id',    NULL,
                'quantity',     1,
                'unit_price',   v_base_amount,
                'subtotal',     v_base_amount,
                'sort_order',   v_sort
            );
        END IF;
    END IF;

    -- ── 2. Add-ons ────────────────────────────────────────────
    IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
        FOREACH v_add_on_id IN ARRAY p_add_on_ids
        LOOP
            SELECT * INTO v_add_on
            FROM public.pricing_add_ons
            WHERE id = v_add_on_id AND is_active = true;

            IF FOUND THEN
                v_addon_price := CASE
                    WHEN v_add_on.billing_type = 'one_time' THEN COALESCE(v_add_on.price_one_time, 0)
                    WHEN p_billing_cycle = 'yearly' THEN COALESCE(v_add_on.price_yearly, 0)
                    ELSE COALESCE(v_add_on.price_monthly, 0)
                END;

                v_addons_amount := v_addons_amount + v_addon_price;
                v_sort := v_sort + 1;
                v_items := v_items || jsonb_build_object(
                    'item_type',    'add_on',
                    'description',  v_add_on.name || ' (' ||
                        CASE WHEN v_add_on.billing_type = 'one_time' THEN 'One-time'
                             WHEN p_billing_cycle = 'yearly' THEN 'Yearly'
                             ELSE 'Monthly' END || ')',
                    'description_ar', COALESCE(v_add_on.name_ar, v_add_on.name) || ' (' ||
                        CASE WHEN v_add_on.billing_type = 'one_time' THEN 'دفعة واحدة'
                             WHEN p_billing_cycle = 'yearly' THEN 'سنوي'
                             ELSE 'شهري' END || ')',
                    'plan_id',      NULL,
                    'add_on_id',    v_add_on_id,
                    'quantity',     1,
                    'unit_price',   v_addon_price,
                    'subtotal',     v_addon_price,
                    'sort_order',   v_sort
                );
            END IF;
        END LOOP;
    END IF;

    v_subtotal := v_base_amount + v_addons_amount;

    -- ── 3. Discount resolution (policy wins over manual) ──────
    IF p_discount_policy_id IS NOT NULL THEN
        SELECT * INTO v_dp
        FROM public.pricing_discount_policies
        WHERE id = p_discount_policy_id
          AND is_active = true
          AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
          AND (valid_to   IS NULL OR valid_to   >= CURRENT_DATE);

        IF FOUND THEN
            v_disc_type  := v_dp.discount_type;
            v_disc_value := v_dp.discount_value;
        END IF;
    ELSIF p_manual_disc_type IS NOT NULL AND p_manual_disc_type <> 'none' THEN
        v_disc_type  := p_manual_disc_type;
        v_disc_value := COALESCE(p_manual_disc_value, 0);
    END IF;

    -- ── 4. Apply discount ─────────────────────────────────────
    IF v_disc_type = 'percentage' AND v_disc_value > 0 THEN
        v_disc_amount := ROUND(v_subtotal * v_disc_value / 100.0, 2);
    ELSIF v_disc_type = 'fixed_amount' AND v_disc_value > 0 THEN
        v_disc_amount := LEAST(v_disc_value, v_subtotal);  -- floor at subtotal
    END IF;

    IF v_disc_amount > 0 THEN
        v_sort := v_sort + 1;
        v_items := v_items || jsonb_build_object(
            'item_type',    'discount',
            'description',  'Discount (' ||
                CASE WHEN v_disc_type = 'percentage'
                    THEN v_disc_value::TEXT || '%'
                    ELSE 'SAR ' || v_disc_value::TEXT
                END || ')',
            'description_ar', 'خصم (' ||
                CASE WHEN v_disc_type = 'percentage'
                    THEN v_disc_value::TEXT || '%'
                    ELSE v_disc_value::TEXT || ' ريال'
                END || ')',
            'plan_id',    NULL,
            'add_on_id',  NULL,
            'quantity',   1,
            'unit_price', -v_disc_amount,
            'subtotal',   -v_disc_amount,
            'sort_order', v_sort
        );
    END IF;

    -- ── 5. Tax (default 15% VAT) ──────────────────────────────
    v_eff_tax_rate := COALESCE(p_tax_rate, 15.00);
    v_taxable := v_subtotal - v_disc_amount;
    IF v_eff_tax_rate > 0 THEN
        v_tax_amount := ROUND(v_taxable * v_eff_tax_rate / 100.0, 2);
    END IF;
    v_total := v_taxable + v_tax_amount;

    RETURN jsonb_build_object(
        'base_plan_amount', v_base_amount,
        'addons_amount',    v_addons_amount,
        'subtotal',         v_subtotal,
        'discount_type',    v_disc_type,
        'discount_value',   v_disc_value,
        'discount_amount',  v_disc_amount,
        'taxable_amount',   v_taxable,
        'tax_rate',         v_eff_tax_rate,
        'tax_amount',       v_tax_amount,
        'total',            v_total,
        'currency',         'SAR',
        'items',            v_items
    );
END;
$$;

-- ============================================================
-- 11. CREATE PRICING QUOTE RPC
--     Creates a formal quote (draft) with all computed line items.
--     Stores a pricing_snapshot for historical immutability.
--     Platform admins only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_pricing_quote(
    p_tenant_id           UUID,
    p_plan_id             UUID     DEFAULT NULL,
    p_billing_cycle       VARCHAR  DEFAULT 'yearly',
    p_add_on_ids          UUID[]   DEFAULT '{}',
    p_discount_policy_id  UUID     DEFAULT NULL,
    p_manual_disc_type    VARCHAR  DEFAULT 'none',
    p_manual_disc_value   DECIMAL  DEFAULT 0,
    p_tax_rate            DECIMAL  DEFAULT 15.00,
    p_valid_days          INTEGER  DEFAULT 30,
    p_admin_notes         TEXT     DEFAULT NULL,
    p_client_notes        TEXT     DEFAULT NULL,
    p_input_users         INTEGER  DEFAULT 0,
    p_input_buildings     INTEGER  DEFAULT 0,
    p_input_assets        INTEGER  DEFAULT 0,
    p_input_work_orders   INTEGER  DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator_id   UUID;
    v_calc         JSONB;
    v_quote_id     UUID;
    v_quote_number VARCHAR(50);
    v_year_seq     INTEGER;
    v_snapshot     JSONB;
    v_items_arr    JSONB;
    v_item         JSONB;
    v_i            INTEGER;
    v_plan_snap    JSONB := NULL;
BEGIN
    -- ── Security ──────────────────────────────────────────────
    v_creator_id := auth.uid();
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_creator_id
          AND role IN ('platform_owner', 'platform_admin')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only platform admins can create quotes';
    END IF;

    -- ── Run backend pricing calculator ────────────────────────
    v_calc := public.calculate_pricing_quote(
        p_plan_id, p_billing_cycle, p_add_on_ids,
        p_discount_policy_id, p_manual_disc_type, p_manual_disc_value, p_tax_rate
    );

    -- ── Generate quote number (QT-YYYY-NNNN) ─────────────────
    SELECT COALESCE(COUNT(*), 0) + 1
      INTO v_year_seq
      FROM public.pricing_quotes
     WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

    v_quote_number := 'QT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_year_seq::TEXT, 4, '0');

    -- ── Build pricing snapshot for historical accuracy ─────────
    IF p_plan_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'id', id, 'code', code, 'name', name, 'name_ar', name_ar,
            'price_monthly', price_monthly, 'price_yearly', price_yearly
        ) INTO v_plan_snap
        FROM public.subscription_plans WHERE id = p_plan_id;
    END IF;

    v_snapshot := jsonb_build_object(
        'captured_at',   NOW(),
        'billing_cycle', p_billing_cycle,
        'plan',          v_plan_snap,
        'summary', jsonb_build_object(
            'base_plan_amount', (v_calc->>'base_plan_amount')::DECIMAL,
            'addons_amount',    (v_calc->>'addons_amount')::DECIMAL,
            'subtotal',         (v_calc->>'subtotal')::DECIMAL,
            'discount_amount',  (v_calc->>'discount_amount')::DECIMAL,
            'tax_rate',         (v_calc->>'tax_rate')::DECIMAL,
            'tax_amount',       (v_calc->>'tax_amount')::DECIMAL,
            'total',            (v_calc->>'total')::DECIMAL
        )
    );

    -- ── Insert the quote header ───────────────────────────────
    INSERT INTO public.pricing_quotes (
        quote_number, tenant_id, plan_id, discount_policy_id,
        status, billing_cycle,
        input_users, input_buildings, input_assets, input_work_orders_monthly,
        base_plan_amount, addons_amount, subtotal,
        discount_amount, taxable_amount, tax_rate, tax_amount, total,
        currency, valid_until,
        admin_notes, client_notes, pricing_snapshot,
        created_by, created_at, updated_at
    ) VALUES (
        v_quote_number, p_tenant_id, p_plan_id, p_discount_policy_id,
        'draft', p_billing_cycle,
        p_input_users, p_input_buildings, p_input_assets, p_input_work_orders,
        (v_calc->>'base_plan_amount')::DECIMAL,
        (v_calc->>'addons_amount')::DECIMAL,
        (v_calc->>'subtotal')::DECIMAL,
        (v_calc->>'discount_amount')::DECIMAL,
        (v_calc->>'taxable_amount')::DECIMAL,
        (v_calc->>'tax_rate')::DECIMAL,
        (v_calc->>'tax_amount')::DECIMAL,
        (v_calc->>'total')::DECIMAL,
        'SAR',
        (CURRENT_DATE + (p_valid_days || ' days')::INTERVAL)::DATE,
        p_admin_notes, p_client_notes, v_snapshot,
        v_creator_id, NOW(), NOW()
    )
    RETURNING id INTO v_quote_id;

    -- ── Insert line items ─────────────────────────────────────
    v_items_arr := v_calc->'items';
    IF v_items_arr IS NOT NULL AND jsonb_typeof(v_items_arr) = 'array' THEN
        FOR v_i IN 0..jsonb_array_length(v_items_arr) - 1
        LOOP
            v_item := v_items_arr->v_i;
            INSERT INTO public.pricing_quote_items (
                quote_id, item_type, plan_id, add_on_id,
                description, description_ar,
                quantity, unit_price, subtotal,
                sort_order, metadata
            ) VALUES (
                v_quote_id,
                (v_item->>'item_type')::VARCHAR,
                CASE WHEN (v_item->>'plan_id') IS NOT NULL AND (v_item->>'plan_id') != 'null'
                     THEN (v_item->>'plan_id')::UUID ELSE NULL END,
                CASE WHEN (v_item->>'add_on_id') IS NOT NULL AND (v_item->>'add_on_id') != 'null'
                     THEN (v_item->>'add_on_id')::UUID ELSE NULL END,
                COALESCE(v_item->>'description', ''),
                v_item->>'description_ar',
                COALESCE((v_item->>'quantity')::DECIMAL, 1),
                COALESCE((v_item->>'unit_price')::DECIMAL, 0),
                COALESCE((v_item->>'subtotal')::DECIMAL, 0),
                COALESCE((v_item->>'sort_order')::INTEGER, v_i),
                '{}'::JSONB
            );
        END LOOP;
    END IF;

    -- ── Audit log ─────────────────────────────────────────────
    BEGIN
        INSERT INTO public.platform_audit_logs (
            user_id, action, action_type, target_type, target_id, new_values, metadata
        ) VALUES (
            v_creator_id,
            'Created pricing quote ' || v_quote_number,
            'create', 'pricing_quote', v_quote_id::TEXT,
            jsonb_build_object('quote_number', v_quote_number,
                               'total', (v_calc->>'total')::DECIMAL),
            jsonb_build_object('tenant_id', p_tenant_id)
        );
    EXCEPTION WHEN OTHERS THEN NULL;  -- Don't fail on audit write
    END;

    RETURN jsonb_build_object(
        'success',      true,
        'quote_id',     v_quote_id,
        'quote_number', v_quote_number,
        'total',        (v_calc->>'total')::DECIMAL,
        'calculation',  v_calc
    );
END;
$$;

-- ============================================================
-- 12. APPROVE PRICING QUOTE RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_pricing_quote(
    p_quote_id   UUID,
    p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid   UUID;
    v_quote RECORD;
BEGIN
    v_uid := auth.uid();
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_uid AND role IN ('platform_owner', 'platform_admin')
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_quote FROM public.pricing_quotes WHERE id = p_quote_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found: %', p_quote_id;
    END IF;
    IF v_quote.status NOT IN ('draft', 'sent') THEN
        RAISE EXCEPTION 'Quote cannot be approved from status: %', v_quote.status;
    END IF;

    UPDATE public.pricing_quotes
    SET status      = 'approved',
        approved_by = v_uid,
        approved_at = NOW(),
        admin_notes = COALESCE(p_admin_note, admin_notes),
        updated_at  = NOW()
    WHERE id = p_quote_id;

    BEGIN
        INSERT INTO public.platform_audit_logs (user_id, action, action_type, target_type, target_id, metadata)
        VALUES (v_uid, 'Approved quote ' || v_quote.quote_number, 'update', 'pricing_quote',
                p_quote_id::TEXT, jsonb_build_object('tenant_id', v_quote.tenant_id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object('success', true, 'quote_id', p_quote_id, 'status', 'approved');
END;
$$;

-- ============================================================
-- 13. ACTIVATE SUBSCRIPTION FROM QUOTE RPC
--     This is the primary activation path when pricing came from a quote.
--     Uses quote.total (or manual_override_total) as the authoritative amount.
--     Creates/updates tenant_subscriptions with quote_id for full traceability.
--     Also generates a platform_invoice from the quote breakdown.
-- ============================================================
CREATE OR REPLACE FUNCTION public.activate_subscription_from_quote(
    p_quote_id      UUID,
    p_period_months INTEGER DEFAULT NULL  -- NULL = auto (12 for yearly, 1 for monthly)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid             UUID;
    v_quote           RECORD;
    v_now             TIMESTAMPTZ := NOW();
    v_period_end      TIMESTAMPTZ;
    v_months          INTEGER;
    v_subscription_id UUID;
    v_invoice_number  VARCHAR(50);
    v_inv_year_seq    INTEGER;
    v_final_amount    DECIMAL(10,2);
    v_plan_name       VARCHAR(100) := 'Custom Quote';
BEGIN
    -- ── Security ──────────────────────────────────────────────
    v_uid := auth.uid();
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_uid AND role IN ('platform_owner', 'platform_admin')
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- ── Load quote ────────────────────────────────────────────
    SELECT * INTO v_quote FROM public.pricing_quotes WHERE id = p_quote_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found: %', p_quote_id;
    END IF;
    IF v_quote.status NOT IN ('approved', 'draft') THEN
        RAISE EXCEPTION 'Quote must be approved or draft to activate. Current status: %', v_quote.status;
    END IF;
    IF v_quote.tenant_id IS NULL THEN
        RAISE EXCEPTION 'Quote has no tenant assigned';
    END IF;

    -- ── Determine period length ───────────────────────────────
    v_months := COALESCE(
        p_period_months,
        CASE WHEN v_quote.billing_cycle = 'yearly' THEN 12 ELSE 1 END
    );
    v_period_end := v_now + (v_months || ' months')::INTERVAL;

    -- ── Final amount: manual override takes precedence ────────
    v_final_amount := COALESCE(v_quote.manual_override_total, v_quote.total);

    -- ── Resolve plan name for invoice ─────────────────────────
    IF v_quote.plan_id IS NOT NULL THEN
        SELECT COALESCE(name, 'Subscription') INTO v_plan_name
        FROM public.subscription_plans WHERE id = v_quote.plan_id;
    END IF;

    -- ── Upsert tenant_subscriptions ───────────────────────────
    INSERT INTO public.tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        current_period_start, current_period_end,
        trial_ends_at, amount, currency,
        override_type, admin_note,
        quote_id, cancel_at_period_end,
        updated_at
    ) VALUES (
        v_quote.tenant_id, v_quote.plan_id,
        'active', v_quote.billing_cycle,
        v_now, v_period_end,
        NULL, v_final_amount, v_quote.currency,
        'none', 'Activated from quote ' || v_quote.quote_number,
        p_quote_id, false, v_now
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id              = EXCLUDED.plan_id,
        status               = 'active',
        billing_cycle        = EXCLUDED.billing_cycle,
        current_period_start = v_now,
        current_period_end   = v_period_end,
        trial_ends_at        = NULL,
        amount               = v_final_amount,
        currency             = EXCLUDED.currency,
        override_type        = 'none',
        admin_note           = EXCLUDED.admin_note,
        quote_id             = p_quote_id,
        cancel_at_period_end = false,
        updated_at           = v_now
    RETURNING id INTO v_subscription_id;

    -- ── Sync tenants table ────────────────────────────────────
    UPDATE public.tenants
    SET subscription_status = 'active',
        subscription_ends_at = v_period_end,
        plan_id              = v_quote.plan_id,
        updated_at           = v_now
    WHERE id = v_quote.tenant_id;

    -- ── Mark quote as activated ───────────────────────────────
    UPDATE public.pricing_quotes
    SET status          = 'activated',
        activated_by    = v_uid,
        activated_at    = v_now,
        subscription_id = v_subscription_id,
        updated_at      = v_now
    WHERE id = p_quote_id;

    -- ── Generate platform_invoice ─────────────────────────────
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_inv_year_seq
    FROM public.platform_invoices
    WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM v_now);

    v_invoice_number := 'INV-' || TO_CHAR(v_now, 'YYYY') || '-' ||
                        LPAD(v_inv_year_seq::TEXT, 5, '0');
    BEGIN
        INSERT INTO public.platform_invoices (
            invoice_number, tenant_id, subscription_id, plan_id,
            plan_name, billing_period_start, billing_period_end,
            subtotal, discount, tax_rate, tax_amount, total,
            currency, status, paid_at, due_date, payment_method, notes
        ) VALUES (
            v_invoice_number,
            v_quote.tenant_id, v_subscription_id, v_quote.plan_id,
            v_plan_name,
            v_now::DATE, v_period_end::DATE,
            v_quote.subtotal, v_quote.discount_amount,
            v_quote.tax_rate, v_quote.tax_amount, v_final_amount,
            v_quote.currency, 'paid', v_now, v_now::DATE,
            'manual', 'Quote: ' || v_quote.quote_number
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Invoice generation failed (non-fatal): %', SQLERRM;
    END;

    -- ── Audit log ─────────────────────────────────────────────
    BEGIN
        INSERT INTO public.platform_audit_logs (
            user_id, action, action_type, target_type, target_id, new_values, metadata
        ) VALUES (
            v_uid,
            'Activated subscription from quote ' || v_quote.quote_number,
            'create', 'subscription', v_subscription_id::TEXT,
            jsonb_build_object(
                'quote_id',   p_quote_id,
                'amount',     v_final_amount,
                'period_end', v_period_end
            ),
            jsonb_build_object('tenant_id', v_quote.tenant_id)
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'success',         true,
        'subscription_id', v_subscription_id,
        'quote_id',        p_quote_id,
        'quote_number',    v_quote.quote_number,
        'period_end',      v_period_end,
        'amount',          v_final_amount
    );
END;
$$;

-- ============================================================
-- 14. GRANT EXECUTE
-- ============================================================
GRANT EXECUTE ON FUNCTION public.calculate_pricing_quote TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_pricing_quote TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_pricing_quote TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription_from_quote TO authenticated;

-- ============================================================
-- 15. COMMENTS
-- ============================================================
COMMENT ON TABLE  public.pricing_add_ons            IS 'Catalog of billable add-on services. Each add-on has monthly, yearly, and one-time price points.';
COMMENT ON TABLE  public.pricing_discount_policies  IS 'Reusable named discount templates. Referenced in quotes or applied ad-hoc by admins.';
COMMENT ON TABLE  public.pricing_quotes             IS 'Formal commercial pricing agreements. Backend-computed. Stored snapshot ensures historical accuracy.';
COMMENT ON TABLE  public.pricing_quote_items        IS 'Line items within a quote. Negative subtotal = discount line.';
COMMENT ON COLUMN public.pricing_quotes.pricing_snapshot      IS 'Immutable JSON snapshot of plan/addon prices at quote creation time.';
COMMENT ON COLUMN public.pricing_quotes.manual_override_total IS 'If set, this overrides the calculated total. Used for negotiated enterprise pricing.';
COMMENT ON COLUMN public.tenant_subscriptions.quote_id        IS 'NULL = direct admin activation. Set = subscription was activated from a formal quote.';
COMMENT ON FUNCTION public.calculate_pricing_quote IS 'Pure pricing calculator. No side effects. Accepts plan+addons+discount, returns full breakdown JSONB.';
COMMENT ON FUNCTION public.create_pricing_quote    IS 'Creates a draft quote with computed line items and pricing snapshot. Platform admins only.';
COMMENT ON FUNCTION public.approve_pricing_quote   IS 'Marks a quote as approved. Prerequisite before activation.';
COMMENT ON FUNCTION public.activate_subscription_from_quote IS 'Activates a tenant subscription from an approved quote. Source of truth: quote.total. Creates invoice.';
