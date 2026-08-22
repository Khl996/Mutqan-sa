-- =============================================================================
-- Migration: 128_fix_notify_team_on_new_work_order.sql
-- Purpose:
--   Make the new-work-order notification trigger safe when assigned_team is NULL
--   and when tenants have inactive technician/engineer users.
--
-- Root cause:
--   Migration 115 hardened create_notification() to reject inactive or
--   cross-tenant recipients. The older notify_team_on_new_work_order() no-team
--   branch selected all tenant technicians/engineers without filtering active
--   profiles, so one inactive user could raise from create_notification() and
--   abort the entire work_orders INSERT.
--
-- Behavior after this migration:
--   - assigned_team NULL: no-op. Work-order creation/generation must not depend
--     on notification fan-out.
--   - assigned_team present: notify only active members whose profile belongs to
--     the same tenant as the work order and whose team belongs to that tenant.
--   - No cross-tenant recipients and no inactive recipients.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_team_on_new_work_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member RECORD;
    v_notification_title TEXT;
    v_notification_message TEXT;
BEGIN
    v_notification_title := 'أمر عمل جديد: ' || NEW.code;
    v_notification_message := 'تم إنشاء بلاغ جديد بعنوان: ' || NEW.title;

    -- assigned_team is optional context. If no team is present, do not fan out
    -- to broad role groups; creation/generation should continue without notice.
    IF NEW.assigned_team IS NULL THEN
        RETURN NEW;
    END IF;

    -- If a bad row is inserted by a privileged server path, fail closed for
    -- notifications while allowing the work order insert to proceed.
    IF NOT EXISTS (
        SELECT 1
          FROM public.teams t
         WHERE t.id = NEW.assigned_team
           AND t.tenant_id = NEW.tenant_id
    ) THEN
        RETURN NEW;
    END IF;

    FOR v_member IN
        SELECT tm.user_id
          FROM public.team_members tm
          JOIN public.profiles p
            ON p.id = tm.user_id
           AND p.tenant_id = NEW.tenant_id
           AND COALESCE(p.is_active, TRUE) = TRUE
         WHERE tm.team_id = NEW.assigned_team
           AND COALESCE(tm.is_active, TRUE) = TRUE
    LOOP
        IF v_member.user_id IS DISTINCT FROM NEW.reported_by OR NEW.reported_by IS NULL THEN
            PERFORM public.create_notification(
                NEW.tenant_id,
                v_member.user_id,
                v_notification_title,
                v_notification_message || ' (تم إسناده لفريقك)',
                'work_order',
                '/work-orders/' || NEW.id,
                jsonb_build_object('work_order_id', NEW.id, 'team_id', NEW.assigned_team)
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_team_on_new_wo ON public.work_orders;

CREATE TRIGGER trg_notify_team_on_new_wo
    AFTER INSERT ON public.work_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_team_on_new_work_order();

REVOKE ALL ON FUNCTION public.notify_team_on_new_work_order() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_team_on_new_work_order() FROM anon;
REVOKE ALL ON FUNCTION public.notify_team_on_new_work_order() FROM authenticated;

COMMENT ON FUNCTION public.notify_team_on_new_work_order() IS
    'Safely notifies active same-tenant team members on work-order insert. No-op when assigned_team is NULL.';
