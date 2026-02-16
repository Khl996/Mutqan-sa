-- Update the register_new_tenant function to set role as 'tenant_admin' instead of 'tenant_owner'

CREATE OR REPLACE FUNCTION register_new_tenant(
    p_name_ar TEXT,
    p_name_en TEXT,
    p_email TEXT,
    p_address TEXT,
    p_cr_number TEXT,
    p_tax_number TEXT,
    p_first_name TEXT,
    p_last_name TEXT,
    p_phone TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_postal_code TEXT DEFAULT NULL,
    p_website TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_tenant_id UUID;
    v_plan_id UUID;
    v_slug TEXT;
    v_base_slug TEXT;
    v_count INTEGER;
BEGIN
    -- Get current user ID (must be signed in)
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Generate Slug from English Name
    v_base_slug := lower(regexp_replace(p_name_en, '[^a-zA-Z0-9]', '', 'g'));
    
    -- Ensure minimal length
    IF v_base_slug IS NULL OR length(v_base_slug) < 3 THEN
        v_base_slug := 'tenant' || floor(random() * 10000)::text;
    END IF;
    
    v_slug := v_base_slug;
    
    -- Check uniqueness and append random number if needed
    LOOP
        SELECT count(*) INTO v_count FROM tenants WHERE slug = v_slug;
        IF v_count = 0 THEN
            EXIT;
        END IF;
        v_slug := v_base_slug || floor(random() * 10000)::text;
    END LOOP;

    -- Get a default subscription plan (Prefer 'free_trial' or lowest price)
    SELECT id INTO v_plan_id FROM subscription_plans 
    WHERE code = 'free_trial' AND is_active = true 
    LIMIT 1;

    -- Fallback to any plan
    IF v_plan_id IS NULL THEN
        SELECT id INTO v_plan_id FROM subscription_plans WHERE is_active = true AND price_monthly >= 0 ORDER BY price_monthly ASC LIMIT 1;
    END IF;

    -- Create Tenant
    INSERT INTO tenants (
        name, 
        name_ar, 
        slug,
        plan_id,
        subscription_status,
        cr_number,
        tax_number,
        address,
        country,
        city,
        postal_code,
        email,
        phone,
        website,
        created_at,
        updated_at
    ) VALUES (
        p_name_en,
        p_name_ar,
        v_slug,
        v_plan_id,
        'trial',
        p_cr_number,
        p_tax_number,
        p_address,
        p_country,
        p_city,
        p_postal_code,
        p_email,
        p_phone,
        p_website,
        NOW(),
        NOW()
    ) RETURNING id INTO v_tenant_id;

    -- Update User Profile
    UPDATE profiles 
    SET 
        tenant_id = v_tenant_id,
        full_name = p_first_name || ' ' || p_last_name,
        full_name_ar = p_first_name || ' ' || p_last_name,
        phone = p_phone,
        role = 'tenant_admin', -- Changed from 'tenant_owner' to 'tenant_admin'
        is_active = true,
        updated_at = NOW()
    WHERE id = v_user_id;

    -- Also verify user is confirmed if not already
    UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = v_user_id AND email_confirmed_at IS NULL;

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'slug', v_slug,
        'success', true
    );
END;
$$;
