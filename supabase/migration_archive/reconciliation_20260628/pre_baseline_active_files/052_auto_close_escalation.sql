-- =============================================
-- Auto-Close Work Orders Based on Tenant Settings
-- =============================================
-- This function should be called by a cron job (e.g., pg_cron daily)

CREATE OR REPLACE FUNCTION auto_close_stale_work_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER := 0;
    v_tenant RECORD;
    v_auto_close_days INTEGER;
    v_closed_count INTEGER;
BEGIN
    -- Loop through all tenants
    FOR v_tenant IN SELECT id, settings FROM tenants WHERE is_active = true
    LOOP
        -- Get auto_close_after_days setting (default 7)
        v_auto_close_days := COALESCE(
            (v_tenant.settings->'work_orders'->>'auto_close_after_days')::INTEGER, 
            7
        );
        
        -- Auto-close work orders that are in pending_reporter_closure for too long
        UPDATE work_orders
        SET 
            status = 'auto_closed',
            closed_at = NOW(),
            closed_notes = 'تم الإغلاق التلقائي بعد ' || v_auto_close_days || ' أيام بدون استجابة',
            updated_at = NOW()
        WHERE tenant_id = v_tenant.id
          AND status = 'pending_reporter_closure'
          AND updated_at < (NOW() - (v_auto_close_days || ' days')::INTERVAL);
        
        GET DIAGNOSTICS v_closed_count = ROW_COUNT;
        v_count := v_count + v_closed_count;
        
        -- Also auto-close work orders that are in_progress with no activity
        UPDATE work_orders
        SET 
            status = 'auto_closed',
            closed_at = NOW(),
            closed_notes = 'تم الإغلاق التلقائي بسبب عدم النشاط لفترة طويلة',
            updated_at = NOW()
        WHERE tenant_id = v_tenant.id
          AND status IN ('in_progress', 'on_hold')
          AND updated_at < (NOW() - ((v_auto_close_days * 2) || ' days')::INTERVAL);
        
        GET DIAGNOSTICS v_closed_count = ROW_COUNT;
        v_count := v_count + v_closed_count;
    END LOOP;
    
    RETURN v_count;
END;
$$;

-- Function to check max response time and escalate priority
CREATE OR REPLACE FUNCTION check_and_escalate_priority()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER := 0;
    v_tenant RECORD;
    v_max_response_hours INTEGER;
    v_escalation_enabled BOOLEAN;
    v_escalated_count INTEGER;
BEGIN
    -- Loop through all tenants
    FOR v_tenant IN SELECT id, settings FROM tenants WHERE is_active = true
    LOOP
        -- Get settings
        v_max_response_hours := COALESCE(
            (v_tenant.settings->'work_orders'->>'max_response_time_hours')::INTEGER, 
            24
        );
        v_escalation_enabled := COALESCE(
            (v_tenant.settings->'work_orders'->>'priority_escalation_enabled')::BOOLEAN, 
            true
        );
        
        -- Skip if escalation is disabled
        IF NOT v_escalation_enabled THEN
            CONTINUE;
        END IF;
        
        -- Escalate low priority to medium
        UPDATE work_orders
        SET 
            priority = 'medium',
            notes = COALESCE(notes, '') || E'\n[Auto-Escalated] تم تصعيد الأولوية تلقائياً بسبب تجاوز وقت الاستجابة',
            updated_at = NOW()
        WHERE tenant_id = v_tenant.id
          AND status IN ('pending', 'assigned')
          AND priority = 'low'
          AND created_at < (NOW() - (v_max_response_hours || ' hours')::INTERVAL);
        
        GET DIAGNOSTICS v_escalated_count = ROW_COUNT;
        v_count := v_count + v_escalated_count;
        
        -- Escalate medium priority to high
        UPDATE work_orders
        SET 
            priority = 'high',
            notes = COALESCE(notes, '') || E'\n[Auto-Escalated] تم تصعيد الأولوية تلقائياً بسبب تجاوز وقت الاستجابة',
            updated_at = NOW()
        WHERE tenant_id = v_tenant.id
          AND status IN ('pending', 'assigned')
          AND priority = 'medium'
          AND created_at < (NOW() - ((v_max_response_hours * 2) || ' hours')::INTERVAL);
        
        GET DIAGNOSTICS v_escalated_count = ROW_COUNT;
        v_count := v_count + v_escalated_count;
        
        -- Escalate high priority to critical
        UPDATE work_orders
        SET 
            priority = 'critical',
            notes = COALESCE(notes, '') || E'\n[URGENT] تم تصعيد الأولوية للطوارئ بسبب تجاوز وقت الاستجابة الأقصى',
            updated_at = NOW()
        WHERE tenant_id = v_tenant.id
          AND status IN ('pending', 'assigned')
          AND priority = 'high'
          AND created_at < (NOW() - ((v_max_response_hours * 3) || ' hours')::INTERVAL);
        
        GET DIAGNOSTICS v_escalated_count = ROW_COUNT;
        v_count := v_count + v_escalated_count;
    END LOOP;
    
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION auto_close_stale_work_orders IS 'Auto-closes stale work orders based on tenant settings. Should run daily via cron.';
COMMENT ON FUNCTION check_and_escalate_priority IS 'Escalates priority of unresponded work orders based on tenant settings. Should run hourly via cron.';

-- Note: To enable automatic execution, you need to set up pg_cron extension:
-- SELECT cron.schedule('auto-close-daily', '0 0 * * *', 'SELECT auto_close_stale_work_orders()');
-- SELECT cron.schedule('priority-escalation-hourly', '0 * * * *', 'SELECT check_and_escalate_priority()');
