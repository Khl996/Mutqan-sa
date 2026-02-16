-- =============================================
-- Update Inventory Stats to Use Tenant Settings
-- =============================================

-- Update get_inventory_stats to use low_stock_threshold_percent from settings
CREATE OR REPLACE FUNCTION get_inventory_stats(check_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_count INTEGER;
    low_stock_count INTEGER;
    total_val DECIMAL(15, 2);
    v_threshold_percent INTEGER;
    v_settings JSONB;
BEGIN
    -- Get tenant settings for threshold
    SELECT settings INTO v_settings
    FROM tenants
    WHERE id = check_tenant_id;
    
    -- Get threshold from settings (default 20%)
    v_threshold_percent := COALESCE(
        (v_settings->'inventory'->>'low_stock_threshold_percent')::INTEGER,
        20
    );

    -- Total Items
    SELECT COUNT(*) INTO total_count
    FROM inventory_items
    WHERE tenant_id = check_tenant_id AND is_active = TRUE;

    -- Low Stock - using threshold percentage
    -- Item is low stock if quantity <= min_quantity OR quantity <= (min_quantity * threshold% / 100)
    SELECT COUNT(*) INTO low_stock_count
    FROM inventory_items
    WHERE tenant_id = check_tenant_id 
      AND is_active = TRUE 
      AND (
          quantity <= min_quantity 
          OR (min_quantity > 0 AND quantity <= (min_quantity * v_threshold_percent / 100))
      );

    -- Total Value
    SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO total_val
    FROM inventory_items
    WHERE tenant_id = check_tenant_id AND is_active = TRUE;

    RETURN jsonb_build_object(
        'total_items', total_count,
        'low_stock', low_stock_count,
        'total_value', total_val,
        'threshold_percent', v_threshold_percent
    );
END;
$$;

COMMENT ON FUNCTION get_inventory_stats IS 'Returns inventory statistics using tenant-specific low stock threshold settings';
