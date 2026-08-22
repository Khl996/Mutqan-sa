-- 1. Enable RLS on inventory_transactions
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to ensure clean slate
DROP POLICY IF EXISTS "Tenant users can view transactions" ON inventory_transactions;
DROP POLICY IF EXISTS "Tenant users can create transactions" ON inventory_transactions;

-- 3. Create Policies
CREATE POLICY "Tenant users can view transactions" ON inventory_transactions
    FOR SELECT USING (
        tenant_id = public.get_user_tenant_id() OR
        public.is_super_admin() = TRUE
    );

CREATE POLICY "Tenant users can create transactions" ON inventory_transactions
    FOR INSERT WITH CHECK (
        tenant_id = public.get_user_tenant_id()
    );

-- 4. Update Transaction Type Check Constraint to include 'usage'
ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;
ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_transaction_type_check 
    CHECK (transaction_type IN ('in', 'out', 'adjustment', 'return', 'usage'));

-- 5. Make quantity_before and quantity_after nullable to allow flexible inserts (like usage logs)
ALTER TABLE inventory_transactions ALTER COLUMN quantity_before DROP NOT NULL;
ALTER TABLE inventory_transactions ALTER COLUMN quantity_after DROP NOT NULL;
