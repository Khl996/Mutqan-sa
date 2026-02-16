-- =====================================================
-- Fix RLS Policies for Platform Admins to Manage Tenants
-- Run this in SQL Editor
-- =====================================================

-- Update is_super_admin function to include platform_admin role
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT (is_super_admin = true OR role IN ('platform_owner', 'platform_admin')) 
    FROM profiles WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing tenant management policy if exists
DROP POLICY IF EXISTS "Super admins can manage tenants" ON tenants;

-- Create new policy that includes platform_admin role
CREATE POLICY "Platform admins can manage tenants"
  ON tenants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND (is_super_admin = true OR role IN ('platform_owner', 'platform_admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND (is_super_admin = true OR role IN ('platform_owner', 'platform_admin'))
    )
  );

-- Also update the view policy
DROP POLICY IF EXISTS "Super admins can view all tenants" ON tenants;

CREATE POLICY "Platform admins can view all tenants"
  ON tenants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND (is_super_admin = true OR role IN ('platform_owner', 'platform_admin'))
    )
  );

SELECT 'RLS policies updated successfully!' as result;
