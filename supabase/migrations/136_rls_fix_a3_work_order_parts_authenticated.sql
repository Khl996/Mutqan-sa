-- Phase 7 أ.3 — Fix work_order_parts RLS: drop stale {public} policies,
-- replace with properly scoped {authenticated} policies.

DO $$
BEGIN
  -- Drop old public-role policies if they exist
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_order_parts'
      AND policyname = 'Enable read access for all users'
  ) THEN
    DROP POLICY "Enable read access for all users" ON public.work_order_parts;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_order_parts'
      AND policyname = 'Enable insert for authenticated users only'
  ) THEN
    DROP POLICY "Enable insert for authenticated users only" ON public.work_order_parts;
  END IF;

  -- SELECT: same tenant as parent work order
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_order_parts' AND policyname = 'work_order_parts_select'
  ) THEN
    CREATE POLICY work_order_parts_select ON public.work_order_parts
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id
            AND wo.tenant_id = public.get_user_tenant_id()
        )
      );
  END IF;

  -- INSERT: manage-scope roles
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_order_parts' AND policyname = 'work_order_parts_insert'
  ) THEN
    CREATE POLICY work_order_parts_insert ON public.work_order_parts
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id
            AND public.can_manage_work_orders_scope(wo.tenant_id)
        )
      );
  END IF;

  -- UPDATE: manage-scope roles
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_order_parts' AND policyname = 'work_order_parts_update'
  ) THEN
    CREATE POLICY work_order_parts_update ON public.work_order_parts
      FOR UPDATE TO authenticated
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

  -- DELETE: manage-scope roles
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_order_parts' AND policyname = 'work_order_parts_delete'
  ) THEN
    CREATE POLICY work_order_parts_delete ON public.work_order_parts
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id
            AND public.can_manage_work_orders_scope(wo.tenant_id)
        )
      );
  END IF;
END $$;
