-- =====================================================
-- REJECT WORKFLOW FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION reject_work_order(
    p_work_order_id UUID, 
    p_user_id UUID, 
    p_reason TEXT
)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_current_status VARCHAR;
BEGIN
    SELECT tenant_id, status INTO v_tenant_id, v_current_status 
    FROM work_orders WHERE id = p_work_order_id;

    -- Update status back to in_progress regardless of who rejected it
    -- This assumes rejection means "more work is needed"
    UPDATE work_orders
    SET 
        status = 'in_progress',
        updated_at = NOW()
        -- We keep previous notes, new notes will be in logs
    WHERE id = p_work_order_id;

    PERFORM create_operation_log(
        v_tenant_id, p_work_order_id, 'status_change', 
        'Rejected/Returned for revision. Reason: ' || COALESCE(p_reason, '-'), 
        p_user_id,
        'completed' -- Must be a valid status from check constraint
    );
END;
$$ LANGUAGE plpgsql;
