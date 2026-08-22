ALTER TABLE public.operation_logs DROP CONSTRAINT IF EXISTS operation_logs_type_check;

ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_type_check CHECK (
    type IN (
        'maintenance', 'repair', 'inspection', 'emergency', 'routine',
        'installation', 'calibration', 'other', 'status_change', 'comment',
        'assignment', 'create', 'update', 'cancellation', 'pm_generate',
        'pm_master_propagate', 'pm_blackout_defer', 'governance'
    )
);

COMMENT ON CONSTRAINT operation_logs_type_check ON public.operation_logs IS
    'Allowed operation log types. governance added by Field Governance Wave 1.';

CREATE TABLE IF NOT EXISTS public.work_order_governance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    work_order_id UUID NOT NULL UNIQUE REFERENCES public.work_orders(id) ON DELETE CASCADE,
    route_type TEXT NOT NULL DEFAULT 'standard' CHECK (route_type IN ('standard', 'emergency_override')),
    governance_state TEXT NOT NULL DEFAULT 'standard' CHECK (governance_state IN ('standard', 'post_action_required', 'post_action_complete', 'approved', 'rejected')),
    override_reason TEXT,
    override_severity TEXT CHECK (override_severity IS NULL OR override_severity IN ('low', 'medium', 'high', 'critical', 'life_safety')),
    override_evidence JSONB NOT NULL DEFAULT '[]'::JSONB,
    affected_asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    affected_building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
    affected_floor_id UUID REFERENCES public.floors(id) ON DELETE SET NULL,
    affected_room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    temp_action TEXT,
    verbal_approver_name TEXT,
    verbal_approver_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    post_action_deadline TIMESTAMPTZ,
    started_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    post_action_completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    post_action_completed_at TIMESTAMPTZ,
    decision_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decision_at TIMESTAMPTZ,
    decision_notes TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT work_order_governance_emergency_minimum_check CHECK (
        route_type <> 'emergency_override'
        OR (
            override_reason IS NOT NULL
            AND BTRIM(override_reason) <> ''
            AND override_severity IS NOT NULL
            AND override_evidence IS NOT NULL
            AND override_evidence <> '[]'::JSONB
            AND override_evidence <> '{}'::JSONB
            AND (affected_asset_id IS NOT NULL OR affected_building_id IS NOT NULL OR affected_floor_id IS NOT NULL OR affected_room_id IS NOT NULL)
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_work_order_governance_tenant ON public.work_order_governance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_order_governance_state ON public.work_order_governance(governance_state);
CREATE INDEX IF NOT EXISTS idx_work_order_governance_route ON public.work_order_governance(route_type);
CREATE INDEX IF NOT EXISTS idx_work_order_governance_affected_asset ON public.work_order_governance(affected_asset_id);
CREATE INDEX IF NOT EXISTS idx_work_order_governance_affected_building ON public.work_order_governance(affected_building_id);
CREATE INDEX IF NOT EXISTS idx_work_order_governance_affected_floor ON public.work_order_governance(affected_floor_id);
CREATE INDEX IF NOT EXISTS idx_work_order_governance_affected_room ON public.work_order_governance(affected_room_id);
CREATE INDEX IF NOT EXISTS idx_work_order_governance_started_by ON public.work_order_governance(started_by);
CREATE INDEX IF NOT EXISTS idx_work_order_governance_post_action_completed_by ON public.work_order_governance(post_action_completed_by);
CREATE INDEX IF NOT EXISTS idx_work_order_governance_decision_by ON public.work_order_governance(decision_by);

COMMENT ON TABLE public.work_order_governance IS 'Field Governance state layer above work_orders. Does not add or replace work_orders.status.';
COMMENT ON COLUMN public.work_order_governance.governance_state IS 'Governance sub-state. Direct changes are blocked by trigger unless an audited governance RPC sets app.governance_workflow_authorized.';

CREATE TABLE IF NOT EXISTS public.operation_log_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    operation_log_id UUID NOT NULL REFERENCES public.operation_logs(id) ON DELETE RESTRICT,
    work_order_id UUID REFERENCES public.work_orders(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type LIKE 'governance.%'),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    before_state JSONB,
    after_state JSONB,
    context JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operation_log_events_tenant ON public.operation_log_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_events_operation_log ON public.operation_log_events(operation_log_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_events_work_order ON public.operation_log_events(work_order_id);
CREATE INDEX IF NOT EXISTS idx_operation_log_events_type ON public.operation_log_events(event_type);
CREATE INDEX IF NOT EXISTS idx_operation_log_events_actor ON public.operation_log_events(actor_id);

COMMENT ON TABLE public.operation_log_events IS 'Append-only governance event rows linked to operation_logs via ON DELETE RESTRICT.';

ALTER TABLE public.work_order_governance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_log_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_order_governance_select_scoped" ON public.work_order_governance;
CREATE POLICY "work_order_governance_select_scoped"
ON public.work_order_governance
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

DROP POLICY IF EXISTS "operation_log_events_select_scoped" ON public.operation_log_events;
CREATE POLICY "operation_log_events_select_scoped"
ON public.operation_log_events
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

GRANT SELECT ON TABLE public.work_order_governance TO authenticated;
GRANT SELECT ON TABLE public.operation_log_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.work_order_governance FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.operation_log_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_operation_log_events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'operation_log_events is append-only; UPDATE/DELETE is not permitted'
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_operation_log_events_append_only ON public.operation_log_events;
CREATE TRIGGER trg_guard_operation_log_events_append_only
BEFORE UPDATE OR DELETE ON public.operation_log_events
FOR EACH ROW
EXECUTE FUNCTION public.guard_operation_log_events_append_only();

CREATE OR REPLACE FUNCTION public.guard_work_order_governance_state_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_authorized BOOLEAN;
BEGIN
    IF NEW.governance_state IS NOT DISTINCT FROM OLD.governance_state THEN
        RETURN NEW;
    END IF;

    v_authorized := COALESCE(current_setting('app.governance_workflow_authorized', TRUE) = 'true', FALSE);

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'Direct update of governance_state is not permitted. Use audited governance RPCs. Field Governance Wave 1.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_work_order_governance_state_update ON public.work_order_governance;
CREATE TRIGGER trg_guard_work_order_governance_state_update
BEFORE UPDATE OF governance_state ON public.work_order_governance
FOR EACH ROW
EXECUTE FUNCTION public.guard_work_order_governance_state_update();

CREATE OR REPLACE FUNCTION public.create_governance_log_event(
    p_tenant_id UUID,
    p_work_order_id UUID,
    p_description TEXT,
    p_reason TEXT,
    p_actor_id UUID,
    p_event_type TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_before_state JSONB DEFAULT NULL,
    p_after_state JSONB DEFAULT NULL,
    p_context JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_operation_log_id UUID;
    v_asset_id UUID;
    v_building_id UUID;
    v_team_id UUID;
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant id is required for governance audit event' USING ERRCODE = '23502';
    END IF;

    IF p_event_type IS NULL OR p_event_type NOT LIKE 'governance.%' THEN
        RAISE EXCEPTION 'Governance event_type must start with governance. (got: %)', p_event_type USING ERRCODE = '22023';
    END IF;

    IF p_entity_type IS NULL OR BTRIM(p_entity_type) = '' THEN
        RAISE EXCEPTION 'Governance audit entity_type is required' USING ERRCODE = '23502';
    END IF;

    IF p_work_order_id IS NOT NULL THEN
        SELECT asset_id, building_id, assigned_team
          INTO v_asset_id, v_building_id, v_team_id
          FROM public.work_orders
         WHERE id = p_work_order_id
           AND tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Work order not found for governance audit event' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    v_code := 'GOV-' || to_char(NOW(), 'YYMMDDHH24MISS') || '-' || substring(gen_random_uuid()::TEXT FROM 1 FOR 4);

    INSERT INTO public.operation_logs (
        tenant_id, code, type, description, reason, work_order_id, asset_id, building_id,
        performed_by, team_id, timestamp, status, notes
    ) VALUES (
        p_tenant_id, v_code, 'governance', COALESCE(NULLIF(BTRIM(p_description), ''), p_event_type),
        NULLIF(BTRIM(p_reason), ''), p_work_order_id, v_asset_id, v_building_id,
        p_actor_id, v_team_id, NOW(), 'completed', COALESCE(p_context, '{}'::JSONB)::TEXT
    )
    RETURNING id INTO v_operation_log_id;

    INSERT INTO public.operation_log_events (
        tenant_id, operation_log_id, work_order_id, event_type, actor_id, entity_type,
        entity_id, before_state, after_state, context
    ) VALUES (
        p_tenant_id, v_operation_log_id, p_work_order_id, p_event_type, p_actor_id,
        p_entity_type, p_entity_id, p_before_state, p_after_state, COALESCE(p_context, '{}'::JSONB)
    );

    RETURN v_operation_log_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_governance_log_event(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, UUID, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_governance_log_event(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, UUID, JSONB, JSONB, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_governance_log_event(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, UUID, JSONB, JSONB, JSONB) FROM authenticated;

COMMENT ON FUNCTION public.create_governance_log_event(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, UUID, JSONB, JSONB, JSONB) IS
    'Internal Field Governance audit helper. Writes operation_logs parent row plus append-only operation_log_events row.';

CREATE OR REPLACE FUNCTION public.audit_work_order_governance_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_type TEXT;
    v_description TEXT;
    v_context JSONB;
BEGIN
    IF NEW.governance_state IS NOT DISTINCT FROM OLD.governance_state THEN
        RETURN NEW;
    END IF;

    v_event_type := COALESCE(NULLIF(current_setting('app.governance_event_type', TRUE), ''), 'governance.state_changed');
    v_description := COALESCE(NULLIF(current_setting('app.governance_event_description', TRUE), ''), 'Governance state changed from ' || OLD.governance_state || ' to ' || NEW.governance_state);
    v_context := COALESCE(NULLIF(current_setting('app.governance_event_context', TRUE), '')::JSONB, '{}'::JSONB)
        || jsonb_build_object('source', 'work_order_governance_state_trigger');

    PERFORM public.create_governance_log_event(
        NEW.tenant_id, NEW.work_order_id, v_description, NULL, auth.uid(), v_event_type,
        'work_order_governance', NEW.id, to_jsonb(OLD), to_jsonb(NEW), v_context
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_work_order_governance_state_change ON public.work_order_governance;
CREATE TRIGGER trg_audit_work_order_governance_state_change
AFTER UPDATE OF governance_state ON public.work_order_governance
FOR EACH ROW
EXECUTE FUNCTION public.audit_work_order_governance_state_change();

CREATE OR REPLACE FUNCTION public.guard_emergency_governance_before_work_order_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_governance_state TEXT;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('completed', 'auto_closed', 'archived') THEN
        RETURN NEW;
    END IF;

    SELECT governance_state
      INTO v_governance_state
      FROM public.work_order_governance
     WHERE work_order_id = NEW.id
       AND route_type = 'emergency_override';

    IF FOUND AND v_governance_state <> 'approved' THEN
        RAISE EXCEPTION 'Emergency override work order cannot be closed before governance approval; current governance_state=%', v_governance_state
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_emergency_governance_before_work_order_close ON public.work_orders;
CREATE TRIGGER trg_guard_emergency_governance_before_work_order_close
BEFORE UPDATE OF status ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_emergency_governance_before_work_order_close();

CREATE OR REPLACE FUNCTION public.start_work_order_emergency(
    p_work_order_id UUID,
    p_override_reason TEXT,
    p_override_severity TEXT,
    p_evidence JSONB,
    p_affected_asset_id UUID DEFAULT NULL,
    p_affected_building_id UUID DEFAULT NULL,
    p_affected_floor_id UUID DEFAULT NULL,
    p_affected_room_id UUID DEFAULT NULL
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
    v_wo public.work_orders%ROWTYPE;
    v_affected_asset_id UUID;
    v_affected_building_id UUID;
    v_affected_floor_id UUID;
    v_affected_room_id UUID;
    v_governance public.work_order_governance%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    IF p_work_order_id IS NULL THEN RAISE EXCEPTION 'Work order id is required' USING ERRCODE = '22023'; END IF;
    IF COALESCE(BTRIM(p_override_reason), '') = '' THEN RAISE EXCEPTION 'Emergency override reason is required' USING ERRCODE = '23502'; END IF;
    IF p_override_severity NOT IN ('low', 'medium', 'high', 'critical', 'life_safety') THEN
        RAISE EXCEPTION 'Invalid emergency override severity: %', p_override_severity USING ERRCODE = '22023';
    END IF;
    IF p_evidence IS NULL OR jsonb_typeof(p_evidence) NOT IN ('array', 'object') OR p_evidence = '[]'::JSONB OR p_evidence = '{}'::JSONB THEN
        RAISE EXCEPTION 'Emergency override evidence is required' USING ERRCODE = '23502';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot start emergency work orders' USING ERRCODE = '42501'; END IF;

    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
    IF NOT (v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin')) AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.work_order_governance WHERE work_order_id = p_work_order_id) THEN
        RAISE EXCEPTION 'Governance record already exists for this work order' USING ERRCODE = '23505';
    END IF;

    v_affected_asset_id := COALESCE(p_affected_asset_id, v_wo.asset_id);
    v_affected_building_id := COALESCE(p_affected_building_id, v_wo.building_id);
    v_affected_floor_id := COALESCE(p_affected_floor_id, v_wo.floor_id);
    v_affected_room_id := COALESCE(p_affected_room_id, v_wo.room_id);
    IF v_affected_asset_id IS NULL AND v_affected_building_id IS NULL AND v_affected_floor_id IS NULL AND v_affected_room_id IS NULL THEN
        RAISE EXCEPTION 'Emergency override requires an affected asset or location' USING ERRCODE = '23502';
    END IF;
    IF NOT public.work_order_asset_location_is_valid(v_wo.tenant_id, v_affected_building_id, v_affected_floor_id, v_affected_room_id, v_affected_asset_id) THEN
        RAISE EXCEPTION 'Invalid affected asset or location for this tenant' USING ERRCODE = '42501';
    END IF;

    PERFORM public.start_work_order(p_work_order_id);

    INSERT INTO public.work_order_governance (
        tenant_id, work_order_id, route_type, governance_state, override_reason, override_severity,
        override_evidence, affected_asset_id, affected_building_id, affected_floor_id, affected_room_id,
        started_by, started_at, created_at, updated_at
    ) VALUES (
        v_wo.tenant_id, p_work_order_id, 'emergency_override', 'post_action_required', BTRIM(p_override_reason),
        p_override_severity, p_evidence, v_affected_asset_id, v_affected_building_id, v_affected_floor_id,
        v_affected_room_id, v_actor_id, NOW(), NOW(), NOW()
    ) RETURNING * INTO v_governance;

    PERFORM public.create_governance_log_event(
        v_governance.tenant_id, v_governance.work_order_id, 'Emergency override started', v_governance.override_reason,
        v_actor_id, 'governance.emergency_started', 'work_order_governance', v_governance.id,
        NULL, to_jsonb(v_governance), jsonb_build_object('started_via', 'start_work_order', 'override_severity', v_governance.override_severity)
    );

    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_work_order_id, 'governance_id', v_governance.id, 'governance_state', v_governance.governance_state, 'started_via', 'start_work_order');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_work_order_emergency(UUID, TEXT, TEXT, JSONB, UUID, UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_work_order_emergency(UUID, TEXT, TEXT, JSONB, UUID, UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_work_order_emergency(UUID, TEXT, TEXT, JSONB, UUID, UUID, UUID, UUID) TO authenticated;
COMMENT ON FUNCTION public.start_work_order_emergency(UUID, TEXT, TEXT, JSONB, UUID, UUID, UUID, UUID) IS 'Starts an emergency override through existing start_work_order(UUID), then creates governance state and audit event.';

CREATE OR REPLACE FUNCTION public.complete_emergency_post_action(
    p_work_order_id UUID,
    p_temp_action TEXT,
    p_verbal_approver_name TEXT DEFAULT NULL,
    p_verbal_approver_profile_id UUID DEFAULT NULL,
    p_post_action_deadline TIMESTAMPTZ DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::JSONB
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
    v_wo public.work_orders%ROWTYPE;
    v_governance public.work_order_governance%ROWTYPE;
    v_is_platform BOOLEAN := FALSE;
    v_is_management BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    IF COALESCE(BTRIM(p_temp_action), '') = '' THEN RAISE EXCEPTION 'Temporary action is required for emergency post-action completion' USING ERRCODE = '23502'; END IF;
    IF COALESCE(BTRIM(p_verbal_approver_name), '') = '' AND p_verbal_approver_profile_id IS NULL THEN
        RAISE EXCEPTION 'Verbal approver is required for emergency post-action completion' USING ERRCODE = '23502';
    END IF;
    IF p_post_action_deadline IS NULL THEN RAISE EXCEPTION 'Post-action approval deadline is required' USING ERRCODE = '23502'; END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot complete emergency post-action fields' USING ERRCODE = '42501'; END IF;

    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management := v_is_platform OR v_actor_role IN ('tenant_admin', 'maintenance_manager', 'engineer');
    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501'; END IF;
    IF v_actor_role NOT IN ('tenant_admin', 'maintenance_manager', 'engineer', 'technician', 'platform_owner', 'platform_admin') AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to complete emergency post-action fields' USING ERRCODE = '42501';
    END IF;
    IF NOT v_is_management AND v_wo.assigned_to IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the assigned technician or management can complete emergency post-action fields' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id AND route_type = 'emergency_override' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Emergency governance record not found' USING ERRCODE = 'P0002'; END IF;
    IF v_governance.governance_state <> 'post_action_required' THEN
        RAISE EXCEPTION 'Cannot complete post-action fields from governance_state: %', v_governance.governance_state USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE);
    PERFORM set_config('app.governance_event_type', 'governance.post_action_completed', TRUE);
    PERFORM set_config('app.governance_event_description', 'Emergency post-action fields completed', TRUE);
    PERFORM set_config('app.governance_event_context', COALESCE(p_details, '{}'::JSONB)::TEXT, TRUE);

    UPDATE public.work_order_governance
       SET governance_state = 'post_action_complete', temp_action = BTRIM(p_temp_action),
           verbal_approver_name = NULLIF(BTRIM(p_verbal_approver_name), ''),
           verbal_approver_profile_id = p_verbal_approver_profile_id,
           post_action_deadline = p_post_action_deadline,
           post_action_completed_by = v_actor_id,
           post_action_completed_at = NOW(), updated_at = NOW()
     WHERE id = v_governance.id
     RETURNING * INTO v_governance;

    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_work_order_id, 'governance_id', v_governance.id, 'governance_state', v_governance.governance_state);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_emergency_post_action(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_emergency_post_action(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_emergency_post_action(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_emergency_governance(p_work_order_id UUID, p_notes TEXT DEFAULT NULL)
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
    v_wo public.work_orders%ROWTYPE;
    v_governance public.work_order_governance%ROWTYPE;
    v_is_platform BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot approve emergency governance' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501'; END IF;
    IF v_actor_role NOT IN ('tenant_admin', 'maintenance_manager', 'engineer', 'supervisor', 'platform_owner', 'platform_admin') AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to approve emergency governance' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id AND route_type = 'emergency_override' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Emergency governance record not found' USING ERRCODE = 'P0002'; END IF;
    IF v_governance.governance_state <> 'post_action_complete' THEN
        RAISE EXCEPTION 'Cannot approve emergency governance from governance_state: %', v_governance.governance_state USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE);
    PERFORM set_config('app.governance_event_type', 'governance.approved', TRUE);
    PERFORM set_config('app.governance_event_description', 'Emergency governance approved', TRUE);
    PERFORM set_config('app.governance_event_context', jsonb_build_object('notes', p_notes)::TEXT, TRUE);
    UPDATE public.work_order_governance
       SET governance_state = 'approved', decision_by = v_actor_id, decision_at = NOW(),
           decision_notes = NULLIF(BTRIM(p_notes), ''), updated_at = NOW()
     WHERE id = v_governance.id
     RETURNING * INTO v_governance;
    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_work_order_id, 'governance_id', v_governance.id, 'governance_state', v_governance.governance_state);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_emergency_governance(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_emergency_governance(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_emergency_governance(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_emergency_governance(p_work_order_id UUID, p_reason TEXT)
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
    v_wo public.work_orders%ROWTYPE;
    v_governance public.work_order_governance%ROWTYPE;
    v_is_platform BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    IF COALESCE(BTRIM(p_reason), '') = '' THEN RAISE EXCEPTION 'Emergency governance rejection reason is required' USING ERRCODE = '23502'; END IF;
    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot reject emergency governance' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501'; END IF;
    IF v_actor_role NOT IN ('tenant_admin', 'maintenance_manager', 'engineer', 'supervisor', 'platform_owner', 'platform_admin') AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to reject emergency governance' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id AND route_type = 'emergency_override' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Emergency governance record not found' USING ERRCODE = 'P0002'; END IF;
    IF v_governance.governance_state <> 'post_action_complete' THEN
        RAISE EXCEPTION 'Cannot reject emergency governance from governance_state: %', v_governance.governance_state USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE);
    PERFORM set_config('app.governance_event_type', 'governance.rejected', TRUE);
    PERFORM set_config('app.governance_event_description', 'Emergency governance rejected', TRUE);
    PERFORM set_config('app.governance_event_context', jsonb_build_object('reason', BTRIM(p_reason))::TEXT, TRUE);
    UPDATE public.work_order_governance
       SET governance_state = 'rejected', decision_by = v_actor_id, decision_at = NOW(),
           rejection_reason = BTRIM(p_reason), updated_at = NOW()
     WHERE id = v_governance.id
     RETURNING * INTO v_governance;
    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_work_order_id, 'governance_id', v_governance.id, 'governance_state', v_governance.governance_state);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_emergency_governance(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_emergency_governance(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_emergency_governance(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.complete_emergency_post_action(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, JSONB) IS 'Completes required emergency post-action fields and moves governance_state to post_action_complete. State transition audit is automatic via trigger.';
COMMENT ON FUNCTION public.approve_emergency_governance(UUID, TEXT) IS 'Approves completed emergency governance. State transition audit is automatic via trigger.';
COMMENT ON FUNCTION public.reject_emergency_governance(UUID, TEXT) IS 'Rejects completed emergency governance with required reason. State transition audit is automatic via trigger.';
