-- =============================================================================
-- Migration: 120_guard_work_order_sensitive_fields.sql
-- Mutqan Pilot v1 — Phase 2 Database-Level Sensitive-Field Guard
-- =============================================================================
--
-- WHY THIS GUARD EXISTS
-- =====================
-- Work orders are Mutqan operational memory. Direct table UPDATEs to
-- workflow-sensitive fields bypass:
--   * status-transition validation and business rules
--   * role and assignment authority checks
--   * operation log creation (auditability)
--
-- The Phase 1 client-side allowlist in useWorkOrders.ts is not a security
-- boundary. Any authenticated user with a role allowed by the RLS
-- work_orders_update_scoped policy can call the Supabase REST API directly
-- and update fields that the frontend would never send. This migration adds
-- a BEFORE UPDATE trigger that enforces lifecycle protection at the database
-- layer — below every client, every API call, and every RLS policy.
--
-- DESIGN: TRANSACTION-LOCAL GUC FLAG
-- ====================================
-- Approved workflow RPCs call, before their work_orders UPDATE:
--   PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);
-- The TRUE argument makes this transaction-local: the GUC is automatically
-- cleared when the transaction ends (commit or rollback). The flag cannot
-- leak across sessions or connections. Direct REST API calls do not set this
-- GUC, so the trigger blocks any sensitive field change from those paths.
--
-- RESILIENCE TO SCHEMA DRIFT
-- ============================
-- The trigger converts OLD and NEW rows to JSONB via to_jsonb(). For a
-- field name in the sensitive list that does not exist as a column, to_jsonb()
-- will not include that key. Both sides return NULL, so IS DISTINCT FROM is
-- FALSE and no exception is raised. The migration is safe to apply even if
-- some listed columns have not yet been added to the schema.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — Trigger function: guard_work_order_sensitive_fields
-- =============================================================================

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
    -- Lifecycle-sensitive fields that must only change inside approved RPCs.
    -- Mutqan operational memory protection: these fields carry workflow state,
    -- audit identity, and completion evidence. Direct mutation bypasses all
    -- business rules and operation logs.
    -- Resilient to missing columns: to_jsonb() only emits keys for columns
    -- that actually exist, so listing a column that is not yet in the schema
    -- is safe — the JSONB key will simply not appear and the check is skipped.
    v_sensitive_fields TEXT[] := ARRAY[
        -- Workflow state
        'status',
        -- Assignment: identity of who is doing the work
        'assigned_to',
        'assigned_team',
        -- Execution timestamps
        'start_time',
        'started_at',
        'end_time',
        'completed_at',
        'technician_completed_at',
        -- Technician completion evidence
        'technician_notes',
        -- Supervisor approval
        'supervisor_approved_by',
        'supervisor_approved_at',
        'supervisor_notes',
        -- Engineer review
        'engineer_approved_by',
        'engineer_approved_at',
        'engineer_notes',
        -- Maintenance manager approval (column may not exist in all schema versions)
        'maintenance_manager_approved_by',
        'maintenance_manager_approved_at',
        'maintenance_manager_notes',
        -- Reporter closure
        'customer_reviewed_by',
        'customer_reviewed_at',
        'reporter_notes',
        -- Auto-lifecycle housekeeping
        'pending_closure_since',
        'auto_closed_at',
        -- Cost actuals (set only at technician completion)
        'actual_cost',
        -- SLA outcome fields (set by lifecycle transitions)
        'sla_response_met',
        'sla_resolution_met',
        -- PM lifecycle fields (added by migration 108/109)
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
    -- Check whether the current transaction was authorized by an approved
    -- workflow RPC. Approved RPCs set this flag via set_config with the
    -- transaction-local flag (third arg = TRUE) before their UPDATE.
    -- current_setting with missing_ok=TRUE returns NULL if not set.
    v_authorized := COALESCE(
        current_setting('app.work_order_workflow_authorized', TRUE) = 'true',
        FALSE
    );

    -- Authorized RPCs may update any field — they have already performed all
    -- role, tenant, status, and assignment checks.
    IF v_authorized THEN
        RETURN NEW;
    END IF;

    -- Not authorized: check whether any sensitive field changed.
    -- Use JSONB -> operator (returns jsonb, not text) for type-correct
    -- comparison including JSONB columns like job_plan_snapshot.
    v_new_json := to_jsonb(NEW);
    v_old_json := to_jsonb(OLD);

    FOREACH v_field IN ARRAY v_sensitive_fields
    LOOP
        -- Skip fields that do not exist in the current schema version.
        IF NOT (v_new_json ? v_field) THEN
            CONTINUE;
        END IF;

        IF (v_new_json -> v_field) IS DISTINCT FROM (v_old_json -> v_field) THEN
            RAISE EXCEPTION
                'Direct update of workflow-sensitive field "%" is not permitted. '
                'Use an approved workflow RPC: start_work_order, '
                'assign_work_order, '
                'complete_work_order_technician, approve_work_order_supervisor, '
                'approve_work_order_engineer, close_work_order, reject_work_order. '
                'Mutqan operational memory protection (migration 120).',
                v_field
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END LOOP;

    -- No sensitive field changed — allow the metadata-only update through.
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_work_order_sensitive_fields() IS
    'Phase 2 Mutqan DB guard. Blocks direct UPDATE to lifecycle-sensitive '
    'work_order fields outside approved workflow RPCs. Approved RPCs set '
    'transaction-local GUC app.work_order_workflow_authorized=true before UPDATE. '
    'Added by migration 120_guard_work_order_sensitive_fields.';


-- =============================================================================
-- SECTION 2 — Attach trigger to work_orders
-- =============================================================================

DROP TRIGGER IF EXISTS trg_guard_work_order_sensitive_fields ON public.work_orders;

CREATE TRIGGER trg_guard_work_order_sensitive_fields
    BEFORE UPDATE ON public.work_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_work_order_sensitive_fields();

COMMENT ON TRIGGER trg_guard_work_order_sensitive_fields ON public.work_orders IS
    'Phase 2 sensitive-field guard — Mutqan Pilot v1 operational memory '
    'protection. Blocks workflow-sensitive field changes outside approved RPCs. '
    'Added by migration 120_guard_work_order_sensitive_fields.';


-- =============================================================================
-- SECTION 3 — Authorized workflow RPCs
-- Each approved RPC adds set_config('app.work_order_workflow_authorized','true',TRUE)
-- before its work_orders UPDATE. The TRUE argument is transaction-local:
-- the flag is cleared automatically at transaction end.
--
-- RPC bodies are reproduced in full from 093_v1_roles_permissions_alignment.sql
-- (the authoritative version) with the set_config line added before each
-- work_orders UPDATE. No other behavior is changed.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 3.1  start_work_order(UUID)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.start_work_order(UUID, UUID);
DROP FUNCTION IF EXISTS public.start_work_order(UUID);

CREATE OR REPLACE FUNCTION public.start_work_order(p_work_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id               UUID    := auth.uid();
    v_actor_role             TEXT;
    v_actor_tenant           UUID;
    v_is_super               BOOLEAN := FALSE;
    v_tenant_id              UUID;
    v_old_status             TEXT;
    v_assigned_to            UUID;
    v_is_platform_override   BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, assigned_to
      INTO v_tenant_id, v_old_status, v_assigned_to
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override   := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin', 'maintenance_manager', 'engineer', 'technician',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: you are not allowed to start this work order';
    END IF;

    IF v_old_status NOT IN ('pending', 'assigned') THEN
        RAISE EXCEPTION 'Cannot start work order in status: %', v_old_status;
    END IF;

    IF NOT v_is_management_override
       AND v_assigned_to IS NOT NULL
       AND v_assigned_to <> v_actor_id
    THEN
        RAISE EXCEPTION 'Only the assigned technician can start this work order';
    END IF;

    -- Authorize the trigger guard for this transaction before the UPDATE.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status      = 'in_progress',
           start_time  = NOW(),
           assigned_to = COALESCE(v_assigned_to, v_actor_id),
           updated_at  = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance', 'Work started', v_actor_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_work_order(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_work_order(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.start_work_order(UUID) TO authenticated;

COMMENT ON FUNCTION public.start_work_order(UUID) IS
    'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized '
    'before UPDATE. Tenant, role, assignment, and status guards enforced. '
    'Operation log written. Updated by migration 120.';


-- ---------------------------------------------------------------------------
-- 3.2  complete_work_order_technician(UUID, TEXT, JSONB)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.complete_work_order_technician(UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.complete_work_order_technician(UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.complete_work_order_technician(
    p_work_order_id    UUID,
    p_technician_notes TEXT  DEFAULT '',
    p_parts            JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id               UUID    := auth.uid();
    v_actor_role             TEXT;
    v_actor_tenant           UUID;
    v_is_super               BOOLEAN := FALSE;
    v_tenant_id              UUID;
    v_old_status             TEXT;
    v_assigned_to            UUID;
    v_tenant_settings        JSONB;
    v_require_supervisor     BOOLEAN;
    v_require_engineer       BOOLEAN;
    v_next_status            TEXT;
    v_is_platform_override   BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
    v_part                   JSONB;
    v_part_id                UUID;
    v_part_quantity          DECIMAL;
    v_item_cost              DECIMAL;
    v_item_name              VARCHAR;
    v_available_qty          DECIMAL;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, assigned_to
      INTO v_tenant_id, v_old_status, v_assigned_to
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override   := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin', 'maintenance_manager', 'engineer', 'technician',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: you are not allowed to complete this work order';
    END IF;

    IF v_old_status <> 'in_progress' THEN
        RAISE EXCEPTION 'Cannot complete work order in status: %', v_old_status;
    END IF;

    IF NOT v_is_management_override AND v_assigned_to IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the assigned technician can complete this work order';
    END IF;

    SELECT settings INTO v_tenant_settings
      FROM public.tenants WHERE id = v_tenant_id;

    v_require_supervisor := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_supervisor_approval')::BOOLEAN, TRUE
    );
    v_require_engineer := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_engineer_review')::BOOLEAN, TRUE
    );

    IF v_require_supervisor THEN
        v_next_status := 'pending_supervisor_approval';
    ELSIF v_require_engineer THEN
        v_next_status := 'pending_engineer_review';
    ELSE
        v_next_status := 'pending_reporter_closure';
    END IF;

    -- Authorize the trigger guard for this transaction before the UPDATE.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status                  = v_next_status,
           technician_notes        = p_technician_notes,
           technician_completed_at = NOW(),
           end_time                = NOW(),
           updated_at              = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance',
        'Work completed by technician. Next status: ' || v_next_status, v_actor_id
    );

    IF p_parts IS NOT NULL AND jsonb_typeof(p_parts) = 'array' AND jsonb_array_length(p_parts) > 0 THEN
        FOR v_part IN SELECT * FROM jsonb_array_elements(p_parts)
        LOOP
            v_part_id       := (v_part->>'part_id')::UUID;
            v_part_quantity := (v_part->>'quantity')::DECIMAL;

            IF v_part_id IS NULL OR COALESCE(v_part_quantity, 0) <= 0 THEN
                RAISE EXCEPTION 'Invalid part usage payload';
            END IF;

            SELECT unit_cost, name, quantity
              INTO v_item_cost, v_item_name, v_available_qty
              FROM public.inventory_items
             WHERE id = v_part_id AND tenant_id = v_tenant_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Part % not found or does not belong to this tenant', v_part_id;
            END IF;

            IF v_available_qty < v_part_quantity THEN
                RAISE EXCEPTION 'Insufficient stock for part "%": available=%, requested=%',
                    v_item_name, v_available_qty, v_part_quantity;
            END IF;

            INSERT INTO public.work_order_parts (
                tenant_id, work_order_id, part_id, quantity, unit_cost, created_by
            ) VALUES (
                v_tenant_id, p_work_order_id, v_part_id, v_part_quantity,
                COALESCE(v_item_cost, 0), v_actor_id
            );

            -- inventory_items UPDATE does not touch work_order sensitive fields;
            -- no guard flag needed for this table.
            UPDATE public.inventory_items
               SET quantity = quantity - v_part_quantity
             WHERE id = v_part_id;

            PERFORM public.create_operation_log(
                v_tenant_id, p_work_order_id, 'maintenance',
                'Used part: ' || COALESCE(v_item_name, 'Unknown') || ' (Qty: ' || v_part_quantity || ')',
                v_actor_id
            );
        END LOOP;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_work_order_technician(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_work_order_technician(UUID, TEXT, JSONB) FROM anon;
GRANT  EXECUTE ON FUNCTION public.complete_work_order_technician(UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.complete_work_order_technician(UUID, TEXT, JSONB) IS
    'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized '
    'before UPDATE. Tenant, role, assignment, and status guards enforced. '
    'Parts consumption validated. Operation log written. Updated by migration 120.';


-- ---------------------------------------------------------------------------
-- 3.3  approve_work_order_supervisor(UUID, TEXT)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.approve_work_order_supervisor(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.approve_work_order_supervisor(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.approve_work_order_supervisor(
    p_work_order_id UUID,
    p_notes         TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id             UUID    := auth.uid();
    v_actor_role           TEXT;
    v_actor_tenant         UUID;
    v_is_super             BOOLEAN := FALSE;
    v_tenant_id            UUID;
    v_old_status           TEXT;
    v_tenant_settings      JSONB;
    v_require_engineer     BOOLEAN;
    v_next_status          TEXT;
    v_is_platform_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status
      INTO v_tenant_id, v_old_status
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin', 'maintenance_manager', 'supervisor',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: only supervisors or managers can approve';
    END IF;

    IF v_old_status <> 'pending_supervisor_approval' THEN
        RAISE EXCEPTION 'Cannot approve work order in status: %', v_old_status;
    END IF;

    SELECT settings INTO v_tenant_settings FROM public.tenants WHERE id = v_tenant_id;
    v_require_engineer := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_engineer_review')::BOOLEAN, TRUE
    );
    v_next_status := CASE WHEN v_require_engineer
                          THEN 'pending_engineer_review'
                          ELSE 'pending_reporter_closure' END;

    -- Authorize the trigger guard for this transaction before the UPDATE.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status                  = v_next_status,
           supervisor_notes        = p_notes,
           supervisor_approved_by  = v_actor_id,
           supervisor_approved_at  = NOW(),
           updated_at              = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance',
        'Approved by supervisor. Next status: ' || v_next_status, v_actor_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_work_order_supervisor(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_work_order_supervisor(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.approve_work_order_supervisor(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.approve_work_order_supervisor(UUID, TEXT) IS
    'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized '
    'before UPDATE. Updated by migration 120.';


-- ---------------------------------------------------------------------------
-- 3.4  approve_work_order_engineer(UUID, TEXT)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.approve_work_order_engineer(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.approve_work_order_engineer(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.approve_work_order_engineer(
    p_work_order_id UUID,
    p_notes         TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id             UUID    := auth.uid();
    v_actor_role           TEXT;
    v_actor_tenant         UUID;
    v_is_super             BOOLEAN := FALSE;
    v_tenant_id            UUID;
    v_old_status           TEXT;
    v_is_platform_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status
      INTO v_tenant_id, v_old_status
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin', 'maintenance_manager', 'engineer',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: only engineers or managers can review';
    END IF;

    IF v_old_status <> 'pending_engineer_review' THEN
        RAISE EXCEPTION 'Cannot review work order in status: %', v_old_status;
    END IF;

    -- Authorize the trigger guard for this transaction before the UPDATE.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status               = 'pending_reporter_closure',
           engineer_notes       = p_notes,
           engineer_approved_by = v_actor_id,
           engineer_approved_at = NOW(),
           updated_at           = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance', 'Approved by engineer', v_actor_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_work_order_engineer(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_work_order_engineer(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.approve_work_order_engineer(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.approve_work_order_engineer(UUID, TEXT) IS
    'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized '
    'before UPDATE. Updated by migration 120.';


-- ---------------------------------------------------------------------------
-- 3.5  close_work_order(UUID, TEXT)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.close_work_order(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.close_work_order(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.close_work_order(
    p_work_order_id UUID,
    p_notes         TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id               UUID    := auth.uid();
    v_actor_role             TEXT;
    v_actor_tenant           UUID;
    v_is_super               BOOLEAN := FALSE;
    v_tenant_id              UUID;
    v_old_status             TEXT;
    v_reported_by            UUID;
    v_is_platform_override   BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, reported_by
      INTO v_tenant_id, v_old_status, v_reported_by
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override   := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF NOT v_is_management_override AND v_reported_by IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the original reporter can close this work order';
    END IF;

    IF v_old_status <> 'pending_reporter_closure' THEN
        RAISE EXCEPTION 'Cannot close work order in status: %', v_old_status;
    END IF;

    -- Authorize the trigger guard for this transaction before the UPDATE.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status               = 'completed',
           completed_at         = NOW(),
           customer_reviewed_by = v_actor_id,
           customer_reviewed_at = NOW(),
           reporter_notes       = p_notes,
           updated_at           = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance', 'Work order closed', v_actor_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_work_order(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_work_order(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.close_work_order(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.close_work_order(UUID, TEXT) IS
    'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized '
    'before UPDATE. Reporter/management authority enforced. Updated by migration 120.';


-- ---------------------------------------------------------------------------
-- 3.6  reject_work_order(UUID, TEXT)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.reject_work_order(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.reject_work_order(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.reject_work_order(
    p_work_order_id UUID,
    p_reason        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id               UUID    := auth.uid();
    v_actor_role             TEXT;
    v_actor_tenant           UUID;
    v_is_super               BOOLEAN := FALSE;
    v_tenant_id              UUID;
    v_old_status             TEXT;
    v_assigned_to            UUID;
    v_reported_by            UUID;
    v_is_platform_override   BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF COALESCE(BTRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Rejection reason is required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, assigned_to, reported_by
      INTO v_tenant_id, v_old_status, v_assigned_to, v_reported_by
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override   := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    -- Authorize the trigger guard before any branch UPDATE.
    -- The flag covers all UPDATE statements in this transaction.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    CASE v_old_status
        WHEN 'assigned' THEN
            IF v_actor_role NOT IN (
                'tenant_admin', 'maintenance_manager', 'engineer', 'technician',
                'platform_owner', 'platform_admin'
            ) AND NOT v_is_super THEN
                RAISE EXCEPTION 'Unauthorized: only assigned technicians, engineers, or managers can reject this assignment';
            END IF;
            IF NOT v_is_management_override AND v_assigned_to IS DISTINCT FROM v_actor_id THEN
                RAISE EXCEPTION 'Only the assigned technician can reject this assignment';
            END IF;
            UPDATE public.work_orders
               SET status      = 'pending',
                   assigned_to = NULL,
                   start_time  = NULL,
                   updated_at  = NOW()
             WHERE id = p_work_order_id;

        WHEN 'pending_supervisor_approval' THEN
            IF v_actor_role NOT IN (
                'tenant_admin', 'maintenance_manager', 'supervisor',
                'platform_owner', 'platform_admin'
            ) AND NOT v_is_super THEN
                RAISE EXCEPTION 'Unauthorized: only supervisors or managers can reject at this stage';
            END IF;
            UPDATE public.work_orders
               SET status = 'in_progress', updated_at = NOW()
             WHERE id = p_work_order_id;

        WHEN 'pending_engineer_review' THEN
            IF v_actor_role NOT IN (
                'tenant_admin', 'maintenance_manager', 'engineer',
                'platform_owner', 'platform_admin'
            ) AND NOT v_is_super THEN
                RAISE EXCEPTION 'Unauthorized: only engineers or managers can reject at this stage';
            END IF;
            UPDATE public.work_orders
               SET status = 'in_progress', updated_at = NOW()
             WHERE id = p_work_order_id;

        WHEN 'pending_reporter_closure' THEN
            IF NOT v_is_management_override AND v_reported_by IS DISTINCT FROM v_actor_id THEN
                RAISE EXCEPTION 'Only the original reporter can reject closure for this work order';
            END IF;
            UPDATE public.work_orders
               SET status = 'in_progress', updated_at = NOW()
             WHERE id = p_work_order_id;

        ELSE
            RAISE EXCEPTION 'Cannot reject work order in status: %', v_old_status;
    END CASE;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance',
        'Workflow rejected/returned. Reason: ' || p_reason, v_actor_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_work_order(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_work_order(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reject_work_order(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.reject_work_order(UUID, TEXT) IS
    'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized '
    'before all CASE-branch UPDATEs. Rejection reason required. Updated by migration 120.';


-- ---------------------------------------------------------------------------
-- 3.7  auto_close_stale_work_orders()
-- Server-side function called by cron. Adds authorization flag so the guard
-- does not block its status updates.
-- NOTE: This function uses status value 'auto_closed' which is not in the
-- work_orders_status_check constraint from migration 011. It also references
-- columns closed_at and closed_notes that do not exist in current migrations.
-- These are pre-existing issues from migration 052, unrelated to this guard.
-- The function will still fail on execution if those constraints/columns are
-- absent, but that failure pre-dates this migration.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_close_stale_work_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count           INTEGER := 0;
    v_tenant          RECORD;
    v_auto_close_days INTEGER;
    v_closed_count    INTEGER;
BEGIN
    -- Authorize the trigger guard for this server-side batch operation.
    -- This is a controlled server-side auto-close, not a direct client update.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    FOR v_tenant IN SELECT id, settings FROM tenants WHERE is_active = true
    LOOP
        v_auto_close_days := COALESCE(
            (v_tenant.settings->'work_orders'->>'auto_close_after_days')::INTEGER, 7
        );

        UPDATE work_orders
           SET status       = 'auto_closed',
               closed_at    = NOW(),
               closed_notes = 'تم الإغلاق التلقائي بعد ' || v_auto_close_days || ' أيام بدون استجابة',
               updated_at   = NOW()
         WHERE tenant_id = v_tenant.id
           AND status    = 'pending_reporter_closure'
           AND updated_at < (NOW() - (v_auto_close_days || ' days')::INTERVAL);

        GET DIAGNOSTICS v_closed_count = ROW_COUNT;
        v_count := v_count + v_closed_count;

        UPDATE work_orders
           SET status       = 'auto_closed',
               closed_at    = NOW(),
               closed_notes = 'تم الإغلاق التلقائي بسبب عدم النشاط لفترة طويلة',
               updated_at   = NOW()
         WHERE tenant_id = v_tenant.id
           AND status IN ('in_progress', 'on_hold')
           AND updated_at < (NOW() - ((v_auto_close_days * 2) || ' days')::INTERVAL);

        GET DIAGNOSTICS v_closed_count = ROW_COUNT;
        v_count := v_count + v_closed_count;
    END LOOP;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.auto_close_stale_work_orders() IS
    'Phase 2: Authorization flag added so guard trigger permits this server-side '
    'auto-close batch. Pre-existing issue: uses status auto_closed (not in constraint) '
    'and columns closed_at/closed_notes (not in schema). Updated by migration 120.';


-- =============================================================================
-- SECTION 4 — PM foundation RPCs: intentionally blocked
-- =============================================================================
-- wo_start(UUID) and wo_complete(UUID, TEXT) — defined in migration 108 —
-- are NOT granted workflow authorization in this migration.
--
-- DECISION: Intentionally block both RPCs pending PM hardening.
--
-- REASON: wo_start and wo_complete attempt to UPDATE workflow-sensitive
-- fields (status, start_time, started_at, completed_at, completion_notes,
-- actual_duration_minutes). However, unlike the reactive workflow RPCs,
-- they do not validate:
--   * Tenant isolation: no check that auth.uid() belongs to the same tenant
--     as the work order being started or completed.
--   * Role authority: no check that the caller has a role permitted to
--     start or complete PM work orders.
--   * Assignment authority: no check that the caller is the assigned
--     technician or has management override rights.
--
-- IMPACT: PM foundation execution (ExecutionDialog calling wo_start /
-- wo_complete) will receive:
--   ERROR: Direct update of workflow-sensitive field "status" is not permitted.
-- until wo_start and wo_complete are hardened.
--
-- REQUIRED NEXT STEP:
--   Harden wo_start and wo_complete to match the reactive workflow RPC standard:
--   1. Add tenant isolation: verify auth.uid() profile.tenant_id = work_order.tenant_id.
--   2. Add role check: only technician, engineer, maintenance_manager, tenant_admin,
--      platform_owner, platform_admin (or equivalent PM executor roles).
--   3. Add assignment check: verify caller is the assigned technician or has
--      management override.
--   4. Add PERFORM set_config('app.work_order_workflow_authorized','true',TRUE)
--      before each UPDATE to work_orders.
--   5. Add operation log entries.
--   6. Update this comment in a subsequent migration to record completion.
-- =============================================================================


-- =============================================================================
-- SECTION 5 — Manual smoke-test queries
-- Run these against staging after applying the migration.
-- =============================================================================
-- A. Confirm trigger is attached:
--
--    SELECT tgname, tgenabled, tgtype
--      FROM pg_trigger
--     WHERE tgrelid = 'public.work_orders'::regclass
--       AND tgname  = 'trg_guard_work_order_sensitive_fields';
--    Expected: 1 row, tgenabled = 'O' (origin), tgtype = 7 (BEFORE ROW UPDATE)
--
-- B. Confirm direct status update is blocked (run as authenticated role):
--
--    UPDATE public.work_orders SET status = 'completed' WHERE id = '<any_id>';
--    Expected: ERROR:  Direct update of workflow-sensitive field "status" ...
--
-- C. Confirm metadata-only update is allowed:
--
--    UPDATE public.work_orders
--       SET title = 'Smoke-test title', updated_at = NOW()
--     WHERE id = '<any_id>';
--    Expected: UPDATE 1  (no error)
--
-- D. Confirm start_work_order still succeeds (as assigned technician):
--
--    SELECT public.start_work_order('<pending_or_assigned_wo_id>');
--    Expected: success — status becomes in_progress, operation log created.
--
-- E. Confirm wo_start is blocked (PM hardening pending):
--
--    SELECT public.wo_start('<pending_wo_id>');
--    Expected: ERROR:  Direct update of workflow-sensitive field "status" ...
--
-- F. Confirm trigger function exists with correct signature:
--
--    SELECT proname, prosecdef, provolatile
--      FROM pg_proc
--      JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
--     WHERE nspname = 'public'
--       AND proname = 'guard_work_order_sensitive_fields';
--    Expected: 1 row, prosecdef = true, provolatile = 'v'
-- =============================================================================
