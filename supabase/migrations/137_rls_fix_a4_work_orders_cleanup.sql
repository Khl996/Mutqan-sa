-- Phase 7 أ.4 — work_orders RLS cleanup
-- Dropped three stale {public} policies that were either overly broad or
-- made the delete-disabled policy bypassable via OR semantics.
-- Replaced the UPDATE policy with a scoped {authenticated} policy that
-- covers the same principals (assigned/reporter/creator) the old policy did,
-- while requiring tenant isolation.

DO $$
BEGIN
  -- Drop stale public-role policies
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_orders'
      AND policyname = 'Users can view work orders in their tenant'
  ) THEN
    DROP POLICY "Users can view work orders in their tenant" ON public.work_orders;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_orders'
      AND policyname = 'Users can update assigned work orders'
  ) THEN
    DROP POLICY "Users can update assigned work orders" ON public.work_orders;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_orders'
      AND policyname = 'Admins can delete work orders'
  ) THEN
    DROP POLICY "Admins can delete work orders" ON public.work_orders;
  END IF;

  -- Replacement UPDATE policy: authenticated, same tenant, AND involved
  -- (assigned_to, reported_by, or created_by = current user)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_orders'
      AND policyname = 'work_orders_update_involved'
  ) THEN
    CREATE POLICY work_orders_update_involved ON public.work_orders
      FOR UPDATE TO authenticated
      USING (
        tenant_id = public.get_user_tenant_id()
        AND (
          assigned_to = auth.uid()
          OR reported_by = auth.uid()
          OR created_by = auth.uid()
        )
      )
      WITH CHECK (
        tenant_id = public.get_user_tenant_id()
        AND (
          assigned_to = auth.uid()
          OR reported_by = auth.uid()
          OR created_by = auth.uid()
        )
      );
  END IF;
END $$;
