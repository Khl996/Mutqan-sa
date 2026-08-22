-- ==============================================================================
-- Migration: 084_provision_tenant_unified.sql
-- Purpose: Single backend path for tenant creation with mandatory subscription
-- 
-- This replaces both:
--   1. register_new_tenant (self-registration flow)
--   2. Direct INSERT into tenants (platform admin flow)
-- 
-- Both flows now call provision_tenant() which guarantees:
--   - A tenant record is created
--   - A tenant_subscriptions record is created (trial by default)
--   - The tenants.plan_id and subscription_status are set
--   - Trial dates are properly configured
-- ==============================================================================

-- ======================
-- 1. Unified RPC function for ALL tenant creation
-- ======================

CREATE OR REPLACE FUNCTION provision_tenant(
    -- Tenant details
    p_name         TEXT,
    p_name_ar      TEXT DEFAULT NULL,
    p_slug         TEXT DEFAULT NULL,           -- optional; auto-generated if null
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
    -- Initial subscription (defaults to free_trial)
    p_plan_code    TEXT DEFAULT 'free_trial',    -- code from subscription_plans
    p_trial_days   INTEGER DEFAULT 14,
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
    v_plan_price   DECIMAL(10, 2);
    v_plan_currency VARCHAR(3) := 'SAR';
    v_slug         TEXT;
    v_base_slug    TEXT;
    v_count        INTEGER;
BEGIN
    -- Must be authenticated
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
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

    -- Ensure slug uniqueness
    LOOP
        SELECT count(*) INTO v_count FROM tenants WHERE slug = v_slug;
        EXIT WHEN v_count = 0;
        v_slug := v_base_slug || floor(random() * 10000)::text;
    END LOOP;

    -- ----- Resolve Subscription Plan -----
    SELECT id, price_monthly,
           coalesce(currency, 'SAR')
      INTO v_plan_id, v_plan_price, v_plan_currency
      FROM subscription_plans
     WHERE code = p_plan_code AND is_active = true
     LIMIT 1;

    -- Fallback: first active plan with lowest price
    IF v_plan_id IS NULL THEN
        SELECT id, price_monthly,
               coalesce(currency, 'SAR')
          INTO v_plan_id, v_plan_price, v_plan_currency
          FROM subscription_plans
         WHERE is_active = true
         ORDER BY price_monthly ASC
         LIMIT 1;
    END IF;

    -- If still no plan found, error out — we don't allow tenants without a plan
    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'No active subscription plan found. Cannot create tenant without a plan.';
    END IF;

    -- ----- Create Tenant -----
    INSERT INTO tenants (
        name, name_ar, slug, plan_id, subscription_status,
        cr_number, tax_number, address, country, city, postal_code,
        email, phone, website, timezone,
        trial_ends_at,
        created_at, updated_at
    ) VALUES (
        p_name, p_name_ar, v_slug, v_plan_id, 'trial',
        p_cr_number, p_tax_number, p_address, p_country, p_city, p_postal_code,
        p_email, p_phone, p_website, p_timezone,
        NOW() + (p_trial_days || ' days')::INTERVAL,
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
        NOW() + (p_trial_days || ' days')::INTERVAL,
        NOW() + (p_trial_days || ' days')::INTERVAL,
        0,  -- trial is free
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

        -- Ensure email is confirmed
        UPDATE auth.users
        SET email_confirmed_at = NOW()
        WHERE id = v_user_id AND email_confirmed_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'slug', v_slug,
        'plan_id', v_plan_id,
        'success', true
    );
END;
$$;


-- ======================
-- 2. Update register_new_tenant to be a thin wrapper around provision_tenant
--    This preserves backward compatibility for any code still calling it
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
    -- Delegate to the single unified function
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
        p_plan_code              := 'free_trial',
        p_trial_days             := 14,
        p_assign_caller_as_admin := TRUE,
        p_caller_full_name       := p_first_name || ' ' || p_last_name,
        p_caller_phone           := p_phone
    );
END;
$$;
