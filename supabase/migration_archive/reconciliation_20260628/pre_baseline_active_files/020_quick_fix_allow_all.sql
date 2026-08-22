-- =====================================================
-- QUICK FIX: Temporarily disable RLS on tenants table
-- This allows all authenticated users to manage tenants
-- Use this for development/testing only!
-- =====================================================

-- Option 1: Disable RLS completely (NOT recommended for production)
-- ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;

-- Option 2: Allow all authenticated users (use this for testing)
DROP POLICY IF EXISTS "tenants_select_policy" ON tenants;
DROP POLICY IF EXISTS "tenants_insert_policy" ON tenants;
DROP POLICY IF EXISTS "tenants_update_policy" ON tenants;
DROP POLICY IF EXISTS "tenants_delete_policy" ON tenants;
DROP POLICY IF EXISTS "Platform admins can manage tenants" ON tenants;
DROP POLICY IF EXISTS "Platform admins can view all tenants" ON tenants;

-- Create permissive policies for all authenticated users
CREATE POLICY "allow_all_select" ON tenants FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_all_insert" ON tenants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "allow_all_update" ON tenants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_delete" ON tenants FOR DELETE TO authenticated USING (true);

SELECT 'SUCCESS: All authenticated users can now manage tenants!' as result;

-- =====================================================
-- AFTER TESTING: To restore proper RLS, run this:
-- =====================================================
/*
DROP POLICY IF EXISTS "allow_all_select" ON tenants;
DROP POLICY IF EXISTS "allow_all_insert" ON tenants;
DROP POLICY IF EXISTS "allow_all_update" ON tenants;
DROP POLICY IF EXISTS "allow_all_delete" ON tenants;

-- Then re-run 018_complete_tenants_rls_fix.sql
*/
