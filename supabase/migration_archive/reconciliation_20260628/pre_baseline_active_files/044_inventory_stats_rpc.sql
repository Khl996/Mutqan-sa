-- Function to get inventory stats
CREATE OR REPLACE FUNCTION get_inventory_stats(check_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_count INTEGER;
  low_stock_count INTEGER;
  total_val DECIMAL(15, 2);
BEGIN
  -- Total Items
  SELECT COUNT(*) INTO total_count
  FROM inventory_items
  WHERE tenant_id = check_tenant_id AND is_active = TRUE;

  -- Low Stock
  SELECT COUNT(*) INTO low_stock_count
  FROM inventory_items
  WHERE tenant_id = check_tenant_id 
    AND is_active = TRUE 
    AND quantity <= min_quantity;

  -- Total Value
  SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO total_val
  FROM inventory_items
  WHERE tenant_id = check_tenant_id AND is_active = TRUE;

  RETURN jsonb_build_object(
    'total_items', total_count,
    'low_stock', low_stock_count,
    'total_value', total_val
  );
END;
$$;
