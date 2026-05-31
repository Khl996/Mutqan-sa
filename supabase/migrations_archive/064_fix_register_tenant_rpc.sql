-- Fix register_new_tenant function: remove 'status' column from insert
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
    v_slug TEXT;
    v_base_slug TEXT;
    v_count INTEGER;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Generate Slug
    v_base_slug := lower(regexp_replace(p_name_en, '[^a-zA-Z0-9]', '', 'g'));
    IF v_base_slug IS NULL OR length(v_base_slug) < 3 THEN
        v_base_slug := 'tenant' || floor(random() * 10000)::text;
    END IF;
    
    v_slug := v_base_slug;
    
    -- Check uniqueness
    LOOP
        SELECT count(*) INTO v_count FROM tenants WHERE slug = v_slug;
        IF v_count = 0 THEN
            EXIT;
        END IF;
        v_slug := v_base_slug || floor(random() * 10000)::text;
    END LOOP;

    -- Get Plan
    SELECT id INTO v_plan_id FROM subscription_plans WHERE code = 'free_trial' AND is_active = true LIMIT 1;
    IF v_plan_id IS NULL THEN
        SELECT id INTO v_plan_id FROM subscription_plans WHERE is_active = true ORDER BY price_monthly ASC LIMIT 1;
    END IF;

    -- Create Tenant (Removed 'status' column which caused error)
    INSERT INTO tenants (
        name, 
        name_ar, 
        slug,
        subscription_plan_id, 
        subscription_status,
        cr_number,
        tax_number,
        address,
        email,
        is_active,
        subscription_starts_at,
        trial_ends_at
    ) VALUES (
        p_name_en,
        p_name_ar,
        v_slug,
        v_plan_id,
        'trial',
        p_cr_number,
        p_tax_number,
        p_address,
        p_email,
        true,
        NOW(),
        NOW() + INTERVAL '14 days'
    ) RETURNING id INTO v_tenant_id;

    -- Update User Profile
    UPDATE profiles 
    SET 
        tenant_id = v_tenant_id,
        full_name = p_first_name || ' ' || p_last_name,
        full_name_ar = p_first_name || ' ' || p_last_name,
        role = 'tenant_owner',
        status = 'active'
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'slug', v_slug,
        'success', true
    );
END;
$$;
