-- ================================================================
-- Fix Visibility Issues for Logs (Unknown User / Unknown Asset)
-- ================================================================

-- 1. Create a helper function to safely get the current user's tenant_id
-- This prevents "Infinite Recursion" errors in RLS policies
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update PROFILES Policy
-- Allow users to see names of other users in the SAME tenant
DROP POLICY IF EXISTS "Users can view profiles of same tenant" ON public.profiles;

CREATE POLICY "Users can view profiles of same tenant"
ON public.profiles FOR SELECT
USING (
    tenant_id = get_my_tenant_id() 
);

-- 3. Update ASSETS Policy (Just to be sure)
-- Ensure assets are visible in joins
DROP POLICY IF EXISTS "Users can view assets of same tenant" ON public.assets;

CREATE POLICY "Users can view assets of same tenant"
ON public.assets FOR SELECT
USING (
    tenant_id = get_my_tenant_id()
);
