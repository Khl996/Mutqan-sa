-- Fix submit_public_work_order to use gen_random_uuid() instead of uuid_generate_v4()
-- This resolves the "function does not exist" error

CREATE OR REPLACE FUNCTION submit_public_work_order(
    p_token TEXT,
    p_reporter_name TEXT,
    p_reporter_phone TEXT,
    p_description TEXT,
    p_building_id UUID,
    p_floor_id UUID DEFAULT NULL,
    p_asset_id UUID DEFAULT NULL
)
RETURNS UUID -- Returns the new Work Order ID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_new_id UUID;
    v_code TEXT;
BEGIN
    -- 1. Validate Token
    SELECT tenant_id INTO v_tenant_id
    FROM tenant_access_tokens
    WHERE token = p_token AND is_active = true;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired token';
    END IF;

    -- 2. Generate Code 
    -- Using gen_random_uuid() which is built-in
    v_code := 'PUB-' || to_char(NOW(), 'YYMMDD') || '-' || substring(gen_random_uuid()::text from 1 for 4);

    -- 3. Insert Work Order
    INSERT INTO work_orders (
        tenant_id,
        code,
        title, 
        description,
        status,
        priority,
        building_id,
        floor_id,
        asset_id,
        reporter_name,
        reporter_phone,
        reported_at,
        created_at
    ) VALUES (
        v_tenant_id,
        v_code,
        'بلاغ عام: ' || COALESCE(substring(p_description from 1 for 30), 'General Issue'),
        p_description,
        'pending', 
        'medium', 
        p_building_id,
        p_floor_id,
        p_asset_id,
        p_reporter_name,
        p_reporter_phone,
        NOW(),
        NOW()
    ) RETURNING id INTO v_new_id;

    -- 4. Log the creation
    PERFORM create_operation_log(
        v_tenant_id, v_new_id, 'create', 
        'Public report submitted by: ' || p_reporter_name, 
        NULL
    );

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;
