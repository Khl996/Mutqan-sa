-- =====================================================
-- DIAGNOSTIC: Check current user profile and permissions
-- Run this in Supabase SQL Editor to see what's happening
-- =====================================================

-- 1. Check current user's profile
SELECT 
    id,
    email,
    role,
    is_super_admin,
    tenant_id,
    full_name
FROM profiles 
WHERE id = auth.uid();

-- 2. Check if is_platform_admin function exists and works
SELECT public.is_platform_admin() as "Is Platform Admin?";

-- 3. List all policies on tenants table
SELECT 
    policyname,
    cmd,
    permissive,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'tenants';

-- 4. Check all profiles with platform roles
SELECT 
    id,
    email,
    role,
    is_super_admin,
    tenant_id
FROM profiles
WHERE role IN ('platform_owner', 'platform_admin') OR is_super_admin = true;

-- 5. Quick fix: If your user is NOT a platform_admin, update it
-- UNCOMMENT and modify the email below to fix:
/*
UPDATE profiles
SET 
    role = 'platform_admin',
    is_super_admin = true,
    tenant_id = NULL
WHERE email = 'YOUR_EMAIL_HERE';
*/

SELECT '--- Run the queries above to diagnose the issue ---' as instructions;
