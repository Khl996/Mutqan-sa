-- =============================================================================
-- Migration: 125_disable_work_order_direct_delete.sql
-- Purpose:
--   Disable direct authenticated hard delete for work orders in Pilot v1.
--   Work orders are operational memory; use cancel_work_order for lifecycle
--   cancellation instead of deleting rows and their related history.
-- =============================================================================

-- Legacy and current DELETE policy names seen across migrations:
--   003_rls_policies.sql: "Admins can delete work orders"
--   093_v1_roles_permissions_alignment.sql: "Managers can delete work orders"
--   094_soft_launch_assets_facilities_hardening.sql: "work_orders_delete_scoped"
--
-- Drop all known direct DELETE policies so future evaluation cannot allow
-- tenant management roles to hard delete work_orders through the REST API.
DROP POLICY IF EXISTS "Admins can delete work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Managers can delete work orders" ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_delete_scoped" ON public.work_orders;
DROP POLICY IF EXISTS "work_orders_delete_disabled_direct" ON public.work_orders;

CREATE POLICY "work_orders_delete_disabled_direct"
ON public.work_orders
FOR DELETE
TO authenticated
USING (FALSE);

COMMENT ON POLICY "work_orders_delete_disabled_direct" ON public.work_orders IS
    'Pilot v1 operational-memory protection: authenticated users cannot hard delete work orders directly. Use public.cancel_work_order(...) for audited cancellation. Service-role/database maintenance may still bypass RLS according to PostgreSQL/Supabase service-role behavior.';

COMMENT ON TABLE public.work_orders IS
    'Work orders are operational memory. Direct authenticated DELETE is disabled for Pilot v1; use audited lifecycle RPCs such as cancel_work_order.';
