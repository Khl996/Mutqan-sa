-- =============================================================================
-- Migration: 147_rounds_v0.sql
-- Feature: Supervisor rounds v0
--
-- Additive only:
--   * rounds
--   * round_observations
--   * four SECURITY DEFINER RPCs:
--       create_round, add_round_observation, complete_round,
--       convert_observation_to_wo
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rounds (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    round_type    TEXT NOT NULL,
    supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'in_progress',
    summary       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rounds_round_type_check
        CHECK (round_type IN ('maintenance', 'cleaning')),
    CONSTRAINT rounds_status_check
        CHECK (status IN ('in_progress', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_rounds_tenant_started
    ON public.rounds (tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_rounds_supervisor_started
    ON public.rounds (supervisor_id, started_at DESC);

ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.round_observations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    round_id              UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
    location_id           UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    observation_text      TEXT NOT NULL,
    action_taken          TEXT,
    needs_work_order      BOOLEAN NOT NULL DEFAULT FALSE,
    created_work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_round_observations_round
    ON public.round_observations (round_id, created_at);

CREATE INDEX IF NOT EXISTS idx_round_observations_tenant
    ON public.round_observations (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_round_observations_work_order
    ON public.round_observations (created_work_order_id)
    WHERE created_work_order_id IS NOT NULL;

ALTER TABLE public.round_observations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rounds_can_view_all_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND COALESCE(p.is_active, TRUE) = TRUE
           AND (
                COALESCE(p.is_super_admin, FALSE) = TRUE
                OR p.role IN ('platform_owner', 'platform_admin')
                OR (
                    p.tenant_id = p_tenant_id
                    AND p.role IN ('tenant_admin', 'facility_manager', 'maintenance_manager', 'engineer')
                )
           )
    );
$$;

CREATE OR REPLACE FUNCTION public.rounds_can_create_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND COALESCE(p.is_active, TRUE) = TRUE
           AND p.tenant_id = p_tenant_id
           AND public.tenant_has_operational_access(p_tenant_id)
           AND p.role IN ('tenant_admin', 'facility_manager', 'maintenance_manager', 'supervisor', 'engineer')
    );
$$;

CREATE OR REPLACE FUNCTION public.rounds_can_edit_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.rounds r
          JOIN public.profiles p
            ON p.id = auth.uid()
         WHERE r.id = p_round_id
           AND r.status = 'in_progress'
           AND r.supervisor_id = auth.uid()
           AND p.tenant_id = r.tenant_id
           AND COALESCE(p.is_active, TRUE) = TRUE
           AND p.role IN ('tenant_admin', 'facility_manager', 'maintenance_manager', 'supervisor', 'engineer')
    );
$$;

DROP POLICY IF EXISTS rounds_select ON public.rounds;
CREATE POLICY rounds_select ON public.rounds
    FOR SELECT TO authenticated
    USING (
        public.rounds_can_view_all_tenant(tenant_id)
        OR supervisor_id = auth.uid()
    );

DROP POLICY IF EXISTS round_observations_select ON public.round_observations;
CREATE POLICY round_observations_select ON public.round_observations
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.rounds r
             WHERE r.id = round_observations.round_id
               AND r.tenant_id = round_observations.tenant_id
               AND (
                    public.rounds_can_view_all_tenant(r.tenant_id)
                    OR r.supervisor_id = auth.uid()
               )
        )
    );

REVOKE ALL ON public.rounds FROM PUBLIC;
REVOKE ALL ON public.rounds FROM anon;
REVOKE ALL ON public.rounds FROM authenticated;
GRANT SELECT ON public.rounds TO authenticated;

REVOKE ALL ON public.round_observations FROM PUBLIC;
REVOKE ALL ON public.round_observations FROM anon;
REVOKE ALL ON public.round_observations FROM authenticated;
GRANT SELECT ON public.round_observations TO authenticated;

CREATE OR REPLACE FUNCTION public.create_round(p_round_type TEXT)
RETURNS public.rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor_id     UUID := auth.uid();
    v_actor_role   TEXT;
    v_actor_tenant UUID;
    v_round        public.rounds%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_round_type NOT IN ('maintenance', 'cleaning') THEN
        RAISE EXCEPTION 'Invalid round type: %', p_round_type USING ERRCODE = '22023';
    END IF;

    SELECT p.role, p.tenant_id
      INTO v_actor_role, v_actor_tenant
      FROM public.profiles p
     WHERE p.id = v_actor_id
       AND COALESCE(p.is_active, TRUE) = TRUE;

    IF v_actor_tenant IS NULL OR NOT public.rounds_can_create_tenant(v_actor_tenant) THEN
        RAISE EXCEPTION 'Insufficient permissions to create a round' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.rounds (tenant_id, round_type, supervisor_id)
    VALUES (v_actor_tenant, p_round_type, v_actor_id)
    RETURNING * INTO v_round;

    RETURN v_round;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_round_observation(
    p_round_id UUID,
    p_location_id UUID,
    p_observation_text TEXT,
    p_action_taken TEXT DEFAULT NULL,
    p_needs_work_order BOOLEAN DEFAULT FALSE
)
RETURNS public.round_observations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_round       public.rounds%ROWTYPE;
    v_observation public.round_observations%ROWTYPE;
BEGIN
    SELECT *
      INTO v_round
      FROM public.rounds
     WHERE id = p_round_id
     FOR UPDATE;

    IF NOT FOUND OR NOT public.rounds_can_edit_round(p_round_id) THEN
        RAISE EXCEPTION 'Round not found or not editable' USING ERRCODE = '42501';
    END IF;

    IF NULLIF(BTRIM(p_observation_text), '') IS NULL THEN
        RAISE EXCEPTION 'Observation text is required' USING ERRCODE = '23502';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.departments d
         WHERE d.id = p_location_id
           AND d.tenant_id = v_round.tenant_id
           AND COALESCE(d.is_active, TRUE) = TRUE
    ) THEN
        RAISE EXCEPTION 'Location does not belong to this tenant' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.round_observations (
        tenant_id,
        round_id,
        location_id,
        observation_text,
        action_taken,
        needs_work_order
    ) VALUES (
        v_round.tenant_id,
        p_round_id,
        p_location_id,
        BTRIM(p_observation_text),
        NULLIF(BTRIM(p_action_taken), ''),
        COALESCE(p_needs_work_order, FALSE)
    )
    RETURNING * INTO v_observation;

    RETURN v_observation;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_round(
    p_round_id UUID,
    p_summary TEXT DEFAULT NULL
)
RETURNS public.rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_round public.rounds%ROWTYPE;
BEGIN
    IF NOT public.rounds_can_edit_round(p_round_id) THEN
        RAISE EXCEPTION 'Round not found or not editable' USING ERRCODE = '42501';
    END IF;

    UPDATE public.rounds
       SET status = 'completed',
           completed_at = COALESCE(completed_at, NOW()),
           summary = NULLIF(BTRIM(p_summary), '')
     WHERE id = p_round_id
       AND status = 'in_progress'
    RETURNING * INTO v_round;

    IF v_round.id IS NULL THEN
        RAISE EXCEPTION 'Round could not be completed' USING ERRCODE = '22023';
    END IF;

    RETURN v_round;
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_observation_to_wo(p_observation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_actor_id       UUID := auth.uid();
    v_actor_role     TEXT;
    v_actor_tenant   UUID;
    v_actor_super    BOOLEAN := FALSE;
    v_observation    public.round_observations%ROWTYPE;
    v_round          public.rounds%ROWTYPE;
    v_location       public.departments%ROWTYPE;
    v_supervisor     public.profiles%ROWTYPE;
    v_issue_type_id  UUID;
    v_payload        JSONB;
    v_description    TEXT;
    v_title          TEXT;
    v_work_order     public.work_orders%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT p.role, p.tenant_id, COALESCE(p.is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_super
      FROM public.profiles p
     WHERE p.id = v_actor_id
       AND COALESCE(p.is_active, TRUE) = TRUE;

    SELECT *
      INTO v_observation
      FROM public.round_observations
     WHERE id = p_observation_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Observation not found' USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_round
      FROM public.rounds
     WHERE id = v_observation.round_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Round not found' USING ERRCODE = '42501';
    END IF;

    IF NOT (
        v_round.supervisor_id = v_actor_id
        OR public.rounds_can_view_all_tenant(v_round.tenant_id)
    ) THEN
        RAISE EXCEPTION 'Observation is not convertible by this user' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_create_work_orders_scope(v_round.tenant_id) THEN
        RAISE EXCEPTION 'Insufficient permissions to create work orders' USING ERRCODE = '42501';
    END IF;

    IF v_observation.created_work_order_id IS NOT NULL THEN
        SELECT *
          INTO v_work_order
          FROM public.work_orders
         WHERE id = v_observation.created_work_order_id;

        RETURN jsonb_build_object(
            'work_order_id', v_observation.created_work_order_id,
            'code', v_work_order.code,
            'already_converted', TRUE
        );
    END IF;

    SELECT *
      INTO v_location
      FROM public.departments
     WHERE id = v_observation.location_id
       AND tenant_id = v_observation.tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Observation location is invalid' USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_supervisor
      FROM public.profiles
     WHERE id = v_round.supervisor_id;

    SELECT it.id
      INTO v_issue_type_id
      FROM public.issue_types it
     WHERE it.code = 'other'
       AND (it.tenant_id IS NULL OR it.tenant_id = v_round.tenant_id)
     ORDER BY it.tenant_id NULLS FIRST
     LIMIT 1;

    v_title := 'جولة: ' || LEFT(REGEXP_REPLACE(BTRIM(v_observation.observation_text), '\s+', ' ', 'g'), 70);
    v_description :=
        'المصدر: جولة مشرف' || E'\n' ||
        'نوع الجولة: ' || CASE v_round.round_type WHEN 'cleaning' THEN 'نظافة' ELSE 'صيانة' END || E'\n' ||
        'المشرف: ' || COALESCE(v_supervisor.full_name_ar, v_supervisor.full_name, 'غير معروف') || E'\n' ||
        'الموقع: ' || COALESCE(v_location.name_ar, v_location.name) || E'\n\n' ||
        'الملاحظة: ' || v_observation.observation_text;

    IF v_observation.action_taken IS NOT NULL THEN
        v_description := v_description || E'\n\nالإجراء أثناء الجولة: ' || v_observation.action_taken;
    END IF;

    v_payload := jsonb_build_object(
        'title', v_title,
        'description', v_description,
        'priority', 'medium',
        'issue_type_id', v_issue_type_id,
        'issue_type', 'أخرى',
        'building_id', v_location.building_id,
        'floor_id', v_location.floor_id,
        'department_id', v_location.id,
        'reported_by', v_round.supervisor_id,
        'reporter_name', COALESCE(v_supervisor.full_name_ar, v_supervisor.full_name, 'جولة مشرف'),
        'source', 'round'
    );

    v_work_order := public.create_work_order(
        jsonb_strip_nulls(v_payload),
        CASE
            WHEN v_actor_super OR v_actor_role IN ('platform_owner', 'platform_admin')
                THEN v_round.tenant_id
            ELSE NULL
        END
    );

    UPDATE public.round_observations
       SET needs_work_order = TRUE,
           created_work_order_id = v_work_order.id
     WHERE id = p_observation_id;

    PERFORM public.create_operation_log(
        v_round.tenant_id,
        v_work_order.id,
        'comment',
        'المصدر: جولة مشرف. تم تحويل ملاحظة الجولة إلى أمر عمل.',
        v_actor_id
    );

    RETURN jsonb_build_object(
        'work_order_id', v_work_order.id,
        'code', v_work_order.code,
        'already_converted', FALSE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rounds_can_view_all_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rounds_can_create_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rounds_can_edit_round(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_round(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_round_observation(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_round(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_observation_to_wo(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.rounds_can_view_all_tenant(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rounds_can_create_tenant(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rounds_can_edit_round(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.create_round(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.add_round_observation(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM anon;
REVOKE ALL ON FUNCTION public.complete_round(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.convert_observation_to_wo(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.rounds_can_view_all_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rounds_can_create_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rounds_can_edit_round(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_round(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_round_observation(UUID, UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_round(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_observation_to_wo(UUID) TO authenticated;

COMMENT ON TABLE public.rounds IS
    'Supervisor rounds v0. Supervisors create their own maintenance/cleaning rounds; managers and engineers view tenant-wide rounds.';

COMMENT ON TABLE public.round_observations IS
    'Observation rows captured during supervisor rounds. A flagged observation may be converted to a work order via convert_observation_to_wo.';

