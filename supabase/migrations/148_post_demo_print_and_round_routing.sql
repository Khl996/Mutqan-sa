-- =============================================================================
-- Migration: 148_post_demo_print_and_round_routing.sql
-- Purpose:
--   Post-demo polish for hospital print identity and round-observation routing.
--
-- Additive / compatibility notes:
--   * Reuses tenants.settings->pdf_identity for generic print configuration:
--       print_letterhead_url (full header image, highest priority)
--       print_logo_url       (logo for composed fallback header)
--       print_header_name    (large composed fallback header name)
--       print_header_secondary (optional secondary line, blank for now)
--   * Reuses existing teams / work_orders.assigned_team for routing.
--   * Adds a routed overload for convert_observation_to_wo(observation, team).
-- =============================================================================

UPDATE public.tenants
   SET settings = COALESCE(settings, '{}'::jsonb)
      || jsonb_build_object(
          'pdf_identity',
          COALESCE(settings->'pdf_identity', '{}'::jsonb)
          || jsonb_build_object(
              'print_letterhead_url', NULL,
              'print_logo_url', '/tenant-assets/3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a/print/hospital-logo.png',
              'print_header_name', 'مستشفى الصحة النفسية بالقريات',
              'print_header_secondary', '',
              'organization_name_ar', 'مستشفى الصحة النفسية بالقريات'
          )
      )
 WHERE id = '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a';

INSERT INTO public.teams (
    tenant_id,
    code,
    name,
    name_ar,
    description,
    type,
    specializations,
    status
) VALUES
    (
      '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a',
      'RT-CLEAN',
      'Cleaning Team',
      'فريق النظافة',
      'Routing team for cleaning observations and housekeeping work orders.',
      'maintenance',
      ARRAY['cleaning']::text[],
      'active'
    ),
    (
      '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a',
      'RT-ELEC',
      'Electrical Team',
      'كهرباء',
      'Routing team for electrical observations.',
      'maintenance',
      ARRAY['electrical']::text[],
      'active'
    ),
    (
      '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a',
      'RT-PLUMB',
      'Plumbing Team',
      'سباكة',
      'Routing team for plumbing observations.',
      'maintenance',
      ARRAY['plumbing']::text[],
      'active'
    ),
    (
      '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a',
      'RT-HVAC',
      'HVAC Team',
      'تكييف وتبريد',
      'Routing team for air conditioning and refrigeration observations.',
      'maintenance',
      ARRAY['hvac']::text[],
      'active'
    ),
    (
      '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a',
      'RT-CIVIL',
      'Civil Team',
      'مدني',
      'Routing team for civil and building fabric observations.',
      'maintenance',
      ARRAY['civil']::text[],
      'active'
    ),
    (
      '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a',
      'RT-GEN',
      'General Maintenance Team',
      'عام',
      'Routing team for general maintenance observations.',
      'maintenance',
      ARRAY['general']::text[],
      'active'
    )
ON CONFLICT (tenant_id, code) DO UPDATE
   SET name = EXCLUDED.name,
       name_ar = EXCLUDED.name_ar,
       description = EXCLUDED.description,
       type = EXCLUDED.type,
       specializations = EXCLUDED.specializations,
       status = EXCLUDED.status,
       updated_at = NOW();

CREATE OR REPLACE FUNCTION public.convert_observation_to_wo(
    p_observation_id UUID,
    p_assigned_team_id UUID
)
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
    v_assigned_team  public.teams%ROWTYPE;
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
            'assigned_team_id', v_work_order.assigned_team,
            'already_converted', TRUE
        );
    END IF;

    IF p_assigned_team_id IS NULL THEN
        RAISE EXCEPTION 'Assigned team is required for round observation conversion'
            USING ERRCODE = '23502';
    END IF;

    SELECT *
      INTO v_assigned_team
      FROM public.teams t
     WHERE t.id = p_assigned_team_id
       AND t.tenant_id = v_round.tenant_id
       AND COALESCE(t.status, 'active') = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assigned team does not belong to this tenant or is inactive'
            USING ERRCODE = '42501';
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
        'الفريق/التخصص: ' || COALESCE(v_assigned_team.name_ar, v_assigned_team.name) || E'\n' ||
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
        'assigned_team', v_assigned_team.id,
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
        'assignment',
        'تم توجيه أمر العمل من ملاحظة جولة إلى الفريق: ' || COALESCE(v_assigned_team.name_ar, v_assigned_team.name),
        v_actor_id
    );

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
        'assigned_team_id', v_assigned_team.id,
        'assigned_team_name', COALESCE(v_assigned_team.name_ar, v_assigned_team.name),
        'already_converted', FALSE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.convert_observation_to_wo(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_observation_to_wo(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.convert_observation_to_wo(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.convert_observation_to_wo(UUID, UUID) IS
    'Converts a round observation into a work order after validating the selected same-tenant routing team.';
