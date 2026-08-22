-- ==============================================================================
-- Migration: 102_billing_tax_optional.sql
-- Purpose: Make VAT optional via platform_settings table.
--          Default: tax disabled (0%). Platform owner can enable and set rate.
--
-- Why: Mutqan owner is a freelancer (وثيقة عمل حر) — not VAT-registered.
--      Tax must be configurable, not hardcoded at 15%.
--
-- Changes:
--   1. platform_settings table (key/value store for platform config)
--   2. Insert default tax_config (enabled=false, rate=0.00)
--   3. ALTER DEFAULT on billing_quotes.tax_rate and billing_invoices.tax_rate to 0.00
--   4. Replace engine_calculate() to read tax_rate from platform_settings
-- ==============================================================================

-- ============================================================
-- 1. platform_settings table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_settings (
    key        varchar(100) PRIMARY KEY,
    value      jsonb        NOT NULL,
    updated_at timestamptz  DEFAULT now(),
    updated_by uuid         REFERENCES public.profiles(id)
);

-- RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_settings_read_authenticated" ON public.platform_settings;
CREATE POLICY "platform_settings_read_authenticated"
    ON public.platform_settings FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "platform_settings_write_owner" ON public.platform_settings;
CREATE POLICY "platform_settings_write_owner"
    ON public.platform_settings FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('platform_owner', 'platform_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('platform_owner', 'platform_admin')
        )
    );

-- ============================================================
-- 2. Default tax_config — disabled, 0%
-- ============================================================
INSERT INTO public.platform_settings (key, value)
VALUES (
    'tax_config',
    '{"enabled": false, "rate": 0.00, "label": "VAT", "label_ar": "ضريبة القيمة المضافة"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 3. Change DEFAULT tax_rate to 0.00 on new rows
--    (existing rows are untouched)
-- ============================================================
ALTER TABLE public.billing_invoices ALTER COLUMN tax_rate SET DEFAULT 0.0000;
ALTER TABLE public.billing_quotes   ALTER COLUMN tax_rate SET DEFAULT 0.0000;

-- ============================================================
-- 4. Replace engine_calculate() — reads tax_rate from platform_settings
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
    v_tax_rate      decimal(5,4)  := 0.0000;
    v_taxable       decimal(10,2);
    v_tax_amount    decimal(10,2) := 0;
    v_total         decimal(10,2);
    v_breakdown     jsonb         := '[]'::jsonb;
    v_sort          integer       := 0;
    v_tax_cfg       jsonb;
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

    -- Tax rate from platform_settings (0 if disabled or not found)
    SELECT value INTO v_tax_cfg
      FROM public.platform_settings
     WHERE key = 'tax_config';

    IF v_tax_cfg IS NOT NULL AND (v_tax_cfg->>'enabled')::boolean = true THEN
        v_tax_rate := COALESCE((v_tax_cfg->>'rate')::decimal(5,4), 0.0000);
    ELSE
        v_tax_rate := 0.0000;
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
