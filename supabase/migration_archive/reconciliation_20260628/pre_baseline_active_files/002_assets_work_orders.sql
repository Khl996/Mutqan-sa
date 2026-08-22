-- =====================================================
-- Mutqan Database Schema - Assets & Work Orders
-- Version: 1.0.0
-- =====================================================

-- =====================================================
-- 1. ASSET CATEGORIES
-- =====================================================

CREATE TABLE IF NOT EXISTS asset_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  parent_id UUID REFERENCES asset_categories(id),
  icon VARCHAR(50),
  color VARCHAR(7),
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. ASSETS
-- =====================================================

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Basic Info
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  description TEXT,
  
  -- Classification
  category_id UUID REFERENCES asset_categories(id),
  category VARCHAR(100),
  subcategory VARCHAR(100),
  type VARCHAR(100),
  
  -- Status
  status VARCHAR(30) DEFAULT 'operational' CHECK (status IN ('operational', 'under_maintenance', 'out_of_service', 'retired', 'pending_installation', 'disposed')),
  criticality VARCHAR(20) DEFAULT 'medium' CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
  
  -- Technical Specs
  model VARCHAR(100),
  serial_number VARCHAR(100),
  manufacturer VARCHAR(255),
  manufacture_year INTEGER,
  specifications JSONB DEFAULT '{}',
  
  -- Financial
  purchase_date DATE,
  purchase_cost DECIMAL(12, 2),
  installation_date DATE,
  depreciation_annual DECIMAL(10, 2),
  expected_lifespan_years INTEGER,
  current_value DECIMAL(12, 2),
  
  -- Warranty
  warranty_provider VARCHAR(255),
  warranty_expiry DATE,
  supplier VARCHAR(255),
  supplier_contact TEXT,
  
  -- Location
  building_id UUID REFERENCES buildings(id),
  floor_id UUID REFERENCES floors(id),
  department_id UUID REFERENCES departments(id),
  room_id UUID REFERENCES rooms(id),
  coordinates_x DECIMAL(10, 2),
  coordinates_y DECIMAL(10, 2),
  
  -- Hierarchy
  parent_asset_id UUID REFERENCES assets(id),
  
  -- QR & Tracking
  qr_code VARCHAR(100) UNIQUE,
  barcode VARCHAR(100),
  rfid_tag VARCHAR(100),
  
  -- Images
  image_url TEXT,
  images JSONB DEFAULT '[]',
  documents JSONB DEFAULT '[]',
  
  -- Maintenance
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  maintenance_frequency_days INTEGER,
  
  -- Metadata
  custom_fields JSONB DEFAULT '{}',
  tags TEXT[],
  
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, code)
);

-- =====================================================
-- 3. ISSUE TYPES
-- =====================================================

CREATE TABLE IF NOT EXISTS issue_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  description TEXT,
  default_team_id UUID REFERENCES teams(id),
  default_priority VARCHAR(20) DEFAULT 'medium',
  sla_hours INTEGER,
  icon VARCHAR(50),
  color VARCHAR(7),
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. WORK ORDERS
-- =====================================================

CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Basic Info
  code VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Classification
  issue_type_id UUID REFERENCES issue_types(id),
  issue_type VARCHAR(100),
  
  -- Status & Priority
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 'assigned', 'in_progress', 
    'pending_supervisor_approval', 'pending_engineer_review', 
    'pending_reporter_closure', 'completed', 'auto_closed',
    'rejected_by_technician', 'cancelled', 'on_hold'
  )),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- People
  reported_by UUID REFERENCES profiles(id),
  assigned_to UUID REFERENCES profiles(id),
  assigned_team UUID REFERENCES teams(id),
  created_by UUID REFERENCES profiles(id),
  
  -- Location
  building_id UUID REFERENCES buildings(id),
  floor_id UUID REFERENCES floors(id),
  department_id UUID REFERENCES departments(id),
  room_id UUID REFERENCES rooms(id),
  asset_id UUID REFERENCES assets(id),
  
  -- External
  company_id UUID,
  contractor_name VARCHAR(255),
  
  -- Timing
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  
  -- Workflow Approvals
  technician_completed_at TIMESTAMPTZ,
  technician_notes TEXT,
  
  supervisor_approved_at TIMESTAMPTZ,
  supervisor_approved_by UUID REFERENCES profiles(id),
  supervisor_notes TEXT,
  
  engineer_approved_at TIMESTAMPTZ,
  engineer_approved_by UUID REFERENCES profiles(id),
  engineer_notes TEXT,
  
  customer_reviewed_at TIMESTAMPTZ,
  customer_reviewed_by UUID REFERENCES profiles(id),
  reporter_notes TEXT,
  
  maintenance_manager_approved_at TIMESTAMPTZ,
  maintenance_manager_approved_by UUID REFERENCES profiles(id),
  maintenance_manager_notes TEXT,
  
  -- Auto Close
  auto_closed_at TIMESTAMPTZ,
  pending_closure_since TIMESTAMPTZ,
  
  -- Attachments
  attachments JSONB DEFAULT '[]',
  before_images JSONB DEFAULT '[]',
  after_images JSONB DEFAULT '[]',
  
  -- Cost
  estimated_cost DECIMAL(12, 2),
  actual_cost DECIMAL(12, 2),
  
  -- SLA
  sla_response_deadline TIMESTAMPTZ,
  sla_resolution_deadline TIMESTAMPTZ,
  sla_response_met BOOLEAN,
  sla_resolution_met BOOLEAN,
  
  -- Metadata
  custom_fields JSONB DEFAULT '{}',
  tags TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, code)
);

-- =====================================================
-- 5. WORK ORDER COSTS
-- =====================================================

CREATE TABLE IF NOT EXISTS work_order_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  cost_type VARCHAR(50) NOT NULL CHECK (cost_type IN ('labor', 'parts', 'materials', 'external_service', 'travel', 'other')),
  description TEXT,
  quantity DECIMAL(10, 2) DEFAULT 1,
  unit_cost DECIMAL(12, 2),
  total_cost DECIMAL(12, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  currency VARCHAR(3) DEFAULT 'SAR',
  vendor_id UUID,
  invoice_number VARCHAR(100),
  invoice_date DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. OPERATION LOGS
-- =====================================================

CREATE TABLE IF NOT EXISTS operation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  
  -- Type
  type VARCHAR(50) NOT NULL CHECK (type IN ('maintenance', 'repair', 'inspection', 'emergency', 'routine', 'installation', 'calibration', 'other')),
  
  -- Related Entities
  asset_id UUID REFERENCES assets(id),
  asset_name VARCHAR(255),
  work_order_id UUID REFERENCES work_orders(id),
  
  -- Location
  building_id UUID REFERENCES buildings(id),
  location TEXT,
  system_type VARCHAR(100),
  
  -- Details
  reason TEXT,
  description TEXT NOT NULL,
  
  -- People
  performed_by UUID REFERENCES profiles(id),
  technician_name VARCHAR(255),
  team_id UUID REFERENCES teams(id),
  
  -- Timing
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  estimated_duration INTEGER, -- minutes
  actual_duration INTEGER, -- minutes
  
  -- Status
  status VARCHAR(30) DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed', 'cancelled', 'pending_approval')),
  
  -- Approval
  approval_required BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,
  
  -- Emergency
  emergency_measures TEXT,
  affected_areas TEXT[],
  notified_parties TEXT[],
  
  -- Media
  photos JSONB DEFAULT '[]',
  documents JSONB DEFAULT '[]',
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, code)
);

-- =====================================================
-- 7. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_assets_tenant ON assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id);
CREATE INDEX IF NOT EXISTS idx_assets_building ON assets(building_id);
CREATE INDEX IF NOT EXISTS idx_assets_qr ON assets(qr_code);

CREATE INDEX IF NOT EXISTS idx_work_orders_tenant ON work_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_priority ON work_orders(priority);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_team ON work_orders(assigned_team);
CREATE INDEX IF NOT EXISTS idx_work_orders_asset ON work_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_reported ON work_orders(reported_at);

CREATE INDEX IF NOT EXISTS idx_operation_logs_tenant ON operation_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_asset ON operation_logs(asset_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_work_order ON operation_logs(work_order_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_type ON operation_logs(type);

-- =====================================================
-- 8. DEFAULT ISSUE TYPES (System Level)
-- =====================================================

-- These will be copied to each tenant on creation
INSERT INTO issue_types (tenant_id, code, name, name_ar, default_priority, icon, color, display_order)
VALUES 
  (NULL, 'electrical', 'Electrical', 'كهربائي', 'high', 'zap', '#F59E0B', 1),
  (NULL, 'mechanical', 'Mechanical', 'ميكانيكي', 'medium', 'wrench', '#3B82F6', 2),
  (NULL, 'plumbing', 'Plumbing', 'سباكة', 'medium', 'droplet', '#06B6D4', 3),
  (NULL, 'hvac', 'HVAC', 'تكييف وتبريد', 'high', 'thermometer', '#10B981', 4),
  (NULL, 'civil', 'Civil', 'أعمال مدنية', 'low', 'building', '#6B7280', 5),
  (NULL, 'medical_equipment', 'Medical Equipment', 'معدات طبية', 'critical', 'heart-pulse', '#EF4444', 6),
  (NULL, 'it', 'IT & Network', 'تقنية المعلومات', 'medium', 'wifi', '#8B5CF6', 7),
  (NULL, 'cleaning', 'Cleaning', 'نظافة', 'low', 'sparkles', '#EC4899', 8),
  (NULL, 'safety', 'Safety & Security', 'السلامة والأمن', 'urgent', 'shield', '#DC2626', 9),
  (NULL, 'other', 'Other', 'أخرى', 'low', 'more-horizontal', '#9CA3AF', 10)
ON CONFLICT DO NOTHING;
