-- =====================================================
-- Migration: 014_fix_platform_admin_rls.sql
-- Purpose: Allow platform admins to work without tenant_id while remaining production-safe
-- =====================================================

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT (is_super_admin = TRUE OR role IN ('platform_owner', 'platform_admin'))
    FROM profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS SETOF profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Platform admins can view own profile" ON profiles;
CREATE POLICY "Platform admins can view own profile"
  ON profiles FOR SELECT
  USING (
    id = auth.uid()
    AND (role IN ('platform_owner', 'platform_admin', 'platform_support') OR is_super_admin = TRUE)
  );

DO $$
BEGIN
  RAISE NOTICE '014_fix_platform_admin_rls.sql applied without bootstrap profile inserts or hardcoded admin updates.';
END $$;
