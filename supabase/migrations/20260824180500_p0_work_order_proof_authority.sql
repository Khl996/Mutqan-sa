-- P0 Proof of Work authority boundary.
--
-- Forward-only hardening. Historical migrations remain immutable.
-- The final document is generated dynamically from an authorized read; the
-- client is no longer allowed to author closure snapshots, PDF metadata, or
-- persistent PDF objects.

BEGIN;

SET LOCAL check_function_bodies = on;

DO $executor_precondition$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION
            USING ERRCODE = '42501',
                  MESSAGE = 'Proof of Work authority migration must be executed by postgres';
    END IF;
END;
$executor_precondition$;

-- Reject malformed future snapshots while tolerating the historical empty
-- object default. NOT VALID deliberately avoids rewriting experimental rows.
DO $snapshot_constraint$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.work_orders'::regclass
           AND conname = 'work_orders_pdf_snapshot_minimum_shape'
    ) THEN
        ALTER TABLE public.work_orders
            ADD CONSTRAINT work_orders_pdf_snapshot_minimum_shape
            CHECK (
                pdf_snapshot IS NULL
                OR pdf_snapshot = '{}'::jsonb
                OR (
                    jsonb_typeof(pdf_snapshot) = 'object'
                    AND NULLIF(BTRIM(pdf_snapshot ->> 'code'), '') IS NOT NULL
                    AND pdf_snapshot ->> 'code' = code
                    AND NULLIF(BTRIM(pdf_snapshot ->> 'closed_at'), '') IS NOT NULL
                    AND pg_input_is_valid(
                        pdf_snapshot ->> 'closed_at',
                        'timestamp with time zone'
                    )
                    AND (
                        pdf_snapshot ->> 'priority' IN ('low', 'medium', 'high', 'urgent')
                    ) IS TRUE
                    AND (jsonb_typeof(pdf_snapshot -> 'closed_by') = 'object') IS TRUE
                    AND NULLIF(BTRIM(pdf_snapshot #>> '{closed_by,id}'), '') IS NOT NULL
                    AND NULLIF(BTRIM(pdf_snapshot #>> '{closed_by,full_name}'), '') IS NOT NULL
                    AND (
                        NOT (pdf_snapshot ? 'contract_version')
                        OR (
                            jsonb_typeof(pdf_snapshot -> 'contract_version') = 'number'
                            AND pdf_snapshot ->> 'contract_version' = '2'
                            AND NULLIF(BTRIM(pdf_snapshot ->> 'title'), '') IS NOT NULL
                            AND pdf_snapshot ? 'asset'
                            AND (
                                pdf_snapshot -> 'asset' = 'null'::jsonb
                                OR (
                                    jsonb_typeof(pdf_snapshot -> 'asset') = 'object'
                                    AND NULLIF(BTRIM(pdf_snapshot #>> '{asset,id}'), '') IS NOT NULL
                                    AND NULLIF(BTRIM(pdf_snapshot #>> '{asset,code}'), '') IS NOT NULL
                                    AND NULLIF(BTRIM(pdf_snapshot #>> '{asset,name}'), '') IS NOT NULL
                                )
                            ) IS TRUE
                        ) IS TRUE
                    )
                )
            ) NOT VALID;
    END IF;
END;
$snapshot_constraint$;

-- Replace the historical closure implementation forward-only. The original
-- function did not take a row lock and did not consult the central suspension
-- authority, so two authorized callers could race and a suspended reporter
-- could still author a closure snapshot. Keep the accepted reporter/management
-- contract, but make actor activity and the locked row the source of truth.
CREATE OR REPLACE FUNCTION public.close_work_order(
    p_work_order_id uuid,
    p_notes text DEFAULT ''::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_actor_tenant uuid;
    v_is_super boolean := false;
    v_work_order public.work_orders%ROWTYPE;
    v_is_platform_override boolean := false;
    v_is_management_override boolean := false;
    v_pdf_snapshot jsonb;
BEGIN
    IF v_actor_id IS NULL OR NOT public.current_actor_is_active() THEN
        RAISE EXCEPTION 'An active authenticated profile is required to close a work order'
            USING ERRCODE = '28000';
    END IF;

    SELECT p.role, p.tenant_id, COALESCE(p.is_super_admin, false)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles p
     WHERE p.id = v_actor_id
       AND p.is_active IS TRUE;

    IF NOT FOUND OR (v_actor_role IS NULL AND NOT v_is_super) THEN
        RAISE EXCEPTION 'Active caller profile not found'
            USING ERRCODE = '28000';
    END IF;

    -- Serialize closure before evaluating tenant, reporter and state authority.
    -- A concurrent replay waits here, then observes the committed closed state
    -- and is rejected instead of replacing the first proof snapshot.
    SELECT wo.*
      INTO v_work_order
      FROM public.work_orders wo
     WHERE wo.id = p_work_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_is_platform_override := v_is_super
        OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override
        OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override
       AND v_actor_tenant IS DISTINCT FROM v_work_order.tenant_id
    THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_management_override
       AND v_work_order.reported_by IS DISTINCT FROM v_actor_id
    THEN
        RAISE EXCEPTION 'Only the original reporter can close this work order'
            USING ERRCODE = '42501';
    END IF;

    IF v_work_order.status IS DISTINCT FROM 'pending_reporter_closure' THEN
        RAISE EXCEPTION 'Cannot close work order in status: %', v_work_order.status
            USING ERRCODE = '22023';
    END IF;

    -- Build the accepted historical closure shape from server-owned rows. The
    -- proof trigger below adds contract_version/title/asset in the same UPDATE.
    SELECT jsonb_build_object(
               'code', v_work_order.code,
               'description', v_work_order.description,
               'priority', v_work_order.priority,
               'created_at', v_work_order.created_at,
               'closed_at', now(),
               'reporter_notes', p_notes,
               'reporter_image_url', v_work_order.reporter_image_url,
               'before_images', COALESCE(v_work_order.before_images, '[]'::jsonb),
               'after_images', COALESCE(v_work_order.after_images, '[]'::jsonb),
               'issue_type', CASE WHEN it.id IS NOT NULL THEN
                   jsonb_build_object(
                       'id', it.id,
                       'name', it.name,
                       'name_ar', it.name_ar
                   )
               ELSE NULL END,
               'building', CASE WHEN b.id IS NOT NULL THEN
                   jsonb_build_object(
                       'id', b.id,
                       'name', b.name,
                       'name_ar', b.name_ar
                   )
               ELSE NULL END,
               'floor', CASE WHEN fl.id IS NOT NULL THEN
                   jsonb_build_object(
                       'id', fl.id,
                       'name', fl.name,
                       'name_ar', fl.name_ar
                   )
               ELSE NULL END,
               'room', CASE WHEN rm.id IS NOT NULL THEN
                   jsonb_build_object(
                       'id', rm.id,
                       'name', rm.name,
                       'name_ar', rm.name_ar
                   )
               ELSE NULL END,
               'assigned_team', CASE WHEN tm.id IS NOT NULL THEN
                   jsonb_build_object(
                       'id', tm.id,
                       'name', tm.name,
                       'name_ar', tm.name_ar
                   )
               ELSE NULL END,
               'assignee', CASE WHEN assignee.id IS NOT NULL THEN
                   jsonb_build_object(
                       'id', assignee.id,
                       'full_name', COALESCE(
                           NULLIF(BTRIM(assignee.full_name), ''),
                           NULLIF(BTRIM(assignee.email), ''),
                           assignee.id::text
                       )
                   )
               ELSE NULL END,
               'reporter', CASE WHEN reporter.id IS NOT NULL THEN
                   jsonb_build_object(
                       'id', reporter.id,
                       'full_name', COALESCE(
                           NULLIF(BTRIM(reporter.full_name), ''),
                           NULLIF(BTRIM(reporter.email), ''),
                           reporter.id::text
                       )
                   )
               ELSE NULL END,
               'closed_by', jsonb_build_object(
                   'id', v_actor_id,
                   'full_name', COALESCE(
                       NULLIF(BTRIM(actor_profile.full_name), ''),
                       NULLIF(BTRIM(actor_profile.email), ''),
                       v_actor_id::text
                   )
               )
           )
      INTO v_pdf_snapshot
      FROM public.profiles actor_profile
      LEFT JOIN public.issue_types it
        ON it.id = v_work_order.issue_type_id
       AND (it.tenant_id IS NULL OR it.tenant_id = v_work_order.tenant_id)
      LEFT JOIN public.buildings b
        ON b.id = v_work_order.building_id
       AND b.tenant_id = v_work_order.tenant_id
      LEFT JOIN public.floors fl
        ON fl.id = v_work_order.floor_id
       AND fl.building_id = v_work_order.building_id
      LEFT JOIN public.rooms rm
        ON rm.id = v_work_order.room_id
       AND rm.tenant_id = v_work_order.tenant_id
      LEFT JOIN public.teams tm
        ON tm.id = v_work_order.assigned_team
       AND tm.tenant_id = v_work_order.tenant_id
      LEFT JOIN public.profiles assignee
        ON assignee.id = v_work_order.assigned_to
       AND assignee.tenant_id = v_work_order.tenant_id
      LEFT JOIN public.profiles reporter
        ON reporter.id = v_work_order.reported_by
       AND reporter.tenant_id = v_work_order.tenant_id
     WHERE actor_profile.id = v_actor_id;

    IF v_pdf_snapshot IS NULL THEN
        RAISE EXCEPTION 'Closure snapshot identity could not be resolved'
            USING ERRCODE = '23514';
    END IF;

    UPDATE public.work_orders
       SET status = 'completed',
           completed_at = now(),
           customer_reviewed_by = v_actor_id,
           customer_reviewed_at = now(),
           reporter_notes = p_notes,
           pdf_snapshot = v_pdf_snapshot,
           updated_at = now()
     WHERE id = v_work_order.id;

    PERFORM public.create_operation_log(
        v_work_order.tenant_id,
        v_work_order.id,
        'maintenance',
        'Work order closed',
        v_actor_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.close_work_order(uuid, text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_work_order(uuid, text)
    TO authenticated, postgres, service_role;

COMMENT ON FUNCTION public.close_work_order(uuid, text) IS
    'Fail-closed reporter/management closure: requires an active actor, serializes the target row, and creates a server-owned Proof of Work snapshot.';

-- Enrich every future completed closure snapshot with the immutable subject of
-- the work: its title and asset identity. This avoids rewriting the historical
-- close_work_order() migration while moving new closures to contract v2.
-- Once a non-empty proof snapshot exists, its subject cannot be rebound by an
-- ordinary UPDATE; corrections require an explicit future amendment contract.
CREATE OR REPLACE FUNCTION public.seal_work_order_proof_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_asset jsonb;
BEGIN
    IF OLD.pdf_snapshot IS NOT NULL
       AND OLD.pdf_snapshot <> '{}'::jsonb
       AND NEW.pdf_snapshot IS DISTINCT FROM OLD.pdf_snapshot
    THEN
        RAISE EXCEPTION
            'A sealed work-order proof snapshot cannot be replaced or removed'
            USING ERRCODE = '42501';
    END IF;

    IF OLD.status IN ('completed', 'auto_closed', 'archived')
       AND jsonb_typeof(OLD.pdf_snapshot) = 'object'
       AND OLD.pdf_snapshot <> '{}'::jsonb
       AND (
            NEW.title IS DISTINCT FROM OLD.title
            OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
       )
    THEN
        RAISE EXCEPTION
            'A closed work order with proof cannot be rebound to a different title or asset'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'completed'
       AND NEW.status IS DISTINCT FROM OLD.status
       AND jsonb_typeof(NEW.pdf_snapshot) = 'object'
       AND NEW.pdf_snapshot <> '{}'::jsonb
    THEN
        v_asset := NULL;

        IF NEW.asset_id IS NOT NULL THEN
            SELECT jsonb_build_object(
                       'id', a.id,
                       'code', a.code,
                       'name', a.name,
                       'name_ar', a.name_ar
                   )
              INTO v_asset
              FROM public.assets a
             WHERE a.id = NEW.asset_id
               AND a.tenant_id = NEW.tenant_id;

            IF v_asset IS NULL THEN
                RAISE EXCEPTION 'Work-order proof asset is missing or belongs to another tenant'
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        NEW.pdf_snapshot := NEW.pdf_snapshot || jsonb_build_object(
            'contract_version', 2,
            'title', NEW.title,
            'asset', v_asset
        );
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.seal_work_order_proof_identity()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seal_work_order_proof_identity() TO postgres;

DROP TRIGGER IF EXISTS trg_seal_work_order_proof_identity ON public.work_orders;
CREATE TRIGGER trg_seal_work_order_proof_identity
BEFORE UPDATE ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.seal_work_order_proof_identity();

COMMENT ON FUNCTION public.seal_work_order_proof_identity() IS
    'Moves new completed closure snapshots to Proof of Work contract v2 and prevents replacement, removal or post-closure rebinding of sealed proof identity.';

-- Preserve the accepted explicit execution boundary and extend the protected
-- field set. Only postgres-owned workflow code, or an explicitly trusted
-- service operation, may write these fields.
CREATE OR REPLACE FUNCTION public.guard_work_order_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_new_json jsonb;
    v_old_json jsonb;
    v_field text;
    v_sensitive_fields text[] := ARRAY[
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
        'reporter_image_url',
        'before_images',
        'after_images',
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
        'actual_duration_minutes',
        'pdf_snapshot',
        'pdf_generated_at',
        'pdf_version',
        'pdf_file_url'
    ];
BEGIN
    IF current_user IN ('postgres', 'service_role') THEN
        RETURN NEW;
    END IF;

    v_new_json := to_jsonb(NEW);
    v_old_json := to_jsonb(OLD);

    FOREACH v_field IN ARRAY v_sensitive_fields
    LOOP
        IF v_new_json ? v_field
           AND (v_new_json -> v_field) IS DISTINCT FROM (v_old_json -> v_field)
        THEN
            RAISE EXCEPTION
                'Direct update of workflow-sensitive field "%" is not allowed. Use an approved workflow RPC.',
                v_field
                USING ERRCODE = '42501';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_work_order_sensitive_fields()
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_work_order_sensitive_fields() TO postgres;

COMMENT ON FUNCTION public.guard_work_order_sensitive_fields() IS
    'Fail-closed work-order guard. Proof snapshot and legacy PDF metadata are server-owned alongside workflow state; client updates are rejected.';

-- Dynamic authenticated download is the accepted first contract. Remove the
-- historical client-write surface so an arbitrary tenant user cannot replace
-- a canonical-looking PDF at a deterministic path. Existing private objects
-- remain readable under the existing tenant-scoped SELECT policy.
UPDATE storage.buckets
   SET public = false
 WHERE id = 'work-order-pdfs';

DROP POLICY IF EXISTS work_order_pdfs_insert ON storage.objects;
DROP POLICY IF EXISTS work_order_pdfs_update ON storage.objects;

-- Operation logs are evidence, not caller-authored notes. Accepted workflow
-- paths already write them through postgres-owned functions. Remove the
-- legacy direct INSERT surface that let callers choose actor and timestamp.
DROP POLICY IF EXISTS "Users can create operation logs" ON public.operation_logs;
DROP POLICY IF EXISTS operation_logs_insert_scoped ON public.operation_logs;
REVOKE INSERT ON TABLE public.operation_logs FROM anon, authenticated;

-- The anonymous deny-by-default migration correctly removed inherited PUBLIC
-- execution, but this RLS helper had no explicit authenticated grant. Restore
-- only the caller required by its technician visibility policy and pin its
-- definer search path.
ALTER FUNCTION public.is_technician_role()
    SET search_path TO pg_catalog, public, auth, pg_temp;
REVOKE ALL ON FUNCTION public.is_technician_role()
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_technician_role()
    TO authenticated, postgres;

COMMIT;
