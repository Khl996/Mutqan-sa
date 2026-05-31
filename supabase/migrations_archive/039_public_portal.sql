-- =====================================================
-- PUBLIC PORTAL & GUEST REPORTING SETUP
-- =====================================================

-- 1. Create Tenant Access Tokens Table
-- This table stores secure tokens that allow public access specific tenants
CREATE TABLE IF NOT EXISTS tenant_access_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE, -- The secure string seen in URL
    name TEXT NOT NULL, -- e.g., "Main QR Code", "Guest Portal"
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id)
);

-- Enable RLS
ALTER TABLE tenant_access_tokens ENABLE ROW LEVEL SECURITY;

-- Only authenticated users (admins) can view/manage tokens
CREATE POLICY "Admins can manage tokens" ON tenant_access_tokens
    FOR ALL
    USING (auth.uid() IN (
        SELECT id FROM profiles WHERE tenant_id = tenant_access_tokens.tenant_id
    ));


-- 2. Modify Work Orders Table for Guest Reporting
-- We need to store reporter details for non-authenticated users
ALTER TABLE work_orders 
ADD COLUMN IF NOT EXISTS reporter_name TEXT,
ADD COLUMN IF NOT EXISTS reporter_phone TEXT;

-- Update RLS for work_orders to allow insertion without auth IF handled via secure RPC
-- Standard INSERT policy usually requires auth.uid(). 
-- We will rely on SECURITY DEFINER RPC for public insertion to bypass this safely.


-- 3. Secure RPC: Get Tenant Public Data
-- Returns minimal needed data (id, name only) for dropdowns based on valid token
CREATE OR REPLACE FUNCTION get_public_tenant_data(p_token TEXT)
RETURNS TABLE (
    tenant_id UUID,
    tenant_name TEXT,
    buildings JSON
) 
SECURITY DEFINER -- Runs with system privileges
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_tenant_name TEXT;
BEGIN
    -- 1. Validate Token
    SELECT t.tenant_id INTO v_tenant_id
    FROM tenant_access_tokens t
    WHERE t.token = p_token AND t.is_active = true;

    IF v_tenant_id IS NULL THEN
        RETURN; -- Return nothing if invalid
    END IF;

    -- 2. Get Tenant Name
    SELECT name INTO v_tenant_name FROM tenants WHERE id = v_tenant_id;

    -- 3. Return Data
    RETURN QUERY
    SELECT 
        v_tenant_id,
        v_tenant_name,
        (
            SELECT json_agg(json_build_object('id', b.id, 'name', b.name, 'name_ar', b.name_ar))
            FROM buildings b
            WHERE b.tenant_id = v_tenant_id
        ) as buildings;
END;
$$ LANGUAGE plpgsql;


-- 4. Secure RPC: Submit Public Work Order
-- Validates token and inserts work order
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
    v_code_seq INT;
    v_code TEXT;
BEGIN
    -- 1. Validate Token
    SELECT tenant_id INTO v_tenant_id
    FROM tenant_access_tokens
    WHERE token = p_token AND is_active = true;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired token';
    END IF;

    -- 2. Generate Code (Custom logic similar to standard insert)
    -- Simple sequence approach for safety
    -- Note: In production, ideally use the same trigger logic or a shared helper
    v_code := 'PUB-' || to_char(NOW(), 'YYMMDD') || '-' || substring(uuid_generate_v4()::text from 1 for 4);

    -- 3. Insert Work Order
    INSERT INTO work_orders (
        tenant_id,
        code,
        title, -- Auto-generate title
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
        'pending', -- Default status
        'medium',  -- Default priority
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
        NULL -- No user ID
    );

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;
