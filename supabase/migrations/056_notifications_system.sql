-- =============================================
-- Notifications System
-- =============================================

-- 1. Create Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'info', 'success', 'warning', 'error', 'work_order', 'message'
    link VARCHAR(255), -- Link to redirect when clicked (e.g., /work-orders/123)
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb -- Extra data like work_order_id, etc.
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
CREATE POLICY "Users can update their own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- 2. Function to Create Notification
CREATE OR REPLACE FUNCTION create_notification(
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
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO notifications (tenant_id, user_id, title, message, type, link, metadata)
    VALUES (p_tenant_id, p_user_id, p_title, p_message, p_type, p_link, p_metadata)
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;

-- 3. Trigger: Notify Assignee when Assigned
CREATE OR REPLACE FUNCTION notify_on_work_order_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only if assigned_to changed and is not null
    IF (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) AND (NEW.assigned_to IS NOT NULL) THEN
        PERFORM create_notification(
            NEW.tenant_id,
            NEW.assigned_to,
            'تم تعيينك لأمر عمل جديد', -- Title
            'تم تعيين أمر العمل ' || NEW.title || ' إليك. يرجى مراجعته.', -- Message
            'work_order', -- Type
            '/work-orders/' || NEW.id, -- Link
            jsonb_build_object('work_order_id', NEW.id) -- Metadata
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_wo_assignment ON work_orders;
CREATE TRIGGER trg_notify_wo_assignment
    AFTER UPDATE ON work_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_work_order_assignment();

-- 4. Trigger: Notify Reporter on Status Change
CREATE OR REPLACE FUNCTION notify_on_work_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only if status changed
    IF (NEW.status IS DISTINCT FROM OLD.status) AND (NEW.reported_by IS NOT NULL) THEN
        PERFORM create_notification(
            NEW.tenant_id,
            NEW.reported_by,
            'تحديث حالة البلاغ',
            'تم تغيير حالة بلاغك "' || NEW.title || '" إلى ' || NEW.status, -- Note: Should ideally map status to Arabic name
            'work_order',
            '/work-orders/' || NEW.id,
            jsonb_build_object('work_order_id', NEW.id, 'status', NEW.status)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_wo_status ON work_orders;
CREATE TRIGGER trg_notify_wo_status
    AFTER UPDATE ON work_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_work_order_status_change();

-- 5. Trigger: Notify Supervisors on New Work Order (High/Urgent Priority)
CREATE OR REPLACE FUNCTION notify_supervisors_new_wo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    supervisor_record RECORD;
BEGIN
    -- Only for High/Urgent priority
    IF NEW.priority IN ('high', 'urgent') THEN
        -- Find all supervisors in the tenant
        FOR supervisor_record IN 
            SELECT id FROM profiles 
            WHERE tenant_id = NEW.tenant_id AND role IN ('supervisor', 'facility_manager', 'maintenance_manager')
        LOOP
            PERFORM create_notification(
                NEW.tenant_id,
                supervisor_record.id,
                'بلاغ جديد عالي الأولوية',
                'تم إنشاء بلاغ جديد: ' || NEW.title || ' (الأولوية: ' || NEW.priority || ')',
                'alert',
                '/work-orders/' || NEW.id,
                jsonb_build_object('work_order_id', NEW.id, 'priority', NEW.priority)
            );
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_wo_urgent ON work_orders;
CREATE TRIGGER trg_notify_new_wo_urgent
    AFTER INSERT ON work_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_supervisors_new_wo();
