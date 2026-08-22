-- Phase 2 Wave 3.2/2.3: WhatsApp-compatible governance decision tokens.
--
-- Safe simulation only: no provider integration. Raw tokens are returned once by
-- the issuance RPC, never stored. Consumption verifies the real Supabase session
-- identity (auth.uid()) matches the bound intended_actor_id, then calls the same
-- governance decision RPCs that power in-app approvals/rejections.

CREATE TABLE IF NOT EXISTS public.governance_decision_action_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
    governance_id UUID NOT NULL REFERENCES public.work_order_governance(id) ON DELETE CASCADE,
    intended_actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    delegation_id UUID REFERENCES public.governance_delegations(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('approve', 'reject')),
    route_type TEXT NOT NULL CHECK (route_type IN ('standard', 'emergency_override')),
    required_approver_role TEXT NOT NULL CHECK (
        required_approver_role IN ('supervisor', 'engineer', 'facility_manager', 'maintenance_manager', 'tenant_admin')
    ),
    token_hash BYTEA NOT NULL UNIQUE,
    channel TEXT NOT NULL DEFAULT 'whatsapp_simulation' CHECK (
        channel IN ('whatsapp_simulation', 'manual_simulation', 'webhook_compatible')
    ),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decision_result JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    CONSTRAINT governance_decision_action_tokens_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT governance_decision_action_tokens_use_pair_check CHECK (
        (used_at IS NULL AND used_by IS NULL)
        OR (used_at IS NOT NULL AND used_by IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_governance_decision_action_tokens_tenant
    ON public.governance_decision_action_tokens(tenant_id);

CREATE INDEX IF NOT EXISTS idx_governance_decision_action_tokens_governance
    ON public.governance_decision_action_tokens(governance_id);

CREATE INDEX IF NOT EXISTS idx_governance_decision_action_tokens_work_order
    ON public.governance_decision_action_tokens(work_order_id);

CREATE INDEX IF NOT EXISTS idx_governance_decision_action_tokens_intended_actor
    ON public.governance_decision_action_tokens(intended_actor_id);

CREATE INDEX IF NOT EXISTS idx_governance_decision_action_tokens_unused_expiry
    ON public.governance_decision_action_tokens(expires_at)
    WHERE used_at IS NULL;

COMMENT ON TABLE public.governance_decision_action_tokens IS
    'Hash-only, single-use, expiring governance decision tokens for WhatsApp/webhook-compatible simulation. Raw token is never stored.';

COMMENT ON COLUMN public.governance_decision_action_tokens.token_hash IS
    'SHA-256 hash of the raw action token. The raw token is returned once by create_governance_decision_action_token and is never stored.';

ALTER TABLE public.governance_decision_action_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "governance_decision_action_tokens_select_scoped"
    ON public.governance_decision_action_tokens;

CREATE POLICY "governance_decision_action_tokens_select_scoped"
ON public.governance_decision_action_tokens
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

REVOKE ALL PRIVILEGES ON TABLE public.governance_decision_action_tokens FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.governance_decision_action_tokens FROM PUBLIC;
GRANT SELECT ON TABLE public.governance_decision_action_tokens TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_governance_decision_action_tokens_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_authorized BOOLEAN;
BEGIN
    v_authorized := COALESCE(
        current_setting('app.governance_token_authorized', TRUE) = 'true',
        FALSE
    );

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'Direct mutation of governance_decision_action_tokens is not permitted. Use governance token RPCs.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'governance_decision_action_tokens cannot be deleted; consume or expire tokens instead'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.token_hash IS DISTINCT FROM OLD.token_hash THEN
            RAISE EXCEPTION 'Token hash cannot be changed after issuance'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.work_order_id IS DISTINCT FROM OLD.work_order_id
           OR NEW.governance_id IS DISTINCT FROM OLD.governance_id
           OR NEW.intended_actor_id IS DISTINCT FROM OLD.intended_actor_id
           OR NEW.delegation_id IS DISTINCT FROM OLD.delegation_id
           OR NEW.action IS DISTINCT FROM OLD.action
           OR NEW.route_type IS DISTINCT FROM OLD.route_type
           OR NEW.required_approver_role IS DISTINCT FROM OLD.required_approver_role
           OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
        THEN
            RAISE EXCEPTION 'Issued governance decision token bindings cannot be changed'
                USING ERRCODE = '42501';
        END IF;

        IF OLD.used_at IS NOT NULL THEN
            RAISE EXCEPTION 'Used governance decision tokens are immutable'
                USING ERRCODE = '42501';
        END IF;

        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_governance_decision_action_tokens_mutation
    ON public.governance_decision_action_tokens;

CREATE TRIGGER trg_guard_governance_decision_action_tokens_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.governance_decision_action_tokens
FOR EACH ROW
EXECUTE FUNCTION public.guard_governance_decision_action_tokens_mutation();

CREATE OR REPLACE FUNCTION public.create_governance_decision_action_token(
    p_governance_id UUID,
    p_action TEXT,
    p_intended_actor_id UUID,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_channel TEXT DEFAULT 'whatsapp_simulation',
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator_id UUID := auth.uid();
    v_creator_role TEXT;
    v_creator_tenant UUID;
    v_creator_active BOOLEAN;
    v_creator_super BOOLEAN := FALSE;
    v_creator_platform BOOLEAN := FALSE;
    v_intended public.profiles%ROWTYPE;
    v_governance public.work_order_governance%ROWTYPE;
    v_work_order_tenant UUID;
    v_authority JSONB := '{}'::JSONB;
    v_token_raw TEXT;
    v_token public.governance_decision_action_tokens%ROWTYPE;
    v_expires_at TIMESTAMPTZ;
    v_action TEXT;
    v_channel TEXT;
BEGIN
    IF v_creator_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create governance decision token'
            USING ERRCODE = '28000';
    END IF;

    v_action := LOWER(BTRIM(COALESCE(p_action, '')));
    IF v_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid governance decision token action: %', p_action
            USING ERRCODE = '22023';
    END IF;

    v_channel := COALESCE(NULLIF(BTRIM(p_channel), ''), 'whatsapp_simulation');
    IF v_channel NOT IN ('whatsapp_simulation', 'manual_simulation', 'webhook_compatible') THEN
        RAISE EXCEPTION 'Invalid governance decision token channel: %', p_channel
            USING ERRCODE = '22023';
    END IF;

    v_expires_at := COALESCE(p_expires_at, NOW() + INTERVAL '30 minutes');
    IF v_expires_at <= NOW() THEN
        RAISE EXCEPTION 'Governance decision token expiry must be in the future'
            USING ERRCODE = '22023';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_creator_role, v_creator_tenant, v_creator_active, v_creator_super
      FROM public.profiles
     WHERE id = v_creator_id;

    IF v_creator_role IS NULL AND NOT v_creator_super THEN
        RAISE EXCEPTION 'Caller profile not found'
            USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_creator_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot create governance decision tokens'
            USING ERRCODE = '42501';
    END IF;

    v_creator_platform := v_creator_super OR v_creator_role IN ('platform_owner', 'platform_admin');

    SELECT *
      INTO v_governance
      FROM public.work_order_governance
     WHERE id = p_governance_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Governance record not found for decision token'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT tenant_id
      INTO v_work_order_tenant
      FROM public.work_orders
     WHERE id = v_governance.work_order_id
       AND tenant_id = v_governance.tenant_id;

    IF v_work_order_tenant IS NULL THEN
        RAISE EXCEPTION 'Work order not found for governance decision token'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT v_creator_platform AND v_creator_tenant IS DISTINCT FROM v_governance.tenant_id THEN
        RAISE EXCEPTION 'Access denied: governance decision token belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF NOT (
        (v_governance.route_type = 'standard' AND v_governance.governance_state = 'pending_approval')
        OR (v_governance.route_type = 'emergency_override' AND v_governance.governance_state = 'post_action_complete')
    ) THEN
        RAISE EXCEPTION 'Governance decision token can only be issued for pending approval decisions; route_type=%, governance_state=%',
            v_governance.route_type,
            v_governance.governance_state
            USING ERRCODE = '22023';
    END IF;

    IF v_governance.required_approver_role IS NULL THEN
        RAISE EXCEPTION 'Governance decision token requires a required_approver_role'
            USING ERRCODE = '23502';
    END IF;

    SELECT *
      INTO v_intended
      FROM public.profiles
     WHERE id = p_intended_actor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Intended actor profile not found for governance decision token'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT COALESCE(v_intended.is_active, TRUE) THEN
        RAISE EXCEPTION 'Inactive users cannot receive governance decision tokens'
            USING ERRCODE = '42501';
    END IF;

    IF NOT (COALESCE(v_intended.is_super_admin, FALSE) OR v_intended.role IN ('platform_owner', 'platform_admin'))
       AND v_intended.tenant_id IS DISTINCT FROM v_governance.tenant_id
    THEN
        RAISE EXCEPTION 'Intended actor must belong to the governance tenant or be a platform approver'
            USING ERRCODE = '42501';
    END IF;

    v_authority := public.governance_resolve_decision_actor(p_intended_actor_id, v_governance.id);

    IF NOT (
        v_creator_platform
        OR v_creator_role = 'tenant_admin'
        OR (
            v_creator_id = p_intended_actor_id
            AND COALESCE((v_authority->>'authorized')::BOOLEAN, FALSE)
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized: only tenant admins/platform admins may issue tokens for another actor; self-issued tokens require current decision authority'
            USING ERRCODE = '42501';
    END IF;

    v_token_raw := encode(gen_random_bytes(32), 'hex');

    PERFORM set_config('app.governance_token_authorized', 'true', TRUE);

    INSERT INTO public.governance_decision_action_tokens (
        tenant_id,
        work_order_id,
        governance_id,
        intended_actor_id,
        delegation_id,
        action,
        route_type,
        required_approver_role,
        token_hash,
        channel,
        expires_at,
        created_by,
        metadata
    ) VALUES (
        v_governance.tenant_id,
        v_governance.work_order_id,
        v_governance.id,
        p_intended_actor_id,
        NULLIF(v_authority->>'delegation_id', '')::UUID,
        v_action,
        v_governance.route_type,
        v_governance.required_approver_role,
        digest(v_token_raw, 'sha256'),
        v_channel,
        v_expires_at,
        v_creator_id,
        COALESCE(p_metadata, '{}'::JSONB)
    )
    RETURNING * INTO v_token;

    PERFORM set_config('app.governance_token_authorized', 'false', TRUE);

    RETURN jsonb_build_object(
        'success', TRUE,
        'token_id', v_token.id,
        'raw_token', v_token_raw,
        'tenant_id', v_token.tenant_id,
        'work_order_id', v_token.work_order_id,
        'governance_id', v_token.governance_id,
        'intended_actor_id', v_token.intended_actor_id,
        'delegation_id', v_token.delegation_id,
        'action', v_token.action,
        'route_type', v_token.route_type,
        'required_approver_role', v_token.required_approver_role,
        'expires_at', v_token.expires_at,
        'channel', v_token.channel,
        'token_display', RIGHT(v_token_raw, 8),
        'authority_snapshot', v_authority
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_governance_decision_action_token(
    p_token TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_token public.governance_decision_action_tokens%ROWTYPE;
    v_governance public.work_order_governance%ROWTYPE;
    v_decision_authority JSONB;
    v_decision_result JSONB;
BEGIN
    IF COALESCE(BTRIM(p_token), '') = '' THEN
        RAISE EXCEPTION 'Governance decision token is required'
            USING ERRCODE = '23502';
    END IF;

    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required for governance decision token'
            USING ERRCODE = '28000';
    END IF;

    SELECT *
      INTO v_token
      FROM public.governance_decision_action_tokens
     WHERE token_hash = digest(BTRIM(p_token), 'sha256')
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid governance decision token'
            USING ERRCODE = '22023';
    END IF;

    IF v_token.used_at IS NOT NULL THEN
        RAISE EXCEPTION 'Governance decision token has already been used'
            USING ERRCODE = '42501';
    END IF;

    IF NOW() >= v_token.expires_at THEN
        RAISE EXCEPTION 'Governance decision token has expired'
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_id IS DISTINCT FROM v_token.intended_actor_id THEN
        RAISE EXCEPTION 'Governance decision token actor mismatch: session identity does not match intended_actor_id'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_governance
      FROM public.work_order_governance
     WHERE id = v_token.governance_id
       AND tenant_id = v_token.tenant_id
       AND work_order_id = v_token.work_order_id
       AND route_type = v_token.route_type
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Governance record not found for decision token'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_governance.required_approver_role IS DISTINCT FROM v_token.required_approver_role THEN
        RAISE EXCEPTION 'Governance decision token required role no longer matches the decision'
            USING ERRCODE = '42501';
    END IF;

    IF NOT (
        (v_token.route_type = 'standard' AND v_governance.governance_state = 'pending_approval')
        OR (v_token.route_type = 'emergency_override' AND v_governance.governance_state = 'post_action_complete')
    ) THEN
        RAISE EXCEPTION 'Governance decision token no longer points to an actionable decision; route_type=%, governance_state=%',
            v_governance.route_type,
            v_governance.governance_state
            USING ERRCODE = '22023';
    END IF;

    v_decision_authority := public.governance_resolve_decision_actor(v_actor_id, v_governance.id);

    IF NOT COALESCE((v_decision_authority->>'authorized')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION 'Unauthorized governance decision token actor: reason=%',
            COALESCE(v_decision_authority->>'reason', 'not_authorized')
            USING ERRCODE = '42501';
    END IF;

    IF v_token.delegation_id IS NOT NULL
       AND v_token.delegation_id IS DISTINCT FROM NULLIF(v_decision_authority->>'delegation_id', '')::UUID
    THEN
        RAISE EXCEPTION 'Governance decision token delegation no longer matches current authority'
            USING ERRCODE = '42501';
    END IF;

    IF v_token.route_type = 'standard' AND v_token.action = 'approve' THEN
        v_decision_result := public.approve_governance_decision(v_token.work_order_id, p_note);
    ELSIF v_token.route_type = 'standard' AND v_token.action = 'reject' THEN
        v_decision_result := public.reject_governance_decision(v_token.work_order_id, p_note);
    ELSIF v_token.route_type = 'emergency_override' AND v_token.action = 'approve' THEN
        v_decision_result := public.approve_emergency_governance(v_token.work_order_id, p_note);
    ELSIF v_token.route_type = 'emergency_override' AND v_token.action = 'reject' THEN
        v_decision_result := public.reject_emergency_governance(v_token.work_order_id, p_note);
    ELSE
        RAISE EXCEPTION 'Unsupported governance decision token route/action: %/%',
            v_token.route_type,
            v_token.action
            USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('app.governance_token_authorized', 'true', TRUE);

    UPDATE public.governance_decision_action_tokens
       SET used_at = NOW(),
           used_by = v_actor_id,
           decision_result = v_decision_result,
           updated_at = NOW()
     WHERE id = v_token.id
     RETURNING * INTO v_token;

    PERFORM set_config('app.governance_token_authorized', 'false', TRUE);

    RETURN jsonb_build_object(
        'success', TRUE,
        'token_id', v_token.id,
        'used_at', v_token.used_at,
        'used_by', v_token.used_by,
        'tenant_id', v_token.tenant_id,
        'work_order_id', v_token.work_order_id,
        'governance_id', v_token.governance_id,
        'action', v_token.action,
        'route_type', v_token.route_type,
        'decision_result', v_decision_result,
        'decision_authority', v_decision_authority
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_governance_decision_action_tokens_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_governance_decision_action_tokens_mutation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_governance_decision_action_tokens_mutation() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.create_governance_decision_action_token(UUID, TEXT, UUID, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_governance_decision_action_token(UUID, TEXT, UUID, TIMESTAMPTZ, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_governance_decision_action_token(UUID, TEXT, UUID, TIMESTAMPTZ, TEXT, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.consume_governance_decision_action_token(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_governance_decision_action_token(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_governance_decision_action_token(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_governance_decision_action_token(UUID, TEXT, UUID, TIMESTAMPTZ, TEXT, JSONB) IS
    'Issues a hash-only, single-use governance decision token. Returns raw token once; does not decide.';

COMMENT ON FUNCTION public.consume_governance_decision_action_token(TEXT, TEXT) IS
    'Consumes a governance decision token only when auth.uid() matches intended_actor_id, then routes through the existing audited governance decision RPCs.';
