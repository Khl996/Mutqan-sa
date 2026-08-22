-- =============================================================================
-- Migration: field_governance_wave3_delegation_authority.sql
-- Purpose:
--   Phase 2 / Wave 3.2.7 Delegation of Authority.
--
--   Non-destructive:
--     - Adds native approval authority limits with explicit amount and scope.
--     - Adds tenant-scoped governance delegations.
--     - Keeps decision queue as a filter over work_order_governance.
--     - Preserves public approval/rejection RPC signatures.
--     - Does not add or change work_order.status.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Native authority limits and delegations.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.governance_approval_authority_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    limit_code TEXT NOT NULL,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (
        role IN (
            'supervisor',
            'engineer',
            'facility_manager',
            'maintenance_manager',
            'tenant_admin'
        )
    ),
    max_approval_amount NUMERIC(12, 2) NOT NULL CHECK (max_approval_amount >= 0),

    scope_building_id UUID REFERENCES public.buildings(id) ON DELETE RESTRICT,
    scope_floor_id UUID REFERENCES public.floors(id) ON DELETE RESTRICT,
    scope_department_id UUID REFERENCES public.departments(id) ON DELETE RESTRICT,
    scope_room_id UUID REFERENCES public.rooms(id) ON DELETE RESTRICT,
    scope_asset_id UUID REFERENCES public.assets(id) ON DELETE RESTRICT,

    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    deactivated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    deactivated_at TIMESTAMPTZ,
    deactivation_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT governance_authority_limits_valid_window_check CHECK (
        valid_until IS NULL OR valid_until > valid_from
    ),
    CONSTRAINT governance_authority_limits_tenant_code_key UNIQUE (tenant_id, limit_code)
);

CREATE INDEX IF NOT EXISTS idx_governance_authority_limits_tenant_role
    ON public.governance_approval_authority_limits(tenant_id, role)
    WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_governance_authority_limits_profile
    ON public.governance_approval_authority_limits(profile_id)
    WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_governance_authority_limits_scope_building
    ON public.governance_approval_authority_limits(scope_building_id);

CREATE INDEX IF NOT EXISTS idx_governance_authority_limits_scope_floor
    ON public.governance_approval_authority_limits(scope_floor_id);

CREATE INDEX IF NOT EXISTS idx_governance_authority_limits_scope_department
    ON public.governance_approval_authority_limits(scope_department_id);

CREATE INDEX IF NOT EXISTS idx_governance_authority_limits_scope_room
    ON public.governance_approval_authority_limits(scope_room_id);

CREATE INDEX IF NOT EXISTS idx_governance_authority_limits_scope_asset
    ON public.governance_approval_authority_limits(scope_asset_id);

COMMENT ON TABLE public.governance_approval_authority_limits IS
    'Native approval authority. Delegation can only narrow this amount+scope authority; it cannot be used to prove delegated authority.';

CREATE TABLE IF NOT EXISTS public.governance_delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    delegator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    delegate_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    scope_role TEXT NOT NULL CHECK (
        scope_role IN (
            'supervisor',
            'engineer',
            'facility_manager',
            'maintenance_manager',
            'tenant_admin'
        )
    ),
    cost_ceiling NUMERIC(12, 2) NOT NULL CHECK (cost_ceiling >= 0),

    scope_building_id UUID REFERENCES public.buildings(id) ON DELETE RESTRICT,
    scope_floor_id UUID REFERENCES public.floors(id) ON DELETE RESTRICT,
    scope_department_id UUID REFERENCES public.departments(id) ON DELETE RESTRICT,
    scope_room_id UUID REFERENCES public.rooms(id) ON DELETE RESTRICT,
    scope_asset_id UUID REFERENCES public.assets(id) ON DELETE RESTRICT,

    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT,

    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT governance_delegations_no_self_check CHECK (delegator_id <> delegate_id),
    CONSTRAINT governance_delegations_valid_window_check CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_governance_delegations_tenant_role
    ON public.governance_delegations(tenant_id, scope_role, valid_from, valid_until)
    WHERE is_active AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_governance_delegations_delegator
    ON public.governance_delegations(delegator_id)
    WHERE is_active AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_governance_delegations_delegate
    ON public.governance_delegations(delegate_id)
    WHERE is_active AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_governance_delegations_active_unique_scope
    ON public.governance_delegations (
        tenant_id,
        delegator_id,
        delegate_id,
        scope_role,
        scope_building_id,
        scope_floor_id,
        scope_department_id,
        scope_room_id,
        scope_asset_id
    ) NULLS NOT DISTINCT
    WHERE is_active AND revoked_at IS NULL;

COMMENT ON TABLE public.governance_delegations IS
    'Tenant-scoped approval delegation. V1 blocks delegation chaining; delegator authority must be native.';

ALTER TABLE public.governance_approval_authority_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "governance_authority_limits_select_scoped" ON public.governance_approval_authority_limits;
CREATE POLICY "governance_authority_limits_select_scoped"
ON public.governance_approval_authority_limits
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

DROP POLICY IF EXISTS "governance_delegations_select_scoped" ON public.governance_delegations;
CREATE POLICY "governance_delegations_select_scoped"
ON public.governance_delegations
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

REVOKE ALL PRIVILEGES ON TABLE public.governance_approval_authority_limits FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.governance_approval_authority_limits FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.governance_delegations FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.governance_delegations FROM PUBLIC;
GRANT SELECT ON TABLE public.governance_approval_authority_limits TO authenticated;
GRANT SELECT ON TABLE public.governance_delegations TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Scope helpers. A scope is tenant-wide when all scope columns are NULL.
--    Otherwise the deepest provided entity determines the scope and any broader
--    columns must match its real hierarchy.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.governance_scope_level_name(p_level INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE COALESCE(p_level, 0)
        WHEN 5 THEN 'asset'
        WHEN 4 THEN 'room'
        WHEN 3 THEN 'department'
        WHEN 2 THEN 'floor'
        WHEN 1 THEN 'building'
        ELSE 'tenant'
    END;
$$;

CREATE OR REPLACE FUNCTION public.governance_resolve_scope(
    p_tenant_id UUID,
    p_scope_building_id UUID DEFAULT NULL,
    p_scope_floor_id UUID DEFAULT NULL,
    p_scope_department_id UUID DEFAULT NULL,
    p_scope_room_id UUID DEFAULT NULL,
    p_scope_asset_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_level INTEGER := 0;
    v_entity_tenant UUID;
    v_building_id UUID;
    v_floor_id UUID;
    v_department_id UUID;
    v_room_id UUID;
    v_asset_id UUID;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('valid', FALSE, 'reason', 'tenant_id_required');
    END IF;

    IF p_scope_asset_id IS NOT NULL THEN
        SELECT a.tenant_id, a.building_id, a.floor_id, a.department_id, a.room_id, a.id
          INTO v_entity_tenant, v_building_id, v_floor_id, v_department_id, v_room_id, v_asset_id
          FROM public.assets a
         WHERE a.id = p_scope_asset_id;
        v_level := 5;
    ELSIF p_scope_room_id IS NOT NULL THEN
        SELECT r.tenant_id, r.building_id, r.floor_id, r.department_id, r.id
          INTO v_entity_tenant, v_building_id, v_floor_id, v_department_id, v_room_id
          FROM public.rooms r
         WHERE r.id = p_scope_room_id;
        v_level := 4;
    ELSIF p_scope_department_id IS NOT NULL THEN
        SELECT d.tenant_id, d.building_id, d.floor_id, d.id
          INTO v_entity_tenant, v_building_id, v_floor_id, v_department_id
          FROM public.departments d
         WHERE d.id = p_scope_department_id;
        v_level := 3;
    ELSIF p_scope_floor_id IS NOT NULL THEN
        SELECT b.tenant_id, f.building_id, f.id
          INTO v_entity_tenant, v_building_id, v_floor_id
          FROM public.floors f
          JOIN public.buildings b ON b.id = f.building_id
         WHERE f.id = p_scope_floor_id;
        v_level := 2;
    ELSIF p_scope_building_id IS NOT NULL THEN
        SELECT b.tenant_id, b.id
          INTO v_entity_tenant, v_building_id
          FROM public.buildings b
         WHERE b.id = p_scope_building_id;
        v_level := 1;
    ELSE
        RETURN jsonb_build_object(
            'valid', TRUE,
            'level', 0,
            'level_name', 'tenant',
            'tenant_id', p_tenant_id,
            'building_id', NULL,
            'floor_id', NULL,
            'department_id', NULL,
            'room_id', NULL,
            'asset_id', NULL
        );
    END IF;

    IF v_entity_tenant IS DISTINCT FROM p_tenant_id THEN
        RETURN jsonb_build_object('valid', FALSE, 'reason', 'scope_entity_not_in_tenant');
    END IF;

    IF p_scope_building_id IS NOT NULL AND p_scope_building_id IS DISTINCT FROM v_building_id THEN
        RETURN jsonb_build_object('valid', FALSE, 'reason', 'scope_building_mismatch');
    END IF;

    IF p_scope_floor_id IS NOT NULL AND p_scope_floor_id IS DISTINCT FROM v_floor_id THEN
        RETURN jsonb_build_object('valid', FALSE, 'reason', 'scope_floor_mismatch');
    END IF;

    IF p_scope_department_id IS NOT NULL AND p_scope_department_id IS DISTINCT FROM v_department_id THEN
        RETURN jsonb_build_object('valid', FALSE, 'reason', 'scope_department_mismatch');
    END IF;

    IF p_scope_room_id IS NOT NULL AND p_scope_room_id IS DISTINCT FROM v_room_id THEN
        RETURN jsonb_build_object('valid', FALSE, 'reason', 'scope_room_mismatch');
    END IF;

    RETURN jsonb_build_object(
        'valid', TRUE,
        'level', v_level,
        'level_name', public.governance_scope_level_name(v_level),
        'tenant_id', p_tenant_id,
        'building_id', v_building_id,
        'floor_id', v_floor_id,
        'department_id', v_department_id,
        'room_id', v_room_id,
        'asset_id', v_asset_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_scope_is_valid_for_tenant(
    p_tenant_id UUID,
    p_scope_building_id UUID DEFAULT NULL,
    p_scope_floor_id UUID DEFAULT NULL,
    p_scope_department_id UUID DEFAULT NULL,
    p_scope_room_id UUID DEFAULT NULL,
    p_scope_asset_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (public.governance_resolve_scope(
            p_tenant_id,
            p_scope_building_id,
            p_scope_floor_id,
            p_scope_department_id,
            p_scope_room_id,
            p_scope_asset_id
        )->>'valid')::BOOLEAN,
        FALSE
    );
$$;

CREATE OR REPLACE FUNCTION public.governance_scope_contains(
    p_tenant_id UUID,
    p_container_building_id UUID DEFAULT NULL,
    p_container_floor_id UUID DEFAULT NULL,
    p_container_department_id UUID DEFAULT NULL,
    p_container_room_id UUID DEFAULT NULL,
    p_container_asset_id UUID DEFAULT NULL,
    p_child_building_id UUID DEFAULT NULL,
    p_child_floor_id UUID DEFAULT NULL,
    p_child_department_id UUID DEFAULT NULL,
    p_child_room_id UUID DEFAULT NULL,
    p_child_asset_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_container JSONB;
    v_child JSONB;
    v_container_level INTEGER;
    v_child_level INTEGER;
BEGIN
    v_container := public.governance_resolve_scope(
        p_tenant_id,
        p_container_building_id,
        p_container_floor_id,
        p_container_department_id,
        p_container_room_id,
        p_container_asset_id
    );

    v_child := public.governance_resolve_scope(
        p_tenant_id,
        p_child_building_id,
        p_child_floor_id,
        p_child_department_id,
        p_child_room_id,
        p_child_asset_id
    );

    IF NOT COALESCE((v_container->>'valid')::BOOLEAN, FALSE)
       OR NOT COALESCE((v_child->>'valid')::BOOLEAN, FALSE)
    THEN
        RETURN FALSE;
    END IF;

    v_container_level := COALESCE((v_container->>'level')::INTEGER, 0);
    v_child_level := COALESCE((v_child->>'level')::INTEGER, 0);

    IF v_container_level = 0 THEN
        RETURN TRUE;
    END IF;

    IF v_child_level < v_container_level THEN
        RETURN FALSE;
    END IF;

    RETURN CASE v_container_level
        WHEN 5 THEN (v_child->>'asset_id')::UUID IS NOT DISTINCT FROM (v_container->>'asset_id')::UUID
        WHEN 4 THEN (v_child->>'room_id')::UUID IS NOT DISTINCT FROM (v_container->>'room_id')::UUID
        WHEN 3 THEN (v_child->>'department_id')::UUID IS NOT DISTINCT FROM (v_container->>'department_id')::UUID
        WHEN 2 THEN (v_child->>'floor_id')::UUID IS NOT DISTINCT FROM (v_container->>'floor_id')::UUID
        WHEN 1 THEN (v_child->>'building_id')::UUID IS NOT DISTINCT FROM (v_container->>'building_id')::UUID
        ELSE FALSE
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_scope_covers_work_order(
    p_work_order_id UUID,
    p_scope_building_id UUID DEFAULT NULL,
    p_scope_floor_id UUID DEFAULT NULL,
    p_scope_department_id UUID DEFAULT NULL,
    p_scope_room_id UUID DEFAULT NULL,
    p_scope_asset_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wo public.work_orders%ROWTYPE;
BEGIN
    SELECT *
      INTO v_wo
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_wo.asset_id IS NOT NULL THEN
        RETURN public.governance_scope_contains(
            v_wo.tenant_id,
            p_scope_building_id,
            p_scope_floor_id,
            p_scope_department_id,
            p_scope_room_id,
            p_scope_asset_id,
            NULL,
            NULL,
            NULL,
            NULL,
            v_wo.asset_id
        );
    END IF;

    RETURN public.governance_scope_contains(
        v_wo.tenant_id,
        p_scope_building_id,
        p_scope_floor_id,
        p_scope_department_id,
        p_scope_room_id,
        p_scope_asset_id,
        v_wo.building_id,
        v_wo.floor_id,
        v_wo.department_id,
        v_wo.room_id,
        NULL
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Guard direct authority/delegation mutations.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_governance_authority_limits_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_authorized BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'governance_approval_authority_limits cannot be deleted; deactivate authority limits instead'
            USING ERRCODE = '42501';
    END IF;

    v_authorized := COALESCE(
        current_setting('app.governance_authority_limit_authorized', TRUE) = 'true',
        FALSE
    );

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'Direct mutation of governance_approval_authority_limits is not permitted. Use audited governance authority RPCs.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.profile_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM public.profiles p
             WHERE p.id = NEW.profile_id
               AND p.tenant_id = NEW.tenant_id
               AND p.role = NEW.role
       )
    THEN
        RAISE EXCEPTION 'Authority profile must belong to the tenant and match the authority role'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.governance_scope_is_valid_for_tenant(
        NEW.tenant_id,
        NEW.scope_building_id,
        NEW.scope_floor_id,
        NEW.scope_department_id,
        NEW.scope_room_id,
        NEW.scope_asset_id
    ) THEN
        RAISE EXCEPTION 'Invalid authority scope for this tenant'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_governance_authority_limits_mutation
    ON public.governance_approval_authority_limits;

CREATE TRIGGER trg_guard_governance_authority_limits_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.governance_approval_authority_limits
FOR EACH ROW
EXECUTE FUNCTION public.guard_governance_authority_limits_mutation();

CREATE OR REPLACE FUNCTION public.guard_governance_delegations_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_authorized BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'governance_delegations cannot be deleted; revoke delegations instead'
            USING ERRCODE = '42501';
    END IF;

    v_authorized := COALESCE(
        current_setting('app.governance_delegation_authorized', TRUE) = 'true',
        FALSE
    );

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'Direct mutation of governance_delegations is not permitted. Use audited governance delegation RPCs.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.delegator_id = NEW.delegate_id THEN
        RAISE EXCEPTION 'Delegator and delegate must be different users'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.profiles delegator
          JOIN public.profiles delegate
            ON delegate.id = NEW.delegate_id
           AND delegate.tenant_id = delegator.tenant_id
         WHERE delegator.id = NEW.delegator_id
           AND delegator.tenant_id = NEW.tenant_id
           AND COALESCE(delegator.is_active, TRUE) IS TRUE
           AND COALESCE(delegate.is_active, TRUE) IS TRUE
    ) THEN
        RAISE EXCEPTION 'Delegator and delegate must be active users in the same tenant'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.governance_scope_is_valid_for_tenant(
        NEW.tenant_id,
        NEW.scope_building_id,
        NEW.scope_floor_id,
        NEW.scope_department_id,
        NEW.scope_room_id,
        NEW.scope_asset_id
    ) THEN
        RAISE EXCEPTION 'Invalid delegation scope for this tenant'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_governance_delegations_mutation
    ON public.governance_delegations;

CREATE TRIGGER trg_guard_governance_delegations_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.governance_delegations
FOR EACH ROW
EXECUTE FUNCTION public.guard_governance_delegations_mutation();

-- -----------------------------------------------------------------------------
-- 4. Native authority helpers.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.governance_authority_profile_specific_exists(
    p_tenant_id UUID,
    p_profile_id UUID,
    p_role TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.governance_approval_authority_limits l
         WHERE l.tenant_id = p_tenant_id
           AND l.profile_id = p_profile_id
           AND l.role = p_role
           AND l.is_active IS TRUE
           AND NOW() >= l.valid_from
           AND (l.valid_until IS NULL OR NOW() < l.valid_until)
           AND l.deactivated_at IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.ensure_default_governance_authority_limits(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant id is required for default governance authority limits'
            USING ERRCODE = '23502';
    END IF;

    PERFORM set_config('app.governance_authority_limit_authorized', 'true', TRUE);

    INSERT INTO public.governance_approval_authority_limits (
        tenant_id,
        limit_code,
        role,
        max_approval_amount,
        created_by
    )
    VALUES
        (p_tenant_id, 'default_supervisor_native', 'supervisor', 999999999.99, NULL),
        (p_tenant_id, 'default_engineer_native', 'engineer', 999999999.99, NULL),
        (p_tenant_id, 'default_facility_manager_native', 'facility_manager', 999999999.99, NULL),
        (p_tenant_id, 'default_maintenance_manager_native', 'maintenance_manager', 999999999.99, NULL),
        (p_tenant_id, 'default_tenant_admin_native', 'tenant_admin', 999999999.99, NULL)
    ON CONFLICT (tenant_id, limit_code) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_native_authority_for_scope(
    p_tenant_id UUID,
    p_profile_id UUID,
    p_role TEXT,
    p_amount NUMERIC,
    p_scope_building_id UUID DEFAULT NULL,
    p_scope_floor_id UUID DEFAULT NULL,
    p_scope_department_id UUID DEFAULT NULL,
    p_scope_room_id UUID DEFAULT NULL,
    p_scope_asset_id UUID DEFAULT NULL
)
RETURNS TABLE (
    authority_limit_id UUID,
    max_approval_amount NUMERIC,
    scope_building_id UUID,
    scope_floor_id UUID,
    scope_department_id UUID,
    scope_room_id UUID,
    scope_asset_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_specific BOOLEAN;
BEGIN
    v_profile_specific := public.governance_authority_profile_specific_exists(
        p_tenant_id,
        p_profile_id,
        p_role
    );

    RETURN QUERY
    SELECT
        l.id,
        l.max_approval_amount,
        l.scope_building_id,
        l.scope_floor_id,
        l.scope_department_id,
        l.scope_room_id,
        l.scope_asset_id
      FROM public.governance_approval_authority_limits l
     WHERE l.tenant_id = p_tenant_id
       AND l.role = p_role
       AND (
            (v_profile_specific AND l.profile_id = p_profile_id)
            OR (NOT v_profile_specific AND l.profile_id IS NULL)
       )
       AND l.is_active IS TRUE
       AND NOW() >= l.valid_from
       AND (l.valid_until IS NULL OR NOW() < l.valid_until)
       AND l.deactivated_at IS NULL
       AND COALESCE(p_amount, 0) <= l.max_approval_amount
       AND public.governance_scope_contains(
            p_tenant_id,
            l.scope_building_id,
            l.scope_floor_id,
            l.scope_department_id,
            l.scope_room_id,
            l.scope_asset_id,
            p_scope_building_id,
            p_scope_floor_id,
            p_scope_department_id,
            p_scope_room_id,
            p_scope_asset_id
       )
     ORDER BY
        CASE WHEN l.profile_id = p_profile_id THEN 0 ELSE 1 END,
        (
            (CASE WHEN l.scope_asset_id IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN l.scope_room_id IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN l.scope_department_id IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN l.scope_floor_id IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN l.scope_building_id IS NOT NULL THEN 1 ELSE 0 END)
        ) DESC,
        l.max_approval_amount ASC,
        l.created_at ASC
     LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_native_authority_for_work_order(
    p_tenant_id UUID,
    p_profile_id UUID,
    p_role TEXT,
    p_amount NUMERIC,
    p_work_order_id UUID
)
RETURNS TABLE (
    authority_limit_id UUID,
    max_approval_amount NUMERIC,
    scope_building_id UUID,
    scope_floor_id UUID,
    scope_department_id UUID,
    scope_room_id UUID,
    scope_asset_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wo public.work_orders%ROWTYPE;
BEGIN
    SELECT *
      INTO v_wo
      FROM public.work_orders
     WHERE id = p_work_order_id
       AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_wo.asset_id IS NOT NULL THEN
        RETURN QUERY
        SELECT *
          FROM public.governance_native_authority_for_scope(
            p_tenant_id,
            p_profile_id,
            p_role,
            p_amount,
            NULL,
            NULL,
            NULL,
            NULL,
            v_wo.asset_id
          );
        RETURN;
    END IF;

    RETURN QUERY
    SELECT *
      FROM public.governance_native_authority_for_scope(
        p_tenant_id,
        p_profile_id,
        p_role,
        p_amount,
        v_wo.building_id,
        v_wo.floor_id,
        v_wo.department_id,
        v_wo.room_id,
        NULL
      );
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_native_authority_covers_work_order(
    p_tenant_id UUID,
    p_profile_id UUID,
    p_role TEXT,
    p_amount NUMERIC,
    p_work_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.governance_native_authority_for_work_order(
            p_tenant_id,
            p_profile_id,
            p_role,
            p_amount,
            p_work_order_id
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.governance_delegation_covers_work_order(
    p_delegation_id UUID,
    p_work_order_id UUID,
    p_amount NUMERIC,
    p_required_role TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.governance_delegations d
          JOIN public.profiles delegator ON delegator.id = d.delegator_id
          JOIN public.profiles delegate
            ON delegate.id = d.delegate_id
           AND delegate.tenant_id = d.tenant_id
          JOIN public.work_orders w ON w.id = p_work_order_id AND w.tenant_id = d.tenant_id
         WHERE d.id = p_delegation_id
           AND d.scope_role = p_required_role
           AND d.is_active IS TRUE
           AND d.revoked_at IS NULL
           AND NOW() >= d.valid_from
           AND NOW() < d.valid_until
           AND COALESCE(p_amount, 0) <= d.cost_ceiling
           AND COALESCE(delegator.is_active, TRUE) IS TRUE
           AND COALESCE(delegate.is_active, TRUE) IS TRUE
           AND public.governance_actor_can_decide(delegator.role::TEXT, p_required_role, FALSE)
           AND public.governance_scope_covers_work_order(
                p_work_order_id,
                d.scope_building_id,
                d.scope_floor_id,
                d.scope_department_id,
                d.scope_room_id,
                d.scope_asset_id
           )
           AND public.governance_native_authority_covers_work_order(
                d.tenant_id,
                d.delegator_id,
                delegator.role::TEXT,
                COALESCE(p_amount, 0),
                p_work_order_id
           )
    );
$$;

-- Seed role-wide tenant authority limits so the existing live approval path
-- remains unaffected until tenants configure narrower native scopes.
SELECT public.ensure_default_governance_authority_limits(t.id)
  FROM public.tenants t;

-- -----------------------------------------------------------------------------
-- 5. Audited authority/delegation RPCs.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_governance_authority_limit(
    p_limit_code TEXT,
    p_role TEXT,
    p_max_approval_amount NUMERIC,
    p_profile_id UUID DEFAULT NULL,
    p_scope_building_id UUID DEFAULT NULL,
    p_scope_floor_id UUID DEFAULT NULL,
    p_scope_department_id UUID DEFAULT NULL,
    p_scope_room_id UUID DEFAULT NULL,
    p_scope_asset_id UUID DEFAULT NULL,
    p_valid_from TIMESTAMPTZ DEFAULT NOW(),
    p_valid_until TIMESTAMPTZ DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE
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
    v_target_tenant UUID;
    v_limit public.governance_approval_authority_limits%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF COALESCE(BTRIM(p_limit_code), '') = '' THEN
        RAISE EXCEPTION 'Authority limit code is required' USING ERRCODE = '23502';
    END IF;

    IF p_role NOT IN ('supervisor', 'engineer', 'facility_manager', 'maintenance_manager', 'tenant_admin') THEN
        RAISE EXCEPTION 'Invalid governance authority role: %', p_role USING ERRCODE = '22023';
    END IF;

    IF p_max_approval_amount IS NULL OR p_max_approval_amount < 0 THEN
        RAISE EXCEPTION 'Authority max approval amount must be zero or greater' USING ERRCODE = '22023';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot manage governance authority limits'
            USING ERRCODE = '42501';
    END IF;

    IF NOT (v_actor_super OR v_actor_role IN ('tenant_admin', 'platform_owner', 'platform_admin')) THEN
        RAISE EXCEPTION 'Unauthorized: only tenant admins or platform admins can manage governance authority limits'
            USING ERRCODE = '42501';
    END IF;

    IF p_profile_id IS NOT NULL THEN
        SELECT tenant_id
          INTO v_target_tenant
          FROM public.profiles
         WHERE id = p_profile_id
           AND role = p_role;

        IF v_target_tenant IS NULL THEN
            RAISE EXCEPTION 'Authority profile must exist and match the authority role'
                USING ERRCODE = 'P0002';
        END IF;
    ELSE
        v_target_tenant := v_actor_tenant;
    END IF;

    IF v_target_tenant IS NULL THEN
        RAISE EXCEPTION 'Tenant id could not be resolved for authority limit'
            USING ERRCODE = '23502';
    END IF;

    IF NOT (v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin'))
       AND v_actor_tenant IS DISTINCT FROM v_target_tenant
    THEN
        RAISE EXCEPTION 'Access denied: authority limit belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.governance_scope_is_valid_for_tenant(
        v_target_tenant,
        p_scope_building_id,
        p_scope_floor_id,
        p_scope_department_id,
        p_scope_room_id,
        p_scope_asset_id
    ) THEN
        RAISE EXCEPTION 'Invalid authority scope for this tenant'
            USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.governance_authority_limit_authorized', 'true', TRUE);

    INSERT INTO public.governance_approval_authority_limits (
        tenant_id,
        limit_code,
        profile_id,
        role,
        max_approval_amount,
        scope_building_id,
        scope_floor_id,
        scope_department_id,
        scope_room_id,
        scope_asset_id,
        valid_from,
        valid_until,
        is_active,
        created_by
    )
    VALUES (
        v_target_tenant,
        BTRIM(p_limit_code),
        p_profile_id,
        p_role,
        p_max_approval_amount,
        p_scope_building_id,
        p_scope_floor_id,
        p_scope_department_id,
        p_scope_room_id,
        p_scope_asset_id,
        COALESCE(p_valid_from, NOW()),
        p_valid_until,
        COALESCE(p_is_active, TRUE),
        v_actor_id
    )
    ON CONFLICT (tenant_id, limit_code)
    DO UPDATE SET
        profile_id = EXCLUDED.profile_id,
        role = EXCLUDED.role,
        max_approval_amount = EXCLUDED.max_approval_amount,
        scope_building_id = EXCLUDED.scope_building_id,
        scope_floor_id = EXCLUDED.scope_floor_id,
        scope_department_id = EXCLUDED.scope_department_id,
        scope_room_id = EXCLUDED.scope_room_id,
        scope_asset_id = EXCLUDED.scope_asset_id,
        valid_from = EXCLUDED.valid_from,
        valid_until = EXCLUDED.valid_until,
        is_active = EXCLUDED.is_active,
        deactivated_at = CASE WHEN EXCLUDED.is_active THEN NULL ELSE public.governance_approval_authority_limits.deactivated_at END,
        deactivated_by = CASE WHEN EXCLUDED.is_active THEN NULL ELSE public.governance_approval_authority_limits.deactivated_by END,
        deactivation_reason = CASE WHEN EXCLUDED.is_active THEN NULL ELSE public.governance_approval_authority_limits.deactivation_reason END,
        updated_at = NOW()
    RETURNING * INTO v_limit;

    PERFORM public.create_governance_log_event(
        v_limit.tenant_id,
        NULL,
        'Governance native authority limit upserted',
        NULL,
        v_actor_id,
        'governance.authority_limit_upserted',
        'governance_approval_authority_limits',
        v_limit.id,
        NULL,
        to_jsonb(v_limit),
        jsonb_build_object(
            'limit_code', v_limit.limit_code,
            'role', v_limit.role,
            'profile_id', v_limit.profile_id,
            'max_approval_amount', v_limit.max_approval_amount,
            'scope', jsonb_build_object(
                'building_id', v_limit.scope_building_id,
                'floor_id', v_limit.scope_floor_id,
                'department_id', v_limit.scope_department_id,
                'room_id', v_limit.scope_room_id,
                'asset_id', v_limit.scope_asset_id
            )
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'authority_limit_id', v_limit.id,
        'tenant_id', v_limit.tenant_id,
        'role', v_limit.role,
        'profile_id', v_limit.profile_id,
        'max_approval_amount', v_limit.max_approval_amount
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_governance_delegation(
    p_delegate_id UUID,
    p_scope_role TEXT,
    p_cost_ceiling NUMERIC,
    p_valid_from TIMESTAMPTZ,
    p_valid_until TIMESTAMPTZ,
    p_scope_building_id UUID DEFAULT NULL,
    p_scope_floor_id UUID DEFAULT NULL,
    p_scope_department_id UUID DEFAULT NULL,
    p_scope_room_id UUID DEFAULT NULL,
    p_scope_asset_id UUID DEFAULT NULL,
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
    v_delegate_tenant UUID;
    v_delegate_active BOOLEAN;
    v_authority_limit_id UUID;
    v_authority_max NUMERIC;
    v_delegation public.governance_delegations%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_scope_role NOT IN ('supervisor', 'engineer', 'facility_manager', 'maintenance_manager', 'tenant_admin') THEN
        RAISE EXCEPTION 'Invalid governance delegation role: %', p_scope_role USING ERRCODE = '22023';
    END IF;

    IF p_cost_ceiling IS NULL OR p_cost_ceiling < 0 THEN
        RAISE EXCEPTION 'Delegation cost ceiling must be zero or greater' USING ERRCODE = '22023';
    END IF;

    IF p_valid_from IS NULL OR p_valid_until IS NULL OR p_valid_until <= p_valid_from THEN
        RAISE EXCEPTION 'Delegation requires a valid from/until window'
            USING ERRCODE = '22023';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot create governance delegations'
            USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, COALESCE(is_active, TRUE)
      INTO v_delegate_tenant, v_delegate_active
      FROM public.profiles
     WHERE id = p_delegate_id;

    IF v_delegate_tenant IS NULL THEN
        RAISE EXCEPTION 'Delegate profile not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_delegate_tenant IS DISTINCT FROM v_actor_tenant THEN
        RAISE EXCEPTION 'Delegate must belong to the same tenant as the delegator'
            USING ERRCODE = '42501';
    END IF;

    IF NOT COALESCE(v_delegate_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot receive governance delegations'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.governance_actor_can_decide(v_actor_role, p_scope_role, v_actor_super) THEN
        RAISE EXCEPTION 'Delegation rejected: delegator role % cannot delegate authority for required role %',
            v_actor_role, p_scope_role
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.governance_scope_is_valid_for_tenant(
        v_actor_tenant,
        p_scope_building_id,
        p_scope_floor_id,
        p_scope_department_id,
        p_scope_room_id,
        p_scope_asset_id
    ) THEN
        RAISE EXCEPTION 'Invalid delegation scope for this tenant'
            USING ERRCODE = '42501';
    END IF;

    SELECT authority_limit_id, max_approval_amount
      INTO v_authority_limit_id, v_authority_max
      FROM public.governance_native_authority_for_scope(
        v_actor_tenant,
        v_actor_id,
        v_actor_role,
        p_cost_ceiling,
        p_scope_building_id,
        p_scope_floor_id,
        p_scope_department_id,
        p_scope_room_id,
        p_scope_asset_id
     )
     LIMIT 1;

    IF v_authority_limit_id IS NULL THEN
        RAISE EXCEPTION 'Delegation rejected: delegator native authority does not cover requested scope and amount'
            USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.governance_delegation_authorized', 'true', TRUE);

    INSERT INTO public.governance_delegations (
        tenant_id,
        delegator_id,
        delegate_id,
        scope_role,
        cost_ceiling,
        scope_building_id,
        scope_floor_id,
        scope_department_id,
        scope_room_id,
        scope_asset_id,
        valid_from,
        valid_until,
        reason,
        created_by
    )
    VALUES (
        v_actor_tenant,
        v_actor_id,
        p_delegate_id,
        p_scope_role,
        p_cost_ceiling,
        p_scope_building_id,
        p_scope_floor_id,
        p_scope_department_id,
        p_scope_room_id,
        p_scope_asset_id,
        p_valid_from,
        p_valid_until,
        NULLIF(BTRIM(p_reason), ''),
        v_actor_id
    )
    RETURNING * INTO v_delegation;

    PERFORM public.create_governance_log_event(
        v_delegation.tenant_id,
        NULL,
        'Governance delegation created',
        v_delegation.reason,
        v_actor_id,
        'governance.delegation_created',
        'governance_delegations',
        v_delegation.id,
        NULL,
        to_jsonb(v_delegation),
        jsonb_build_object(
            'delegator_id', v_delegation.delegator_id,
            'delegate_id', v_delegation.delegate_id,
            'scope_role', v_delegation.scope_role,
            'cost_ceiling', v_delegation.cost_ceiling,
            'native_authority_limit_id', v_authority_limit_id,
            'delegator_native_ceiling', v_authority_max,
            'delegation_chaining', 'blocked_v1'
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'delegation_id', v_delegation.id,
        'delegator_id', v_delegation.delegator_id,
        'delegate_id', v_delegation.delegate_id,
        'scope_role', v_delegation.scope_role,
        'cost_ceiling', v_delegation.cost_ceiling,
        'valid_from', v_delegation.valid_from,
        'valid_until', v_delegation.valid_until
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_governance_delegation(
    p_delegation_id UUID,
    p_reason TEXT
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
    v_before public.governance_delegations%ROWTYPE;
    v_delegation public.governance_delegations%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF COALESCE(BTRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Delegation revoke reason is required'
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
        RAISE EXCEPTION 'Inactive users cannot revoke governance delegations'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_delegation
      FROM public.governance_delegations
     WHERE id = p_delegation_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Governance delegation not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT (
        v_actor_super
        OR v_actor_role IN ('platform_owner', 'platform_admin')
        OR v_actor_id = v_delegation.delegator_id
        OR (v_actor_role = 'tenant_admin' AND v_actor_tenant = v_delegation.tenant_id)
    ) THEN
        RAISE EXCEPTION 'Unauthorized: you cannot revoke this governance delegation'
            USING ERRCODE = '42501';
    END IF;

    v_before := v_delegation;

    PERFORM set_config('app.governance_delegation_authorized', 'true', TRUE);

    UPDATE public.governance_delegations
       SET is_active = FALSE,
           revoked_by = v_actor_id,
           revoked_at = NOW(),
           revoke_reason = BTRIM(p_reason),
           updated_at = NOW()
     WHERE id = p_delegation_id
     RETURNING * INTO v_delegation;

    PERFORM public.create_governance_log_event(
        v_delegation.tenant_id,
        NULL,
        'Governance delegation revoked',
        v_delegation.revoke_reason,
        v_actor_id,
        'governance.delegation_revoked',
        'governance_delegations',
        v_delegation.id,
        to_jsonb(v_before),
        to_jsonb(v_delegation),
        jsonb_build_object(
            'delegator_id', v_delegation.delegator_id,
            'delegate_id', v_delegation.delegate_id,
            'scope_role', v_delegation.scope_role
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'delegation_id', v_delegation.id,
        'is_active', v_delegation.is_active,
        'revoked_at', v_delegation.revoked_at
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Delegation-aware decision routing.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.governance_has_active_decision_route(
    p_tenant_id UUID,
    p_role TEXT,
    p_work_order_id UUID,
    p_amount NUMERIC
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.tenant_id = p_tenant_id
           AND p.role = p_role
           AND COALESCE(p.is_active, TRUE) IS TRUE
           AND public.governance_native_authority_covers_work_order(
                p_tenant_id,
                p.id,
                p.role::TEXT,
                COALESCE(p_amount, 0),
                p_work_order_id
           )
    )
    OR EXISTS (
        SELECT 1
          FROM public.governance_delegations d
         WHERE d.tenant_id = p_tenant_id
           AND d.scope_role = p_role
           AND public.governance_delegation_covers_work_order(
                d.id,
                p_work_order_id,
                COALESCE(p_amount, 0),
                p_role
           )
    );
$$;

CREATE OR REPLACE FUNCTION public.governance_resolve_required_role(
    p_tenant_id UUID,
    p_requested_role TEXT,
    p_escalation_role TEXT,
    p_work_order_id UUID,
    p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT := COALESCE(NULLIF(BTRIM(p_requested_role), ''), 'maintenance_manager');
    v_next TEXT;
    v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF public.governance_has_active_decision_route(p_tenant_id, v_role, p_work_order_id, p_amount) THEN
        RETURN jsonb_build_object(
            'required_role', v_role,
            'requested_role', v_role,
            'escalated', FALSE,
            'reason', NULL
        );
    END IF;

    v_next := COALESCE(NULLIF(BTRIM(p_escalation_role), ''), public.governance_next_escalation_role(v_role));

    LOOP
        IF v_next IS NULL OR v_next = ANY(v_seen) THEN
            EXIT;
        END IF;

        v_seen := array_append(v_seen, v_next);

        IF public.governance_has_active_decision_route(p_tenant_id, v_next, p_work_order_id, p_amount) THEN
            RETURN jsonb_build_object(
                'required_role', v_next,
                'requested_role', v_role,
                'escalated', TRUE,
                'reason', 'no_active_approver_or_delegate_for_' || v_role
            );
        END IF;

        IF v_next = 'tenant_admin' THEN
            EXIT;
        END IF;

        v_next := public.governance_next_escalation_role(v_next);
    END LOOP;

    RETURN jsonb_build_object(
        'required_role', 'tenant_admin',
        'requested_role', v_role,
        'escalated', TRUE,
        'reason', 'no_active_approver_or_delegate_for_' || v_role
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_resolve_decision_actor(
    p_actor_id UUID,
    p_governance_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_governance public.work_order_governance%ROWTYPE;
    v_wo public.work_orders%ROWTYPE;
    v_native_authority_limit_id UUID;
    v_native_max NUMERIC;
    v_delegation public.governance_delegations%ROWTYPE;
    v_delegator_role TEXT;
    v_delegator_authority_limit_id UUID;
    v_delegator_max NUMERIC;
    v_amount NUMERIC;
BEGIN
    IF p_actor_id IS NULL THEN
        RETURN jsonb_build_object('authorized', FALSE, 'reason', 'authentication_required');
    END IF;

    SELECT *
      INTO v_actor
      FROM public.profiles
     WHERE id = p_actor_id;

    IF NOT FOUND OR NOT COALESCE(v_actor.is_active, TRUE) THEN
        RETURN jsonb_build_object('authorized', FALSE, 'reason', 'inactive_or_missing_actor');
    END IF;

    SELECT *
      INTO v_governance
      FROM public.work_order_governance
     WHERE id = p_governance_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', FALSE, 'reason', 'governance_not_found');
    END IF;

    SELECT *
      INTO v_wo
      FROM public.work_orders
     WHERE id = v_governance.work_order_id
       AND tenant_id = v_governance.tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('authorized', FALSE, 'reason', 'work_order_not_found');
    END IF;

    v_amount := COALESCE(v_governance.approval_amount, 0);

    IF COALESCE(v_actor.is_super_admin, FALSE)
       OR v_actor.role IN ('platform_owner', 'platform_admin')
    THEN
        RETURN jsonb_build_object(
            'authorized', TRUE,
            'decision_mode', 'manual',
            'authority_mode', 'platform',
            'actor_id', p_actor_id,
            'actor_role', v_actor.role,
            'required_approver_role', v_governance.required_approver_role
        );
    END IF;

    IF v_actor.tenant_id IS DISTINCT FROM v_governance.tenant_id THEN
        RETURN jsonb_build_object('authorized', FALSE, 'reason', 'cross_tenant_actor');
    END IF;

    IF public.governance_actor_can_decide(v_actor.role::TEXT, v_governance.required_approver_role, FALSE) THEN
        SELECT authority_limit_id, max_approval_amount
          INTO v_native_authority_limit_id, v_native_max
          FROM public.governance_native_authority_for_work_order(
            v_governance.tenant_id,
            p_actor_id,
            v_actor.role::TEXT,
            v_amount,
            v_governance.work_order_id
         )
         LIMIT 1;

        IF v_native_authority_limit_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'authorized', TRUE,
                'decision_mode', 'manual',
                'authority_mode', 'native',
                'actor_id', p_actor_id,
                'actor_role', v_actor.role,
                'required_approver_role', v_governance.required_approver_role,
                'native_authority_limit_id', v_native_authority_limit_id,
                'effective_ceiling', v_native_max
            );
        END IF;
    END IF;

    SELECT d.*
      INTO v_delegation
      FROM public.governance_delegations d
      JOIN public.profiles delegator
        ON delegator.id = d.delegator_id
       AND delegator.tenant_id = d.tenant_id
       AND COALESCE(delegator.is_active, TRUE) IS TRUE
     WHERE d.tenant_id = v_governance.tenant_id
       AND d.delegate_id = p_actor_id
       AND d.scope_role = v_governance.required_approver_role
       AND d.is_active IS TRUE
       AND d.revoked_at IS NULL
       AND NOW() >= d.valid_from
       AND NOW() < d.valid_until
       AND v_amount <= d.cost_ceiling
       AND public.governance_scope_covers_work_order(
            v_governance.work_order_id,
            d.scope_building_id,
            d.scope_floor_id,
            d.scope_department_id,
            d.scope_room_id,
            d.scope_asset_id
       )
       AND public.governance_actor_can_decide(delegator.role::TEXT, v_governance.required_approver_role, FALSE)
     ORDER BY d.valid_until ASC, d.created_at ASC
     LIMIT 1;

    IF v_delegation.id IS NOT NULL THEN
        SELECT role::TEXT
          INTO v_delegator_role
          FROM public.profiles
         WHERE id = v_delegation.delegator_id;

        SELECT authority_limit_id, max_approval_amount
          INTO v_delegator_authority_limit_id, v_delegator_max
          FROM public.governance_native_authority_for_work_order(
            v_governance.tenant_id,
            v_delegation.delegator_id,
            v_delegator_role,
            v_amount,
            v_governance.work_order_id
         )
         LIMIT 1;

        IF v_delegator_authority_limit_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'authorized', TRUE,
                'decision_mode', 'delegated',
                'authority_mode', 'delegated',
                'actor_id', p_actor_id,
                'actor_role', v_actor.role,
                'delegator_id', v_delegation.delegator_id,
                'delegator_role', v_delegator_role,
                'delegation_id', v_delegation.id,
                'required_approver_role', v_governance.required_approver_role,
                'native_authority_limit_id', v_delegator_authority_limit_id,
                'delegation_cost_ceiling', v_delegation.cost_ceiling,
                'delegator_native_ceiling', v_delegator_max,
                'effective_ceiling', LEAST(v_delegation.cost_ceiling, v_delegator_max)
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'authorized', FALSE,
        'reason', 'no_native_or_delegated_authority_for_required_scope_and_amount',
        'actor_id', p_actor_id,
        'actor_role', v_actor.role,
        'required_approver_role', v_governance.required_approver_role
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Recreate approval evaluation with delegation-aware no-approver routing.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.evaluate_work_order_approval(p_work_order_id UUID)
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
    v_governance public.work_order_governance%ROWTYPE;
    v_before_governance public.work_order_governance%ROWTYPE;
    v_rule public.approval_matrix_rules%ROWTYPE;
    v_asset_criticality TEXT := 'medium';
    v_severity TEXT;
    v_severity_rank INTEGER;
    v_criticality_rank INTEGER;
    v_amount NUMERIC;
    v_amount_source TEXT := 'none';
    v_role_resolution JSONB;
    v_requested_role TEXT;
    v_required_role TEXT;
    v_escalated BOOLEAN;
    v_escalation_reason TEXT;
    v_route_type TEXT := 'standard';
    v_context JSONB;
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
        RAISE EXCEPTION 'Inactive users cannot evaluate governance approval'
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
       AND v_actor_role NOT IN ('tenant_admin', 'maintenance_manager', 'supervisor', 'engineer') THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to evaluate governance approval'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_governance
      FROM public.work_order_governance
     WHERE work_order_id = p_work_order_id
     FOR UPDATE;

    IF FOUND THEN
        v_route_type := v_governance.route_type;
    ELSE
        INSERT INTO public.work_order_governance (
            tenant_id,
            work_order_id,
            route_type,
            governance_state
        )
        VALUES (
            v_wo.tenant_id,
            v_wo.id,
            'standard',
            'standard'
        )
        RETURNING * INTO v_governance;
    END IF;

    IF v_route_type = 'standard' AND v_wo.status NOT IN ('pending', 'assigned') THEN
        RAISE EXCEPTION 'Standard governance approval can only be evaluated before work starts; current status=%',
            v_wo.status
            USING ERRCODE = '22023';
    END IF;

    IF v_wo.asset_id IS NOT NULL THEN
        SELECT COALESCE(a.criticality, 'medium')
          INTO v_asset_criticality
          FROM public.assets a
         WHERE a.id = v_wo.asset_id;
        v_asset_criticality := COALESCE(v_asset_criticality, 'medium');
    END IF;

    IF v_route_type = 'emergency_override' THEN
        v_severity := COALESCE(v_governance.override_severity, v_wo.priority::TEXT, 'medium');
    ELSE
        v_severity := CASE v_wo.priority
            WHEN 'urgent' THEN 'critical'
            WHEN 'high' THEN 'high'
            WHEN 'medium' THEN 'medium'
            WHEN 'low' THEN 'low'
            ELSE 'medium'
        END;
    END IF;

    IF v_wo.estimated_cost IS NOT NULL AND v_wo.estimated_cost >= 0 THEN
        v_amount := v_wo.estimated_cost;
        v_amount_source := 'estimated_cost';
    ELSE
        v_amount := NULL;
        v_amount_source := 'none';
    END IF;

    v_severity_rank := public.governance_severity_rank(v_severity);
    v_criticality_rank := public.governance_criticality_rank(v_asset_criticality);
    v_rule := public.select_approval_matrix_rule(v_wo.tenant_id, v_severity_rank, v_criticality_rank, v_amount);
    v_role_resolution := public.governance_resolve_required_role(
        v_wo.tenant_id,
        v_rule.required_approver_role,
        v_rule.escalation_role,
        v_wo.id,
        v_amount
    );
    v_requested_role := v_role_resolution->>'requested_role';
    v_required_role := v_role_resolution->>'required_role';
    v_escalated := COALESCE((v_role_resolution->>'escalated')::BOOLEAN, FALSE);
    v_escalation_reason := v_role_resolution->>'reason';

    v_context := jsonb_build_object(
        'decision_mode', CASE WHEN v_rule.auto_approve THEN 'auto' ELSE 'manual_required' END,
        'route_type', v_route_type,
        'approval_rule_id', v_rule.id,
        'approval_tier', v_rule.approval_tier,
        'requested_approver_role', v_requested_role,
        'required_approver_role', v_required_role,
        'severity', v_severity,
        'severity_rank', v_severity_rank,
        'asset_criticality', v_asset_criticality,
        'asset_criticality_rank', v_criticality_rank,
        'amount', v_amount,
        'amount_source', v_amount_source,
        'escalated', v_escalated,
        'escalation_reason', v_escalation_reason,
        'decision_route_resolution', v_role_resolution
    );

    v_before_governance := v_governance;

    UPDATE public.work_order_governance
       SET approval_rule_id = v_rule.id,
           approval_tier = v_rule.approval_tier,
           requested_approver_role = v_requested_role,
           required_approver_role = v_required_role,
           escalated_from_role = CASE WHEN v_escalated THEN v_requested_role ELSE NULL END,
           approval_escalation_reason = CASE WHEN v_escalated THEN v_escalation_reason ELSE NULL END,
           approval_amount = v_amount,
           approval_amount_source = v_amount_source,
           severity_snapshot = v_severity,
           asset_criticality_snapshot = v_asset_criticality,
           approval_requested_by = v_actor_id,
           approval_requested_at = COALESCE(approval_requested_at, NOW()),
           approval_due_at = NOW() + make_interval(hours => v_rule.decision_deadline_hours),
           approval_escalated_at = CASE WHEN v_escalated THEN NOW() ELSE approval_escalated_at END,
           updated_at = NOW()
     WHERE id = v_governance.id
     RETURNING * INTO v_governance;

    IF v_route_type = 'emergency_override' THEN
        PERFORM public.create_governance_log_event(
            v_wo.tenant_id,
            v_wo.id,
            'Approval matrix evaluated for emergency governance',
            NULL,
            v_actor_id,
            'governance.approval_matrix_evaluated',
            'work_order_governance',
            v_governance.id,
            to_jsonb(v_before_governance),
            to_jsonb(v_governance),
            v_context
        );

        IF v_escalated THEN
            PERFORM public.create_governance_log_event(
                v_wo.tenant_id,
                v_wo.id,
                'Governance approval escalated because the requested approver role has no active approver or delegate',
                v_escalation_reason,
                v_actor_id,
                'governance.approval_escalated',
                'work_order_governance',
                v_governance.id,
                to_jsonb(v_before_governance),
                to_jsonb(v_governance),
                v_context
            );
        END IF;

        RETURN jsonb_build_object(
            'success', TRUE,
            'work_order_id', v_wo.id,
            'governance_id', v_governance.id,
            'route_type', v_route_type,
            'governance_state', v_governance.governance_state,
            'approval_rule_id', v_rule.id,
            'approval_tier', v_rule.approval_tier,
            'requested_approver_role', v_requested_role,
            'required_approver_role', v_required_role,
            'escalated', v_escalated,
            'amount', v_amount,
            'amount_source', v_amount_source
        );
    END IF;

    IF v_governance.governance_state NOT IN ('pending_approval', 'approved') THEN
        PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE);
        PERFORM set_config('app.governance_event_type', 'governance.approval_requested', TRUE);
        PERFORM set_config('app.governance_event_description', 'Standard work order approval requested by approval matrix', TRUE);
        PERFORM set_config('app.governance_event_context', v_context::TEXT, TRUE);

        UPDATE public.work_order_governance
           SET governance_state = 'pending_approval',
               updated_at = NOW()
         WHERE id = v_governance.id
         RETURNING * INTO v_governance;
    END IF;

    IF v_escalated THEN
        PERFORM public.create_governance_log_event(
            v_wo.tenant_id,
            v_wo.id,
            'Governance approval escalated because the requested approver role has no active approver or delegate',
            v_escalation_reason,
            v_actor_id,
            'governance.approval_escalated',
            'work_order_governance',
            v_governance.id,
            to_jsonb(v_before_governance),
            to_jsonb(v_governance),
            v_context
        );
    END IF;

    IF v_rule.auto_approve THEN
        PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE);
        PERFORM set_config('app.governance_event_type', 'governance.approved', TRUE);
        PERFORM set_config('app.governance_event_description', 'Standard work order auto-approved by approval matrix', TRUE);
        PERFORM set_config(
            'app.governance_event_context',
            (v_context || jsonb_build_object('decision_mode', 'auto'))::TEXT,
            TRUE
        );

        UPDATE public.work_order_governance
           SET governance_state = 'approved',
               decision_by = v_actor_id,
               decision_at = NOW(),
               decision_notes = 'Auto-approved by approval matrix',
               updated_at = NOW()
         WHERE id = v_governance.id
         RETURNING * INTO v_governance;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', v_wo.id,
        'governance_id', v_governance.id,
        'route_type', v_route_type,
        'governance_state', v_governance.governance_state,
        'approval_rule_id', v_rule.id,
        'approval_tier', v_rule.approval_tier,
        'requested_approver_role', v_requested_role,
        'required_approver_role', v_required_role,
        'escalated', v_escalated,
        'amount', v_amount,
        'amount_source', v_amount_source
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Recreate decision RPCs with delegated authority checks. Signatures stay.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_governance_decision(
    p_work_order_id UUID,
    p_notes TEXT DEFAULT NULL
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
    v_governance public.work_order_governance%ROWTYPE;
    v_decision_authority JSONB;
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
        RAISE EXCEPTION 'Inactive users cannot approve governance decisions'
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

    SELECT *
      INTO v_governance
      FROM public.work_order_governance
     WHERE work_order_id = p_work_order_id
       AND route_type = 'standard'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Standard governance record not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_governance.governance_state <> 'pending_approval' THEN
        RAISE EXCEPTION 'Cannot approve standard governance from governance_state: %',
            v_governance.governance_state
            USING ERRCODE = '22023';
    END IF;

    v_decision_authority := public.governance_resolve_decision_actor(v_actor_id, v_governance.id);

    IF NOT COALESCE((v_decision_authority->>'authorized')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION 'Unauthorized: required approver role is %, your role is %; reason=%',
            v_governance.required_approver_role,
            v_actor_role,
            COALESCE(v_decision_authority->>'reason', 'not_authorized')
            USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE);
    PERFORM set_config('app.governance_event_type', 'governance.approved', TRUE);
    PERFORM set_config('app.governance_event_description', 'Standard governance approved', TRUE);
    PERFORM set_config(
        'app.governance_event_context',
        (
            jsonb_build_object(
                'notes', p_notes,
                'required_approver_role', v_governance.required_approver_role,
                'approval_tier', v_governance.approval_tier
            )
            || v_decision_authority
        )::TEXT,
        TRUE
    );

    UPDATE public.work_order_governance
       SET governance_state = 'approved',
           decision_by = v_actor_id,
           decision_at = NOW(),
           decision_notes = NULLIF(BTRIM(p_notes), ''),
           updated_at = NOW()
     WHERE id = v_governance.id
     RETURNING * INTO v_governance;

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', p_work_order_id,
        'governance_id', v_governance.id,
        'governance_state', v_governance.governance_state,
        'required_approver_role', v_governance.required_approver_role,
        'decision_authority', v_decision_authority
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_governance_decision(
    p_work_order_id UUID,
    p_reason TEXT
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
    v_governance public.work_order_governance%ROWTYPE;
    v_decision_authority JSONB;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF COALESCE(BTRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Standard governance rejection reason is required'
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
        RAISE EXCEPTION 'Inactive users cannot reject governance decisions'
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

    SELECT *
      INTO v_governance
      FROM public.work_order_governance
     WHERE work_order_id = p_work_order_id
       AND route_type = 'standard'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Standard governance record not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_governance.governance_state <> 'pending_approval' THEN
        RAISE EXCEPTION 'Cannot reject standard governance from governance_state: %',
            v_governance.governance_state
            USING ERRCODE = '22023';
    END IF;

    v_decision_authority := public.governance_resolve_decision_actor(v_actor_id, v_governance.id);

    IF NOT COALESCE((v_decision_authority->>'authorized')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION 'Unauthorized: required approver role is %, your role is %; reason=%',
            v_governance.required_approver_role,
            v_actor_role,
            COALESCE(v_decision_authority->>'reason', 'not_authorized')
            USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE);
    PERFORM set_config('app.governance_event_type', 'governance.rejected', TRUE);
    PERFORM set_config('app.governance_event_description', 'Standard governance rejected', TRUE);
    PERFORM set_config(
        'app.governance_event_context',
        (
            jsonb_build_object(
                'reason', BTRIM(p_reason),
                'required_approver_role', v_governance.required_approver_role,
                'approval_tier', v_governance.approval_tier
            )
            || v_decision_authority
        )::TEXT,
        TRUE
    );

    UPDATE public.work_order_governance
       SET governance_state = 'rejected',
           decision_by = v_actor_id,
           decision_at = NOW(),
           rejection_reason = BTRIM(p_reason),
           updated_at = NOW()
     WHERE id = v_governance.id
     RETURNING * INTO v_governance;

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', p_work_order_id,
        'governance_id', v_governance.id,
        'governance_state', v_governance.governance_state,
        'required_approver_role', v_governance.required_approver_role,
        'decision_authority', v_decision_authority
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_emergency_governance(
    p_work_order_id UUID,
    p_notes TEXT DEFAULT NULL
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
    v_decision_authority JSONB;
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
        RAISE EXCEPTION 'Inactive users cannot approve emergency governance'
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

    SELECT *
      INTO v_governance
      FROM public.work_order_governance
     WHERE work_order_id = p_work_order_id
       AND route_type = 'emergency_override'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Emergency governance record not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_governance.required_approver_role IS NULL THEN
        PERFORM public.evaluate_work_order_approval(p_work_order_id);

        SELECT *
          INTO v_governance
          FROM public.work_order_governance
         WHERE work_order_id = p_work_order_id
           AND route_type = 'emergency_override'
         FOR UPDATE;
    END IF;

    IF v_governance.governance_state <> 'post_action_complete' THEN
        RAISE EXCEPTION 'Cannot approve emergency governance from governance_state: %',
            v_governance.governance_state
            USING ERRCODE = '22023';
    END IF;

    v_decision_authority := public.governance_resolve_decision_actor(v_actor_id, v_governance.id);

    IF NOT COALESCE((v_decision_authority->>'authorized')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION 'Unauthorized: required approver role is %, your role is %; reason=%',
            v_governance.required_approver_role,
            v_actor_role,
            COALESCE(v_decision_authority->>'reason', 'not_authorized')
            USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE);
    PERFORM set_config('app.governance_event_type', 'governance.approved', TRUE);
    PERFORM set_config('app.governance_event_description', 'Emergency governance approved', TRUE);
    PERFORM set_config(
        'app.governance_event_context',
        (
            jsonb_build_object(
                'notes', p_notes,
                'required_approver_role', v_governance.required_approver_role,
                'approval_tier', v_governance.approval_tier
            )
            || v_decision_authority
        )::TEXT,
        TRUE
    );

    UPDATE public.work_order_governance
       SET governance_state = 'approved',
           decision_by = v_actor_id,
           decision_at = NOW(),
           decision_notes = NULLIF(BTRIM(p_notes), ''),
           updated_at = NOW()
     WHERE id = v_governance.id
     RETURNING * INTO v_governance;

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', p_work_order_id,
        'governance_id', v_governance.id,
        'governance_state', v_governance.governance_state,
        'required_approver_role', v_governance.required_approver_role,
        'decision_authority', v_decision_authority
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_emergency_governance(
    p_work_order_id UUID,
    p_reason TEXT
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
    v_decision_authority JSONB;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF COALESCE(BTRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Emergency governance rejection reason is required'
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
        RAISE EXCEPTION 'Inactive users cannot reject emergency governance'
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

    SELECT *
      INTO v_governance
      FROM public.work_order_governance
     WHERE work_order_id = p_work_order_id
       AND route_type = 'emergency_override'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Emergency governance record not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_governance.required_approver_role IS NULL THEN
        PERFORM public.evaluate_work_order_approval(p_work_order_id);

        SELECT *
          INTO v_governance
          FROM public.work_order_governance
         WHERE work_order_id = p_work_order_id
           AND route_type = 'emergency_override'
         FOR UPDATE;
    END IF;

    IF v_governance.governance_state <> 'post_action_complete' THEN
        RAISE EXCEPTION 'Cannot reject emergency governance from governance_state: %',
            v_governance.governance_state
            USING ERRCODE = '22023';
    END IF;

    v_decision_authority := public.governance_resolve_decision_actor(v_actor_id, v_governance.id);

    IF NOT COALESCE((v_decision_authority->>'authorized')::BOOLEAN, FALSE) THEN
        RAISE EXCEPTION 'Unauthorized: required approver role is %, your role is %; reason=%',
            v_governance.required_approver_role,
            v_actor_role,
            COALESCE(v_decision_authority->>'reason', 'not_authorized')
            USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.governance_workflow_authorized', 'true', TRUE);
    PERFORM set_config('app.governance_event_type', 'governance.rejected', TRUE);
    PERFORM set_config('app.governance_event_description', 'Emergency governance rejected', TRUE);
    PERFORM set_config(
        'app.governance_event_context',
        (
            jsonb_build_object(
                'reason', BTRIM(p_reason),
                'required_approver_role', v_governance.required_approver_role,
                'approval_tier', v_governance.approval_tier
            )
            || v_decision_authority
        )::TEXT,
        TRUE
    );

    UPDATE public.work_order_governance
       SET governance_state = 'rejected',
           decision_by = v_actor_id,
           decision_at = NOW(),
           rejection_reason = BTRIM(p_reason),
           updated_at = NOW()
     WHERE id = v_governance.id
     RETURNING * INTO v_governance;

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', p_work_order_id,
        'governance_id', v_governance.id,
        'governance_state', v_governance.governance_state,
        'required_approver_role', v_governance.required_approver_role,
        'decision_authority', v_decision_authority
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Delegation-aware decision queue. Still a security_invoker filter over
--    existing governance_state, not a duplicated state store.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.governance_decision_queue
WITH (security_invoker = true)
AS
SELECT
    g.id AS governance_id,
    g.tenant_id,
    g.work_order_id,
    w.code::TEXT AS work_order_code,
    w.title::TEXT AS work_order_title,
    g.route_type,
    g.governance_state,
    g.approval_tier,
    g.required_approver_role,
    g.approval_amount,
    g.approval_amount_source,
    g.severity_snapshot,
    g.asset_criticality_snapshot,
    g.approval_due_at,
    g.created_at,
    CASE
        WHEN direct_route.authorized THEN 'direct'
        WHEN delegated_route.delegation_id IS NOT NULL THEN 'delegated'
        ELSE NULL
    END AS decision_route,
    delegated_route.delegation_id,
    delegated_route.delegator_id
FROM public.work_order_governance g
JOIN public.work_orders w
  ON w.id = g.work_order_id
 AND w.tenant_id = g.tenant_id
JOIN public.profiles actor
  ON actor.id = auth.uid()
 AND actor.tenant_id = g.tenant_id
 AND COALESCE(actor.is_active, TRUE) IS TRUE
LEFT JOIN LATERAL (
    SELECT TRUE AS authorized
     WHERE public.governance_actor_can_decide(actor.role::TEXT, g.required_approver_role, COALESCE(actor.is_super_admin, FALSE))
       AND public.governance_native_authority_covers_work_order(
            g.tenant_id,
            actor.id,
            actor.role::TEXT,
            COALESCE(g.approval_amount, 0),
            g.work_order_id
       )
) direct_route ON TRUE
LEFT JOIN LATERAL (
    SELECT d.id AS delegation_id, d.delegator_id
      FROM public.governance_delegations d
     WHERE d.tenant_id = g.tenant_id
       AND d.delegate_id = actor.id
       AND d.scope_role = g.required_approver_role
       AND public.governance_delegation_covers_work_order(
            d.id,
            g.work_order_id,
            COALESCE(g.approval_amount, 0),
            g.required_approver_role
       )
     ORDER BY d.valid_until ASC, d.created_at ASC
     LIMIT 1
) delegated_route ON TRUE
WHERE (
        (
            g.route_type = 'standard'
            AND g.governance_state = 'pending_approval'
        )
        OR (
            g.route_type = 'emergency_override'
            AND g.governance_state = 'post_action_complete'
        )
    )
    AND (
        COALESCE(direct_route.authorized, FALSE)
        OR delegated_route.delegation_id IS NOT NULL
    );

COMMENT ON VIEW public.governance_decision_queue IS
    'Wave 3 delegation-aware role-scoped Field Governance decision queue. SECURITY INVOKER view; no duplicated queue state.';

REVOKE ALL PRIVILEGES ON TABLE public.governance_decision_queue FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.governance_decision_queue FROM PUBLIC;
GRANT SELECT ON TABLE public.governance_decision_queue TO authenticated;

CREATE OR REPLACE FUNCTION public.get_governance_decision_queue()
RETURNS TABLE (
    governance_id UUID,
    work_order_id UUID,
    work_order_code TEXT,
    work_order_title TEXT,
    route_type TEXT,
    governance_state TEXT,
    approval_tier TEXT,
    required_approver_role TEXT,
    approval_amount NUMERIC,
    approval_amount_source TEXT,
    severity_snapshot TEXT,
    asset_criticality_snapshot TEXT,
    approval_due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        q.governance_id,
        q.work_order_id,
        q.work_order_code,
        q.work_order_title,
        q.route_type,
        q.governance_state,
        q.approval_tier,
        q.required_approver_role,
        q.approval_amount,
        q.approval_amount_source,
        q.severity_snapshot,
        q.asset_criticality_snapshot,
        q.approval_due_at,
        q.created_at
      FROM public.governance_decision_queue q
     ORDER BY q.approval_due_at NULLS LAST, q.created_at ASC;
$$;

ALTER FUNCTION public.get_governance_decision_queue() SECURITY INVOKER;

-- -----------------------------------------------------------------------------
-- 10. Grants. Public decision signatures are preserved; internal helpers stay
--     off the public API unless the security_invoker queue needs a boolean helper.
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.governance_resolve_scope(UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.governance_scope_is_valid_for_tenant(UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.governance_scope_contains(UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.governance_authority_profile_specific_exists(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_default_governance_authority_limits(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.governance_native_authority_for_scope(UUID, UUID, TEXT, NUMERIC, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.governance_native_authority_for_work_order(UUID, UUID, TEXT, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.governance_has_active_decision_route(UUID, TEXT, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.governance_resolve_required_role(UUID, TEXT, TEXT, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.governance_resolve_decision_actor(UUID, UUID) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.governance_scope_covers_work_order(UUID, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.governance_native_authority_covers_work_order(UUID, UUID, TEXT, NUMERIC, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.governance_delegation_covers_work_order(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.governance_scope_covers_work_order(UUID, UUID, UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_native_authority_covers_work_order(UUID, UUID, TEXT, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_delegation_covers_work_order(UUID, UUID, NUMERIC, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_governance_authority_limit(TEXT, TEXT, NUMERIC, UUID, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_governance_authority_limit(TEXT, TEXT, NUMERIC, UUID, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_governance_authority_limit(TEXT, TEXT, NUMERIC, UUID, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_governance_delegation(UUID, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_governance_delegation(UUID, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_governance_delegation(UUID, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revoke_governance_delegation(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_governance_delegation(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_governance_delegation(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.evaluate_work_order_approval(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.evaluate_work_order_approval(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.evaluate_work_order_approval(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.approve_governance_decision(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_governance_decision(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_governance_decision(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_governance_decision(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_governance_decision(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_governance_decision(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.approve_emergency_governance(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_emergency_governance(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_emergency_governance(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_emergency_governance(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_emergency_governance(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_emergency_governance(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_governance_decision_queue() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_governance_decision_queue() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_governance_decision_queue() TO authenticated;

COMMENT ON FUNCTION public.create_governance_delegation(
    UUID, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID, UUID, UUID, TEXT
) IS
    'Creates a tenant-scoped governance delegation from the caller native authority only. Delegation chaining is blocked in v1.';

COMMENT ON FUNCTION public.governance_resolve_decision_actor(UUID, UUID) IS
    'Resolves whether the actual actor may decide a governance row directly or through a valid delegation. Used by approval/rejection RPCs.';
