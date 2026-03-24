-- ==============================================================================
-- Migration: 085_subscription_phase2_sync.sql
-- Purpose: Phase 2 fixes for subscription flow
--
-- 1. Update provision_tenant to use is_default + trial_days from DB
-- 2. Update admin_update_subscription to sync subscription_tier on tenants
-- ==============================================================================

-- ======================
-- 1. Update provision_tenant: use is_default plan and its trial_days
-- ======================

CREATE OR REPLACE FUNCTION provision_tenant(
    -- Tenant details
    p_name         TEXT,
    p_name_ar      TEXT DEFAULT NULL,
    p_slug         TEXT DEFAULT NULL,
    p_email        TEXT DEFAULT NULL,
    p_phone        TEXT DEFAULT NULL,
    p_address      TEXT DEFAULT NULL,
    p_cr_number    TEXT DEFAULT NULL,
    p_tax_number   TEXT DEFAULT NULL,
    p_country      TEXT DEFAULT NULL,
    p_city         TEXT DEFAULT NULL,
    p_postal_code  TEXT DEFAULT NULL,
    p_website      TEXT DEFAULT NULL,
    p_timezone     TEXT DEFAULT 'Asia/Riyadh',
    -- Initial subscription: p_plan_code is now a hint; is_default takes priority
    p_plan_code    TEXT DEFAULT NULL,
    p_trial_days   INTEGER DEFAULT NULL,        -- NULL = use plan's trial_days
    -- Optional: link calling user as tenant_admin
    p_assign_caller_as_admin BOOLEAN DEFAULT FALSE,
    p_caller_full_name       TEXT DEFAULT NULL,
    p_caller_phone           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id      UUID;
    v_tenant_id    UUID;
    v_plan_id      UUID;
    v_plan_code    TEXT;
    v_plan_price   DECIMAL(10, 2);
    v_plan_currency VARCHAR(3) := 'SAR';
    v_trial_days   INTEGER;
    v_slug         TEXT;
    v_base_slug    TEXT;
    v_count        INTEGER;
BEGIN
    -- Must be authenticated
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- ----- Resolve Subscription Plan -----
    -- Priority 1: Use the DB-flagged default plan (is_default = true)
    SELECT id, code, price_monthly, coalesce(currency, 'SAR'), coalesce(trial_days, 14)
      INTO v_plan_id, v_plan_code, v_plan_price, v_plan_currency, v_trial_days
      FROM subscription_plans
     WHERE is_default = true AND is_active = true
     LIMIT 1;

    -- Priority 2: If no default, try the passed p_plan_code
    IF v_plan_id IS NULL AND p_plan_code IS NOT NULL THEN
        SELECT id, code, price_monthly, coalesce(currency, 'SAR'), coalesce(trial_days, 14)
          INTO v_plan_id, v_plan_code, v_plan_price, v_plan_currency, v_trial_days
          FROM subscription_plans
         WHERE code = p_plan_code AND is_active = true
         LIMIT 1;
    END IF;

    -- Priority 3: fallback to cheapest active plan
    IF v_plan_id IS NULL THEN
        SELECT id, code, price_monthly, coalesce(currency, 'SAR'), coalesce(trial_days, 14)
          INTO v_plan_id, v_plan_code, v_plan_price, v_plan_currency, v_trial_days
          FROM subscription_plans
         WHERE is_active = true
         ORDER BY price_monthly ASC
         LIMIT 1;
    END IF;

    -- If still no plan found, error out
    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'No active subscription plan found. Cannot create tenant without a plan.';
    END IF;

    -- Allow caller to override trial_days (but only if explicitly passed)
    IF p_trial_days IS NOT NULL THEN
        v_trial_days := p_trial_days;
    END IF;

    -- ----- Slug Generation -----
    IF p_slug IS NOT NULL AND length(trim(p_slug)) >= 3 THEN
        v_base_slug := lower(regexp_replace(trim(p_slug), '[^a-z0-9\-]', '', 'g'));
    ELSE
        v_base_slug := lower(regexp_replace(coalesce(p_name, 'tenant'), '[^a-zA-Z0-9]', '', 'g'));
    END IF;

    IF v_base_slug IS NULL OR length(v_base_slug) < 3 THEN
        v_base_slug := 'tenant' || floor(random() * 10000)::text;
    END IF;

    v_slug := v_base_slug;

    LOOP
        SELECT count(*) INTO v_count FROM tenants WHERE slug = v_slug;
        EXIT WHEN v_count = 0;
        v_slug := v_base_slug || floor(random() * 10000)::text;
    END LOOP;

    -- ----- Create Tenant -----
    INSERT INTO tenants (
        name, name_ar, slug, plan_id, subscription_status, subscription_tier,
        cr_number, tax_number, address, country, city, postal_code,
        email, phone, website, timezone,
        trial_ends_at,
        created_at, updated_at
    ) VALUES (
        p_name, p_name_ar, v_slug, v_plan_id, 'trial', v_plan_code,
        p_cr_number, p_tax_number, p_address, p_country, p_city, p_postal_code,
        p_email, p_phone, p_website, p_timezone,
        NOW() + (v_trial_days || ' days')::INTERVAL,
        NOW(), NOW()
    )
    RETURNING id INTO v_tenant_id;

    -- ----- Create Subscription Record -----
    INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        current_period_start, current_period_end,
        trial_ends_at, amount, currency
    ) VALUES (
        v_tenant_id, v_plan_id, 'trial', 'monthly',
        NOW(),
        NOW() + (v_trial_days || ' days')::INTERVAL,
        NOW() + (v_trial_days || ' days')::INTERVAL,
        0,
        v_plan_currency
    );

    -- ----- Optionally assign caller as tenant_admin -----
    IF p_assign_caller_as_admin THEN
        UPDATE profiles
        SET tenant_id   = v_tenant_id,
            full_name   = coalesce(p_caller_full_name, full_name),
            full_name_ar = coalesce(p_caller_full_name, full_name_ar),
            phone       = coalesce(p_caller_phone, phone),
            role        = 'tenant_admin',
            is_active   = true,
            updated_at  = NOW()
        WHERE id = v_user_id;

        UPDATE auth.users
        SET email_confirmed_at = NOW()
        WHERE id = v_user_id AND email_confirmed_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'slug', v_slug,
        'plan_id', v_plan_id,
        'plan_code', v_plan_code,
        'trial_days', v_trial_days,
        'success', true
    );
END;
$$;


-- ======================
-- 2. Update register_new_tenant wrapper (no more hardcoded plan_code or trial_days)
-- ======================

CREATE OR REPLACE FUNCTION register_new_tenant(
    p_name_ar      TEXT,
    p_name_en      TEXT,
    p_email        TEXT,
    p_address      TEXT,
    p_cr_number    TEXT,
    p_tax_number   TEXT,
    p_first_name   TEXT,
    p_last_name    TEXT,
    p_phone        TEXT DEFAULT NULL,
    p_country      TEXT DEFAULT NULL,
    p_city         TEXT DEFAULT NULL,
    p_postal_code  TEXT DEFAULT NULL,
    p_website      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delegate to unified function; plan_code and trial_days are NULL
    -- so provision_tenant will use the DB default (is_default = true)
    RETURN provision_tenant(
        p_name                   := p_name_en,
        p_name_ar                := p_name_ar,
        p_email                  := coalesce(p_email, ''),
        p_phone                  := p_phone,
        p_address                := p_address,
        p_cr_number              := p_cr_number,
        p_tax_number             := p_tax_number,
        p_country                := p_country,
        p_city                   := p_city,
        p_postal_code            := p_postal_code,
        p_website                := p_website,
        p_plan_code              := NULL,   -- let DB decide via is_default
        p_trial_days             := NULL,   -- let plan's trial_days decide
        p_assign_caller_as_admin := TRUE,
        p_caller_full_name       := p_first_name || ' ' || p_last_name,
        p_caller_phone           := p_phone
    );
END;
$$;


-- ======================
-- 3. Update admin_update_subscription to sync subscription_tier
-- ======================

CREATE OR REPLACE FUNCTION admin_update_subscription(
    p_tenant_id UUID,
    p_plan_id UUID,
    p_billing_cycle VARCHAR,
    p_status VARCHAR DEFAULT 'active'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan RECORD;
    v_amount DECIMAL;
    v_now TIMESTAMPTZ := NOW();
    v_period_end TIMESTAMPTZ;
    v_subscription_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Security check
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('platform_admin', 'platform_owner')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only platform admins can update subscriptions directly';
    END IF;

    -- 2. Get Plan Details
    SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found';
    END IF;

    -- 3. Calculate Period End and Amount
    IF p_billing_cycle = 'yearly' THEN
        v_amount := v_plan.price_yearly;
        v_period_end := v_now + INTERVAL '1 year';
    ELSE
        v_amount := v_plan.price_monthly;
        v_period_end := v_now + INTERVAL '1 month';
    END IF;

    -- 4. Upsert Tenant Subscription
    INSERT INTO tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        current_period_start, current_period_end, amount, currency, updated_at
    )
    VALUES (
        p_tenant_id, p_plan_id, p_status, p_billing_cycle,
        v_now, v_period_end, v_amount, v_plan.currency, v_now
    )
    ON CONFLICT (tenant_id)
    DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        billing_cycle = EXCLUDED.billing_cycle,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        updated_at = EXCLUDED.updated_at
    RETURNING id INTO v_subscription_id;

    -- 5. Update Tenant table — NOW includes subscription_tier sync
    UPDATE tenants
    SET 
        subscription_status = p_status,
        subscription_tier = v_plan.code,          -- ← NEW: sync tier from plan code
        subscription_ends_at = v_period_end,
        plan_id = p_plan_id,
        billing_cycle = p_billing_cycle,          -- ← NEW: sync billing cycle
        updated_at = v_now
    WHERE id = p_tenant_id;

    -- 6. Audit log
    INSERT INTO platform_audit_logs (
        user_id, action, action_type, target_type, target_id, new_values, metadata
    )
    VALUES (
        auth.uid(),
        'Updated Subscription for Tenant ' || p_tenant_id,
        'update',
        'subscription',
        v_subscription_id,
        jsonb_build_object(
            'plan_id', p_plan_id,
            'plan_code', v_plan.code,
            'plan_name', v_plan.name,
            'status', p_status,
            'billing_cycle', p_billing_cycle,
            'amount', v_amount,
            'period_end', v_period_end
        ),
        jsonb_build_object('tenant_id', p_tenant_id)
    );

    v_result := jsonb_build_object(
        'success', true,
        'subscription_id', v_subscription_id,
        'plan_code', v_plan.code,
        'period_end', v_period_end
    );

    RETURN v_result;
END;
$$;
