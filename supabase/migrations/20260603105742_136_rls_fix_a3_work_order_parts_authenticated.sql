
-- أ.3 — Replace public-role policies on work_order_parts with authenticated-role equivalents
-- Idempotent: DROP IF EXISTS before CREATE

DROP POLICY IF EXISTS "Technicians and Managers can add parts"              ON public.work_order_parts;
DROP POLICY IF EXISTS "Users can view parts for their tenant work orders"   ON public.work_order_parts;
DROP POLICY IF EXISTS work_order_parts_select                               ON public.work_order_parts;
DROP POLICY IF EXISTS work_order_parts_insert                               ON public.work_order_parts;
DROP POLICY IF EXISTS work_order_parts_update                               ON public.work_order_parts;
DROP POLICY IF EXISTS work_order_parts_delete                               ON public.work_order_parts;

-- SELECT: any authenticated user in the same tenant
CREATE POLICY work_order_parts_select ON public.work_order_parts
    FOR SELECT TO authenticated
    USING (
        work_order_id IN (
            SELECT id FROM public.work_orders
            WHERE tenant_id = public.get_user_tenant_id()
        )
    );

-- INSERT: users who can manage work orders in that tenant
CREATE POLICY work_order_parts_insert ON public.work_order_parts
    FOR INSERT TO authenticated
    WITH CHECK (
        work_order_id IN (
            SELECT id FROM public.work_orders
            WHERE public.can_manage_work_orders_scope(tenant_id)
        )
    );

-- UPDATE/DELETE: same scope as insert
CREATE POLICY work_order_parts_update ON public.work_order_parts
    FOR UPDATE TO authenticated
    USING (
        work_order_id IN (
            SELECT id FROM public.work_orders
            WHERE public.can_manage_work_orders_scope(tenant_id)
        )
    );

CREATE POLICY work_order_parts_delete ON public.work_order_parts
    FOR DELETE TO authenticated
    USING (
        work_order_id IN (
            SELECT id FROM public.work_orders
            WHERE public.can_manage_work_orders_scope(tenant_id)
        )
    );

