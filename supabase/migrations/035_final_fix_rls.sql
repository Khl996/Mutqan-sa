-- ================================================================
-- FINAL FIX for Visibility Issues (RLS Recursion)
-- ================================================================

-- 1. Create a SECURE function to get the current user's tenant_id
-- SECURITY DEFINER = Runs with privileges of the creator (bypass RLS)
-- SET search_path = public = Security best practice
CREATE OR REPLACE FUNCTION secure_get_my_tenant_id()
RETURNS UUID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN (
        SELECT p.tenant_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND public.tenant_has_operational_access(p.tenant_id)
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql;

-- 2. RESET PROFILES Policy using the secure function
DROP POLICY IF EXISTS "Users can view profiles of same tenant" ON public.profiles;
DROP POLICY IF EXISTS "View shared tenant profiles" ON public.profiles; -- Remove if exists

CREATE POLICY "View profiles of same tenant"
ON public.profiles FOR SELECT
TO authenticated
USING (
    tenant_id = secure_get_my_tenant_id()
);

-- 3. RESET ASSETS Policy using the secure function
DROP POLICY IF EXISTS "Users can view assets of same tenant" ON public.assets;
DROP POLICY IF EXISTS "View shared tenant assets" ON public.assets; -- Remove if exists

CREATE POLICY "View assets of same tenant"
ON public.assets FOR SELECT
TO authenticated
USING (
    tenant_id = secure_get_my_tenant_id()
);

-- 4. Check Logs Policy too
DROP POLICY IF EXISTS "Users can view asset logs of their tenant" ON public.asset_activity_logs;

CREATE POLICY "View asset logs of same tenant"
    ON public.asset_activity_logs FOR SELECT
    TO authenticated
    USING (tenant_id = secure_get_my_tenant_id());
