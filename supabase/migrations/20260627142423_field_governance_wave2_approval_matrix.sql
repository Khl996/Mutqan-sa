-- =============================================================================
-- Migration: 132_field_governance_wave2_approval_matrix.sql
-- Purpose:
--   Phase 2 / Wave 2.2 Field Governance approval matrix.
-- =============================================================================

REVOKE ALL PRIVILEGES ON TABLE public.operation_log_events FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.operation_log_events FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.work_order_governance FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.work_order_governance FROM PUBLIC;
GRANT SELECT ON TABLE public.operation_log_events TO authenticated;
GRANT SELECT ON TABLE public.work_order_governance TO authenticated;

CREATE TABLE IF NOT EXISTS public.approval_matrix_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    rule_code TEXT NOT NULL,
    description TEXT,
    severity_min_rank INTEGER NOT NULL DEFAULT 1 CHECK (severity_min_rank BETWEEN 1 AND 5),
    criticality_min_rank INTEGER NOT NULL DEFAULT 1 CHECK (criticality_min_rank BETWEEN 1 AND 4),
    amount_min NUMERIC(12, 2),
    amount_max NUMERIC(12, 2),
    approval_tier TEXT NOT NULL CHECK (approval_tier IN ('auto','routine','supervisor','high_amount','critical_asset','life_safety')),
    required_approver_role TEXT NOT NULL CHECK (required_approver_role IN ('supervisor','engineer','facility_manager','maintenance_manager','tenant_admin')),
    escalation_role TEXT NOT NULL DEFAULT 'maintenance_manager' CHECK (escalation_role IN ('supervisor','engineer','facility_manager','maintenance_manager','tenant_admin')),
    auto_approve BOOLEAN NOT NULL DEFAULT FALSE,
    decision_deadline_hours INTEGER NOT NULL DEFAULT 24 CHECK (decision_deadline_hours BETWEEN 1 AND 720),
    priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT approval_matrix_rules_amount_range_check CHECK (amount_min IS NULL OR amount_max IS NULL OR amount_min <= amount_max),
    CONSTRAINT approval_matrix_rules_tenant_code_key UNIQUE (tenant_id, rule_code)
);

CREATE INDEX IF NOT EXISTS idx_approval_matrix_rules_tenant_active ON public.approval_matrix_rules(tenant_id, is_active, priority);
CREATE INDEX IF NOT EXISTS idx_approval_matrix_rules_thresholds ON public.approval_matrix_rules(tenant_id, severity_min_rank, criticality_min_rank, amount_min, amount_max) WHERE is_active;
ALTER TABLE public.approval_matrix_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "approval_matrix_rules_select_scoped" ON public.approval_matrix_rules;
CREATE POLICY "approval_matrix_rules_select_scoped" ON public.approval_matrix_rules FOR SELECT TO authenticated USING (public.pm_can_view_tenant(tenant_id));
REVOKE ALL PRIVILEGES ON TABLE public.approval_matrix_rules FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.approval_matrix_rules FROM PUBLIC;
GRANT SELECT ON TABLE public.approval_matrix_rules TO authenticated;

ALTER TABLE public.work_order_governance DROP CONSTRAINT IF EXISTS work_order_governance_governance_state_check;
ALTER TABLE public.work_order_governance ADD CONSTRAINT work_order_governance_governance_state_check CHECK (governance_state IN ('standard','pending_approval','post_action_required','post_action_complete','approved','rejected'));
ALTER TABLE public.work_order_governance
    ADD COLUMN IF NOT EXISTS approval_rule_id UUID,
    ADD COLUMN IF NOT EXISTS approval_tier TEXT,
    ADD COLUMN IF NOT EXISTS requested_approver_role TEXT,
    ADD COLUMN IF NOT EXISTS required_approver_role TEXT,
    ADD COLUMN IF NOT EXISTS escalated_from_role TEXT,
    ADD COLUMN IF NOT EXISTS approval_escalation_reason TEXT,
    ADD COLUMN IF NOT EXISTS approval_amount NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS approval_amount_source TEXT,
    ADD COLUMN IF NOT EXISTS severity_snapshot TEXT,
    ADD COLUMN IF NOT EXISTS asset_criticality_snapshot TEXT,
    ADD COLUMN IF NOT EXISTS approval_requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approval_due_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approval_escalated_at TIMESTAMPTZ;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_governance_approval_rule_id_fkey' AND conrelid = 'public.work_order_governance'::regclass) THEN
        ALTER TABLE public.work_order_governance ADD CONSTRAINT work_order_governance_approval_rule_id_fkey FOREIGN KEY (approval_rule_id) REFERENCES public.approval_matrix_rules(id) ON DELETE SET NULL;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_governance_approval_amount_source_check' AND conrelid = 'public.work_order_governance'::regclass) THEN
        ALTER TABLE public.work_order_governance ADD CONSTRAINT work_order_governance_approval_amount_source_check CHECK (approval_amount_source IS NULL OR approval_amount_source IN ('estimated_cost', 'none'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_governance_approval_roles_check' AND conrelid = 'public.work_order_governance'::regclass) THEN
        ALTER TABLE public.work_order_governance ADD CONSTRAINT work_order_governance_approval_roles_check CHECK ((requested_approver_role IS NULL OR requested_approver_role IN ('supervisor','engineer','facility_manager','maintenance_manager','tenant_admin')) AND (required_approver_role IS NULL OR required_approver_role IN ('supervisor','engineer','facility_manager','maintenance_manager','tenant_admin')) AND (escalated_from_role IS NULL OR escalated_from_role IN ('supervisor','engineer','facility_manager','maintenance_manager','tenant_admin')));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_work_order_governance_approval_rule ON public.work_order_governance(approval_rule_id);
CREATE INDEX IF NOT EXISTS idx_work_order_governance_decision_queue ON public.work_order_governance(tenant_id, required_approver_role, approval_due_at) WHERE governance_state IN ('pending_approval', 'post_action_complete');

CREATE OR REPLACE FUNCTION public.governance_severity_rank(p_severity TEXT) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT CASE COALESCE(BTRIM(p_severity), '') WHEN 'life_safety' THEN 5 WHEN 'critical' THEN 4 WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 2 END; $$;
CREATE OR REPLACE FUNCTION public.governance_criticality_rank(p_criticality TEXT) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT CASE COALESCE(BTRIM(p_criticality), '') WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 2 END; $$;
CREATE OR REPLACE FUNCTION public.governance_role_rank(p_role TEXT) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT CASE COALESCE(BTRIM(p_role), '') WHEN 'supervisor' THEN 2 WHEN 'engineer' THEN 3 WHEN 'facility_manager' THEN 4 WHEN 'maintenance_manager' THEN 4 WHEN 'tenant_admin' THEN 5 WHEN 'platform_admin' THEN 6 WHEN 'platform_owner' THEN 7 ELSE 0 END; $$;
CREATE OR REPLACE FUNCTION public.governance_next_escalation_role(p_role TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT CASE COALESCE(BTRIM(p_role), '') WHEN 'supervisor' THEN 'maintenance_manager' WHEN 'engineer' THEN 'maintenance_manager' WHEN 'facility_manager' THEN 'maintenance_manager' WHEN 'maintenance_manager' THEN 'tenant_admin' WHEN 'tenant_admin' THEN 'tenant_admin' ELSE 'maintenance_manager' END; $$;
CREATE OR REPLACE FUNCTION public.governance_actor_can_decide(p_actor_role TEXT, p_required_role TEXT, p_is_super_admin BOOLEAN DEFAULT FALSE) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(p_is_super_admin, FALSE) OR p_actor_role IN ('platform_owner', 'platform_admin') OR p_actor_role = 'tenant_admin' OR p_actor_role = p_required_role; $$;
CREATE OR REPLACE FUNCTION public.governance_has_active_approver(p_tenant_id UUID, p_role TEXT) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.tenant_id = p_tenant_id AND p.role = p_role AND COALESCE(p.is_active, TRUE) IS TRUE); $$;

CREATE OR REPLACE FUNCTION public.governance_resolve_required_role(p_tenant_id UUID, p_requested_role TEXT, p_escalation_role TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT := COALESCE(NULLIF(BTRIM(p_requested_role), ''), 'maintenance_manager'); v_next TEXT; v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF public.governance_has_active_approver(p_tenant_id, v_role) THEN
        RETURN jsonb_build_object('required_role', v_role, 'requested_role', v_role, 'escalated', FALSE, 'reason', NULL);
    END IF;
    v_next := COALESCE(NULLIF(BTRIM(p_escalation_role), ''), public.governance_next_escalation_role(v_role));
    LOOP
        IF v_next IS NULL OR v_next = ANY(v_seen) THEN EXIT; END IF;
        v_seen := array_append(v_seen, v_next);
        IF public.governance_has_active_approver(p_tenant_id, v_next) THEN
            RETURN jsonb_build_object('required_role', v_next, 'requested_role', v_role, 'escalated', TRUE, 'reason', 'no_active_approver_for_' || v_role);
        END IF;
        IF v_next = 'tenant_admin' THEN EXIT; END IF;
        v_next := public.governance_next_escalation_role(v_next);
    END LOOP;
    RETURN jsonb_build_object('required_role', 'tenant_admin', 'requested_role', v_role, 'escalated', TRUE, 'reason', 'no_active_approver_for_' || v_role);
END; $$;

CREATE OR REPLACE FUNCTION public.ensure_default_approval_matrix_rules(p_tenant_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'Tenant id is required for default approval matrix rules' USING ERRCODE = '23502'; END IF;
    INSERT INTO public.approval_matrix_rules (tenant_id, rule_code, description, severity_min_rank, criticality_min_rank, amount_min, amount_max, approval_tier, required_approver_role, escalation_role, auto_approve, decision_deadline_hours, priority)
    VALUES
        (p_tenant_id, 'life_safety_top', 'Life-safety override always maps to the top approval tier.', 5, 1, NULL, NULL, 'life_safety', 'tenant_admin', 'tenant_admin', FALSE, 4, 10),
        (p_tenant_id, 'critical_asset', 'Any work on a critical asset requires maintenance manager approval.', 1, 4, NULL, NULL, 'critical_asset', 'maintenance_manager', 'tenant_admin', FALSE, 24, 20),
        (p_tenant_id, 'high_amount', 'High estimated cost requires maintenance manager approval.', 1, 1, 10000, NULL, 'high_amount', 'maintenance_manager', 'tenant_admin', FALSE, 24, 30),
        (p_tenant_id, 'high_severity', 'High severity routine work requires supervisor approval.', 3, 1, NULL, NULL, 'supervisor', 'supervisor', 'maintenance_manager', FALSE, 24, 40),
        (p_tenant_id, 'routine_auto', 'Routine work below explicit escalation thresholds is auto-approved.', 1, 1, NULL, 9999.99, 'auto', 'supervisor', 'maintenance_manager', TRUE, 24, 100)
    ON CONFLICT (tenant_id, rule_code) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.select_approval_matrix_rule(p_tenant_id UUID, p_severity_rank INTEGER, p_criticality_rank INTEGER, p_amount NUMERIC) RETURNS public.approval_matrix_rules LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rule public.approval_matrix_rules%ROWTYPE; v_amount NUMERIC := COALESCE(p_amount, 0);
BEGIN
    PERFORM public.ensure_default_approval_matrix_rules(p_tenant_id);
    SELECT * INTO v_rule FROM public.approval_matrix_rules r WHERE r.tenant_id = p_tenant_id AND r.is_active IS TRUE AND p_severity_rank >= r.severity_min_rank AND p_criticality_rank >= r.criticality_min_rank AND (r.amount_min IS NULL OR v_amount >= r.amount_min) AND (r.amount_max IS NULL OR v_amount <= r.amount_max) ORDER BY r.priority ASC, r.created_at ASC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'No active approval matrix rule matched tenant %, severity rank %, criticality rank %, amount %', p_tenant_id, p_severity_rank, p_criticality_rank, p_amount USING ERRCODE = 'P0002'; END IF;
    RETURN v_rule;
END; $$;

REVOKE EXECUTE ON FUNCTION public.governance_has_active_approver(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.governance_resolve_required_role(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_default_approval_matrix_rules(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.select_approval_matrix_rule(UUID, INTEGER, INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.evaluate_work_order_approval(p_work_order_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_actor_id UUID := auth.uid(); v_actor_role TEXT; v_actor_tenant UUID; v_actor_active BOOLEAN; v_actor_super BOOLEAN := FALSE; v_is_platform BOOLEAN := FALSE;
    v_wo public.work_orders%ROWTYPE; v_governance public.work_order_governance%ROWTYPE; v_before_governance public.work_order_governance%ROWTYPE; v_rule public.approval_matrix_rules%ROWTYPE;
    v_asset_criticality TEXT := 'medium'; v_severity TEXT; v_severity_rank INTEGER; v_criticality_rank INTEGER; v_amount NUMERIC; v_amount_source TEXT := 'none';
    v_role_resolution JSONB; v_requested_role TEXT; v_required_role TEXT; v_escalated BOOLEAN; v_escalation_reason TEXT; v_route_type TEXT := 'standard'; v_context JSONB;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE) INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot evaluate governance approval' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501'; END IF;
    IF NOT v_is_platform AND NOT public.can_manage_work_orders_scope(v_wo.tenant_id) AND v_actor_role NOT IN ('tenant_admin', 'maintenance_manager', 'supervisor', 'engineer') THEN RAISE EXCEPTION 'Unauthorized: your role is not permitted to evaluate governance approval' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id FOR UPDATE;
    IF FOUND THEN
        v_route_type := v_governance.route_type;
    ELSE
        INSERT INTO public.work_order_governance (tenant_id, work_order_id, route_type, governance_state) VALUES (v_wo.tenant_id, v_wo.id, 'standard', 'standard') RETURNING * INTO v_governance;
    END IF;
    IF v_route_type = 'standard' AND v_wo.status NOT IN ('pending', 'assigned') THEN RAISE EXCEPTION 'Standard governance approval can only be evaluated before work starts; current status=%', v_wo.status USING ERRCODE = '22023'; END IF;
    IF v_wo.asset_id IS NOT NULL THEN SELECT COALESCE(a.criticality, 'medium') INTO v_asset_criticality FROM public.assets a WHERE a.id = v_wo.asset_id; v_asset_criticality := COALESCE(v_asset_criticality, 'medium'); END IF;
    IF v_route_type = 'emergency_override' THEN v_severity := COALESCE(v_governance.override_severity, v_wo.priority::TEXT, 'medium'); ELSE v_severity := CASE v_wo.priority WHEN 'urgent' THEN 'critical' WHEN 'high' THEN 'high' WHEN 'medium' THEN 'medium' WHEN 'low' THEN 'low' ELSE 'medium' END; END IF;
    IF v_wo.estimated_cost IS NOT NULL AND v_wo.estimated_cost >= 0 THEN v_amount := v_wo.estimated_cost; v_amount_source := 'estimated_cost'; ELSE v_amount := NULL; v_amount_source := 'none'; END IF;
    v_severity_rank := public.governance_severity_rank(v_severity); v_criticality_rank := public.governance_criticality_rank(v_asset_criticality);
    v_rule := public.select_approval_matrix_rule(v_wo.tenant_id, v_severity_rank, v_criticality_rank, v_amount);
    v_role_resolution := public.governance_resolve_required_role(v_wo.tenant_id, v_rule.required_approver_role, v_rule.escalation_role);
    v_requested_role := v_role_resolution->>'requested_role'; v_required_role := v_role_resolution->>'required_role'; v_escalated := COALESCE((v_role_resolution->>'escalated')::BOOLEAN, FALSE); v_escalation_reason := v_role_resolution->>'reason';
    v_context := jsonb_build_object('decision_mode', CASE WHEN v_rule.auto_approve THEN 'auto' ELSE 'manual_required' END, 'route_type', v_route_type, 'approval_rule_id', v_rule.id, 'approval_tier', v_rule.approval_tier, 'requested_approver_role', v_requested_role, 'required_approver_role', v_required_role, 'severity', v_severity, 'severity_rank', v_severity_rank, 'asset_criticality', v_asset_criticality, 'asset_criticality_rank', v_criticality_rank, 'amount', v_amount, 'amount_source', v_amount_source, 'escalated', v_escalated, 'escalation_reason', v_escalation_reason);
    v_before_governance := v_governance;
    UPDATE public.work_order_governance SET approval_rule_id = v_rule.id, approval_tier = v_rule.approval_tier, requested_approver_role = v_requested_role, required_approver_role = v_required_role, escalated_from_role = CASE WHEN v_escalated THEN v_requested_role ELSE NULL END, approval_escalation_reason = CASE WHEN v_escalated THEN v_escalation_reason ELSE NULL END, approval_amount = v_amount, approval_amount_source = v_amount_source, severity_snapshot = v_severity, asset_criticality_snapshot = v_asset_criticality, approval_requested_by = v_actor_id, approval_requested_at = COALESCE(approval_requested_at, NOW()), approval_due_at = NOW() + make_interval(hours => v_rule.decision_deadline_hours), approval_escalated_at = CASE WHEN v_escalated THEN NOW() ELSE approval_escalated_at END, updated_at = NOW() WHERE id = v_governance.id RETURNING * INTO v_governance;
    IF v_route_type = 'emergency_override' THEN
        PERFORM public.create_governance_log_event(v_wo.tenant_id, v_wo.id, 'Approval matrix evaluated for emergency governance', NULL, v_actor_id, 'governance.approval_matrix_evaluated', 'work_order_governance', v_governance.id, to_jsonb(v_before_governance), to_jsonb(v_governance), v_context);
        IF v_escalated THEN PERFORM public.create_governance_log_event(v_wo.tenant_id, v_wo.id, 'Governance approval escalated because the requested approver role has no active approver', v_escalation_reason, v_actor_id, 'governance.approval_escalated', 'work_order_governance', v_governance.id, to_jsonb(v_before_governance), to_jsonb(v_governance), v_context); END IF;
        RETURN jsonb_build_object('success', TRUE, 'work_order_id', v_wo.id, 'governance_id', v_governance.id, 'route_type', v_route_type, 'governance_state', v_governance.governance_state, 'approval_rule_id', v_rule.id, 'approval_tier', v_rule.approval_tier, 'requested_approver_role', v_requested_role, 'required_approver_role', v_required_role, 'escalated', v_escalated, 'amount', v_amount, 'amount_source', v_amount_source);
    END IF;
    IF v_governance.governance_state NOT IN ('pending_approval', 'approved') THEN
        PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE); PERFORM set_config('app.governance_event_type', 'governance.approval_requested', TRUE); PERFORM set_config('app.governance_event_description', 'Standard work order approval requested by approval matrix', TRUE); PERFORM set_config('app.governance_event_context', v_context::TEXT, TRUE);
        UPDATE public.work_order_governance SET governance_state = 'pending_approval', updated_at = NOW() WHERE id = v_governance.id RETURNING * INTO v_governance;
    END IF;
    IF v_escalated THEN PERFORM public.create_governance_log_event(v_wo.tenant_id, v_wo.id, 'Governance approval escalated because the requested approver role has no active approver', v_escalation_reason, v_actor_id, 'governance.approval_escalated', 'work_order_governance', v_governance.id, to_jsonb(v_before_governance), to_jsonb(v_governance), v_context); END IF;
    IF v_rule.auto_approve THEN
        PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE); PERFORM set_config('app.governance_event_type', 'governance.approved', TRUE); PERFORM set_config('app.governance_event_description', 'Standard work order auto-approved by approval matrix', TRUE); PERFORM set_config('app.governance_event_context', (v_context || jsonb_build_object('decision_mode', 'auto'))::TEXT, TRUE);
        UPDATE public.work_order_governance SET governance_state = 'approved', decision_by = v_actor_id, decision_at = NOW(), decision_notes = 'Auto-approved by approval matrix', updated_at = NOW() WHERE id = v_governance.id RETURNING * INTO v_governance;
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'work_order_id', v_wo.id, 'governance_id', v_governance.id, 'route_type', v_route_type, 'governance_state', v_governance.governance_state, 'approval_rule_id', v_rule.id, 'approval_tier', v_rule.approval_tier, 'requested_approver_role', v_requested_role, 'required_approver_role', v_required_role, 'escalated', v_escalated, 'amount', v_amount, 'amount_source', v_amount_source);
END; $$;
REVOKE EXECUTE ON FUNCTION public.evaluate_work_order_approval(UUID) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.evaluate_work_order_approval(UUID) FROM anon; GRANT EXECUTE ON FUNCTION public.evaluate_work_order_approval(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_governance_decision(p_work_order_id UUID, p_notes TEXT DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor_id UUID := auth.uid(); v_actor_role TEXT; v_actor_tenant UUID; v_actor_active BOOLEAN; v_actor_super BOOLEAN := FALSE; v_is_platform BOOLEAN := FALSE; v_wo public.work_orders%ROWTYPE; v_governance public.work_order_governance%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE) INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot approve governance decisions' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin'); IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id AND route_type = 'standard' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Standard governance record not found' USING ERRCODE = 'P0002'; END IF;
    IF v_governance.governance_state <> 'pending_approval' THEN RAISE EXCEPTION 'Cannot approve standard governance from governance_state: %', v_governance.governance_state USING ERRCODE = '22023'; END IF;
    IF NOT public.governance_actor_can_decide(v_actor_role, v_governance.required_approver_role, v_actor_super) THEN RAISE EXCEPTION 'Unauthorized: required approver role is %, your role is %', v_governance.required_approver_role, v_actor_role USING ERRCODE = '42501'; END IF;
    PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE); PERFORM set_config('app.governance_event_type', 'governance.approved', TRUE); PERFORM set_config('app.governance_event_description', 'Standard governance approved', TRUE); PERFORM set_config('app.governance_event_context', jsonb_build_object('decision_mode', 'manual', 'notes', p_notes, 'required_approver_role', v_governance.required_approver_role, 'approval_tier', v_governance.approval_tier)::TEXT, TRUE);
    UPDATE public.work_order_governance SET governance_state = 'approved', decision_by = v_actor_id, decision_at = NOW(), decision_notes = NULLIF(BTRIM(p_notes), ''), updated_at = NOW() WHERE id = v_governance.id RETURNING * INTO v_governance;
    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_work_order_id, 'governance_id', v_governance.id, 'governance_state', v_governance.governance_state, 'required_approver_role', v_governance.required_approver_role);
END; $$;

CREATE OR REPLACE FUNCTION public.reject_governance_decision(p_work_order_id UUID, p_reason TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor_id UUID := auth.uid(); v_actor_role TEXT; v_actor_tenant UUID; v_actor_active BOOLEAN; v_actor_super BOOLEAN := FALSE; v_is_platform BOOLEAN := FALSE; v_wo public.work_orders%ROWTYPE; v_governance public.work_order_governance%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    IF COALESCE(BTRIM(p_reason), '') = '' THEN RAISE EXCEPTION 'Standard governance rejection reason is required' USING ERRCODE = '23502'; END IF;
    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE) INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot reject governance decisions' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin'); IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id AND route_type = 'standard' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Standard governance record not found' USING ERRCODE = 'P0002'; END IF;
    IF v_governance.governance_state <> 'pending_approval' THEN RAISE EXCEPTION 'Cannot reject standard governance from governance_state: %', v_governance.governance_state USING ERRCODE = '22023'; END IF;
    IF NOT public.governance_actor_can_decide(v_actor_role, v_governance.required_approver_role, v_actor_super) THEN RAISE EXCEPTION 'Unauthorized: required approver role is %, your role is %', v_governance.required_approver_role, v_actor_role USING ERRCODE = '42501'; END IF;
    PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE); PERFORM set_config('app.governance_event_type', 'governance.rejected', TRUE); PERFORM set_config('app.governance_event_description', 'Standard governance rejected', TRUE); PERFORM set_config('app.governance_event_context', jsonb_build_object('reason', BTRIM(p_reason), 'required_approver_role', v_governance.required_approver_role, 'approval_tier', v_governance.approval_tier)::TEXT, TRUE);
    UPDATE public.work_order_governance SET governance_state = 'rejected', decision_by = v_actor_id, decision_at = NOW(), rejection_reason = BTRIM(p_reason), updated_at = NOW() WHERE id = v_governance.id RETURNING * INTO v_governance;
    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_work_order_id, 'governance_id', v_governance.id, 'governance_state', v_governance.governance_state, 'required_approver_role', v_governance.required_approver_role);
END; $$;
REVOKE EXECUTE ON FUNCTION public.approve_governance_decision(UUID, TEXT) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.approve_governance_decision(UUID, TEXT) FROM anon; GRANT EXECUTE ON FUNCTION public.approve_governance_decision(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_governance_decision(UUID, TEXT) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.reject_governance_decision(UUID, TEXT) FROM anon; GRANT EXECUTE ON FUNCTION public.reject_governance_decision(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_governance_decision_queue() RETURNS TABLE (governance_id UUID, work_order_id UUID, work_order_code TEXT, work_order_title TEXT, route_type TEXT, governance_state TEXT, approval_tier TEXT, required_approver_role TEXT, approval_amount NUMERIC, approval_amount_source TEXT, severity_snapshot TEXT, asset_criticality_snapshot TEXT, approval_due_at TIMESTAMPTZ, created_at TIMESTAMPTZ) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor_id UUID := auth.uid(); v_actor_role TEXT; v_actor_tenant UUID; v_actor_active BOOLEAN; v_actor_super BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE) INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot read governance decision queue' USING ERRCODE = '42501'; END IF;
    RETURN QUERY SELECT g.id, g.work_order_id, w.code::TEXT, w.title::TEXT, g.route_type, g.governance_state, g.approval_tier, g.required_approver_role, g.approval_amount, g.approval_amount_source, g.severity_snapshot, g.asset_criticality_snapshot, g.approval_due_at, g.created_at FROM public.work_order_governance g JOIN public.work_orders w ON w.id = g.work_order_id WHERE ((v_actor_super OR v_actor_role IN ('platform_owner','platform_admin')) OR (w.tenant_id = v_actor_tenant AND g.required_approver_role = v_actor_role)) AND (g.governance_state = 'pending_approval' OR (g.route_type = 'emergency_override' AND g.governance_state = 'post_action_complete')) ORDER BY g.approval_due_at NULLS LAST, g.created_at ASC;
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_governance_decision_queue() FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.get_governance_decision_queue() FROM anon; GRANT EXECUTE ON FUNCTION public.get_governance_decision_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_standard_governance_before_work_order_start() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_governance_state TEXT;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status <> 'in_progress' THEN RETURN NEW; END IF;
    SELECT governance_state INTO v_governance_state FROM public.work_order_governance WHERE work_order_id = NEW.id AND route_type = 'standard';
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF v_governance_state = 'pending_approval' THEN RAISE EXCEPTION 'Standard work order cannot start while governance approval is pending; governance_state=pending_approval' USING ERRCODE = '42501'; END IF;
    IF v_governance_state = 'rejected' THEN RAISE EXCEPTION 'Standard work order cannot start after governance rejection; governance_state=rejected' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_standard_governance_before_work_order_start ON public.work_orders;
CREATE TRIGGER trg_guard_standard_governance_before_work_order_start BEFORE UPDATE OF status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.guard_standard_governance_before_work_order_start();

CREATE OR REPLACE FUNCTION public.close_rejected_emergency_work_order(p_work_order_id UUID, p_notes TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor_id UUID := auth.uid(); v_actor_role TEXT; v_actor_tenant UUID; v_actor_active BOOLEAN; v_actor_super BOOLEAN := FALSE; v_is_platform BOOLEAN := FALSE; v_wo public.work_orders%ROWTYPE; v_before_wo public.work_orders%ROWTYPE; v_governance public.work_order_governance%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE) INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot close rejected emergency governance' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
    v_before_wo := v_wo; v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501'; END IF;
    IF v_actor_role NOT IN ('tenant_admin','maintenance_manager','platform_owner','platform_admin') AND NOT v_actor_super THEN RAISE EXCEPTION 'Unauthorized: your role is not permitted to close rejected emergency governance' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id AND route_type = 'emergency_override' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Emergency governance record not found' USING ERRCODE = 'P0002'; END IF;
    IF v_governance.governance_state <> 'rejected' THEN RAISE EXCEPTION 'Cannot close rejected emergency exception from governance_state: %', v_governance.governance_state USING ERRCODE = '22023'; END IF;
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);
    UPDATE public.work_orders SET status = 'rejected', end_time = COALESCE(end_time, NOW()), updated_at = NOW() WHERE id = p_work_order_id RETURNING * INTO v_wo;
    PERFORM public.create_governance_log_event(v_wo.tenant_id, v_wo.id, 'Rejected emergency governance exception closed', NULLIF(BTRIM(p_notes), ''), v_actor_id, 'governance.rejected_exception_closed', 'work_order_governance', v_governance.id, jsonb_build_object('governance_state', v_governance.governance_state, 'work_order_status', v_before_wo.status), jsonb_build_object('governance_state', v_governance.governance_state, 'work_order_status', v_wo.status), jsonb_build_object('notes', p_notes, 'route_type', v_governance.route_type));
    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_work_order_id, 'status', v_wo.status, 'governance_state', v_governance.governance_state);
END; $$;
REVOKE EXECUTE ON FUNCTION public.close_rejected_emergency_work_order(UUID, TEXT) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.close_rejected_emergency_work_order(UUID, TEXT) FROM anon; GRANT EXECUTE ON FUNCTION public.close_rejected_emergency_work_order(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_emergency_governance(p_work_order_id UUID, p_notes TEXT DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor_id UUID := auth.uid(); v_actor_role TEXT; v_actor_tenant UUID; v_actor_active BOOLEAN; v_actor_super BOOLEAN := FALSE; v_wo public.work_orders%ROWTYPE; v_governance public.work_order_governance%ROWTYPE; v_is_platform BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE) INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot approve emergency governance' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner','platform_admin'); IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id AND route_type = 'emergency_override' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Emergency governance record not found' USING ERRCODE = 'P0002'; END IF;
    IF v_governance.required_approver_role IS NULL THEN PERFORM public.evaluate_work_order_approval(p_work_order_id); SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id AND route_type = 'emergency_override' FOR UPDATE; END IF;
    IF v_governance.required_approver_role IS NOT NULL AND NOT public.governance_actor_can_decide(v_actor_role, v_governance.required_approver_role, v_actor_super) THEN RAISE EXCEPTION 'Unauthorized: required approver role is %, your role is %', v_governance.required_approver_role, v_actor_role USING ERRCODE = '42501'; END IF;
    IF v_actor_role NOT IN ('tenant_admin','maintenance_manager','engineer','supervisor','platform_owner','platform_admin') AND NOT v_actor_super THEN RAISE EXCEPTION 'Unauthorized: your role is not permitted to approve emergency governance' USING ERRCODE = '42501'; END IF;
    IF v_governance.governance_state <> 'post_action_complete' THEN RAISE EXCEPTION 'Cannot approve emergency governance from governance_state: %', v_governance.governance_state USING ERRCODE = '22023'; END IF;
    PERFORM set_config('app.governance_workflow_authorized','true',TRUE); PERFORM set_config('app.governance_event_type','governance.approved',TRUE); PERFORM set_config('app.governance_event_description','Emergency governance approved',TRUE); PERFORM set_config('app.governance_event_context', jsonb_build_object('notes', p_notes, 'decision_mode', 'manual', 'required_approver_role', v_governance.required_approver_role, 'approval_tier', v_governance.approval_tier)::TEXT, TRUE);
    UPDATE public.work_order_governance SET governance_state = 'approved', decision_by = v_actor_id, decision_at = NOW(), decision_notes = NULLIF(BTRIM(p_notes), ''), updated_at = NOW() WHERE id = v_governance.id RETURNING * INTO v_governance;
    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_work_order_id, 'governance_id', v_governance.id, 'governance_state', v_governance.governance_state, 'required_approver_role', v_governance.required_approver_role);
END; $$;

CREATE OR REPLACE FUNCTION public.reject_emergency_governance(p_work_order_id UUID, p_reason TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor_id UUID := auth.uid(); v_actor_role TEXT; v_actor_tenant UUID; v_actor_active BOOLEAN; v_actor_super BOOLEAN := FALSE; v_wo public.work_orders%ROWTYPE; v_governance public.work_order_governance%ROWTYPE; v_is_platform BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
    IF COALESCE(BTRIM(p_reason), '') = '' THEN RAISE EXCEPTION 'Emergency governance rejection reason is required' USING ERRCODE = '23502'; END IF;
    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE) INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super FROM public.profiles WHERE id = v_actor_id;
    IF v_actor_role IS NULL AND NOT v_actor_super THEN RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000'; END IF;
    IF NOT COALESCE(v_actor_active, FALSE) THEN RAISE EXCEPTION 'Inactive users cannot reject emergency governance' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002'; END IF;
    v_is_platform := v_actor_super OR v_actor_role IN ('platform_owner','platform_admin'); IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN RAISE EXCEPTION 'Access denied: work order belongs to a different tenant' USING ERRCODE = '42501'; END IF;
    SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id AND route_type = 'emergency_override' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Emergency governance record not found' USING ERRCODE = 'P0002'; END IF;
    IF v_governance.required_approver_role IS NULL THEN PERFORM public.evaluate_work_order_approval(p_work_order_id); SELECT * INTO v_governance FROM public.work_order_governance WHERE work_order_id = p_work_order_id AND route_type = 'emergency_override' FOR UPDATE; END IF;
    IF v_governance.required_approver_role IS NOT NULL AND NOT public.governance_actor_can_decide(v_actor_role, v_governance.required_approver_role, v_actor_super) THEN RAISE EXCEPTION 'Unauthorized: required approver role is %, your role is %', v_governance.required_approver_role, v_actor_role USING ERRCODE = '42501'; END IF;
    IF v_actor_role NOT IN ('tenant_admin','maintenance_manager','engineer','supervisor','platform_owner','platform_admin') AND NOT v_actor_super THEN RAISE EXCEPTION 'Unauthorized: your role is not permitted to reject emergency governance' USING ERRCODE = '42501'; END IF;
    IF v_governance.governance_state <> 'post_action_complete' THEN RAISE EXCEPTION 'Cannot reject emergency governance from governance_state: %', v_governance.governance_state USING ERRCODE = '22023'; END IF;
    PERFORM set_config('app.governance_workflow_authorized','true',TRUE); PERFORM set_config('app.governance_event_type','governance.rejected',TRUE); PERFORM set_config('app.governance_event_description','Emergency governance rejected',TRUE); PERFORM set_config('app.governance_event_context', jsonb_build_object('reason', BTRIM(p_reason), 'required_approver_role', v_governance.required_approver_role, 'approval_tier', v_governance.approval_tier)::TEXT, TRUE);
    UPDATE public.work_order_governance SET governance_state = 'rejected', decision_by = v_actor_id, decision_at = NOW(), rejection_reason = BTRIM(p_reason), updated_at = NOW() WHERE id = v_governance.id RETURNING * INTO v_governance;
    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_work_order_id, 'governance_id', v_governance.id, 'governance_state', v_governance.governance_state, 'required_approver_role', v_governance.required_approver_role);
END; $$;
REVOKE EXECUTE ON FUNCTION public.approve_emergency_governance(UUID, TEXT) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.approve_emergency_governance(UUID, TEXT) FROM anon; GRANT EXECUTE ON FUNCTION public.approve_emergency_governance(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_emergency_governance(UUID, TEXT) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.reject_emergency_governance(UUID, TEXT) FROM anon; GRANT EXECUTE ON FUNCTION public.reject_emergency_governance(UUID, TEXT) TO authenticated;

