-- Phase 7 أ.1 — RLS for work_order_costs
-- work_order_costs had no RLS at all; scope reads to same-tenant work orders,
-- writes to users with manage-scope only.

ALTER TABLE public.work_order_costs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: any authenticated user in the same tenant as the parent work order
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_order_costs' AND policyname = 'woc_select'
  ) THEN
    CREATE POLICY woc_select ON public.work_order_costs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id
            AND wo.tenant_id = public.get_user_tenant_id()
        )
      );
  END IF;

  -- ALL (INSERT/UPDATE/DELETE): manage-scope roles only
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_order_costs' AND policyname = 'woc_manage'
  ) THEN
    CREATE POLICY woc_manage ON public.work_order_costs
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id
            AND public.can_manage_work_orders_scope(wo.tenant_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id
            AND public.can_manage_work_orders_scope(wo.tenant_id)
        )
      );
  END IF;
END $$;
