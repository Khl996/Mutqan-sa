-- =============================================================================
-- Migration: 129_disable_work_order_direct_insert.sql
-- Purpose:
--   Correct work_orders INSERT policy drift after migration 122. Normal
--   authenticated creation must go through public.create_work_order(...) so
--   tenant/location checks and operation logging cannot be bypassed.
-- =============================================================================

-- A disabled policy is not a deny rule in PostgreSQL RLS; permissive policies are
-- ORed together. Drop every existing INSERT policy on work_orders first so a
-- legacy policy such as "Users can create work orders" cannot continue to allow
-- direct REST inserts beside work_orders_insert_disabled_direct.
DO $$
DECLARE
    v_policy RECORD;
BEGIN
    FOR v_policy IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'work_orders'
          AND cmd = 'INSERT'
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.work_orders',
            v_policy.policyname
        );
    END LOOP;
END;
$$;

CREATE POLICY "work_orders_insert_disabled_direct"
ON public.work_orders
FOR INSERT
TO authenticated
WITH CHECK (FALSE);

COMMENT ON POLICY "work_orders_insert_disabled_direct" ON public.work_orders IS
    'Direct authenticated INSERT is disabled. Use public.create_work_order for audited normal creation; public portal and PM generation use their own server-side RPC paths.';

