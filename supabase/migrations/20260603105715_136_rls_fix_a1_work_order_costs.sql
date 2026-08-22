
-- أ.1 — RLS policies for work_order_costs (no tenant_id column; scoped via work_orders)
-- Idempotent: DROP IF EXISTS before CREATE

DROP POLICY IF EXISTS woc_select  ON public.work_order_costs;
DROP POLICY IF EXISTS woc_manage  ON public.work_order_costs;

-- SELECT: anyone in the same tenant (via the parent work order)
CREATE POLICY woc_select ON public.work_order_costs
    FOR SELECT TO authenticated
    USING (
        work_order_id IN (
            SELECT id FROM public.work_orders
            WHERE tenant_id = public.get_user_tenant_id()
        )
    );

-- ALL write ops: users who can manage work orders in that tenant
CREATE POLICY woc_manage ON public.work_order_costs
    FOR ALL TO authenticated
    USING (
        work_order_id IN (
            SELECT id FROM public.work_orders
            WHERE public.can_manage_work_orders_scope(tenant_id)
        )
    )
    WITH CHECK (
        work_order_id IN (
            SELECT id FROM public.work_orders
            WHERE public.can_manage_work_orders_scope(tenant_id)
        )
    );

