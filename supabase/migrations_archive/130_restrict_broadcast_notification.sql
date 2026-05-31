-- ==============================================================================
-- 130_restrict_broadcast_notification.sql
-- Restrict broadcast_notification to platform admins only.
--
-- Problem: both overloads were callable by anon + authenticated roles,
-- meaning any user with a valid API key could blast system-wide notifications
-- and trigger email sends through the notifications trigger.
--
-- Fix:
--   1. REVOKE EXECUTE from anon on both overloads.
--   2. Replace both functions with versions that verify the caller holds a
--      platform-level role (platform_owner | platform_admin) before proceeding.
--      Authenticated non-platform users receive a clear error; the existing
--      AnnouncementsPage call for platform admins continues to work unchanged.
-- ==============================================================================

-- 1. Revoke anon access on both overloads
REVOKE EXECUTE ON FUNCTION broadcast_notification(uuid, text, text, text, text)
    FROM anon;

REVOKE EXECUTE ON FUNCTION broadcast_notification(uuid, text, text, text, text, uuid[])
    FROM anon;

-- 2. Replace v1 (5-arg) with role-guarded version
CREATE OR REPLACE FUNCTION broadcast_notification(
    p_target_tenant_id UUID,
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
    v_caller_role text;
    v_count       integer;
BEGIN
    -- Verify caller is a platform admin
    SELECT role INTO v_caller_role
    FROM profiles
    WHERE id = auth.uid();

    IF v_caller_role NOT IN ('platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Access denied: platform admin role required to broadcast notifications';
    END IF;

    WITH inserted AS (
        INSERT INTO notifications (tenant_id, user_id, title, message, type, link, is_read)
        SELECT
            p.tenant_id,
            p.id,
            p_title,
            p_message,
            p_type,
            p_link,
            false
        FROM profiles p
        WHERE
            (p_target_tenant_id IS NULL OR p.tenant_id = p_target_tenant_id)
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM inserted;

    RETURN v_count;
END;
$$;

-- 3. Replace v2 (6-arg) with role-guarded version
CREATE OR REPLACE FUNCTION broadcast_notification(
    p_target_tenant_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'info',
    p_link TEXT DEFAULT NULL,
    p_specific_user_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role text;
    v_count       integer;
BEGIN
    -- Verify caller is a platform admin
    SELECT role INTO v_caller_role
    FROM profiles
    WHERE id = auth.uid();

    IF v_caller_role NOT IN ('platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Access denied: platform admin role required to broadcast notifications';
    END IF;

    WITH inserted AS (
        INSERT INTO notifications (tenant_id, user_id, title, message, type, link, is_read)
        SELECT
            p.tenant_id,
            p.id,
            p_title,
            p_message,
            p_type,
            p_link,
            false
        FROM profiles p
        WHERE
            p.tenant_id IS NOT NULL
            AND (p_target_tenant_id IS NULL OR p.tenant_id = p_target_tenant_id)
            AND (p_specific_user_ids IS NULL OR p.id = ANY(p_specific_user_ids))
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM inserted;

    RETURN v_count;
END;
$$;
