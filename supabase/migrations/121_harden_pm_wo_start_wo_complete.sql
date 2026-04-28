-- =============================================================================
-- Migration 121 — Harden wo_start and wo_complete (PM foundation RPCs)
--
-- Context:
--   Migration 108 defined wo_start and wo_complete with minimal guards:
--   only auth.uid() IS NULL and a status check. They have no tenant isolation,
--   no role check, no assignment check, and no operation log.
--
--   Migration 120 added a BEFORE UPDATE trigger on work_orders that blocks
--   updates to lifecycle-sensitive fields unless the transaction is authorized
--   via set_config('app.work_order_workflow_authorized', 'true', TRUE).
--   wo_start and wo_complete were intentionally left without that flag,
--   so PM execution flows have been blocked since migration 120 was applied.
--
-- What this migration does:
--   Replaces wo_start and wo_complete with hardened versions that:
--     1. Validate tenant isolation (work order belongs to actor's tenant).
--     2. Check actor role (same set as start_work_order / complete_work_order_technician).
--     3. Check assignment (management override allowed; assigned actor required otherwise).
--     4. Call set_config('app.work_order_workflow_authorized', 'true', TRUE) before UPDATE.
--     5. Write an operation log via create_operation_log().
--
--   The PM-specific behaviors are preserved:
--     - wo_start: sets both start_time (pre-existing) and started_at (PM column).
--     - wo_complete: validates required checks, updates schedule compliance stats,
--       and transitions directly to 'completed' (PM work orders bypass approval stages).
--
-- Authorized roles mirror the reactive RPCs defined in migration 093:
--   technician, engineer, maintenance_manager, tenant_admin,
--   platform_owner, platform_admin, is_super_admin.
--
-- GRANTS: same as migration 108 — EXECUTE granted to authenticated only.
-- =============================================================================

-- =============================================================================
-- SECTION 1 — Hardened wo_start
-- =============================================================================

DROP FUNCTION IF EXISTS public.wo_start(UUID);

CREATE OR REPLACE FUNCTION public.wo_start(p_wo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id      UUID    := auth.uid();
    v_actor_role    TEXT;
    v_actor_tenant  UUID;
    v_is_super      BOOLEAN := FALSE;
    v_tenant_id     UUID;
    v_old_status    TEXT;
    v_assigned_to   UUID;
    v_is_platform   BOOLEAN := FALSE;
    v_is_mgmt       BOOLEAN := FALSE;
BEGIN
    -- 1. Authentication
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Actor profile
    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    -- 3. Work order snapshot
    SELECT tenant_id, status, assigned_to
      INTO v_tenant_id, v_old_status, v_assigned_to
      FROM public.work_orders
     WHERE id = p_wo_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    -- 4. Override flags
    v_is_platform := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_mgmt     := v_is_platform OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    -- 5. Tenant isolation
    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 6. Role check
    IF v_actor_role NOT IN (
        'technician', 'engineer', 'maintenance_manager', 'tenant_admin',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to start a work order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 7. Status check (PM orders start as pending; allow assigned as well)
    IF v_old_status NOT IN ('pending', 'assigned') THEN
        RAISE EXCEPTION 'Cannot start work order in status: %', v_old_status;
    END IF;

    -- 8. Assignment check
    IF NOT v_is_mgmt
       AND v_assigned_to IS NOT NULL
       AND v_assigned_to IS DISTINCT FROM v_actor_id
    THEN
        RAISE EXCEPTION 'Only the assigned technician can start this work order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 9. Authorize the upcoming UPDATE to bypass the sensitive-field trigger
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    -- 10. Transition to in_progress; self-assign if unassigned
    UPDATE public.work_orders
       SET status      = 'in_progress',
           start_time  = COALESCE(start_time, NOW()),
           started_at  = COALESCE(started_at, NOW()),
           assigned_to = COALESCE(v_assigned_to, v_actor_id),
           updated_at  = NOW()
     WHERE id = p_wo_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order update failed unexpectedly';
    END IF;

    -- 11. Operation log
    PERFORM public.create_operation_log(
        v_tenant_id,
        p_wo_id,
        'maintenance',
        'PM work order started',
        v_actor_id
    );

    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_wo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.wo_start(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wo_start(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.wo_start(UUID) TO authenticated;

-- =============================================================================
-- SECTION 2 — Hardened wo_complete
-- =============================================================================

DROP FUNCTION IF EXISTS public.wo_complete(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.wo_complete(
    p_wo_id            UUID,
    p_completion_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id      UUID    := auth.uid();
    v_actor_role    TEXT;
    v_actor_tenant  UUID;
    v_is_super      BOOLEAN := FALSE;
    v_wo            RECORD;
    v_is_platform   BOOLEAN := FALSE;
    v_is_mgmt       BOOLEAN := FALSE;
    v_missing_labels TEXT;
BEGIN
    -- 1. Authentication
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Actor profile
    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    -- 3. Work order snapshot (full row for schedule stats update)
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_wo_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    -- 4. Override flags
    v_is_platform := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_mgmt     := v_is_platform OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    -- 5. Tenant isolation
    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 6. Role check
    IF v_actor_role NOT IN (
        'technician', 'engineer', 'maintenance_manager', 'tenant_admin',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to complete a work order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 7. Status check
    IF v_wo.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress work orders can be completed; current status: %', v_wo.status;
    END IF;

    -- 8. Assignment check
    IF NOT v_is_mgmt AND v_wo.assigned_to IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the assigned technician can complete this work order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 9. Required checks — build list of incomplete required items
    SELECT string_agg(
        (item_snapshot->>'label')
        || CASE
               WHEN asset_id IS NOT NULL THEN
                   ' (' || COALESCE(
                       (SELECT name FROM public.assets WHERE id = asset_id),
                       'Asset'
                   ) || ')'
               ELSE ''
           END,
        ', '
        ORDER BY sort_order
    )
    INTO v_missing_labels
    FROM public.work_order_checks
    WHERE work_order_id = p_wo_id
      AND COALESCE((item_snapshot->>'is_required')::BOOLEAN, FALSE) = TRUE
      AND status = 'pending';

    IF v_missing_labels IS NOT NULL THEN
        RAISE EXCEPTION 'Required checks incomplete: %', v_missing_labels;
    END IF;

    -- 10. Authorize the upcoming UPDATE to bypass the sensitive-field trigger
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    -- 11. Transition to completed (PM work orders bypass approval stages)
    UPDATE public.work_orders
       SET status                  = 'completed',
           completed_at            = NOW(),
           completion_notes        = COALESCE(p_completion_notes, completion_notes),
           actual_duration_minutes = CASE
               WHEN started_at IS NOT NULL
               THEN GREATEST(0,
                   (EXTRACT(EPOCH FROM (NOW() - started_at)) / 60.0)::INTEGER
               )
               WHEN start_time IS NOT NULL
               THEN GREATEST(0,
                   (EXTRACT(EPOCH FROM (NOW() - start_time)) / 60.0)::INTEGER
               )
               ELSE NULL
           END,
           updated_at = NOW()
     WHERE id = p_wo_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order update failed unexpectedly';
    END IF;

    -- 12. Update schedule compliance stats (PM-specific; safe to run even if columns are null)
    IF v_wo.source_schedule_id IS NOT NULL THEN
        UPDATE public.pm_schedules
           SET total_completed = total_completed + 1,
               compliance_rate = CASE
                   WHEN total_generated > 0
                   THEN ((total_completed + 1)::DECIMAL / total_generated * 100.0)
                   ELSE 0
               END,
               updated_at = NOW()
         WHERE id = v_wo.source_schedule_id;
    END IF;

    -- 13. Operation log
    PERFORM public.create_operation_log(
        v_wo.tenant_id,
        p_wo_id,
        'maintenance',
        'PM work order completed',
        v_actor_id
    );

    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_wo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.wo_complete(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wo_complete(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.wo_complete(UUID, TEXT) TO authenticated;

-- =============================================================================
-- SECTION 3 — Smoke-test queries (run manually in Supabase SQL editor)
-- =============================================================================

-- A. Verify both functions exist with the correct signatures:
--
-- SELECT proname, proargtypes::TEXT
--   FROM pg_proc
--   WHERE proname IN ('wo_start', 'wo_complete')
--     AND pronamespace = 'public'::regnamespace;
--
-- B. Verify function bodies contain set_config authorization:
--
-- SELECT proname, prosrc
--   FROM pg_proc
--   WHERE proname IN ('wo_start', 'wo_complete')
--     AND pronamespace = 'public'::regnamespace
--     AND prosrc LIKE '%work_order_workflow_authorized%';
--
-- C. Verify trigger still fires for direct update attempt (service role):
--
-- PATCH /rest/v1/work_orders?id=eq.<wo_id>
-- Authorization: Bearer <service_role_key>
-- Content-Type: application/json
-- Body: {"status":"completed"}
-- → Expect HTTP 403, code 42501, "Direct update of workflow-sensitive field..."
--
-- D. Verify wo_start accepts a pending work order (authenticated technician JWT):
--
-- POST /rest/v1/rpc/wo_start
-- Authorization: Bearer <technician_jwt>
-- Body: {"p_wo_id":"<pending_pm_wo_id>"}
-- → Expect HTTP 200, {"success":true,"work_order_id":"<wo_id>"}
--
-- E. Verify wo_complete accepts an in-progress work order (same actor):
--
-- POST /rest/v1/rpc/wo_complete
-- Authorization: Bearer <technician_jwt>
-- Body: {"p_wo_id":"<in_progress_pm_wo_id>","p_completion_notes":"Test completion"}
-- → Expect HTTP 200, {"success":true,"work_order_id":"<wo_id>"}
--
-- F. Verify role check (reporter JWT attempting wo_start):
--
-- POST /rest/v1/rpc/wo_start
-- Authorization: Bearer <reporter_jwt>
-- Body: {"p_wo_id":"<pending_pm_wo_id>"}
-- → Expect HTTP 403/500, "Unauthorized: your role is not permitted to start a work order"
--
-- G. Verify tenant isolation (Tenant B user attempting to start Tenant A work order):
--
-- POST /rest/v1/rpc/wo_start
-- Authorization: Bearer <tenant_b_user_jwt>
-- Body: {"p_wo_id":"<tenant_a_wo_id>"}
-- → Expect HTTP 403/500, "Access denied: work order belongs to a different tenant"
