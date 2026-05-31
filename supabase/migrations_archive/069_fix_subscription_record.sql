CREATE OR REPLACE FUNCTION register_new_tenant(
    p_name_ar TEXT,
    p_name_en TEXT,
    p_email TEXT,
    p_address TEXT,
    p_cr_number TEXT,
    p_tax_number TEXT,
    p_first_name TEXT,
    p_last_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_tenant_id UUID;
    v_plan_id UUID;
    v_trial_days INTEGER;
    v_price DECIMAL(10, 2);
    v_currency VARCHAR(3);
    v_slug TEXT;
    v_base_slug TEXT;
    v_count INTEGER;
BEGIN
    -- Auth check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Slug Generation
    v_base_slug := lower(regexp_replace(p_name_en, '[^a-zA-Z0-9]', '', 'g'));
    IF v_base_slug IS NULL OR length(v_base_slug) < 3 THEN
        v_base_slug := 'tenant' || floor(random() * 10000)::text;
    END IF;
    v_slug := v_base_slug;
    LOOP
        SELECT count(*) INTO v_count FROM tenants WHERE slug = v_slug;
        IF v_count = 0 THEN EXIT; END IF;
        v_slug := v_base_slug || floor(random() * 10000)::text;
    END LOOP;

    -- Get Default Plan (Fixed: Get price and currency too)
    SELECT id, trial_days, price_monthly, currency INTO v_plan_id, v_trial_days, v_price, v_currency
    FROM subscription_plans 
    WHERE is_default = true AND is_active = true 
    LIMIT 1;

    -- Fallback Plan
    IF v_plan_id IS NULL THEN
        SELECT id, 7, price_monthly, currency INTO v_plan_id, v_trial_days, v_price, v_currency
        FROM subscription_plans 
        WHERE is_active = true 
        ORDER BY price_monthly ASC 
        LIMIT 1;
    END IF;
    
    IF v_trial_days IS NULL THEN v_trial_days := 7; END IF;

    -- Create Tenant
    INSERT INTO tenants (
        name, name_ar, slug, 
        subscription_plan_id, subscription_status,
        cr_number, tax_number, address, email,
        is_active, subscription_starts_at, trial_ends_at
    ) VALUES (
        p_name_en, p_name_ar, v_slug,
        v_plan_id, 'trial',
        p_cr_number, p_tax_number, p_address, p_email,
        true, NOW(), NOW() + (v_trial_days || ' days')::INTERVAL
    ) RETURNING id INTO v_tenant_id;

    -- Create Tenant Subscription Record (The Missing Link)
    INSERT INTO tenant_subscriptions (
        tenant_id,
        plan_id,
        status,
        billing_cycle,
        current_period_start,
        current_period_end,
        trial_ends_at,
        amount,
        currency
    ) VALUES (
        v_tenant_id,
        v_plan_id,
        'trial',
        'monthly',
        NOW(),
        NOW() + (v_trial_days || ' days')::INTERVAL,
        NOW() + (v_trial_days || ' days')::INTERVAL,
        v_price,
        v_currency
    );

    -- Update Profile
    UPDATE profiles 
    SET tenant_id = v_tenant_id,
        full_name = p_first_name || ' ' || p_last_name,
        full_name_ar = p_first_name || ' ' || p_last_name,
        role = 'tenant_admin',
        is_active = true 
    WHERE id = v_user_id;

    RETURN jsonb_build_object('tenant_id', v_tenant_id, 'success', true);
END;
$$;
