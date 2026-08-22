
-- أ.4 — Remove 3 stale public-role policies on work_orders, replace UPDATE with clean authenticated equivalent.
-- Idempotent: DROP IF EXISTS

-- 1. Drop the three stale {public} policies
DROP POLICY IF EXISTS "Users can view work orders in their tenant"  ON public.work_orders;
DROP POLICY IF EXISTS "Users can update assigned work orders"        ON public.work_orders;
DROP POLICY IF EXISTS "Admins can delete work orders"                ON public.work_orders;

-- 2. Add replacement UPDATE policy (authenticated) preserving access for
--    assigned technicians, original reporters, and creators.
--    Can_manage_work_orders_scope (tenant_admin/maint_manager) is already covered
--    by work_orders_update_scoped; this fills the gap for involved non-admin roles.
DROP POLICY IF EXISTS work_orders_update_involved ON public.work_orders;

CREATE POLICY work_orders_update_involved ON public.work_orders
    FOR UPDATE TO authenticated
    USING (
        tenant_id = public.get_user_tenant_id()
        AND (
            assigned_to  = auth.uid()
            OR reported_by = auth.uid()
            OR created_by  = auth.uid()
        )
    )
    WITH CHECK (
        tenant_id = public.get_user_tenant_id()
        AND (
            assigned_to  = auth.uid()
            OR reported_by = auth.uid()
            OR created_by  = auth.uid()
        )
    );

