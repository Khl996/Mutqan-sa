-- =====================================================
-- Mutqan Database Schema - Row Level Security
-- Version: 1.0.0
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get current user's tenant_id
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is super admin (platform level)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT is_super_admin FROM profiles WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is tenant admin
CREATE OR REPLACE FUNCTION is_tenant_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT role IN ('tenant_admin', 'platform_owner', 'platform_admin') 
    FROM profiles WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PROFILES POLICIES
-- =====================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Users can view profiles in their tenant
CREATE POLICY "Users can view tenant profiles"
  ON profiles FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Super admins can view all profiles
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_super_admin());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Tenant admins can update profiles in their tenant
CREATE POLICY "Tenant admins can update tenant profiles"
  ON profiles FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_tenant_admin());

-- =====================================================
-- TENANTS POLICIES
-- =====================================================

-- Users can view their own tenant
CREATE POLICY "Users can view own tenant"
  ON tenants FOR SELECT
  USING (id = get_user_tenant_id());

-- Super admins can view all tenants
CREATE POLICY "Super admins can view all tenants"
  ON tenants FOR SELECT
  USING (is_super_admin());

-- Super admins can manage tenants
CREATE POLICY "Super admins can manage tenants"
  ON tenants FOR ALL
  USING (is_super_admin());

-- =====================================================
-- BUILDINGS POLICIES
-- =====================================================

CREATE POLICY "Users can view buildings in their tenant"
  ON buildings FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "Admins can manage buildings"
  ON buildings FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- FLOORS POLICIES
-- =====================================================

CREATE POLICY "Users can view floors in their tenant"
  ON floors FOR SELECT
  USING (
    building_id IN (SELECT id FROM buildings WHERE tenant_id = get_user_tenant_id())
    OR is_super_admin()
  );

CREATE POLICY "Admins can manage floors"
  ON floors FOR ALL
  USING (
    (building_id IN (SELECT id FROM buildings WHERE tenant_id = get_user_tenant_id()) AND is_tenant_admin())
    OR is_super_admin()
  );

-- =====================================================
-- DEPARTMENTS POLICIES
-- =====================================================

CREATE POLICY "Users can view departments in their tenant"
  ON departments FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "Admins can manage departments"
  ON departments FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- ROOMS POLICIES
-- =====================================================

CREATE POLICY "Users can view rooms in their tenant"
  ON rooms FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "Admins can manage rooms"
  ON rooms FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- TEAMS POLICIES
-- =====================================================

CREATE POLICY "Users can view teams in their tenant"
  ON teams FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "Admins can manage teams"
  ON teams FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- ASSETS POLICIES
-- =====================================================

CREATE POLICY "Users can view assets in their tenant"
  ON assets FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "Admins can manage assets"
  ON assets FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- WORK ORDERS POLICIES
-- =====================================================

-- Everyone in tenant can view work orders
CREATE POLICY "Users can view work orders in their tenant"
  ON work_orders FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

-- Everyone can create work orders (reporters)
CREATE POLICY "Users can create work orders"
  ON work_orders FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update work orders they're assigned to or created
CREATE POLICY "Users can update assigned work orders"
  ON work_orders FOR UPDATE
  USING (
    tenant_id = get_user_tenant_id() AND (
      assigned_to = auth.uid() OR
      reported_by = auth.uid() OR
      created_by = auth.uid() OR
      is_tenant_admin()
    )
  );

-- Admins can delete work orders
CREATE POLICY "Admins can delete work orders"
  ON work_orders FOR DELETE
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- OPERATION LOGS POLICIES
-- =====================================================

CREATE POLICY "Users can view operation logs in their tenant"
  ON operation_logs FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "Users can create operation logs"
  ON operation_logs FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- =====================================================
-- ISSUE TYPES POLICIES
-- =====================================================

-- View system-level and tenant-level issue types
CREATE POLICY "Users can view issue types"
  ON issue_types FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "Admins can manage issue types"
  ON issue_types FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- ASSET CATEGORIES POLICIES
-- =====================================================

CREATE POLICY "Users can view asset categories"
  ON asset_categories FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "Admins can manage asset categories"
  ON asset_categories FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- TENANT MODULES POLICIES
-- =====================================================

CREATE POLICY "Users can view their tenant modules"
  ON tenant_modules FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

CREATE POLICY "Super admins can manage tenant modules"
  ON tenant_modules FOR ALL
  USING (is_super_admin());
