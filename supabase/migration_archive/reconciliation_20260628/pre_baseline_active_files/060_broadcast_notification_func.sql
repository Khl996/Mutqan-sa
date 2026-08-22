-- ==============================================================================
-- 060_broadcast_notification_func.sql
-- Function to broadcast notifications to multiple users
-- ==============================================================================

CREATE OR REPLACE FUNCTION broadcast_notification(
    p_target_tenant_id UUID, -- NULL for ALL tenants
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'info',
    p_link TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Insert notifications for all matching users
    WITH inserted AS (
        INSERT INTO notifications (tenant_id, user_id, title, message, type, link, is_read)
        SELECT 
            p.tenant_id,
            p.id as user_id,
            p_title,
            p_message,
            p_type,
            p_link,
            false
        FROM profiles p
        WHERE 
            -- If tenant_id provided, filter by it. Else (NULL), include all.
            (p_target_tenant_id IS NULL OR p.tenant_id = p_target_tenant_id)
            -- Exclude deleted users or invalid profiles if any logic exists
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM inserted;

    RETURN v_count;
END;
$$;
