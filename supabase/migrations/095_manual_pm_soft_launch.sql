-- ==============================================================================
-- Migration: 095_manual_pm_soft_launch.sql
-- Purpose:
--   1) Lock preventive maintenance soft launch to manual-only flows
--   2) Disable postpone / auto-generation behavior at the database layer
--   3) Keep maintenance task status aligned with linked work order outcomes
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.can_postpone_maintenance(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT FALSE;
$$;

CREATE OR REPLACE FUNCTION public.get_maintenance_advance_notice_days(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 0;
$$;

CREATE OR REPLACE FUNCTION public.is_auto_generate_work_orders_enabled(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT FALSE;
$$;

CREATE OR REPLACE FUNCTION public.generate_work_orders_from_maintenance()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.postpone_maintenance_task(
    p_task_id UUID,
    p_new_date DATE,
    p_reason TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'Preventive maintenance automation is disabled in soft launch';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_work_orders_from_maintenance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_work_orders_from_maintenance() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_work_orders_from_maintenance() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.postpone_maintenance_task(UUID, DATE, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.postpone_maintenance_task(UUID, DATE, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.postpone_maintenance_task(UUID, DATE, TEXT) FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_related_work_order
ON public.maintenance_tasks(related_work_order_id);

CREATE OR REPLACE FUNCTION public.sync_maintenance_task_from_work_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task_status TEXT;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    v_task_status := CASE
        WHEN NEW.status IN ('pending', 'assigned') THEN 'pending'
        WHEN NEW.status IN (
            'in_progress',
            'pending_supervisor_approval',
            'pending_engineer_review',
            'pending_reporter_closure',
            'on_hold'
        ) THEN 'in_progress'
        WHEN NEW.status IN ('completed', 'auto_closed') THEN 'completed'
        WHEN NEW.status IN ('cancelled', 'rejected_by_technician') THEN 'cancelled'
        ELSE NULL
    END;

    IF v_task_status IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.maintenance_tasks
    SET status = v_task_status,
        updated_at = NOW()
    WHERE related_work_order_id = NEW.id
      AND status IS DISTINCT FROM v_task_status;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_maintenance_task_from_work_order ON public.work_orders;

CREATE TRIGGER trg_sync_maintenance_task_from_work_order
AFTER UPDATE OF status ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_maintenance_task_from_work_order();

COMMENT ON FUNCTION public.generate_work_orders_from_maintenance() IS
'Soft launch no-op: preventive maintenance work orders are created manually only.';

COMMENT ON FUNCTION public.postpone_maintenance_task(UUID, DATE, TEXT) IS
'Soft launch disabled: postpone flow is not available for manual preventive maintenance.';

COMMENT ON FUNCTION public.sync_maintenance_task_from_work_order() IS
'Keeps maintenance_tasks status aligned with the linked work_orders status for soft launch.';
