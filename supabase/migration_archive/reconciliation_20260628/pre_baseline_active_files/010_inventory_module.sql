-- =====================================================
-- Mutqan Database Schema - Inventory Module
-- Version: 1.0.0
-- =====================================================

-- =====================================================
-- 1. INVENTORY CATEGORIES
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. INVENTORY ITEMS (Spare Parts)
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Item Details
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  description TEXT,
  part_number VARCHAR(100),
  manufacturer VARCHAR(255),
  
  -- Classification
  category_id UUID REFERENCES inventory_categories(id),
  
  -- Stock Levels
  quantity DECIMAL(10, 2) DEFAULT 0,
  min_quantity DECIMAL(10, 2) DEFAULT 0, -- Reorder point
  max_quantity DECIMAL(10, 2),
  unit_of_measure VARCHAR(20) DEFAULT 'pcs', -- pcs, kg, ltr, etc.
  
  -- Location
  location VARCHAR(100), -- Warehouse/Shelf/Bin
  
  -- Financial
  unit_cost DECIMAL(12, 2) DEFAULT 0,
  selling_price DECIMAL(12, 2),
  
  -- Assets Linking
  compatible_assets JSONB DEFAULT '[]', -- Array of asset codes or IDs
  
  -- Media
  image_url TEXT,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, code)
);

-- =====================================================
-- 3. INVENTORY TRANSACTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  
  -- Transaction Type
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('in', 'out', 'adjustment', 'return')),
  
  -- Quantity
  quantity DECIMAL(10, 2) NOT NULL,
  quantity_before DECIMAL(10, 2) NOT NULL,
  quantity_after DECIMAL(10, 2) NOT NULL,
  
  -- Financial
  unit_cost DECIMAL(12, 2),
  total_cost DECIMAL(12, 2),
  
  -- Reference
  reference_type VARCHAR(50), -- work_order, purchase_order, manual
  reference_id UUID,          -- ID of the related entity
  
  notes TEXT,
  
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_inventory_items_tenant ON inventory_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_low_stock ON inventory_items(quantity, min_quantity) WHERE quantity <= min_quantity;

CREATE INDEX IF NOT EXISTS idx_inventory_trans_tenant ON inventory_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_trans_item ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_trans_created ON inventory_transactions(created_at);

-- =====================================================
-- 5. LOW STOCK VIEW (Optional, but helpful)
-- =====================================================
CREATE OR REPLACE VIEW view_low_stock_items AS
SELECT * FROM inventory_items
WHERE quantity <= min_quantity AND is_active = TRUE;

-- =====================================================
-- 6. Trigger to Update Stock Quantity automatically
-- =====================================================
-- This would be complex to implement safely in SQL ensuring consistency. 
-- For now, we will handle stock updates via Application Logic (RPC or API)
-- to ensure we calculate before/after correctly.
