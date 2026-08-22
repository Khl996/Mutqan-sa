-- =====================================================
-- Migration: 098_public_portal_entitlement_enforcement.sql
-- Purpose: Enforce public portal entitlements on token management and public RPCs
-- Date: 2026-04-01
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_tenant_feature_enabled(
    p_tenant_id UUID,
    p_module_code TEXT,
    p_feature_code TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT CASE
                WHEN COALESCE((t.enabled_modules -> p_module_code ->> 'enabled')::BOOLEAN, FALSE) = FALSE THEN FALSE
                ELSE COALESCE((t.enabled_modules -> p_module_code -> 'features' ->> p_feature_code)::BOOLEAN, FALSE)
            END
            FROM public.tenants t
            WHERE t.id = p_tenant_id
        ),
        FALSE
    );
$$;

COMMENT ON FUNCTION public.is_tenant_feature_enabled(UUID, TEXT, TEXT) IS
'Returns TRUE only when the tenant module is enabled and the specific feature flag is enabled. Fails closed.';

CREATE OR REPLACE FUNCTION public.has_public_portal_access(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_tenant_feature_enabled(p_tenant_id, 'public_portal', 'qr_portal')
       AND public.is_tenant_feature_enabled(p_tenant_id, 'public_portal', 'public_submission');
$$;

COMMENT ON FUNCTION public.has_public_portal_access(UUID) IS
'Returns TRUE only when the tenant subscription/modules explicitly allow the public portal experience.';

DROP POLICY IF EXISTS "Admins can manage tokens" ON public.tenant_access_tokens;

CREATE POLICY "Admins can manage tokens"
ON public.tenant_access_tokens
FOR ALL
TO authenticated
USING (
    public.has_public_portal_access(tenant_access_tokens.tenant_id)
    AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (p.tenant_id = tenant_access_tokens.tenant_id AND p.role = 'tenant_admin')
          )
    )
)
WITH CHECK (
    public.has_public_portal_access(tenant_access_tokens.tenant_id)
    AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (p.tenant_id = tenant_access_tokens.tenant_id AND p.role = 'tenant_admin')
          )
    )
);

CREATE OR REPLACE FUNCTION public.get_public_tenant_data(p_token TEXT)
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
    SELECT t.tenant_id
      INTO v_tenant_id
      FROM public.tenant_access_tokens t
     WHERE t.token = p_token
       AND t.is_active = TRUE
       AND public.has_public_portal_access(t.tenant_id)
     LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RETURN;
    END IF;

    SELECT ten.name,
           COALESCE(ten.settings -> 'portal', '{}')::JSON
      INTO v_tenant_name, v_portal_settings
      FROM public.tenants ten
     WHERE ten.id = v_tenant_id;

    RETURN QUERY
    SELECT
        v_tenant_id,
        v_tenant_name,
        (
            SELECT json_agg(json_build_object('id', b.id, 'name', b.name, 'name_ar', b.name_ar))
            FROM public.buildings b
            WHERE b.tenant_id = v_tenant_id
        ) AS buildings,
        v_portal_settings AS portal_settings;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_public_tenant_data(TEXT) IS
'Returns public portal data only when the token is active and the tenant has the public_portal entitlement.';

CREATE OR REPLACE FUNCTION public.submit_public_work_order(
    p_token TEXT,
    p_reporter_name TEXT,
    p_reporter_phone TEXT,
    p_description TEXT,
    p_building_id UUID,
    p_floor_id UUID DEFAULT NULL,
    p_asset_id UUID DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_new_id UUID;
    v_code TEXT;
BEGIN
    SELECT tenant_id
      INTO v_tenant_id
      FROM public.tenant_access_tokens
     WHERE token = p_token
       AND is_active = TRUE
       AND public.has_public_portal_access(tenant_id)
     LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired token';
    END IF;

    IF p_building_id IS NOT NULL THEN
        PERFORM 1
          FROM public.buildings
         WHERE id = p_building_id
           AND tenant_id = v_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid building for this organization';
        END IF;
    END IF;

    IF p_floor_id IS NOT NULL THEN
        PERFORM 1
          FROM public.floors f
          JOIN public.buildings b ON f.building_id = b.id
         WHERE f.id = p_floor_id
           AND b.tenant_id = v_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid floor for this organization';
        END IF;
    END IF;

    IF p_asset_id IS NOT NULL THEN
        PERFORM 1
          FROM public.assets
         WHERE id = p_asset_id
           AND tenant_id = v_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid asset for this organization';
        END IF;
    END IF;

    v_code := 'PUB-' || to_char(NOW(), 'YYMMDD') || '-' || substring(uuid_generate_v4()::text from 1 for 4);

    INSERT INTO public.work_orders (
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
    )
    RETURNING id INTO v_new_id;

    PERFORM public.create_operation_log(
        v_tenant_id,
        v_new_id,
        'create',
        'Public report submitted by: ' || p_reporter_name,
        NULL
    );

    RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.submit_public_work_order(TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID) IS
'Submits a public work order only when the token is active and the tenant has the public_portal entitlement.';
