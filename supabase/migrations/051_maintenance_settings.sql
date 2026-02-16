-- =============================================
-- Maintenance Settings Integration
-- =============================================
-- This migration creates functions that use tenant maintenance settings

-- Function to check if postpone is allowed for a tenant
CREATE OR REPLACE FUNCTION can_postpone_maintenance(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_settings JSONB;
BEGIN
    SELECT settings INTO v_settings FROM tenants WHERE id = p_tenant_id;
    RETURN COALESCE((v_settings->'maintenance'->>'allow_postpone')::BOOLEAN, true);
END;
$$;

-- Function to get advance notice days for a tenant
CREATE OR REPLACE FUNCTION get_maintenance_advance_notice_days(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_settings JSONB;
BEGIN
    SELECT settings INTO v_settings FROM tenants WHERE id = p_tenant_id;
    RETURN COALESCE((v_settings->'maintenance'->>'advance_notice_days')::INTEGER, 3);
END;
$$;

-- Function to check if auto-generate work orders is enabled
CREATE OR REPLACE FUNCTION is_auto_generate_work_orders_enabled(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_settings JSONB;
BEGIN
    SELECT settings INTO v_settings FROM tenants WHERE id = p_tenant_id;
    RETURN COALESCE((v_settings->'maintenance'->>'auto_generate_work_orders')::BOOLEAN, true);
END;
$$;

-- Function to generate work orders from due maintenance tasks
-- This should be called by a cron job or scheduler
CREATE OR REPLACE FUNCTION generate_work_orders_from_maintenance()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER := 0;
    v_task RECORD;
    v_advance_days INTEGER;
    v_auto_generate BOOLEAN;
    v_new_work_order_id UUID;
BEGIN
    -- Loop through all scheduled maintenance tasks that are due soon
    FOR v_task IN
        SELECT mt.*, mp.tenant_id
        FROM maintenance_tasks mt
        JOIN maintenance_plans mp ON mt.plan_id = mp.id
        WHERE mt.status = 'pending'
          AND mt.work_order_id IS NULL
    LOOP
        -- Check tenant settings
        v_auto_generate := is_auto_generate_work_orders_enabled(v_task.tenant_id);
        v_advance_days := get_maintenance_advance_notice_days(v_task.tenant_id);
        
        -- Skip if auto-generate is disabled
        IF NOT v_auto_generate THEN
            CONTINUE;
        END IF;
        
        -- Check if task is within advance notice period
        IF v_task.scheduled_date <= (CURRENT_DATE + (v_advance_days || ' days')::INTERVAL) THEN
            -- Create work order
            INSERT INTO work_orders (
                tenant_id,
                title,
                description,
                status,
                priority,
                source,
                maintenance_task_id
            ) VALUES (
                v_task.tenant_id,
                'صيانة وقائية: ' || v_task.title,
                v_task.description,
                'pending',
                v_task.priority,
                'preventive_maintenance',
                v_task.id
            ) RETURNING id INTO v_new_work_order_id;
            
            -- Link work order to maintenance task
            UPDATE maintenance_tasks 
            SET work_order_id = v_new_work_order_id,
                status = 'in_progress',
                updated_at = NOW()
            WHERE id = v_task.id;
            
            v_count := v_count + 1;
        END IF;
    END LOOP;
    
    RETURN v_count;
END;
$$;

-- Function to postpone maintenance task (respects settings)
CREATE OR REPLACE FUNCTION postpone_maintenance_task(
    p_task_id UUID,
    p_new_date DATE,
    p_reason TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_can_postpone BOOLEAN;
BEGIN
    -- Get tenant_id from task
    SELECT mp.tenant_id INTO v_tenant_id
    FROM maintenance_tasks mt
    JOIN maintenance_plans mp ON mt.plan_id = mp.id
    WHERE mt.id = p_task_id;
    
    -- Check if postpone is allowed
    v_can_postpone := can_postpone_maintenance(v_tenant_id);
    
    IF NOT v_can_postpone THEN
        RAISE EXCEPTION 'Postponing maintenance tasks is not allowed for this organization';
    END IF;
    
    -- Postpone the task
    UPDATE maintenance_tasks
    SET scheduled_date = p_new_date,
        notes = COALESCE(notes, '') || E'\n[Postponed] ' || p_reason,
        updated_at = NOW()
    WHERE id = p_task_id;
    
    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION can_postpone_maintenance IS 'Checks if tenant settings allow postponing maintenance';
COMMENT ON FUNCTION generate_work_orders_from_maintenance IS 'Auto-generates work orders from due maintenance tasks based on tenant settings';
COMMENT ON FUNCTION postpone_maintenance_task IS 'Postpones a maintenance task if allowed by tenant settings';
