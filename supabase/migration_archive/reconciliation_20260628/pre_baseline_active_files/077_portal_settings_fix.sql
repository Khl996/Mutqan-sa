-- =====================================================
-- Migration: 077_portal_settings_fix.sql
-- Purpose: Fix get_public_tenant_data to return portal_settings
-- Date: 2026-03-14
-- =====================================================

-- Problem: PublicReportPage expects portal_settings (require_phone, etc)
--          but get_public_tenant_data does not return them.
-- Solution: Recreate the function to include portal_settings from tenant settings.

-- Drop and recreate with updated return type
DROP FUNCTION IF EXISTS get_public_tenant_data(TEXT);

CREATE OR REPLACE FUNCTION get_public_tenant_data(p_token TEXT)
RETURNS TABLE (
    tenant_id UUID,
    tenant_name TEXT,
    buildings JSON,
    portal_settings JSON
) 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_tenant_name TEXT;
    v_portal_settings JSON;
BEGIN
    -- 1. Validate Token
    SELECT t.tenant_id INTO v_tenant_id
    FROM tenant_access_tokens t
    WHERE t.token = p_token AND t.is_active = true;

    IF v_tenant_id IS NULL THEN
        RETURN; -- Return nothing if invalid
    END IF;

    -- 2. Get Tenant Name and Portal Settings
    SELECT 
        ten.name,
        COALESCE(ten.settings->'portal', '{}')::JSON
    INTO v_tenant_name, v_portal_settings
    FROM tenants ten 
    WHERE ten.id = v_tenant_id;

    -- 3. Return Data with portal_settings
    RETURN QUERY
    SELECT 
        v_tenant_id,
        v_tenant_name,
        (
            SELECT json_agg(json_build_object('id', b.id, 'name', b.name, 'name_ar', b.name_ar))
            FROM buildings b
            WHERE b.tenant_id = v_tenant_id
        ) as buildings,
        v_portal_settings as portal_settings;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_public_tenant_data IS 
'Returns public tenant data for portal page including buildings and portal settings (require_phone, etc).';
