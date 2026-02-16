-- ==============================================================================
-- 059_notify_team_on_new_work_order.sql
-- Notify team members or all technicians when a new work order is created
-- ==============================================================================

CREATE OR REPLACE FUNCTION notify_team_on_new_work_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    team_member RECORD;
    technician_record RECORD;
    v_notification_title TEXT;
    v_notification_message TEXT;
BEGIN
    v_notification_title := 'أمر عمل جديد: ' || NEW.code;
    v_notification_message := 'تم إنشاء بلاغ جديد بعنوان: ' || NEW.title;

    -- CASE 1: Assigned Team is specified
    IF NEW.assigned_team IS NOT NULL THEN
        -- Find all users in this team
        FOR team_member IN 
            SELECT user_id 
            FROM team_members 
            WHERE team_id = NEW.assigned_team
        LOOP
            -- Avoid sending to the reporter if they are in the team (optional, but good UX)
            IF team_member.user_id != NEW.reported_by OR NEW.reported_by IS NULL THEN
                PERFORM create_notification(
                    NEW.tenant_id,
                    team_member.user_id,
                    v_notification_title,
                    v_notification_message || ' (تم إسناده لفريقك)',
                    'work_order',
                    '/work-orders/' || NEW.id,
                    jsonb_build_object('work_order_id', NEW.id, 'team_id', NEW.assigned_team)
                );
            END IF;
        END LOOP;

    -- CASE 2: No Team Assigned -> Notify ALL Technicians/Engineers
    ELSE
        FOR technician_record IN 
            SELECT id 
            FROM profiles 
            WHERE tenant_id = NEW.tenant_id 
            AND role IN ('technician', 'engineer')
        LOOP
             -- Avoid sending to the reporter
            IF technician_record.id != NEW.reported_by OR NEW.reported_by IS NULL THEN
                 PERFORM create_notification(
                    NEW.tenant_id,
                    technician_record.id,
                    v_notification_title,
                    v_notification_message || ' (متاح للجميع)',
                    'work_order',
                    '/work-orders/' || NEW.id,
                    jsonb_build_object('work_order_id', NEW.id)
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

-- Create Trigger
DROP TRIGGER IF EXISTS trg_notify_team_on_new_wo ON work_orders;

CREATE TRIGGER trg_notify_team_on_new_wo
    AFTER INSERT ON work_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_team_on_new_work_order();
