-- =====================================================
-- COMPLETE FIX for Tenants RLS Policies
-- This script ensures platform_admin can fully manage tenants
-- Run this ENTIRE script in Supabase SQL Editor
-- =====================================================

-- Step 1: Ensure RLS is enabled
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies on tenants table
DO $$
DECLARE
    policy_name text;
BEGIN
    FOR policy_name IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'tenants'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON tenants', policy_name);
        RAISE NOTICE 'Dropped policy: %', policy_name;
    END LOOP;
END $$;

-- Step 3: Create a helper function to check if user is platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    user_is_super BOOLEAN;
BEGIN
    SELECT role, is_super_admin INTO user_role, user_is_super
    FROM public.profiles
    WHERE id = auth.uid();
    
    RETURN (
        user_is_super = true 
        OR user_role IN ('platform_owner', 'platform_admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create comprehensive policy for SELECT
CREATE POLICY "tenants_select_policy"
    ON public.tenants
    FOR SELECT
    TO authenticated
    USING (public.is_platform_admin());

-- Step 5: Create comprehensive policy for INSERT
CREATE POLICY "tenants_insert_policy"
    ON public.tenants
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_platform_admin());

-- Step 6: Create comprehensive policy for UPDATE
CREATE POLICY "tenants_update_policy"
    ON public.tenants
    FOR UPDATE
    TO authenticated
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());

-- Step 7: Create comprehensive policy for DELETE
CREATE POLICY "tenants_delete_policy"
    ON public.tenants
    FOR DELETE
    TO authenticated
    USING (public.is_platform_admin());

-- Step 8: Verify the policies were created
SELECT 
    policyname,
    cmd,
    permissive
FROM pg_policies 
WHERE tablename = 'tenants';

-- Step 9: Test the function (optional - you can run this to verify)
-- SELECT public.is_platform_admin();

SELECT 'SUCCESS: RLS policies for tenants table have been updated!' as result;
