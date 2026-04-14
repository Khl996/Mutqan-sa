-- ==============================================================================
-- Migration: 101_unified_billing_engine.sql
-- Purpose: Replace all fragmented billing logic with a single unified engine.
--
-- Engine RPCs:
--   engine_calculate()           Pure pricing calculator (no DB writes)
--   engine_activate()            Create/update subscription + invoice
--   engine_create_quote()        Draft a formal pricing quote
--   engine_approve_quote()       Approve a draft quote
--   engine_activate_from_quote() Activate subscription from an approved quote
--   engine_cancel()              Cancel a subscription
--   engine_extend_trial()        Extend a trial period
-- ==============================================================================

-- ============================================================
-- SECTION 1: DROP LEGACY FUNCTIONS
-- Uses pg_proc scan to handle unknown argument signatures safely.
-- ============================================================
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT p.oid::regprocedure::text AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN (
               'admin_update_subscription',
               'generate_invoice_number',
               'activate_subscription_after_payment',
               'activate_subscription_from_quote',
               'admin_manage_subscription',
               'calculate_pricing_quote',
               'create_pricing_quote',
               'approve_pricing_quote'
           )
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || rec.sig || ' CASCADE';
    END LOOP;
END;
$$;

-- ============================================================
-- SECTION 2: DROP LEGACY TABLES
-- pricing_quote_items first (child of pricing_quotes)
-- ============================================================
DROP TABLE IF EXISTS public.pricing_quote_items     CASCADE;
DROP TABLE IF EXISTS public.payment_history         CASCADE;
DROP TABLE IF EXISTS public.platform_financial_summary CASCADE;

-- ============================================================
-- SECTION 3: REUSABLE updated_at TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================================
-- SECTION 4: subscription_plans — add missing columns, drop currency
-- ============================================================
ALTER TABLE public.subscription_plans
    ADD COLUMN IF NOT EXISTS name_ar        varchar(100),
    ADD COLUMN IF NOT EXISTS description_ar text,
    ADD COLUMN IF NOT EXISTS is_default     boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS trial_days     integer NOT NULL DEFAULT 14;

-- Backfill name_ar from name, then enforce NOT NULL
UPDATE public.subscription_plans SET name_ar = name WHERE name_ar IS NULL;
ALTER TABLE public.subscription_plans ALTER COLUMN name_ar SET NOT NULL;

-- Remove currency column (currency is always SAR at engine level)
ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS currency;

-- Ensure NOT NULL on core limit columns (backfill defaults first)
UPDATE public.subscription_plans SET max_users                = COALESCE(max_users, 5)   WHERE max_users IS NULL;
UPDATE public.subscription_plans SET max_buildings            = COALESCE(max_buildings,2) WHERE max_buildings IS NULL;
UPDATE public.subscription_plans SET max_assets               = COALESCE(max_assets,50)  WHERE max_assets IS NULL;
UPDATE public.subscription_plans SET max_work_orders_monthly  = COALESCE(max_work_orders_monthly,50) WHERE max_work_orders_monthly IS NULL;
UPDATE public.subscription_plans SET price_monthly = 0 WHERE price_monthly IS NULL;
UPDATE public.subscription_plans SET price_yearly  = 0 WHERE price_yearly  IS NULL;

ALTER TABLE public.subscription_plans
    ALTER COLUMN price_monthly           SET NOT NULL,
    ALTER COLUMN price_yearly            SET NOT NULL,
    ALTER COLUMN max_users               SET NOT NULL,
    ALTER COLUMN max_buildings           SET NOT NULL,
    ALTER COLUMN max_assets              SET NOT NULL,
    ALTER COLUMN max_work_orders_monthly SET NOT NULL,
    ALTER COLUMN is_active               SET NOT NULL,
    ALTER COLUMN display_order           SET NOT NULL;

DROP TRIGGER IF EXISTS set_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER set_subscription_plans_updated_at
    BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
DROP POLICY IF EXISTS "Plans are viewable by authenticated users" ON public.subscription_plans;
DROP POLICY IF EXISTS "subscription_plans_read"  ON public.subscription_plans;
DROP POLICY IF EXISTS "subscription_plans_write" ON public.subscription_plans;
CREATE POLICY "subscription_plans_read" ON public.subscription_plans
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "subscription_plans_write" ON public.subscription_plans
    FOR ALL TO authenticated
    USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')))
    WITH CHECK(EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')));

-- ============================================================
-- SECTION 5: SEQUENCES FOR AUTO-NUMBERING
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq;

-- ============================================================
-- SECTION 6: discount_policies
-- ============================================================
CREATE TABLE IF NOT EXISTS public.discount_policies (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    code           varchar(50) UNIQUE NOT NULL,
    name           varchar(100) NOT NULL,
    name_ar        varchar(100) NOT NULL,
    description    text,
    description_ar text,
    discount_type  varchar(20) NOT NULL CHECK (discount_type IN ('percentage','fixed')),
    discount_value decimal(10,2) NOT NULL,
    valid_from     timestamptz,
    valid_to       timestamptz,
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz DEFAULT now(),
    updated_at     timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS set_discount_policies_updated_at ON public.discount_policies;
CREATE TRIGGER set_discount_policies_updated_at
    BEFORE UPDATE ON public.discount_policies
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.discount_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "discount_policies_read"  ON public.discount_policies;
DROP POLICY IF EXISTS "discount_policies_write" ON public.discount_policies;
CREATE POLICY "discount_policies_read" ON public.discount_policies
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "discount_policies_write" ON public.discount_policies
    FOR ALL TO authenticated
    USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')))
    WITH CHECK(EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')));

-- Migrate data from pricing_discount_policies if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'pricing_discount_policies') THEN
        INSERT INTO public.discount_policies
            (code, name, name_ar, description, description_ar,
             discount_type, discount_value, valid_from, valid_to, is_active, created_at, updated_at)
        SELECT
            code,
            name,
            LEFT(COALESCE(name_ar, name), 100),
            description,
            description,  -- description_ar not in source; use description
            CASE discount_type WHEN 'fixed_amount' THEN 'fixed' ELSE 'percentage' END,
            discount_value,
            valid_from::timestamptz,
            valid_to::timestamptz,
            is_active,
            created_at,
            updated_at
        FROM public.pricing_discount_policies
        ON CONFLICT (code) DO NOTHING;
    END IF;
END;
$$;

-- ============================================================
-- SECTION 7: billing_add_ons
-- ============================================================
CREATE TABLE IF NOT EXISTS public.billing_add_ons (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    code         varchar(50) UNIQUE NOT NULL,
    name         varchar(100) NOT NULL,
    name_ar      varchar(100) NOT NULL,
    description  text,
    description_ar text,
    price        decimal(10,2) NOT NULL DEFAULT 0,
    billing_type varchar(20)   NOT NULL DEFAULT 'one_time'
        CHECK (billing_type IN ('recurring','one_time')),
    is_active    boolean NOT NULL DEFAULT true,
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz DEFAULT now(),
    updated_at   timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS set_billing_add_ons_updated_at ON public.billing_add_ons;
CREATE TRIGGER set_billing_add_ons_updated_at
    BEFORE UPDATE ON public.billing_add_ons
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.billing_add_ons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_add_ons_read"  ON public.billing_add_ons;
DROP POLICY IF EXISTS "billing_add_ons_write" ON public.billing_add_ons;
CREATE POLICY "billing_add_ons_read" ON public.billing_add_ons
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "billing_add_ons_write" ON public.billing_add_ons
    FOR ALL TO authenticated
    USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')))
    WITH CHECK(EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')));

-- Migrate data from pricing_add_ons if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'pricing_add_ons') THEN
        INSERT INTO public.billing_add_ons
            (code, name, name_ar, description, description_ar,
             price, billing_type, is_active, sort_order, created_at, updated_at)
        SELECT
            LEFT(code, 50),
            LEFT(name, 100),
            LEFT(COALESCE(name_ar, name), 100),
            description,
            description_ar,
            CASE WHEN billing_type = 'one_time'
                 THEN COALESCE(price_one_time, 0)
                 ELSE COALESCE(price_monthly, 0)
            END,
            billing_type,
            is_active,
            sort_order,
            created_at,
            updated_at
        FROM public.pricing_add_ons
        ON CONFLICT (code) DO NOTHING;
    END IF;
END;
$$;

DROP TABLE IF EXISTS public.pricing_add_ons           CASCADE;
DROP TABLE IF EXISTS public.pricing_discount_policies  CASCADE;

-- ============================================================
-- SECTION 8: billing_quotes
-- subscription_id column added now; FK to tenant_subscriptions added in section 11
-- after tenant_subscriptions columns are finalized.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.billing_quotes (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_number       varchar(50) UNIQUE NOT NULL,
    tenant_id          uuid        NOT NULL REFERENCES public.tenants(id),
    plan_id            uuid        NOT NULL REFERENCES public.subscription_plans(id),
    discount_policy_id uuid        REFERENCES public.discount_policies(id),
    status             varchar(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','approved','activated','expired')),
    billing_cycle      varchar(20) NOT NULL DEFAULT 'yearly'
        CHECK (billing_cycle IN ('monthly','yearly')),
    line_items         jsonb       NOT NULL DEFAULT '[]'::jsonb,
    subtotal           decimal(10,2) NOT NULL DEFAULT 0,
    discount_amount    decimal(10,2) NOT NULL DEFAULT 0,
    tax_rate           decimal(5,4)  NOT NULL DEFAULT 0.1500,
    tax_amount         decimal(10,2) NOT NULL DEFAULT 0,
    total              decimal(10,2) NOT NULL DEFAULT 0,
    valid_until        date        NOT NULL,
    pricing_snapshot   jsonb,
    admin_notes        text,
    client_notes       text,
    created_by         uuid        REFERENCES public.profiles(id),
    approved_by        uuid        REFERENCES public.profiles(id),
    approved_at        timestamptz,
    activated_by       uuid        REFERENCES public.profiles(id),
    activated_at       timestamptz,
    subscription_id    uuid,       -- FK to tenant_subscriptions added in section 11
    created_at         timestamptz DEFAULT now(),
    updated_at         timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS set_billing_quotes_updated_at ON public.billing_quotes;
CREATE TRIGGER set_billing_quotes_updated_at
    BEFORE UPDATE ON public.billing_quotes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Migrate data from pricing_quotes if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'pricing_quotes') THEN

        -- Use EXECUTE (dynamic SQL) so that the reference to pricing_discount_policies
        -- is only resolved at runtime, after it may have already been dropped in section 7.
        IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = 'pricing_discount_policies') THEN
            EXECUTE $q$
                INSERT INTO public.billing_quotes (
                    id, quote_number, tenant_id, plan_id, discount_policy_id,
                    status, billing_cycle, line_items,
                    subtotal, discount_amount, tax_rate, tax_amount, total,
                    valid_until, pricing_snapshot, admin_notes, client_notes,
                    created_by, approved_by, approved_at,
                    activated_by, activated_at, subscription_id,
                    created_at, updated_at
                )
                SELECT
                    pq.id,
                    LEFT(pq.quote_number, 50),
                    pq.tenant_id,
                    pq.plan_id,
                    dp.id,
                    CASE pq.status
                        WHEN 'sent'      THEN 'approved'
                        WHEN 'rejected'  THEN 'expired'
                        WHEN 'activated' THEN 'activated'
                        WHEN 'expired'   THEN 'expired'
                        WHEN 'approved'  THEN 'approved'
                        ELSE 'draft'
                    END,
                    pq.billing_cycle,
                    COALESCE(pq.pricing_snapshot, '[]'::jsonb),
                    COALESCE(pq.subtotal, 0),
                    COALESCE(pq.discount_amount, 0),
                    CASE WHEN COALESCE(pq.tax_rate, 0) > 1
                         THEN ROUND(COALESCE(pq.tax_rate, 15.00) / 100.0, 4)
                         ELSE COALESCE(pq.tax_rate::decimal(5,4), 0.1500)
                    END,
                    COALESCE(pq.tax_amount, 0),
                    COALESCE(pq.total, 0),
                    COALESCE(pq.valid_until, CURRENT_DATE + 30),
                    pq.pricing_snapshot,
                    pq.admin_notes,
                    pq.client_notes,
                    pq.created_by,
                    pq.approved_by,
                    pq.approved_at,
                    pq.activated_by,
                    pq.activated_at,
                    pq.subscription_id,
                    pq.created_at,
                    pq.updated_at
                FROM public.pricing_quotes pq
                LEFT JOIN public.pricing_discount_policies pdp ON pdp.id = pq.discount_policy_id
                LEFT JOIN public.discount_policies dp          ON dp.code = pdp.code
                WHERE pq.tenant_id IS NOT NULL AND pq.plan_id IS NOT NULL
                ON CONFLICT (id) DO NOTHING
            $q$;
        ELSE
            -- pricing_discount_policies already dropped — migrate without discount mapping
            INSERT INTO public.billing_quotes (
                id, quote_number, tenant_id, plan_id, discount_policy_id,
                status, billing_cycle, line_items,
                subtotal, discount_amount, tax_rate, tax_amount, total,
                valid_until, pricing_snapshot, admin_notes, client_notes,
                created_by, approved_by, approved_at,
                activated_by, activated_at, subscription_id,
                created_at, updated_at
            )
            SELECT
                pq.id,
                LEFT(pq.quote_number, 50),
                pq.tenant_id,
                pq.plan_id,
                NULL,  -- discount_policy_id: cannot map without pricing_discount_policies
                CASE pq.status
                    WHEN 'sent'      THEN 'approved'
                    WHEN 'rejected'  THEN 'expired'
                    WHEN 'activated' THEN 'activated'
                    WHEN 'expired'   THEN 'expired'
                    WHEN 'approved'  THEN 'approved'
                    ELSE 'draft'
                END,
                pq.billing_cycle,
                COALESCE(pq.pricing_snapshot, '[]'::jsonb),
                COALESCE(pq.subtotal, 0),
                COALESCE(pq.discount_amount, 0),
                CASE WHEN COALESCE(pq.tax_rate, 0) > 1
                     THEN ROUND(COALESCE(pq.tax_rate, 15.00) / 100.0, 4)
                     ELSE COALESCE(pq.tax_rate::decimal(5,4), 0.1500)
                END,
                COALESCE(pq.tax_amount, 0),
                COALESCE(pq.total, 0),
                COALESCE(pq.valid_until, CURRENT_DATE + 30),
                pq.pricing_snapshot,
                pq.admin_notes,
                pq.client_notes,
                pq.created_by,
                pq.approved_by,
                pq.approved_at,
                pq.activated_by,
                pq.activated_at,
                pq.subscription_id,
                pq.created_at,
                pq.updated_at
            FROM public.pricing_quotes pq
            WHERE pq.tenant_id IS NOT NULL AND pq.plan_id IS NOT NULL
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END IF;
END;
$$;

-- ============================================================
-- SECTION 9: Rebuild tenant_subscriptions columns
-- ============================================================

-- 9a. Drop old FK on quote_id (points to pricing_quotes, which we are about to drop)
ALTER TABLE public.tenant_subscriptions DROP CONSTRAINT IF EXISTS tenant_subscriptions_quote_id_fkey;

-- 9b. Drop pricing_quotes — all FKs already removed above
DROP TABLE IF EXISTS public.pricing_quotes CASCADE;

-- 9c. Fix status CHECK constraint: add 'past_due', remove 'suspended'
ALTER TABLE public.tenant_subscriptions DROP CONSTRAINT IF EXISTS tenant_subscriptions_status_check;
UPDATE public.tenant_subscriptions SET status = 'past_due' WHERE status = 'suspended';
ALTER TABLE public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_status_check
    CHECK (status IN ('trial','active','past_due','expired','cancelled'));

-- 9d. Drop obsolete columns
ALTER TABLE public.tenant_subscriptions
    DROP COLUMN IF EXISTS override_type,
    DROP COLUMN IF EXISTS discount_type,
    DROP COLUMN IF EXISTS discount_value,
    DROP COLUMN IF EXISTS discount_applies_to_next_only,
    DROP COLUMN IF EXISTS payment_method,
    DROP COLUMN IF EXISTS cancel_at_period_end,
    DROP COLUMN IF EXISTS currency;

-- 9e. Add new columns
UPDATE public.tenant_subscriptions SET amount = 0 WHERE amount IS NULL;
ALTER TABLE public.tenant_subscriptions ALTER COLUMN amount SET NOT NULL;
ALTER TABLE public.tenant_subscriptions ALTER COLUMN amount SET DEFAULT 0;

ALTER TABLE public.tenant_subscriptions
    ADD COLUMN IF NOT EXISTS discount_policy_id uuid,
    ADD COLUMN IF NOT EXISTS activated_by       varchar(20)
        CHECK (activated_by IN ('self_service','admin','quote'));

-- 9f. Wire new FK constraints
DO $$
BEGIN
    -- discount_policy_id → discount_policies
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'tenant_subscriptions_discount_policy_id_fkey'
           AND table_name = 'tenant_subscriptions'
    ) THEN
        ALTER TABLE public.tenant_subscriptions
            ADD CONSTRAINT tenant_subscriptions_discount_policy_id_fkey
            FOREIGN KEY (discount_policy_id) REFERENCES public.discount_policies(id);
    END IF;

    -- quote_id → billing_quotes (column already exists from migration 100; FK was dropped in 9a)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'tenant_subscriptions_quote_id_fkey'
           AND table_name = 'tenant_subscriptions'
    ) THEN
        ALTER TABLE public.tenant_subscriptions
            ADD CONSTRAINT tenant_subscriptions_quote_id_fkey
            FOREIGN KEY (quote_id) REFERENCES public.billing_quotes(id);
    END IF;
END;
$$;

-- 9g. RLS rebuild
DROP POLICY IF EXISTS "Subscriptions viewable by tenant members"  ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "Platform admins can manage subscriptions"  ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "tenant_subscriptions_read"   ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "tenant_subscriptions_manage" ON public.tenant_subscriptions;

CREATE POLICY "tenant_subscriptions_read" ON public.tenant_subscriptions
    FOR SELECT TO authenticated
    USING (
        tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                   AND role IN ('platform_owner','platform_admin','platform_finance','platform_support'))
    );
CREATE POLICY "tenant_subscriptions_manage" ON public.tenant_subscriptions
    FOR ALL TO authenticated
    USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')))
    WITH CHECK(EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')));

DROP TRIGGER IF EXISTS set_tenant_subscriptions_updated_at ON public.tenant_subscriptions;
CREATE TRIGGER set_tenant_subscriptions_updated_at
    BEFORE UPDATE ON public.tenant_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- SECTION 10: Close the circular FK: billing_quotes → tenant_subscriptions
-- (tenant_subscriptions is now finalized above)
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'billing_quotes_subscription_id_fkey'
           AND table_name = 'billing_quotes'
    ) THEN
        ALTER TABLE public.billing_quotes
            ADD CONSTRAINT billing_quotes_subscription_id_fkey
            FOREIGN KEY (subscription_id) REFERENCES public.tenant_subscriptions(id);
    END IF;
END;
$$;

-- RLS for billing_quotes
ALTER TABLE public.billing_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_quotes_platform_read" ON public.billing_quotes;
DROP POLICY IF EXISTS "billing_quotes_tenant_read"   ON public.billing_quotes;
DROP POLICY IF EXISTS "billing_quotes_manage"        ON public.billing_quotes;
CREATE POLICY "billing_quotes_platform_read" ON public.billing_quotes
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                   AND role IN ('platform_owner','platform_admin','platform_finance','platform_support')));
CREATE POLICY "billing_quotes_tenant_read" ON public.billing_quotes
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "billing_quotes_manage" ON public.billing_quotes
    FOR ALL TO authenticated
    USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')))
    WITH CHECK(EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin')));

-- ============================================================
-- SECTION 11: billing_invoices  (replaces platform_invoices)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.billing_invoices (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number       varchar(20) UNIQUE NOT NULL,
    tenant_id            uuid        NOT NULL REFERENCES public.tenants(id),
    subscription_id      uuid        REFERENCES public.tenant_subscriptions(id),
    quote_id             uuid        REFERENCES public.billing_quotes(id),
    subtotal             decimal(10,2) NOT NULL DEFAULT 0,
    discount_amount      decimal(10,2) NOT NULL DEFAULT 0,
    tax_rate             decimal(5,4)  NOT NULL DEFAULT 0.1500,
    tax_amount           decimal(10,2) NOT NULL DEFAULT 0,
    total                decimal(10,2) NOT NULL DEFAULT 0,
    status               varchar(20)   NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','paid','void')),
    payment_method       varchar(20)
        CHECK (payment_method IN ('tap','bank_transfer','manual')),
    payment_reference    varchar(255),
    paid_at              timestamptz,
    billing_period_start date,
    billing_period_end   date,
    notes                text,
    created_by           uuid REFERENCES public.profiles(id),
    created_at           timestamptz DEFAULT now(),
    updated_at           timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS set_billing_invoices_updated_at ON public.billing_invoices;
CREATE TRIGGER set_billing_invoices_updated_at
    BEFORE UPDATE ON public.billing_invoices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Migrate from platform_invoices
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'platform_invoices') THEN
        INSERT INTO public.billing_invoices (
            invoice_number, tenant_id, subscription_id,
            subtotal, discount_amount, tax_rate, tax_amount, total,
            status, payment_method, payment_reference, paid_at,
            billing_period_start, billing_period_end, notes,
            created_at, updated_at
        )
        SELECT
            LEFT(invoice_number, 20),
            tenant_id,
            subscription_id,
            COALESCE(subtotal, 0),
            COALESCE(discount, 0),
            CASE WHEN COALESCE(tax_rate, 0) > 1
                 THEN ROUND(COALESCE(tax_rate, 15.0) / 100.0, 4)
                 ELSE COALESCE(tax_rate::decimal(5,4), 0.1500)
            END,
            COALESCE(tax_amount, 0),
            COALESCE(total, 0),
            CASE status
                WHEN 'paid'      THEN 'paid'
                WHEN 'cancelled' THEN 'void'
                WHEN 'refunded'  THEN 'void'
                ELSE 'draft'
            END,
            CASE payment_method
                WHEN 'bank_transfer' THEN 'bank_transfer'
                WHEN 'manual'        THEN 'manual'
                ELSE NULL
            END,
            payment_reference,
            paid_at,
            billing_period_start,
            billing_period_end,
            notes,
            created_at,
            updated_at
        FROM public.platform_invoices
        WHERE tenant_id IS NOT NULL
        ON CONFLICT (invoice_number) DO NOTHING;
    END IF;
END;
$$;

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_invoices_platform_read" ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_tenant_read"   ON public.billing_invoices;
DROP POLICY IF EXISTS "billing_invoices_manage"        ON public.billing_invoices;
CREATE POLICY "billing_invoices_platform_read" ON public.billing_invoices
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                   AND role IN ('platform_owner','platform_admin','platform_finance','platform_support')));
CREATE POLICY "billing_invoices_tenant_read" ON public.billing_invoices
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "billing_invoices_manage" ON public.billing_invoices
    FOR ALL TO authenticated
    USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin','platform_finance')))
    WITH CHECK(EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_owner','platform_admin','platform_finance')));

DROP TABLE IF EXISTS public.platform_invoices CASCADE;

-- ============================================================
-- SECTION 12: INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_billing_quotes_tenant     ON public.billing_quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_quotes_status     ON public.billing_quotes(status);
CREATE INDEX IF NOT EXISTS idx_billing_quotes_created    ON public.billing_quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant   ON public.billing_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status   ON public.billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_discount_policies_code    ON public.discount_policies(code);
CREATE INDEX IF NOT EXISTS idx_discount_policies_active  ON public.discount_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_billing_add_ons_code      ON public.billing_add_ons(code);
CREATE INDEX IF NOT EXISTS idx_billing_add_ons_active    ON public.billing_add_ons(is_active);
CREATE INDEX IF NOT EXISTS idx_tenant_subs_status        ON public.tenant_subscriptions(status);

-- ============================================================
-- SECTION 13: TRIGGER — sync tenants table from tenant_subscriptions
-- This is the single source of truth; nobody writes to tenants.subscription_* directly.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_tenants_from_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan_code text;
BEGIN
    SELECT code INTO v_plan_code
      FROM public.subscription_plans
     WHERE id = NEW.plan_id;

    UPDATE public.tenants SET
        plan_id              = NEW.plan_id,
        subscription_status  = NEW.status,
        subscription_tier    = v_plan_code,
        billing_cycle        = NEW.billing_cycle,
        trial_ends_at        = NEW.trial_ends_at,
        subscription_ends_at = NEW.current_period_end,
        updated_at           = now()
    WHERE id = NEW.tenant_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_tenants_on_subscription_change ON public.tenant_subscriptions;
CREATE TRIGGER sync_tenants_on_subscription_change
    AFTER INSERT OR UPDATE ON public.tenant_subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.sync_tenants_from_subscription();

-- ============================================================
-- SECTION 14: engine_calculate()
-- Pure pricing calculator — no DB writes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.engine_calculate(
    p_plan_id            uuid,
    p_billing_cycle      varchar  DEFAULT 'monthly',
    p_add_on_ids         uuid[]   DEFAULT '{}',
    p_discount_policy_id uuid     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_plan          RECORD;
    v_dp            RECORD;
    v_add_on        RECORD;
    v_add_on_id     uuid;
    v_plan_amount   decimal(10,2) := 0;
    v_addons_amount decimal(10,2) := 0;
    v_addon_price   decimal(10,2);
    v_subtotal      decimal(10,2);
    v_disc_amount   decimal(10,2) := 0;
    v_tax_rate      decimal(5,4)  := 0.1500;
    v_taxable       decimal(10,2);
    v_tax_amount    decimal(10,2) := 0;
    v_total         decimal(10,2);
    v_breakdown     jsonb         := '[]'::jsonb;
    v_sort          integer       := 0;
BEGIN
    -- Resolve plan
    SELECT * INTO v_plan
      FROM public.subscription_plans
     WHERE id = p_plan_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found or inactive: %', p_plan_id;
    END IF;

    v_plan_amount := CASE p_billing_cycle
        WHEN 'yearly' THEN COALESCE(v_plan.price_yearly, 0)
        ELSE               COALESCE(v_plan.price_monthly, 0)
    END;

    v_sort := v_sort + 1;
    v_breakdown := v_breakdown || jsonb_build_object(
        'type',          'plan',
        'id',            v_plan.id,
        'code',          v_plan.code,
        'name',          v_plan.name,
        'name_ar',       v_plan.name_ar,
        'billing_cycle', p_billing_cycle,
        'unit_price',    v_plan_amount,
        'subtotal',      v_plan_amount,
        'sort_order',    v_sort
    );

    -- Add-ons
    IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
        FOREACH v_add_on_id IN ARRAY p_add_on_ids LOOP
            SELECT * INTO v_add_on
              FROM public.billing_add_ons
             WHERE id = v_add_on_id AND is_active = true;
            IF FOUND THEN
                v_addon_price   := COALESCE(v_add_on.price, 0);
                v_addons_amount := v_addons_amount + v_addon_price;
                v_sort := v_sort + 1;
                v_breakdown := v_breakdown || jsonb_build_object(
                    'type',         'add_on',
                    'id',           v_add_on.id,
                    'code',         v_add_on.code,
                    'name',         v_add_on.name,
                    'name_ar',      v_add_on.name_ar,
                    'billing_type', v_add_on.billing_type,
                    'unit_price',   v_addon_price,
                    'subtotal',     v_addon_price,
                    'sort_order',   v_sort
                );
            END IF;
        END LOOP;
    END IF;

    v_subtotal := v_plan_amount + v_addons_amount;

    -- Discount policy
    IF p_discount_policy_id IS NOT NULL THEN
        SELECT * INTO v_dp
          FROM public.discount_policies
         WHERE id = p_discount_policy_id
           AND is_active = true
           AND (valid_from IS NULL OR valid_from <= now())
           AND (valid_to   IS NULL OR valid_to   >= now());
        IF FOUND THEN
            v_disc_amount := CASE v_dp.discount_type
                WHEN 'percentage' THEN ROUND(v_subtotal * v_dp.discount_value / 100.0, 2)
                WHEN 'fixed'      THEN LEAST(v_dp.discount_value, v_subtotal)
                ELSE 0
            END;
            v_sort := v_sort + 1;
            v_breakdown := v_breakdown || jsonb_build_object(
                'type',           'discount',
                'id',             v_dp.id,
                'code',           v_dp.code,
                'name',           v_dp.name,
                'name_ar',        v_dp.name_ar,
                'discount_type',  v_dp.discount_type,
                'discount_value', v_dp.discount_value,
                'subtotal',       -v_disc_amount,
                'sort_order',     v_sort
            );
        END IF;
    END IF;

    v_taxable    := v_subtotal - v_disc_amount;
    v_tax_amount := ROUND(v_taxable * v_tax_rate, 2);
    v_total      := v_taxable + v_tax_amount;

    RETURN jsonb_build_object(
        'plan_amount',     v_plan_amount,
        'add_ons_amount',  v_addons_amount,
        'subtotal',        v_subtotal,
        'discount_amount', v_disc_amount,
        'taxable_amount',  v_taxable,
        'tax_rate',        v_tax_rate,
        'tax_amount',      v_tax_amount,
        'total',           v_total,
        'currency',        'SAR',
        'breakdown',       v_breakdown
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.engine_calculate TO authenticated;

-- ============================================================
-- SECTION 15: engine_activate()
-- ============================================================
CREATE OR REPLACE FUNCTION public.engine_activate(
    p_tenant_id          uuid,
    p_plan_id            uuid,
    p_billing_cycle      varchar  DEFAULT 'monthly',
    p_source             varchar  DEFAULT 'admin',
    p_status             varchar  DEFAULT 'active',
    p_trial_days         integer  DEFAULT NULL,
    p_discount_policy_id uuid     DEFAULT NULL,
    p_quote_id           uuid     DEFAULT NULL,
    p_payment_method     varchar  DEFAULT NULL,
    p_payment_reference  varchar  DEFAULT NULL,
    p_amount             decimal  DEFAULT NULL,
    p_admin_note         text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id    uuid        := auth.uid();
    v_caller_role  text;
    v_caller_tid   uuid;
    v_now          timestamptz := now();
    v_trial_days   integer;
    v_trial_ends   timestamptz;
    v_period_start timestamptz;
    v_period_end   timestamptz;
    v_amount       decimal(10,2);
    v_calc         jsonb;
    v_sub_id       uuid;
    v_inv_id       uuid;
    v_inv_number   text;
    v_plan         RECORD;
BEGIN
    -- Authorization check
    SELECT role, tenant_id INTO v_caller_role, v_caller_tid
      FROM public.profiles WHERE id = v_caller_id;

    IF p_source = 'self_service' THEN
        IF v_caller_role NOT IN ('tenant_admin','tenant_owner') OR v_caller_tid IS DISTINCT FROM p_tenant_id THEN
            RAISE EXCEPTION 'Unauthorized: self_service requires tenant_admin of the same tenant';
        END IF;
    ELSE
        IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
            RAISE EXCEPTION 'Unauthorized: source % requires platform_owner or platform_admin', p_source;
        END IF;
    END IF;

    -- Validate plan
    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found or inactive: %', p_plan_id;
    END IF;

    -- Always calculate for invoice breakdown
    v_calc := public.engine_calculate(p_plan_id, p_billing_cycle, '{}', p_discount_policy_id);

    IF p_status = 'trial' THEN
        v_trial_days  := COALESCE(p_trial_days, v_plan.trial_days, 14);
        v_trial_ends  := v_now + (v_trial_days || ' days')::interval;
        v_period_start := v_now;
        v_period_end   := v_trial_ends;
        v_amount       := 0;
    ELSE
        -- active
        v_period_start := v_now;
        v_period_end   := CASE p_billing_cycle
            WHEN 'yearly' THEN v_now + interval '1 year'
            ELSE               v_now + interval '1 month'
        END;
        v_amount := COALESCE(p_amount, (v_calc->>'total')::decimal);
    END IF;

    -- Upsert subscription
    INSERT INTO public.tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        trial_ends_at, current_period_start, current_period_end,
        amount, discount_policy_id, activated_by, quote_id, admin_note,
        updated_at
    ) VALUES (
        p_tenant_id, p_plan_id, p_status, p_billing_cycle,
        v_trial_ends, v_period_start, v_period_end,
        v_amount, p_discount_policy_id, p_source, p_quote_id, p_admin_note,
        v_now
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id              = EXCLUDED.plan_id,
        status               = EXCLUDED.status,
        billing_cycle        = EXCLUDED.billing_cycle,
        trial_ends_at        = EXCLUDED.trial_ends_at,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end   = EXCLUDED.current_period_end,
        amount               = EXCLUDED.amount,
        discount_policy_id   = EXCLUDED.discount_policy_id,
        activated_by         = EXCLUDED.activated_by,
        quote_id             = EXCLUDED.quote_id,
        admin_note           = EXCLUDED.admin_note,
        cancelled_at         = NULL,
        updated_at           = EXCLUDED.updated_at
    RETURNING id INTO v_sub_id;

    -- Create invoice for active subscriptions
    IF p_status = 'active' THEN
        v_inv_number := 'INV-' || EXTRACT(YEAR FROM v_now)::text
                        || '-' || LPAD(nextval('public.invoice_number_seq')::text, 4, '0');

        INSERT INTO public.billing_invoices (
            invoice_number, tenant_id, subscription_id, quote_id,
            subtotal, discount_amount, tax_rate, tax_amount, total,
            status, payment_method, payment_reference, paid_at,
            billing_period_start, billing_period_end,
            created_by, created_at
        ) VALUES (
            v_inv_number, p_tenant_id, v_sub_id, p_quote_id,
            (v_calc->>'subtotal')::decimal,
            (v_calc->>'discount_amount')::decimal,
            (v_calc->>'tax_rate')::decimal,
            (v_calc->>'tax_amount')::decimal,
            v_amount,  -- use actual charged amount (may differ from calculated if p_amount supplied)
            CASE WHEN p_payment_method IS NOT NULL THEN 'paid' ELSE 'draft' END,
            p_payment_method,
            p_payment_reference,
            CASE WHEN p_payment_method IS NOT NULL THEN v_now ELSE NULL END,
            v_period_start::date,
            v_period_end::date,
            v_caller_id,
            v_now
        )
        RETURNING id INTO v_inv_id;
    END IF;

    -- Audit log
    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id,
        'engine_activate tenant=' || p_tenant_id || ' plan=' || p_plan_id || ' status=' || p_status,
        'update', 'subscription', v_sub_id::text,
        jsonb_build_object(
            'plan_id',       p_plan_id,   'status',        p_status,
            'billing_cycle', p_billing_cycle, 'amount',    v_amount,
            'source',        p_source,    'period_end',    v_period_end
        ),
        jsonb_build_object('tenant_id', p_tenant_id, 'source', p_source)
    );

    RETURN jsonb_build_object(
        'subscription_id', v_sub_id,
        'invoice_id',      v_inv_id,
        'invoice_number',  v_inv_number,
        'status',          p_status,
        'period_start',    v_period_start,
        'period_end',      v_period_end,
        'amount',          v_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.engine_activate TO authenticated;

-- ============================================================
-- SECTION 16: engine_create_quote()
-- ============================================================
CREATE OR REPLACE FUNCTION public.engine_create_quote(
    p_tenant_id          uuid,
    p_plan_id            uuid,
    p_billing_cycle      varchar  DEFAULT 'yearly',
    p_add_on_ids         uuid[]   DEFAULT '{}',
    p_discount_policy_id uuid     DEFAULT NULL,
    p_valid_days         integer  DEFAULT 30,
    p_admin_notes        text     DEFAULT NULL,
    p_client_notes       text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id   uuid := auth.uid();
    v_caller_role text;
    v_calc        jsonb;
    v_quote_num   text;
    v_quote_id    uuid;
    v_valid_until date;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only platform admins can create quotes';
    END IF;

    v_calc        := public.engine_calculate(p_plan_id, p_billing_cycle, p_add_on_ids, p_discount_policy_id);
    v_valid_until := (now() + (p_valid_days || ' days')::interval)::date;
    v_quote_num   := 'QT-' || EXTRACT(YEAR FROM now())::text
                     || '-' || LPAD(nextval('public.quote_number_seq')::text, 4, '0');

    INSERT INTO public.billing_quotes (
        quote_number, tenant_id, plan_id, discount_policy_id,
        status, billing_cycle, line_items,
        subtotal, discount_amount, tax_rate, tax_amount, total,
        valid_until, pricing_snapshot, admin_notes, client_notes,
        created_by, created_at, updated_at
    ) VALUES (
        v_quote_num, p_tenant_id, p_plan_id, p_discount_policy_id,
        'draft', p_billing_cycle, v_calc->'breakdown',
        (v_calc->>'subtotal')::decimal,
        (v_calc->>'discount_amount')::decimal,
        (v_calc->>'tax_rate')::decimal,
        (v_calc->>'tax_amount')::decimal,
        (v_calc->>'total')::decimal,
        v_valid_until, v_calc, p_admin_notes, p_client_notes,
        v_caller_id, now(), now()
    )
    RETURNING id INTO v_quote_id;

    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id, 'engine_create_quote: ' || v_quote_num,
        'create', 'quote', v_quote_id::text,
        jsonb_build_object('quote_number', v_quote_num, 'total', v_calc->>'total', 'tenant_id', p_tenant_id),
        jsonb_build_object('tenant_id', p_tenant_id)
    );

    RETURN jsonb_build_object(
        'quote_id',     v_quote_id,
        'quote_number', v_quote_num,
        'total',        (v_calc->>'total')::decimal,
        'valid_until',  v_valid_until
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.engine_create_quote TO authenticated;

-- ============================================================
-- SECTION 17: engine_approve_quote()
-- ============================================================
CREATE OR REPLACE FUNCTION public.engine_approve_quote(
    p_quote_id    uuid,
    p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id   uuid := auth.uid();
    v_caller_role text;
    v_quote       RECORD;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only platform admins can approve quotes';
    END IF;

    SELECT * INTO v_quote FROM public.billing_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found: %', p_quote_id;
    END IF;
    IF v_quote.status <> 'draft' THEN
        RAISE EXCEPTION 'Quote must be draft to approve (current: %)', v_quote.status;
    END IF;
    IF v_quote.valid_until < CURRENT_DATE THEN
        RAISE EXCEPTION 'Quote has expired (valid_until: %)', v_quote.valid_until;
    END IF;

    UPDATE public.billing_quotes SET
        status      = 'approved',
        approved_by = v_caller_id,
        approved_at = now(),
        admin_notes = COALESCE(p_admin_notes, admin_notes),
        updated_at  = now()
    WHERE id = p_quote_id;

    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id, 'engine_approve_quote: ' || v_quote.quote_number,
        'update', 'quote', p_quote_id::text,
        jsonb_build_object('status', 'approved', 'quote_number', v_quote.quote_number),
        jsonb_build_object('tenant_id', v_quote.tenant_id)
    );

    RETURN jsonb_build_object(
        'quote_id',     p_quote_id,
        'quote_number', v_quote.quote_number,
        'status',       'approved'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.engine_approve_quote TO authenticated;

-- ============================================================
-- SECTION 18: engine_activate_from_quote()
-- ============================================================
CREATE OR REPLACE FUNCTION public.engine_activate_from_quote(
    p_quote_id      uuid,
    p_period_months integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id   uuid := auth.uid();
    v_caller_role text;
    v_quote       RECORD;
    v_result      jsonb;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only platform admins can activate quotes';
    END IF;

    SELECT * INTO v_quote FROM public.billing_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found: %', p_quote_id;
    END IF;
    IF v_quote.status <> 'approved' THEN
        RAISE EXCEPTION 'Quote must be approved before activation (current: %)', v_quote.status;
    END IF;
    IF v_quote.valid_until < CURRENT_DATE THEN
        RAISE EXCEPTION 'Quote has expired (valid_until: %)', v_quote.valid_until;
    END IF;

    v_result := public.engine_activate(
        p_tenant_id          := v_quote.tenant_id,
        p_plan_id            := v_quote.plan_id,
        p_billing_cycle      := v_quote.billing_cycle,
        p_source             := 'quote',
        p_status             := 'active',
        p_discount_policy_id := v_quote.discount_policy_id,
        p_quote_id           := p_quote_id,
        p_amount             := v_quote.total
    );

    UPDATE public.billing_quotes SET
        status          = 'activated',
        activated_by    = v_caller_id,
        activated_at    = now(),
        subscription_id = (v_result->>'subscription_id')::uuid,
        updated_at      = now()
    WHERE id = p_quote_id;

    RETURN v_result || jsonb_build_object('quote_number', v_quote.quote_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.engine_activate_from_quote TO authenticated;

-- ============================================================
-- SECTION 19: engine_cancel()
-- ============================================================
CREATE OR REPLACE FUNCTION public.engine_cancel(
    p_tenant_id  uuid,
    p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id   uuid := auth.uid();
    v_caller_role text;
    v_sub_id      uuid;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only platform admins can cancel subscriptions';
    END IF;

    UPDATE public.tenant_subscriptions SET
        status       = 'cancelled',
        cancelled_at = now(),
        admin_note   = COALESCE(p_admin_note, admin_note),
        updated_at   = now()
    WHERE tenant_id = p_tenant_id
    RETURNING id INTO v_sub_id;

    IF v_sub_id IS NULL THEN
        RAISE EXCEPTION 'No subscription found for tenant: %', p_tenant_id;
    END IF;

    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id, 'engine_cancel tenant=' || p_tenant_id,
        'update', 'subscription', v_sub_id::text,
        jsonb_build_object('status', 'cancelled', 'admin_note', p_admin_note),
        jsonb_build_object('tenant_id', p_tenant_id)
    );

    RETURN jsonb_build_object(
        'subscription_id', v_sub_id,
        'status',          'cancelled',
        'cancelled_at',    now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.engine_cancel TO authenticated;

-- ============================================================
-- SECTION 20: engine_extend_trial()
-- ============================================================
CREATE OR REPLACE FUNCTION public.engine_extend_trial(
    p_tenant_id  uuid,
    p_extra_days integer,
    p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id     uuid := auth.uid();
    v_caller_role   text;
    v_sub           RECORD;
    v_new_trial_end timestamptz;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only platform admins can extend trials';
    END IF;

    SELECT * INTO v_sub
      FROM public.tenant_subscriptions
     WHERE tenant_id = p_tenant_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No subscription found for tenant: %', p_tenant_id;
    END IF;
    IF v_sub.status NOT IN ('trial','expired') THEN
        RAISE EXCEPTION 'Can only extend trial/expired subscriptions (current: %)', v_sub.status;
    END IF;

    v_new_trial_end := GREATEST(COALESCE(v_sub.trial_ends_at, now()), now())
                       + (p_extra_days || ' days')::interval;

    UPDATE public.tenant_subscriptions SET
        trial_ends_at      = v_new_trial_end,
        current_period_end = v_new_trial_end,
        status             = 'trial',
        admin_note         = COALESCE(p_admin_note, admin_note),
        updated_at         = now()
    WHERE tenant_id = p_tenant_id;

    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id,
        'engine_extend_trial tenant=' || p_tenant_id || ' +' || p_extra_days || ' days',
        'update', 'subscription', v_sub.id::text,
        jsonb_build_object(
            'trial_ends_at', v_new_trial_end,
            'extra_days',    p_extra_days,
            'admin_note',    p_admin_note
        ),
        jsonb_build_object('tenant_id', p_tenant_id)
    );

    RETURN jsonb_build_object(
        'subscription_id', v_sub.id,
        'trial_ends_at',   v_new_trial_end,
        'extra_days',      p_extra_days,
        'status',          'trial'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.engine_extend_trial TO authenticated;

-- ============================================================
-- SECTION 21: check_subscription_limits()
-- Source of truth: tenant_subscriptions → subscription_plans
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_subscription_limits(
    p_tenant_id     uuid,
    p_resource_type varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit   integer;
    v_current integer;
    v_plan_id uuid;
BEGIN
    -- Primary: tenant_subscriptions
    SELECT ts.plan_id INTO v_plan_id
      FROM public.tenant_subscriptions ts
     WHERE ts.tenant_id = p_tenant_id
     LIMIT 1;

    -- Fallback 1: tenants.plan_id
    IF v_plan_id IS NULL THEN
        SELECT plan_id INTO v_plan_id FROM public.tenants WHERE id = p_tenant_id;
    END IF;

    -- Fallback 2: default plan
    IF v_plan_id IS NULL THEN
        SELECT id INTO v_plan_id FROM public.subscription_plans
         WHERE is_default = true AND is_active = true LIMIT 1;
    END IF;

    IF v_plan_id IS NULL THEN RETURN true; END IF;

    SELECT CASE p_resource_type
        WHEN 'users'       THEN max_users
        WHEN 'buildings'   THEN max_buildings
        WHEN 'assets'      THEN max_assets
        WHEN 'work_orders' THEN max_work_orders_monthly
        ELSE -1
    END INTO v_limit
    FROM public.subscription_plans WHERE id = v_plan_id;

    IF v_limit IS NULL OR v_limit < 0 THEN RETURN true; END IF;

    IF p_resource_type = 'users' THEN
        SELECT COUNT(*) INTO v_current FROM public.profiles
         WHERE tenant_id = p_tenant_id AND COALESCE(is_active, true) = true;
    ELSIF p_resource_type = 'buildings' THEN
        SELECT COUNT(*) INTO v_current FROM public.buildings WHERE tenant_id = p_tenant_id;
    ELSIF p_resource_type = 'assets' THEN
        SELECT COUNT(*) INTO v_current FROM public.assets WHERE tenant_id = p_tenant_id;
    ELSIF p_resource_type = 'work_orders' THEN
        SELECT COUNT(*) INTO v_current FROM public.work_orders
         WHERE tenant_id = p_tenant_id
           AND created_at >= date_trunc('month', CURRENT_DATE);
    ELSE
        RETURN true;
    END IF;

    RETURN v_current < v_limit;
END;
$$;

-- ============================================================
-- SECTION 22: enforce_subscription_limits() trigger function
-- (re-declared to pick up updated check_subscription_limits)
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_subscription_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_TABLE_NAME = 'profiles' THEN
        IF NEW.tenant_id IS NULL OR COALESCE(NEW.is_active, true) = false THEN
            RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE'
            AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
            AND NOT (COALESCE(OLD.is_active, false) = false AND COALESCE(NEW.is_active, true) = true)
        THEN
            RETURN NEW;
        END IF;
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'users') THEN
            RAISE EXCEPTION 'User limit reached for this subscription plan';
        END IF;
    ELSIF TG_TABLE_NAME = 'buildings' THEN
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'buildings') THEN
            RAISE EXCEPTION 'Building limit reached for this subscription plan';
        END IF;
    ELSIF TG_TABLE_NAME = 'assets' THEN
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'assets') THEN
            RAISE EXCEPTION 'Asset limit reached for this subscription plan';
        END IF;
    ELSIF TG_TABLE_NAME = 'work_orders' THEN
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'work_orders') THEN
            RAISE EXCEPTION 'Monthly work order limit reached for this subscription plan';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================
-- SECTION 23: provision_tenant() — call engine path for subscriptions
-- provision_tenant is SECURITY DEFINER so it inserts directly into
-- tenant_subscriptions (bypasses engine_activate role check),
-- which is correct for both self-registration and admin creation flows.
-- The sync trigger then keeps tenants table up to date automatically.
-- ============================================================
CREATE OR REPLACE FUNCTION public.provision_tenant(
    p_name                   text,
    p_name_ar                text    DEFAULT NULL,
    p_slug                   text    DEFAULT NULL,
    p_email                  text    DEFAULT NULL,
    p_phone                  text    DEFAULT NULL,
    p_address                text    DEFAULT NULL,
    p_cr_number              text    DEFAULT NULL,
    p_tax_number             text    DEFAULT NULL,
    p_country                text    DEFAULT NULL,
    p_city                   text    DEFAULT NULL,
    p_postal_code            text    DEFAULT NULL,
    p_website                text    DEFAULT NULL,
    p_timezone               text    DEFAULT 'Asia/Riyadh',
    p_plan_code              text    DEFAULT NULL,
    p_trial_days             integer DEFAULT NULL,
    p_assign_caller_as_admin boolean DEFAULT false,
    p_caller_full_name       text    DEFAULT NULL,
    p_caller_phone           text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id    uuid    := auth.uid();
    v_tenant_id  uuid;
    v_plan_id    uuid;
    v_plan_code  text;
    v_trial_days integer;
    v_slug       text;
    v_base_slug  text;
    v_count      integer;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Resolve plan: default → by code → cheapest active
    SELECT id, code, COALESCE(trial_days, 14)
      INTO v_plan_id, v_plan_code, v_trial_days
      FROM public.subscription_plans
     WHERE is_default = true AND is_active = true LIMIT 1;

    IF v_plan_id IS NULL AND p_plan_code IS NOT NULL THEN
        SELECT id, code, COALESCE(trial_days, 14)
          INTO v_plan_id, v_plan_code, v_trial_days
          FROM public.subscription_plans
         WHERE code = p_plan_code AND is_active = true LIMIT 1;
    END IF;

    IF v_plan_id IS NULL THEN
        SELECT id, code, COALESCE(trial_days, 14)
          INTO v_plan_id, v_plan_code, v_trial_days
          FROM public.subscription_plans
         WHERE is_active = true ORDER BY price_monthly ASC LIMIT 1;
    END IF;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'No active subscription plan found. Cannot create tenant without a plan.';
    END IF;

    IF p_trial_days IS NOT NULL THEN v_trial_days := p_trial_days; END IF;

    -- Slug generation
    v_base_slug := CASE
        WHEN p_slug IS NOT NULL AND length(trim(p_slug)) >= 3
        THEN lower(regexp_replace(trim(p_slug), '[^a-z0-9\-]', '', 'g'))
        ELSE lower(regexp_replace(coalesce(p_name, 'tenant'), '[^a-zA-Z0-9]', '', 'g'))
    END;

    IF v_base_slug IS NULL OR length(v_base_slug) < 3 THEN
        v_base_slug := 'tenant' || floor(random() * 10000)::text;
    END IF;

    v_slug := v_base_slug;
    LOOP
        SELECT count(*) INTO v_count FROM public.tenants WHERE slug = v_slug;
        EXIT WHEN v_count = 0;
        v_slug := v_base_slug || floor(random() * 10000)::text;
    END LOOP;

    -- Create tenant (subscription_* columns will be set by the sync trigger)
    INSERT INTO public.tenants (
        name, name_ar, slug, plan_id,
        cr_number, tax_number, address, country, city, postal_code,
        email, phone, website, timezone,
        created_at, updated_at
    ) VALUES (
        p_name, p_name_ar, v_slug, v_plan_id,
        p_cr_number, p_tax_number, p_address, p_country, p_city, p_postal_code,
        p_email, p_phone, p_website, p_timezone,
        now(), now()
    )
    RETURNING id INTO v_tenant_id;

    -- Bypass profile guard for the upcoming UPDATE
    IF p_assign_caller_as_admin THEN
        PERFORM set_config('app.bypass_profile_guard', '1', true);
    END IF;

    -- Insert trial subscription directly (SECURITY DEFINER — no role check needed)
    -- The AFTER INSERT trigger on tenant_subscriptions will sync tenants table.
    INSERT INTO public.tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        trial_ends_at, current_period_start, current_period_end,
        amount, activated_by, updated_at
    ) VALUES (
        v_tenant_id, v_plan_id, 'trial', 'monthly',
        now() + (v_trial_days || ' days')::interval,
        now(),
        now() + (v_trial_days || ' days')::interval,
        0, 'admin', now()
    )
    ON CONFLICT (tenant_id) DO NOTHING;

    -- Optionally assign caller as tenant_admin
    IF p_assign_caller_as_admin THEN
        UPDATE public.profiles SET
            tenant_id    = v_tenant_id,
            full_name    = coalesce(p_caller_full_name, full_name),
            full_name_ar = coalesce(p_caller_full_name, full_name_ar),
            phone        = coalesce(p_caller_phone, phone),
            role         = 'tenant_admin',
            is_active    = true,
            updated_at   = now()
        WHERE id = v_user_id;

        UPDATE auth.users SET email_confirmed_at = now()
         WHERE id = v_user_id AND email_confirmed_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id',  v_tenant_id,
        'slug',       v_slug,
        'plan_id',    v_plan_id,
        'plan_code',  v_plan_code,
        'trial_days', v_trial_days,
        'success',    true
    );
END;
$$;
