-- Migration 095: PM Task ↔ WO minimal status sync (Soft Launch)
-- When a Work Order linked to a maintenance task reaches a terminal state
-- (completed / rejected / cancelled), update the maintenance task accordingly.
-- This prevents tasks from staying "pending" indefinitely after their WO is closed.

CREATE OR REPLACE FUNCTION sync_pm_task_from_wo()
RETURNS TRIGGER AS $$
BEGIN
    -- Only act on terminal WO status transitions
    IF NEW.status IN ('completed', 'rejected', 'cancelled')
       AND OLD.status <> NEW.status THEN

        UPDATE maintenance_tasks
        SET
            status = CASE
                WHEN NEW.status = 'completed' THEN 'completed'
                ELSE 'cancelled'         -- rejected or cancelled WO → cancel the task
            END,
            updated_at = NOW()
        WHERE related_work_order_id = NEW.id
          AND status NOT IN ('completed', 'cancelled');  -- don't overwrite already-terminal tasks

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if an older version exists
DROP TRIGGER IF EXISTS trg_sync_pm_task_from_wo ON work_orders;

CREATE TRIGGER trg_sync_pm_task_from_wo
    AFTER UPDATE ON work_orders
    FOR EACH ROW
    EXECUTE FUNCTION sync_pm_task_from_wo();
