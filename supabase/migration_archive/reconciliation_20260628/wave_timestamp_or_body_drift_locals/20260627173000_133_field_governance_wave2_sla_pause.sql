-- =============================================================================
-- Migration: 133_field_governance_wave2_sla_pause.sql
-- Purpose:
--   Phase 2 / Wave 2.4 Field Governance SLA pause/resume.
--
--   Non-destructive:
--     - Adds tenant-scoped controlled SLA pause reason codes.
--     - Adds tenant-scoped SLA pause intervals with one active pause per work order.
--     - Extends the existing work_orders workflow guard to protect SLA deadlines.
--     - Adds audited SLA deadline, pause, and resume RPCs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend the existing 120 workflow guard to cover SLA deadlines.
-- -----------------------------------------------------------------------------

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
        'sla_response_deadline',
        'sla_resolution_deadline',
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
    'Blocks direct updates to workflow-sensitive work_orders fields unless an approved workflow RPC sets transaction-local app.work_order_workflow_authorized=true. Wave 2.4 adds SLA deadline protection.';

-- -----------------------------------------------------------------------------
-- 2. Controlled tenant-scoped pause reason codes.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sla_pause_reason_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    reason_code TEXT NOT NULL CHECK (
        reason_code IN (
            'waiting_parts',
            'site_access',
            'evacuation',
            'third_party'
        )
    ),
    label TEXT NOT NULL,
    label_ar TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sla_pause_reason_codes_tenant_code_key UNIQUE (tenant_id, reason_code)
);

CREATE INDEX IF NOT EXISTS idx_sla_pause_reason_codes_tenant_active
    ON public.sla_pause_reason_codes(tenant_id, is_active, display_order);

COMMENT ON TABLE public.sla_pause_reason_codes IS
    'Tenant-scoped controlled list of allowed SLA pause reasons. Free-text notes are supplementary only.';

ALTER TABLE public.sla_pause_reason_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sla_pause_reason_codes_select_scoped" ON public.sla_pause_reason_codes;
CREATE POLICY "sla_pause_reason_codes_select_scoped"
ON public.sla_pause_reason_codes
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

REVOKE ALL PRIVILEGES ON TABLE public.sla_pause_reason_codes FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.sla_pause_reason_codes FROM PUBLIC;
GRANT SELECT ON TABLE public.sla_pause_reason_codes TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. SLA pause intervals. One active pause per work order is database-enforced.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.work_order_sla_pauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE RESTRICT,
    reason_code_id UUID NOT NULL REFERENCES public.sla_pause_reason_codes(id) ON DELETE RESTRICT,
    pause_reason_code TEXT NOT NULL CHECK (
        pause_reason_code IN (
            'waiting_parts',
            'site_access',
            'evacuation',
            'third_party'
        )
    ),
    note TEXT,
    paused_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    paused_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resumed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resumed_at TIMESTAMPTZ,
    pause_duration_seconds INTEGER,
    sla_response_deadline_before TIMESTAMPTZ,
    sla_resolution_deadline_before TIMESTAMPTZ,
    sla_response_deadline_after TIMESTAMPTZ,
    sla_resolution_deadline_after TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT work_order_sla_pauses_resumed_after_paused_check CHECK (
        resumed_at IS NULL OR resumed_at >= paused_at
    ),
    CONSTRAINT work_order_sla_pauses_duration_nonnegative_check CHECK (
        pause_duration_seconds IS NULL OR pause_duration_seconds >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_work_order_sla_pauses_tenant
    ON public.work_order_sla_pauses(tenant_id);

CREATE INDEX IF NOT EXISTS idx_work_order_sla_pauses_work_order
    ON public.work_order_sla_pauses(work_order_id);

CREATE INDEX IF NOT EXISTS idx_work_order_sla_pauses_reason_code
    ON public.work_order_sla_pauses(reason_code_id);

CREATE INDEX IF NOT EXISTS idx_work_order_sla_pauses_paused_by
    ON public.work_order_sla_pauses(paused_by);

CREATE INDEX IF NOT EXISTS idx_work_order_sla_pauses_resumed_by
    ON public.work_order_sla_pauses(resumed_by);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_work_order_sla_pauses_active
    ON public.work_order_sla_pauses(work_order_id)
    WHERE resumed_at IS NULL;

COMMENT ON TABLE public.work_order_sla_pauses IS
    'Tenant-scoped SLA pause intervals. A partial unique index enforces one active pause per work order.';

ALTER TABLE public.work_order_sla_pauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_order_sla_pauses_select_scoped" ON public.work_order_sla_pauses;
CREATE POLICY "work_order_sla_pauses_select_scoped"
ON public.work_order_sla_pauses
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

REVOKE ALL PRIVILEGES ON TABLE public.work_order_sla_pauses FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.work_order_sla_pauses FROM PUBLIC;
GRANT SELECT ON TABLE public.work_order_sla_pauses TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Internal default reason-code seed helper.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_default_sla_pause_reason_codes(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant id is required for SLA pause reason codes'
            USING ERRCODE = '23502';
    END IF;

    INSERT INTO public.sla_pause_reason_codes (
        tenant_id,
        reason_code,
        label,
        label_ar,
        description,
        display_order
    )
    VALUES
        (
            p_tenant_id,
            'waiting_parts',
            'Waiting for parts',
            NULL,
            'SLA is paused while approved parts or materials are unavailable.',
            10
        ),
        (
            p_tenant_id,
            'site_access',
            'Site access blocked',
            NULL,
            'SLA is paused while the team is blocked from reaching the location.',
            20
        ),
        (
            p_tenant_id,
            'evacuation',
            'Evacuation or safety restriction',
            NULL,
            'SLA is paused during evacuation or safety restrictions.',
            30
        ),
        (
            p_tenant_id,
            'third_party',
            'Third-party dependency',
            NULL,
            'SLA is paused while a third-party action is required.',
            40
        )
    ON CONFLICT (tenant_id, reason_code) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_default_sla_pause_reason_codes(UUID) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Controlled SLA deadline setter. This keeps deadline changes behind the
--    same authorization-flag + trigger pattern used by workflow RPCs.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_work_order_sla_deadlines(
    p_work_order_id UUID,
    p_sla_response_deadline TIMESTAMPTZ,
    p_sla_resolution_deadline TIMESTAMPTZ,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor_role TEXT;
    v_actor_tenant UUID;
    v_actor_active BOOLEAN;
    v_actor_super BOOLEAN := FALSE;
    v_is_platform BOOLEAN := FALSE;
    v_wo public.work_orders%ROWTYPE;
    v_before public.work_orders%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot set SLA deadlines'
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

    v_before := v_wo;
    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_platform
       AND NOT public.can_manage_work_orders_scope(v_wo.tenant_id)
       AND v_actor_role NOT IN ('tenant_admin', 'maintenance_manager', 'supervisor', 'engineer') THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to set SLA deadlines'
            USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET sla_response_deadline = p_sla_response_deadline,
           sla_resolution_deadline = p_sla_resolution_deadline,
           updated_at = NOW()
     WHERE id = p_work_order_id
     RETURNING * INTO v_wo;

    PERFORM public.create_governance_log_event(
        v_wo.tenant_id,
        v_wo.id,
        'SLA deadlines set through workflow authority',
        NULLIF(BTRIM(p_reason), ''),
        v_actor_id,
        'governance.sla_deadlines_set',
        'work_orders',
        v_wo.id,
        jsonb_build_object(
            'sla_response_deadline', v_before.sla_response_deadline,
            'sla_resolution_deadline', v_before.sla_resolution_deadline
        ),
        jsonb_build_object(
            'sla_response_deadline', v_wo.sla_response_deadline,
            'sla_resolution_deadline', v_wo.sla_resolution_deadline
        ),
        jsonb_build_object('reason', p_reason)
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', v_wo.id,
        'sla_response_deadline', v_wo.sla_response_deadline,
        'sla_resolution_deadline', v_wo.sla_resolution_deadline
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_work_order_sla_deadlines(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_work_order_sla_deadlines(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_work_order_sla_deadlines(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Pause SLA. Reason code is mandatory and must come from the controlled list.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pause_work_order_sla(
    p_work_order_id UUID,
    p_pause_reason_code TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor_role TEXT;
    v_actor_tenant UUID;
    v_actor_active BOOLEAN;
    v_actor_super BOOLEAN := FALSE;
    v_is_platform BOOLEAN := FALSE;
    v_wo public.work_orders%ROWTYPE;
    v_reason public.sla_pause_reason_codes%ROWTYPE;
    v_pause public.work_order_sla_pauses%ROWTYPE;
    v_reason_code TEXT := NULLIF(BTRIM(p_pause_reason_code), '');
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF v_reason_code IS NULL THEN
        RAISE EXCEPTION 'SLA pause reason code is required'
            USING ERRCODE = '23502';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot pause SLA'
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

    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_platform
       AND NOT public.can_manage_work_orders_scope(v_wo.tenant_id)
       AND v_actor_role NOT IN ('tenant_admin', 'maintenance_manager', 'supervisor', 'engineer', 'technician') THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to pause SLA'
            USING ERRCODE = '42501';
    END IF;

    PERFORM public.ensure_default_sla_pause_reason_codes(v_wo.tenant_id);

    SELECT *
      INTO v_reason
      FROM public.sla_pause_reason_codes
     WHERE tenant_id = v_wo.tenant_id
       AND reason_code = v_reason_code
       AND is_active IS TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid SLA pause reason code: %', v_reason_code
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.work_order_sla_pauses p
         WHERE p.work_order_id = v_wo.id
           AND p.resumed_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Work order already has an active SLA pause'
            USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.work_order_sla_pauses (
        tenant_id,
        work_order_id,
        reason_code_id,
        pause_reason_code,
        note,
        paused_by,
        paused_at,
        sla_response_deadline_before,
        sla_resolution_deadline_before
    ) VALUES (
        v_wo.tenant_id,
        v_wo.id,
        v_reason.id,
        v_reason.reason_code,
        NULLIF(BTRIM(p_note), ''),
        v_actor_id,
        NOW(),
        v_wo.sla_response_deadline,
        v_wo.sla_resolution_deadline
    )
    RETURNING * INTO v_pause;

    PERFORM public.create_governance_log_event(
        v_wo.tenant_id,
        v_wo.id,
        'SLA paused',
        v_reason.label,
        v_actor_id,
        'governance.sla_paused',
        'work_order_sla_pauses',
        v_pause.id,
        jsonb_build_object(
            'sla_response_deadline', v_wo.sla_response_deadline,
            'sla_resolution_deadline', v_wo.sla_resolution_deadline,
            'active_pause_id', NULL
        ),
        jsonb_build_object(
            'sla_response_deadline', v_wo.sla_response_deadline,
            'sla_resolution_deadline', v_wo.sla_resolution_deadline,
            'active_pause_id', v_pause.id,
            'pause_reason_code', v_pause.pause_reason_code,
            'paused_at', v_pause.paused_at
        ),
        jsonb_build_object(
            'pause_reason_code', v_pause.pause_reason_code,
            'pause_reason_label', v_reason.label,
            'note', p_note
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', v_wo.id,
        'pause_id', v_pause.id,
        'pause_reason_code', v_pause.pause_reason_code,
        'paused_at', v_pause.paused_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pause_work_order_sla(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pause_work_order_sla(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.pause_work_order_sla(UUID, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Resume SLA. Deadlines shift by the stored integer pause duration.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resume_work_order_sla(
    p_work_order_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor_role TEXT;
    v_actor_tenant UUID;
    v_actor_active BOOLEAN;
    v_actor_super BOOLEAN := FALSE;
    v_is_platform BOOLEAN := FALSE;
    v_wo public.work_orders%ROWTYPE;
    v_before public.work_orders%ROWTYPE;
    v_pause public.work_order_sla_pauses%ROWTYPE;
    v_resumed_at TIMESTAMPTZ := NOW();
    v_duration_seconds INTEGER;
    v_duration_interval INTERVAL;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot resume SLA'
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

    v_before := v_wo;
    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_platform
       AND NOT public.can_manage_work_orders_scope(v_wo.tenant_id)
       AND v_actor_role NOT IN ('tenant_admin', 'maintenance_manager', 'supervisor', 'engineer', 'technician') THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to resume SLA'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_pause
      FROM public.work_order_sla_pauses
     WHERE work_order_id = v_wo.id
       AND resumed_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active SLA pause found for work order'
            USING ERRCODE = 'P0002';
    END IF;

    v_duration_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_resumed_at - v_pause.paused_at)))::INTEGER);
    v_duration_interval := make_interval(secs => v_duration_seconds);

    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET sla_response_deadline = CASE
               WHEN sla_response_deadline IS NULL THEN NULL
               ELSE sla_response_deadline + v_duration_interval
           END,
           sla_resolution_deadline = CASE
               WHEN sla_resolution_deadline IS NULL THEN NULL
               ELSE sla_resolution_deadline + v_duration_interval
           END,
           updated_at = NOW()
     WHERE id = v_wo.id
     RETURNING * INTO v_wo;

    UPDATE public.work_order_sla_pauses
       SET resumed_by = v_actor_id,
           resumed_at = v_resumed_at,
           pause_duration_seconds = v_duration_seconds,
           sla_response_deadline_after = v_wo.sla_response_deadline,
           sla_resolution_deadline_after = v_wo.sla_resolution_deadline,
           updated_at = NOW()
     WHERE id = v_pause.id
     RETURNING * INTO v_pause;

    PERFORM public.create_governance_log_event(
        v_wo.tenant_id,
        v_wo.id,
        'SLA resumed',
        v_pause.pause_reason_code,
        v_actor_id,
        'governance.sla_resumed',
        'work_order_sla_pauses',
        v_pause.id,
        jsonb_build_object(
            'sla_response_deadline', v_before.sla_response_deadline,
            'sla_resolution_deadline', v_before.sla_resolution_deadline,
            'active_pause_id', v_pause.id,
            'paused_at', v_pause.paused_at
        ),
        jsonb_build_object(
            'sla_response_deadline', v_wo.sla_response_deadline,
            'sla_resolution_deadline', v_wo.sla_resolution_deadline,
            'active_pause_id', NULL,
            'pause_duration_seconds', v_duration_seconds,
            'resumed_at', v_resumed_at
        ),
        jsonb_build_object(
            'pause_reason_code', v_pause.pause_reason_code,
            'note', p_note,
            'pause_duration_seconds', v_duration_seconds
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', v_wo.id,
        'pause_id', v_pause.id,
        'pause_duration_seconds', v_duration_seconds,
        'sla_response_deadline', v_wo.sla_response_deadline,
        'sla_resolution_deadline', v_wo.sla_resolution_deadline
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resume_work_order_sla(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resume_work_order_sla(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.resume_work_order_sla(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.set_work_order_sla_deadlines(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) IS
    'Sets SLA deadlines through the work_orders workflow authorization guard and writes a governance audit event.';

COMMENT ON FUNCTION public.pause_work_order_sla(UUID, TEXT, TEXT) IS
    'Pauses SLA using a mandatory controlled reason code and writes governance.sla_paused through the Field Governance audit helper.';

COMMENT ON FUNCTION public.resume_work_order_sla(UUID, TEXT) IS
    'Resumes the active SLA pause, shifts SLA deadlines by stored pause_duration_seconds through the workflow guard, and writes governance.sla_resumed.';
