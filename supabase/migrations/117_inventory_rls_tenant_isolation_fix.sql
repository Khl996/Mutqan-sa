-- =============================================================================
-- Migration: 117_inventory_rls_tenant_isolation_fix.sql
-- Purpose:
--   Fix confirmed tenant leakage on inventory_items found by runtime RLS checks.
--
-- Runtime evidence:
--   verify-rls-isolation showed tenant A users could read tenant B
--   inventory_items, and tenant B could read tenant A inventory_items.
--
-- Approach:
--   Inventory tables had older permissive policies in some staging schemas.
--   Drop all policies on inventory inventory tables and recreate the intended
--   tenant-scoped policies from a single source of truth.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_view_inventory(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND (
                COALESCE(p.is_super_admin, FALSE) = TRUE
                OR p.role IN ('platform_owner', 'platform_admin')
                OR (
                    p.tenant_id = p_tenant_id
                    AND public.tenant_has_operational_access(p_tenant_id)
                )
           )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_inventory(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND (
                COALESCE(p.is_super_admin, FALSE) = TRUE
                OR p.role IN ('platform_owner', 'platform_admin')
                OR (
                    p.tenant_id = p_tenant_id
                    AND public.tenant_has_operational_access(p_tenant_id)
                    AND p.role IN ('tenant_owner', 'tenant_admin', 'maintenance_manager')
                )
           )
    );
$$;

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    v_policy record;
BEGIN
    FOR v_policy IN
        SELECT schemaname, tablename, policyname
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('inventory_categories', 'inventory_items', 'inventory_transactions')
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            v_policy.policyname,
            v_policy.schemaname,
            v_policy.tablename
        );
    END LOOP;
END;
$$;

CREATE POLICY "inventory_categories_select_tenant"
ON public.inventory_categories
FOR SELECT
TO authenticated
USING (public.can_view_inventory(tenant_id));

CREATE POLICY "inventory_categories_insert_tenant"
ON public.inventory_categories
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_categories_update_tenant"
ON public.inventory_categories
FOR UPDATE
TO authenticated
USING (public.can_manage_inventory(tenant_id))
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_categories_delete_tenant"
ON public.inventory_categories
FOR DELETE
TO authenticated
USING (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_items_select_tenant"
ON public.inventory_items
FOR SELECT
TO authenticated
USING (public.can_view_inventory(tenant_id));

CREATE POLICY "inventory_items_insert_tenant"
ON public.inventory_items
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_items_update_tenant"
ON public.inventory_items
FOR UPDATE
TO authenticated
USING (public.can_manage_inventory(tenant_id))
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_items_delete_tenant"
ON public.inventory_items
FOR DELETE
TO authenticated
USING (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_transactions_select_tenant"
ON public.inventory_transactions
FOR SELECT
TO authenticated
USING (public.can_view_inventory(tenant_id));

CREATE POLICY "inventory_transactions_insert_tenant"
ON public.inventory_transactions
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_transactions_update_tenant"
ON public.inventory_transactions
FOR UPDATE
TO authenticated
USING (public.can_manage_inventory(tenant_id))
WITH CHECK (public.can_manage_inventory(tenant_id));

CREATE POLICY "inventory_transactions_delete_tenant"
ON public.inventory_transactions
FOR DELETE
TO authenticated
USING (public.can_manage_inventory(tenant_id));
