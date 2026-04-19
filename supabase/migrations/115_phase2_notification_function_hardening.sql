-- =============================================================================
-- Migration: 115_phase2_notification_function_hardening.sql
-- Purpose:
--   Harden SECURITY DEFINER notification helpers.
--
-- Risk fixed:
--   create_notification() could be exposed as an RPC unless EXECUTE is revoked.
--   Because it is SECURITY DEFINER, direct callers could otherwise attempt to
--   create notifications for users outside their tenant.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_notification(
    p_tenant_id UUID,
    p_user_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT,
    p_link TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = p_user_id
           AND p.tenant_id = p_tenant_id
           AND COALESCE(p.is_active, true) = true
    ) THEN
        RAISE EXCEPTION 'Notification recipient is not active in the requested tenant';
    END IF;

    INSERT INTO public.notifications (tenant_id, user_id, title, message, type, link, metadata)
    VALUES (p_tenant_id, p_user_id, p_title, p_message, p_type, p_link, p_metadata)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

DO $$
DECLARE
    v_signature text;
    v_function regprocedure;
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'public.create_notification(uuid, uuid, text, text, text, text, jsonb)',
        'public.notify_on_work_order_assignment()',
        'public.notify_on_work_order_status_change()',
        'public.notify_supervisors_new_wo()',
        'public.notify_team_on_new_work_order()'
    ]
    LOOP
        v_function := to_regprocedure(v_signature);

        IF v_function IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_function);
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_function);
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_function);
        END IF;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
