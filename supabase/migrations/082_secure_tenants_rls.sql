-- =====================================================
-- Migration: 082_secure_tenants_rls.sql
-- Purpose: Remove allowing all policies from 020 and secure the tenants table.
--          - Platform admins have full access.
--          - Tenant admins/owners can update their own tenant.
--          - Tenant members can only view their own tenant.
-- =====================================================

-- Step 1: Drop the "allow all" policies from migration 020
DROP POLICY IF EXISTS "allow_all_select" ON tenants;
DROP POLICY IF EXISTS "allow_all_insert" ON tenants;
DROP POLICY IF EXISTS "allow_all_update" ON tenants;
DROP POLICY IF EXISTS "allow_all_delete" ON tenants;

-- Ensure the old specific policies from previous versions are also dropped just in case
DROP POLICY IF EXISTS "tenants_select_policy" ON tenants;
DROP POLICY IF EXISTS "tenants_insert_policy" ON tenants;
DROP POLICY IF EXISTS "tenants_update_policy" ON tenants;
DROP POLICY IF EXISTS "tenants_delete_policy" ON tenants;

-- Step 2: Ensure Helper function exists
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    user_is_super BOOLEAN;
BEGIN
    SELECT role, is_super_admin INTO user_role, user_is_super
    FROM public.profiles
    WHERE id = auth.uid();
    
    RETURN (user_is_super = true OR user_role IN ('platform_owner', 'platform_admin'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Create Secure Policies
DROP POLICY IF EXISTS "tenants_select_secure" ON tenants;
DROP POLICY IF EXISTS "tenants_insert_secure" ON tenants;
DROP POLICY IF EXISTS "tenants_update_secure" ON tenants;
DROP POLICY IF EXISTS "tenants_delete_secure" ON tenants;

-- SELECT: Users can see their own tenant, OR platform admins see all
CREATE POLICY "tenants_select_secure" ON tenants FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.tenant_id = tenants.id)
    OR 
    public.is_platform_admin()
);

-- INSERT: Only platform admins can create tenants
CREATE POLICY "tenants_insert_secure" ON tenants FOR INSERT TO authenticated WITH CHECK (
    public.is_platform_admin()
);

-- UPDATE: Platform admins can update any, Tenant Admins/Owners can update their own
CREATE POLICY "tenants_update_secure" ON tenants FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('tenant_admin', 'tenant_owner') AND profiles.tenant_id = tenants.id)
    OR 
    public.is_platform_admin()
) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('tenant_admin', 'tenant_owner') AND profiles.tenant_id = tenants.id)
    OR 
    public.is_platform_admin()
);

-- DELETE: Only platform admins can delete tenants
CREATE POLICY "tenants_delete_secure" ON tenants FOR DELETE TO authenticated USING (
    public.is_platform_admin()
);
