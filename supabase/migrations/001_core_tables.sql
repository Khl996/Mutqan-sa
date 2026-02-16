-- =====================================================
-- Mutqan Database Schema - Core Tables
-- Version: 1.0.0
-- Date: 2026-01-09
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. SUBSCRIPTION SYSTEM
-- =====================================================

-- Subscription Plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_ar VARCHAR(100),
  description TEXT,
  description_ar TEXT,
  price_monthly DECIMAL(10,2) DEFAULT 0,
  price_yearly DECIMAL(10,2) DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  included_users INTEGER DEFAULT 5,
  included_assets INTEGER DEFAULT 100,
  included_storage_mb INTEGER DEFAULT 1000,
  included_work_orders INTEGER DEFAULT 100,
  features JSONB DEFAULT '[]',
  modules JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenants (Organizations)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  
  -- Subscription
  subscription_status VARCHAR(20) DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'suspended', 'cancelled', 'expired')),
  plan_id UUID REFERENCES subscription_plans(id),
  subscription_starts_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  billing_cycle VARCHAR(20) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly', 'custom')),
  payment_method VARCHAR(50),
  
  -- Limits
  max_users INTEGER DEFAULT 5,
  max_assets INTEGER DEFAULT 100,
  max_work_orders_per_month INTEGER DEFAULT 100,
  max_storage_mb INTEGER DEFAULT 1000,
  
  -- Enabled Modules
  enabled_modules JSONB DEFAULT '{}',
  
  -- Branding
  logo_url TEXT,
  logo_white_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#2E3A45',
  secondary_color VARCHAR(7) DEFAULT '#3AAFA9',
  
  -- Contact
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  website VARCHAR(255),
  
  -- Settings
  timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
  language VARCHAR(5) DEFAULT 'ar',
  currency VARCHAR(3) DEFAULT 'SAR',
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  suspended_at TIMESTAMPTZ,
  suspended_by UUID,
  suspension_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant Modules Configuration
CREATE TABLE IF NOT EXISTS tenant_modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_code VARCHAR(50) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  price DECIMAL(10,2) DEFAULT 0,
  configuration JSONB DEFAULT '{}',
  features JSONB DEFAULT '{}',
  enabled_at TIMESTAMPTZ,
  enabled_by UUID,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, module_code)
);

-- =====================================================
-- 2. USER PROFILES & ROLES
-- =====================================================

-- User Profiles (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id),
  
  -- Basic Info
  full_name VARCHAR(255),
  full_name_ar VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  avatar_url TEXT,
  
  -- Role
  role VARCHAR(50) DEFAULT 'reporter' CHECK (role IN (
    'platform_owner', 'platform_admin', 'platform_support', 'platform_finance', 'platform_hr',
    'tenant_admin', 'facility_manager', 'maintenance_manager', 'engineer', 'supervisor', 'technician', 'reporter'
  )),
  is_super_admin BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_activity_at TIMESTAMPTZ,
  
  -- Additional Info
  department VARCHAR(100),
  employee_number VARCHAR(50),
  job_title VARCHAR(100),
  supervisor_id UUID REFERENCES profiles(id),
  
  -- Settings
  language VARCHAR(5) DEFAULT 'ar',
  timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
  notification_preferences JSONB DEFAULT '{"email": true, "push": true}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Custom Roles per Tenant
CREATE TABLE IF NOT EXISTS custom_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_ar VARCHAR(100),
  description TEXT,
  permissions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

-- User Custom Roles
CREATE TABLE IF NOT EXISTS user_custom_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(user_id, role_id)
);

-- =====================================================
-- 3. FACILITY STRUCTURE
-- =====================================================

-- Buildings
CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  description TEXT,
  address TEXT,
  coordinates_lat DECIMAL(10, 8),
  coordinates_lng DECIMAL(11, 8),
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

-- Floors
CREATE TABLE IF NOT EXISTS floors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  level INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(building_id, code)
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  floor_id UUID REFERENCES floors(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  floor_id UUID REFERENCES floors(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  room_type VARCHAR(50),
  capacity INTEGER,
  coordinates_x DECIMAL(10, 2),
  coordinates_y DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

-- =====================================================
-- 4. TEAMS
-- =====================================================

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  description TEXT,
  type VARCHAR(50) DEFAULT 'maintenance' CHECK (type IN ('maintenance', 'engineering', 'operations', 'support', 'custom')),
  specializations TEXT[],
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('leader', 'member', 'supervisor')),
  specializations TEXT[],
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(team_id, user_id)
);

-- =====================================================
-- 5. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_buildings_tenant ON buildings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_floors_building ON floors(building_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rooms_tenant ON rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_teams_tenant ON teams(tenant_id);

-- =====================================================
-- 6. DEFAULT DATA
-- =====================================================

-- Insert default subscription plans
INSERT INTO subscription_plans (code, name, name_ar, price_monthly, price_yearly, included_users, included_assets, included_storage_mb, included_work_orders, is_featured, features)
VALUES 
  ('free_trial', 'Free Trial', 'تجربة مجانية', 0, 0, 3, 50, 500, 50, FALSE, '["basic_dashboard", "basic_assets", "basic_work_orders"]'),
  ('starter', 'Starter', 'البداية', 299, 2990, 10, 200, 2000, 200, FALSE, '["full_dashboard", "assets", "work_orders", "teams"]'),
  ('professional', 'Professional', 'الاحترافية', 599, 5990, 25, 500, 5000, 500, TRUE, '["full_dashboard", "assets", "work_orders", "teams", "inventory", "reports", "sla"]'),
  ('enterprise', 'Enterprise', 'المؤسسات', 999, 9990, 100, 2000, 20000, 2000, FALSE, '["all_features", "custom_modules", "api_access", "priority_support"]')
ON CONFLICT (code) DO NOTHING;
