-- =====================================================
-- FIX: Assign technician when starting work
-- =====================================================

-- Update start_work_order to set assigned_to
CREATE OR REPLACE FUNCTION start_work_order(p_work_order_id UUID, p_user_id UUID)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_old_status VARCHAR;
BEGIN
    SELECT tenant_id, status INTO v_tenant_id, v_old_status 
    FROM work_orders WHERE id = p_work_order_id;

    -- Only update if status is valid
    IF v_old_status IN ('assigned', 'pending') THEN
        UPDATE work_orders
        SET 
            status = 'in_progress',
            start_time = NOW(),
            assigned_to = p_user_id  -- IMPORTANT: Set the technician as assigned
        WHERE id = p_work_order_id;

        -- Log it
        PERFORM create_operation_log(
            v_tenant_id, p_work_order_id, 'status_change', 
            'Work started by technician', p_user_id
        );
    END IF;
END;
$$ LANGUAGE plpgsql;
