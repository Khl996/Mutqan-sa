-- ==============================================================================
-- 060_broadcast_notification_func_v2.sql
-- Updated function to support specific user list
-- ==============================================================================

CREATE OR REPLACE FUNCTION broadcast_notification(
    p_target_tenant_id UUID, -- NULL for ALL tenants
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'info',
    p_link TEXT DEFAULT NULL,
    p_specific_user_ids UUID[] DEFAULT NULL -- New parameter for specific users
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
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
            -- 1. Must have a valid tenant_id
            p.tenant_id IS NOT NULL
            
            -- 2. Filter by tenant (if specified)
            AND (p_target_tenant_id IS NULL OR p.tenant_id = p_target_tenant_id)
            
            -- 3. Filter by specific users (if specified)
            AND (
                p_specific_user_ids IS NULL 
                OR 
                p.id = ANY(p_specific_user_ids)
            )
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM inserted;

    RETURN v_count;
END;
$$;
