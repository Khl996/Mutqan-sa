-- P0: replace ambient trigger-depth trust with explicit PM snapshot authority.
--
-- The public ABI remains available to authenticated and service callers. User
-- calls must be active and pass the existing task visibility predicate. Trusted
-- work-order triggers call a postgres-only implementation in `internal`.

BEGIN;

SET LOCAL check_function_bodies = on;

DO $require_postgres_executor$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            'P0 PM snapshot hardening must be applied by postgres so SECURITY DEFINER ownership is deterministic';
    END IF;
END
$require_postgres_executor$;

CREATE SCHEMA IF NOT EXISTS internal AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.pm_build_task_execution_snapshot(
    p_task_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_task RECORD;
    v_sections jsonb := '[]'::jsonb;
    v_items jsonb := '[]'::jsonb;
    v_targets jsonb := '[]'::jsonb;
BEGIN
    SELECT
        mt.*,
        mp.name AS plan_name,
        mp.name_ar AS plan_name_ar,
        mfb.name AS bundle_name,
        mfb.name_ar AS bundle_name_ar,
        mfb.frequency_type AS bundle_frequency_type,
        mfb.interval_count AS bundle_interval_count,
        mfb.instructions AS bundle_instructions,
        ct.name AS template_name,
        ct.name_ar AS template_name_ar,
        ct.category AS template_category,
        ct.asset_type AS template_asset_type,
        ct.version AS template_version,
        ct.status AS template_status,
        ct.template_type AS template_type,
        ct.metadata AS template_metadata
      INTO v_task
      FROM public.maintenance_tasks mt
      LEFT JOIN public.maintenance_plans mp ON mp.id = mt.maintenance_plan_id
      LEFT JOIN public.maintenance_frequency_bundles mfb ON mfb.id = mt.frequency_bundle_id
      LEFT JOIN public.checklist_templates ct ON ct.id = mt.checklist_template_id
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF v_task.checklist_template_id IS NOT NULL THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', cts.id,
                    'code', cts.code,
                    'title', cts.title,
                    'title_ar', cts.title_ar,
                    'description', cts.description,
                    'description_ar', cts.description_ar,
                    'section_type', cts.section_type,
                    'sort_order', cts.sort_order,
                    'is_collapsible', cts.is_collapsible,
                    'metadata', cts.metadata
                )
                ORDER BY cts.sort_order, cts.created_at
            ),
            '[]'::jsonb
        )
        INTO v_sections
        FROM public.checklist_template_sections cts
        WHERE cts.template_id = v_task.checklist_template_id;

        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', cti.id,
                    'template_id', cti.template_id,
                    'section_id', cti.section_id,
                    'sort_order', cti.sort_order,
                    'label', cti.label,
                    'label_ar', cti.label_ar,
                    'item_type', cti.item_type,
                    'is_required', cti.is_required,
                    'is_critical', cti.is_critical,
                    'unit', cti.unit,
                    'min_value', cti.min_value,
                    'max_value', cti.max_value,
                    'warning_min_value', cti.warning_min_value,
                    'warning_max_value', cti.warning_max_value,
                    'placeholder', cti.placeholder,
                    'placeholder_ar', cti.placeholder_ar,
                    'help_text', cti.help_text,
                    'help_text_ar', cti.help_text_ar,
                    'applies_to_target_type', cti.applies_to_target_type,
                    'options', cti.options,
                    'description', cti.description,
                    'description_ar', cti.description_ar,
                    'metadata', cti.metadata,
                    'created_at', cti.created_at
                )
                ORDER BY COALESCE(cts.sort_order, 0), cti.sort_order, cti.created_at
            ),
            '[]'::jsonb
        )
        INTO v_items
        FROM public.checklist_template_items cti
        LEFT JOIN public.checklist_template_sections cts ON cts.id = cti.section_id
        WHERE cti.template_id = v_task.checklist_template_id;
    END IF;

    IF v_task.maintenance_plan_id IS NOT NULL THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', mpt.id,
                    'target_type', mpt.target_type,
                    'asset_id', mpt.asset_id,
                    'building_id', mpt.building_id,
                    -- Historical identity only; asset_groups remains retired.
                    'asset_group_id', mpt.asset_group_id,
                    'is_primary', mpt.is_primary,
                    'role', mpt.role,
                    'notes', mpt.notes,
                    'label_snapshot', COALESCE(
                        NULLIF(mpt.label_snapshot, '{}'::jsonb),
                        jsonb_strip_nulls(jsonb_build_object(
                            'asset_code', a.code,
                            'asset_name', a.name,
                            'asset_name_ar', a.name_ar,
                            'building_name', b.name,
                            'building_name_ar', b.name_ar
                        ))
                    )
                )
                ORDER BY mpt.is_primary DESC, mpt.created_at
            ),
            '[]'::jsonb
        )
        INTO v_targets
        FROM public.maintenance_plan_targets mpt
        LEFT JOIN public.assets a ON a.id = mpt.asset_id
        LEFT JOIN public.buildings b ON b.id = mpt.building_id
        WHERE mpt.plan_id = v_task.maintenance_plan_id;
    END IF;

    RETURN jsonb_build_object(
        'version', 2,
        'snapshot_type', 'pm_execution',
        'created_at', NOW(),
        'task', jsonb_build_object(
            'id', v_task.id,
            'title', v_task.title,
            'description', v_task.description,
            'asset_id', v_task.asset_id,
            'building_id', v_task.building_id,
            'assigned_to', v_task.assigned_to,
            'assigned_team_id', v_task.assigned_team_id,
            'requires_photo', v_task.requires_photo,
            'requires_signature', v_task.requires_signature,
            'estimated_duration_minutes', v_task.estimated_duration_minutes
        ),
        'plan', jsonb_build_object(
            'id', v_task.maintenance_plan_id,
            'name', v_task.plan_name,
            'name_ar', v_task.plan_name_ar
        ),
        'frequency_bundle', jsonb_build_object(
            'id', v_task.frequency_bundle_id,
            'name', v_task.bundle_name,
            'name_ar', v_task.bundle_name_ar,
            'frequency_type', v_task.bundle_frequency_type,
            'interval_count', v_task.bundle_interval_count,
            'instructions', v_task.bundle_instructions
        ),
        'template', jsonb_build_object(
            'id', v_task.checklist_template_id,
            'name', v_task.template_name,
            'name_ar', v_task.template_name_ar,
            'category', v_task.template_category,
            'asset_type', v_task.template_asset_type,
            'version', v_task.template_version,
            'status', v_task.template_status,
            'template_type', v_task.template_type,
            'metadata', v_task.template_metadata
        ),
        'targets', v_targets,
        'sections', v_sections,
        'items', v_items
    );
END;
$function$;

ALTER FUNCTION internal.pm_build_task_execution_snapshot(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION internal.pm_build_task_execution_snapshot(uuid)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.pm_build_task_execution_snapshot(uuid) TO postgres;

COMMENT ON FUNCTION internal.pm_build_task_execution_snapshot(uuid) IS
    'Postgres-only PM snapshot implementation for explicitly trusted wrappers and triggers.';

CREATE OR REPLACE FUNCTION public.pm_build_task_execution_snapshot(
    p_task_id uuid,
    p_skip_auth boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
    v_is_service_role boolean := COALESCE(auth.role() = 'service_role', false);
BEGIN
    -- p_skip_auth remains in the public ABI but deliberately has no effect.
    IF NOT v_is_service_role THEN
        IF v_actor_id IS NULL THEN
            RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
        END IF;

        IF public.current_actor_is_active() IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'Active profile required' USING ERRCODE = '42501';
        END IF;

        IF public.pm_can_view_task(p_task_id) IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'Unauthorized to build execution snapshot'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN internal.pm_build_task_execution_snapshot(p_task_id);
END;
$function$;

ALTER FUNCTION public.pm_build_task_execution_snapshot(uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.pm_build_task_execution_snapshot(uuid, boolean)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_build_task_execution_snapshot(uuid, boolean)
    TO authenticated, service_role, postgres;

COMMENT ON FUNCTION public.pm_build_task_execution_snapshot(uuid, boolean) IS
    'Authenticated PM snapshot ABI. p_skip_auth is deprecated and ignored; service-role authority is explicit.';

-- This trigger runs first by name. Build the snapshot here so its status update
-- cannot make the task invisible to the second work-order synchronization trigger.
CREATE OR REPLACE FUNCTION public.pm_sync_task_from_work_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_task_id uuid;
    v_plan_id uuid;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    SELECT mt.id, mt.maintenance_plan_id
      INTO v_task_id, v_plan_id
      FROM public.maintenance_tasks mt
     WHERE mt.related_work_order_id = NEW.id
       AND mt.status NOT IN ('completed', 'cancelled')
     LIMIT 1;

    IF v_task_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'completed' THEN
        UPDATE public.maintenance_tasks
           SET status                  = 'completed',
               execution_status        = 'completed',
               completed_at            = NOW(),
               execution_completed_at  = NOW(),
               actual_duration_minutes = GREATEST(0,
                   FLOOR(
                       EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, created_at))) / 60.0
                   )::integer
               ),
               execution_snapshot      = COALESCE(
                   execution_snapshot,
                   internal.pm_build_task_execution_snapshot(v_task_id)
               )
         WHERE id = v_task_id
           AND status = 'in_progress';

        PERFORM public.pm_update_plan_stats(v_plan_id);

    ELSIF NEW.status = 'in_progress' THEN
        UPDATE public.maintenance_tasks
           SET status             = 'in_progress',
               execution_status   = 'in_progress',
               started_at         = COALESCE(started_at, NOW()),
               execution_snapshot = COALESCE(
                   execution_snapshot,
                   internal.pm_build_task_execution_snapshot(v_task_id)
               )
         WHERE id = v_task_id
           AND status = 'pending';

        PERFORM public.pm_populate_task_checks_internal(v_task_id);
    END IF;

    RETURN NEW;
END;
$function$;

ALTER FUNCTION public.pm_sync_task_from_work_order() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.pm_sync_task_from_work_order()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pm_sync_task_from_work_order() TO postgres;

CREATE OR REPLACE FUNCTION public.sync_maintenance_task_from_work_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
    v_task RECORD;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'in_progress' THEN
        FOR v_task IN
            SELECT mt.id
              FROM public.maintenance_tasks mt
             WHERE mt.related_work_order_id = NEW.id
               AND mt.status = 'pending'
        LOOP
            UPDATE public.maintenance_tasks
               SET status = 'in_progress',
                   started_at = COALESCE(started_at, NOW()),
                   execution_snapshot = COALESCE(
                       execution_snapshot,
                       internal.pm_build_task_execution_snapshot(v_task.id)
                   ),
                   updated_at = NOW()
             WHERE id = v_task.id;

            PERFORM public.pm_populate_task_checks_internal(v_task.id);
        END LOOP;

        RETURN NEW;
    END IF;

    IF NEW.status = 'completed' THEN
        FOR v_task IN
            SELECT mt.id, mt.maintenance_plan_id
              FROM public.maintenance_tasks mt
             WHERE mt.related_work_order_id = NEW.id
               AND mt.status NOT IN ('completed', 'cancelled')
        LOOP
            UPDATE public.maintenance_tasks
               SET status = 'completed',
                   completed_at = COALESCE(completed_at, NOW()),
                   execution_snapshot = COALESCE(
                       execution_snapshot,
                       internal.pm_build_task_execution_snapshot(v_task.id)
                   ),
                   updated_at = NOW()
             WHERE id = v_task.id;

            PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);
        END LOOP;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$function$;

ALTER FUNCTION public.sync_maintenance_task_from_work_order() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_maintenance_task_from_work_order()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_maintenance_task_from_work_order() TO postgres;

-- Direct start/complete RPCs intentionally keep calling the checked public ABI.
-- Their SECURITY DEFINER identity must not become implicit snapshot authority.
ALTER FUNCTION public.pm_start_task(uuid) OWNER TO postgres;
ALTER FUNCTION public.pm_start_task(uuid)
    SET search_path TO 'pg_catalog', 'public', 'pg_temp';
REVOKE ALL ON FUNCTION public.pm_start_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_start_task(uuid)
    TO authenticated, service_role, postgres;

ALTER FUNCTION public.pm_complete_task(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.pm_complete_task(uuid, text)
    SET search_path TO 'pg_catalog', 'public', 'pg_temp';
REVOKE ALL ON FUNCTION public.pm_complete_task(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pm_complete_task(uuid, text)
    TO authenticated, service_role, postgres;

COMMIT;
