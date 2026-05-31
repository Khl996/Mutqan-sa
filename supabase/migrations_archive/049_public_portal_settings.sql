-- =============================================
-- Update Public Portal RPC to Include Settings
-- =============================================

-- Drop existing function first to avoid return type conflict
DROP FUNCTION IF EXISTS get_public_tenant_data(TEXT);

-- Update get_public_tenant_data to include portal settings
CREATE OR REPLACE FUNCTION get_public_tenant_data(p_token TEXT)
RETURNS TABLE(
    tenant_id UUID,
    tenant_name TEXT,
    buildings JSONB,
    portal_settings JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_settings JSONB;
BEGIN
    -- Get tenant from portal token
    SELECT pt.tenant_id, t.settings 
    INTO v_tenant_id, v_settings
    FROM public_portal_tokens pt
    JOIN tenants t ON t.id = pt.tenant_id
    WHERE pt.token = p_token 
      AND pt.is_active = true 
      AND (pt.expires_at IS NULL OR pt.expires_at > NOW());
    
    IF v_tenant_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Return tenant data with portal settings
    RETURN QUERY
    SELECT 
        t.id AS tenant_id,
        COALESCE(t.name_ar, t.name)::TEXT AS tenant_name,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'name_ar', b.name_ar))
             FROM buildings b WHERE b.tenant_id = t.id),
            '[]'::JSONB
        ) AS buildings,
        COALESCE(v_settings->'portal', '{}'::JSONB) AS portal_settings
    FROM tenants t
    WHERE t.id = v_tenant_id;
END;
$$;

COMMENT ON FUNCTION get_public_tenant_data IS 'Returns tenant data for public portal including portal settings';
