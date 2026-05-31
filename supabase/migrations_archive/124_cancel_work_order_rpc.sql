-- =============================================================================
-- Migration: 124_cancel_work_order_rpc.sql
-- Purpose:
--   Add an audited authority path for Pilot v1 work-order cancellation.
--   Direct status updates and hard delete remain blocked/disabled.
-- =============================================================================

ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN public.work_orders.cancelled_at IS
    'Timestamp set by the audited cancel_work_order RPC when a work order is cancelled.';

COMMENT ON COLUMN public.work_orders.cancellation_reason IS
    'Required cancellation reason set by the audited cancel_work_order RPC.';

ALTER TABLE public.operation_logs DROP CONSTRAINT IF EXISTS operation_logs_type_check;

ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_type_check CHECK (
    type IN (
        'maintenance',
        'repair',
        'inspection',
        'emergency',
        'routine',
        'installation',
        'calibration',
        'other',
        'status_change',
        'comment',
        'assignment',
        'create',
        'update',
        'cancellation'
    )
);

CREATE OR REPLACE FUNCTION public.guard_work_order_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_authorized       BOOLEAN;
    v_new_json         JSONB;
    v_old_json         JSONB;
    v_field            TEXT;
    v_sensitive_fields TEXT[] := ARRAY[
        'status',
        'assigned_to',
        'assigned_team',
        'start_time',
        'started_at',
        'end_time',
        'completed_at',
        'technician_completed_at',
        'technician_notes',
        'supervisor_approved_by',
        'supervisor_approved_at',
        'supervisor_notes',
        'engineer_approved_by',
        'engineer_approved_at',
        'engineer_notes',
        'maintenance_manager_approved_by',
        'maintenance_manager_approved_at',
        'maintenance_manager_notes',
        'customer_reviewed_by',
        'customer_reviewed_at',
        'reporter_notes',
        'pending_closure_since',
        'auto_closed_at',
        'cancelled_at',
        'cancellation_reason',
        'actual_cost',
        'sla_response_met',
        'sla_resolution_met',
        'completion_notes',
        'work_type',
        'source_schedule_id',
        'source_schedule_asset_id',
        'job_plan_id',
        'job_plan_snapshot',
        'scheduled_date',
        'compliance_deadline',
        'actual_duration_minutes'
    ];
BEGIN
    v_authorized := COALESCE(
        current_setting('app.work_order_workflow_authorized', TRUE) = 'true',
        FALSE
    );

    IF v_authorized THEN
        RETURN NEW;
    END IF;

    v_new_json := to_jsonb(NEW);
    v_old_json := to_jsonb(OLD);

    FOREACH v_field IN ARRAY v_sensitive_fields
    LOOP
        IF NOT (v_new_json ? v_field) THEN
            CONTINUE;
        END IF;

        IF (v_new_json -> v_field) IS DISTINCT FROM (v_old_json -> v_field) THEN
            RAISE EXCEPTION 'Direct update of workflow-sensitive field "%" is not allowed. Use an approved workflow RPC.', v_field
                USING ERRCODE = '42501';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_work_order_sensitive_fields() IS
    'Blocks direct updates to workflow-sensitive work_orders fields unless an approved workflow RPC sets transaction-local app.work_order_workflow_authorized=true. Updated by migration 124 to include cancellation fields.';

DROP FUNCTION IF EXISTS public.cancel_work_order(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.cancel_work_order(
    p_work_order_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id          UUID := auth.uid();
    v_actor_role        TEXT;
    v_actor_tenant      UUID;
    v_actor_active      BOOLEAN;
    v_actor_super       BOOLEAN := FALSE;
    v_wo                public.work_orders%ROWTYPE;
    v_reason            TEXT := NULLIF(BTRIM(p_reason), '');
    v_log_code          TEXT;
    v_description       TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_work_order_id IS NULL THEN
        RAISE EXCEPTION 'Work order id is required' USING ERRCODE = '22023';
    END IF;

    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'Cancellation reason is required' USING ERRCODE = '22023';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot cancel work orders' USING ERRCODE = '28000';
    END IF;

    IF v_actor_role NOT IN ('tenant_admin', 'maintenance_manager') THEN
        RAISE EXCEPTION 'Insufficient permissions to cancel work orders'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_wo
      FROM public.work_orders
     WHERE id = p_work_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF v_wo.status NOT IN ('pending', 'assigned', 'on_hold') THEN
        RAISE EXCEPTION 'Cannot cancel work order in status: %', v_wo.status
            USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancellation_reason = v_reason,
           updated_at = NOW()
     WHERE id = p_work_order_id
     RETURNING * INTO v_wo;

    v_description := 'Work order cancelled; reason=' || v_reason;
    v_log_code := 'LOG-' || to_char(NOW(), 'YYMMDDHH24MISS') || '-' || substring(gen_random_uuid()::TEXT FROM 1 FOR 4);

    INSERT INTO public.operation_logs (
        tenant_id,
        code,
        type,
        description,
        reason,
        work_order_id,
        asset_id,
        building_id,
        performed_by,
        team_id,
        timestamp,
        status
    ) VALUES (
        v_wo.tenant_id,
        v_log_code,
        'cancellation',
        v_description,
        v_reason,
        v_wo.id,
        v_wo.asset_id,
        v_wo.building_id,
        v_actor_id,
        v_wo.assigned_team,
        NOW(),
        'completed'
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', v_wo.id,
        'status', v_wo.status,
        'reason', v_reason
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_work_order(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_work_order(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_work_order(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.cancel_work_order(UUID, TEXT) IS
    'Audited tenant work-order cancellation authority. Tenant admin and maintenance manager may cancel pending, assigned, or on_hold work orders with a required reason. In-progress and closed-equivalent statuses are denied.';
