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

-- Check if a tenant is still allowed operational access
CREATE OR REPLACE FUNCTION public.tenant_has_operational_access(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND COALESCE(t.is_active, TRUE) = TRUE
      AND COALESCE(t.subscription_status, 'trial') NOT IN ('expired', 'suspended', 'cancelled')
      AND (
        COALESCE(t.subscription_ends_at, t.trial_ends_at) IS NULL
        OR COALESCE(t.subscription_ends_at, t.trial_ends_at) >= now()
      )
  );
$$;

-- Get current user's tenant_id only when operational access is still allowed
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT p.tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND public.tenant_has_operational_access(p.tenant_id)
    LIMIT 1
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
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Users can view profiles in their tenant
DROP POLICY IF EXISTS "Users can view tenant profiles" ON profiles;
CREATE POLICY "Users can view tenant profiles"
  ON profiles FOR SELECT
  USING (tenant_id = get_user_tenant_id());

-- Super admins can view all profiles
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_super_admin());

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Tenant admins can update profiles in their tenant
DROP POLICY IF EXISTS "Tenant admins can update tenant profiles" ON profiles;
CREATE POLICY "Tenant admins can update tenant profiles"
  ON profiles FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND is_tenant_admin());

-- =====================================================
-- TENANTS POLICIES
-- =====================================================

-- Users can view their own tenant
DROP POLICY IF EXISTS "Users can view own tenant" ON tenants;
CREATE POLICY "Users can view own tenant"
  ON tenants FOR SELECT
  USING (id = get_user_tenant_id());

-- Users can still view their linked tenant row for billing and renewal flows
DROP POLICY IF EXISTS "Users can view linked tenant for billing" ON tenants;
CREATE POLICY "Users can view linked tenant for billing"
  ON tenants FOR SELECT
  USING (
    id IN (
      SELECT p.tenant_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  );

-- Super admins can view all tenants
DROP POLICY IF EXISTS "Super admins can view all tenants" ON tenants;
CREATE POLICY "Super admins can view all tenants"
  ON tenants FOR SELECT
  USING (is_super_admin());

-- Super admins can manage tenants
DROP POLICY IF EXISTS "Super admins can manage tenants" ON tenants;
CREATE POLICY "Super admins can manage tenants"
  ON tenants FOR ALL
  USING (is_super_admin());

-- =====================================================
-- BUILDINGS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view buildings in their tenant" ON buildings;
CREATE POLICY "Users can view buildings in their tenant"
  ON buildings FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Admins can manage buildings" ON buildings;
CREATE POLICY "Admins can manage buildings"
  ON buildings FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- FLOORS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view floors in their tenant" ON floors;
CREATE POLICY "Users can view floors in their tenant"
  ON floors FOR SELECT
  USING (
    building_id IN (SELECT id FROM buildings WHERE tenant_id = get_user_tenant_id())
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can manage floors" ON floors;
CREATE POLICY "Admins can manage floors"
  ON floors FOR ALL
  USING (
    (building_id IN (SELECT id FROM buildings WHERE tenant_id = get_user_tenant_id()) AND is_tenant_admin())
    OR is_super_admin()
  );

-- =====================================================
-- DEPARTMENTS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view departments in their tenant" ON departments;
CREATE POLICY "Users can view departments in their tenant"
  ON departments FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Admins can manage departments" ON departments;
CREATE POLICY "Admins can manage departments"
  ON departments FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- ROOMS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view rooms in their tenant" ON rooms;
CREATE POLICY "Users can view rooms in their tenant"
  ON rooms FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Admins can manage rooms" ON rooms;
CREATE POLICY "Admins can manage rooms"
  ON rooms FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- TEAMS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view teams in their tenant" ON teams;
CREATE POLICY "Users can view teams in their tenant"
  ON teams FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Admins can manage teams" ON teams;
CREATE POLICY "Admins can manage teams"
  ON teams FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- ASSETS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view assets in their tenant" ON assets;
CREATE POLICY "Users can view assets in their tenant"
  ON assets FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Admins can manage assets" ON assets;
CREATE POLICY "Admins can manage assets"
  ON assets FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- WORK ORDERS POLICIES
-- =====================================================

-- Everyone in tenant can view work orders
DROP POLICY IF EXISTS "Users can view work orders in their tenant" ON work_orders;
CREATE POLICY "Users can view work orders in their tenant"
  ON work_orders FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

-- Everyone can create work orders (reporters)
DROP POLICY IF EXISTS "Users can create work orders" ON work_orders;
CREATE POLICY "Users can create work orders"
  ON work_orders FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Users can update work orders they're assigned to or created
DROP POLICY IF EXISTS "Users can update assigned work orders" ON work_orders;
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
DROP POLICY IF EXISTS "Admins can delete work orders" ON work_orders;
CREATE POLICY "Admins can delete work orders"
  ON work_orders FOR DELETE
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- OPERATION LOGS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view operation logs in their tenant" ON operation_logs;
CREATE POLICY "Users can view operation logs in their tenant"
  ON operation_logs FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Users can create operation logs" ON operation_logs;
CREATE POLICY "Users can create operation logs"
  ON operation_logs FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

-- =====================================================
-- ISSUE TYPES POLICIES
-- =====================================================

-- View system-level and tenant-level issue types
DROP POLICY IF EXISTS "Users can view issue types" ON issue_types;
CREATE POLICY "Users can view issue types"
  ON issue_types FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Admins can manage issue types" ON issue_types;
CREATE POLICY "Admins can manage issue types"
  ON issue_types FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- ASSET CATEGORIES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view asset categories" ON asset_categories;
CREATE POLICY "Users can view asset categories"
  ON asset_categories FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_user_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Admins can manage asset categories" ON asset_categories;
CREATE POLICY "Admins can manage asset categories"
  ON asset_categories FOR ALL
  USING ((tenant_id = get_user_tenant_id() AND is_tenant_admin()) OR is_super_admin());

-- =====================================================
-- TENANT MODULES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their tenant modules" ON tenant_modules;
CREATE POLICY "Users can view their tenant modules"
  ON tenant_modules FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "Super admins can manage tenant modules" ON tenant_modules;
CREATE POLICY "Super admins can manage tenant modules"
  ON tenant_modules FOR ALL
  USING (is_super_admin());
