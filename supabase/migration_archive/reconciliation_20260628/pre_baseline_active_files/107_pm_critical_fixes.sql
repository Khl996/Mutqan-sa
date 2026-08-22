-- =============================================================================
-- Migration: 107_pm_critical_fixes.sql
-- Purpose: Fix 5 critical bugs, simplify architecture, and add missing DB
--          safeguards identified in the PM audit report (April 2026).
-- Changes:
--   BUG1  — Remove over-permissive UPDATE policy for assigned technicians
--   BUG2  — Restore work-order → PM task sync trigger
--   BUG3  — Fix SELECT RLS to include team members via pm_can_view_task()
--   BUG5  — pm_cancel_task must update execution_status
--   UX3.3 — pm_complete_task reports exact names of missing required items
--   P2.1  — checklist_templates.is_active becomes a GENERATED column
--   P2.2  — Trigger keeps execution_status in sync when status changes directly
--   P2.3  — Deprecation comment on maintenance_plans.building_id
--   P4.1  — Add updated_at triggers for plans, tasks, and task checks
--   P4.2  — Enable RLS on checklist_template_sections
-- =============================================================================

-- =============================================================================
-- SECTION 1 (BUG 1) — Remove over-permissive technician UPDATE policy
-- The old policy allowed any UPDATE on maintenance_tasks for assigned_to=uid,
-- including direct status changes that bypass RPCs and audit logging.
-- Technicians interact with tasks exclusively through pm_start_task,
-- pm_complete_task, pm_cancel_task (all SECURITY DEFINER) and through the
-- maintenance_task_checks / maintenance_task_attachments policies that are
-- already correctly scoped to pm_can_execute_task().
-- =============================================================================

DROP POLICY IF EXISTS "maintenance_tasks_update_assigned_technician" ON public.maintenance_tasks;

-- =============================================================================
-- SECTION 2 (BUG 3) — Fix SELECT RLS to include team members
-- The previous policy checked only pm_can_view_tenant OR assigned_to=uid.
-- Migration 104 updated pm_can_view_task() to also check team membership, but
-- the RLS policy was never updated to call it. Team members were therefore
-- invisible to their own assigned tasks.
-- =============================================================================

DROP POLICY IF EXISTS "maintenance_tasks_select_scoped" ON public.maintenance_tasks;

CREATE POLICY "maintenance_tasks_select_scoped"
ON public.maintenance_tasks
FOR SELECT
TO authenticated
USING (public.pm_can_view_task(id));

-- Performance: index on assigned_team_id helps pm_can_view_task() team lookup
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_assigned_team
    ON public.maintenance_tasks(assigned_team_id);

-- =============================================================================
-- SECTION 3 (BUG 2) — Restore work-order → PM task status sync
-- Migration 103 dropped the previous sync trigger without a replacement.
-- This function and trigger keep PM task status aligned when a linked
-- work order transitions to in_progress or completed.
-- Only acts when a linked task exists and is in a compatible state.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_sync_task_from_work_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task_id UUID;
    v_plan_id UUID;
BEGIN
    -- Only act when status actually changed
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
                   )::INTEGER
               )
         WHERE id = v_task_id
           AND status = 'in_progress';

        PERFORM public.pm_update_plan_stats(v_plan_id);

    ELSIF NEW.status = 'in_progress' THEN
        UPDATE public.maintenance_tasks
           SET status           = 'in_progress',
               execution_status = 'in_progress',
               started_at       = COALESCE(started_at, NOW())
         WHERE id = v_task_id
           AND status = 'pending';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_sync_from_work_order ON public.work_orders;

CREATE TRIGGER trg_pm_sync_from_work_order
AFTER UPDATE OF status ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.pm_sync_task_from_work_order();

-- =============================================================================
-- SECTION 4 (BUG 5) — Fix pm_cancel_task to update execution_status
-- The function from migration 103 predates the execution_status column added
-- in migration 106. Cancelled tasks retained their old execution_status,
-- causing a status mismatch (e.g., status=cancelled, execution_status=in_progress).
-- Also extends the CHECK constraint to allow 'cancelled' as a valid value.
-- =============================================================================

-- Extend the execution_status CHECK to allow 'cancelled'
ALTER TABLE public.maintenance_tasks
    DROP CONSTRAINT IF EXISTS maintenance_tasks_execution_status_check;

ALTER TABLE public.maintenance_tasks
    ADD CONSTRAINT maintenance_tasks_execution_status_check
    CHECK (execution_status IN ('draft', 'in_progress', 'completed', 'approved', 'needs_rework', 'cancelled'));

-- Fix any existing mismatch from before this migration
UPDATE public.maintenance_tasks
   SET execution_status = 'cancelled'
 WHERE status = 'cancelled'
   AND execution_status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.pm_cancel_task(
    p_task_id UUID,
    p_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task public.maintenance_tasks%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
      INTO v_task
      FROM public.maintenance_tasks
     WHERE id = p_task_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF v_task.status NOT IN ('pending', 'in_progress') THEN
        RAISE EXCEPTION 'Cannot cancel a task with status %', v_task.status;
    END IF;

    IF NOT public.pm_can_execute_task(p_task_id)
       AND NOT public.pm_can_manage_tenant(v_task.tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized to cancel this maintenance task';
    END IF;

    UPDATE public.maintenance_tasks
       SET status           = 'cancelled',
           execution_status = 'cancelled',
           completion_notes = COALESCE(p_reason, completion_notes)
     WHERE id = p_task_id;

    PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);

    PERFORM public.pm_write_audit_log(
        p_action      => 'Cancelled preventive maintenance task',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'reason',  p_reason
        ),
        p_new_values  => jsonb_build_object(
            'status',           'cancelled',
            'execution_status', 'cancelled'
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'status',  'cancelled'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pm_cancel_task(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_cancel_task(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.pm_cancel_task(UUID, TEXT) TO authenticated;

-- =============================================================================
-- SECTION 5 (UX 3.3) — pm_complete_task: report exact names of missing items
-- The old message "Required checklist items are still missing values" gave no
-- indication of which items the technician still needed to fill. The updated
-- function builds a comma-separated list of missing item labels and includes
-- them in the exception message so the frontend can surface them directly.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_complete_task(
    p_task_id          UUID,
    p_completion_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task                  public.maintenance_tasks%ROWTYPE;
    v_completed_at          TIMESTAMPTZ := NOW();
    v_missing_required      INTEGER     := 0;
    v_missing_labels        TEXT;
    v_unchecked_legacy      INTEGER     := 0;
    v_has_required_photo    BOOLEAN     := FALSE;
    v_has_required_signature BOOLEAN   := FALSE;
    v_actual_duration       INTEGER     := 0;
    v_reference             TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
      INTO v_task
      FROM public.maintenance_tasks
     WHERE id = p_task_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF v_task.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress maintenance tasks can be completed';
    END IF;

    IF NOT public.pm_can_execute_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to complete this maintenance task';
    END IF;

    -- -------------------------------------------------------------------------
    -- Template-based checklist validation
    -- -------------------------------------------------------------------------
    IF v_task.checklist_template_id IS NOT NULL THEN
        PERFORM public.pm_populate_task_checks_internal(p_task_id);

        SELECT
            COUNT(*),
            string_agg(cti.label, ', ' ORDER BY cti.sort_order)
          INTO v_missing_required, v_missing_labels
          FROM public.checklist_template_items cti
          LEFT JOIN public.maintenance_task_checks mtc
                 ON mtc.task_id = p_task_id
                AND mtc.template_item_id = cti.id
         WHERE cti.template_id = v_task.checklist_template_id
           AND cti.is_required = TRUE
           AND COALESCE(
               CASE
                   WHEN cti.item_type = 'yes_no'
                       THEN mtc.value_bool IS NOT NULL OR mtc.status = 'na'
                   WHEN cti.item_type IN ('numeric', 'reading')
                       THEN mtc.value_numeric IS NOT NULL
                   WHEN cti.item_type IN ('text', 'select')
                       THEN NULLIF(BTRIM(mtc.value_text), '') IS NOT NULL
                   WHEN cti.item_type = 'photo'
                       THEN NULLIF(BTRIM(mtc.value_photo_url), '') IS NOT NULL
                   WHEN cti.item_type = 'signature'
                       THEN NULLIF(BTRIM(mtc.value_signature_url), '') IS NOT NULL
                   ELSE FALSE
               END,
               FALSE
           ) = FALSE;

        IF v_missing_required > 0 THEN
            RAISE EXCEPTION 'Required items incomplete: %', COALESCE(v_missing_labels, '(unknown)');
        END IF;

    -- -------------------------------------------------------------------------
    -- Legacy (manual) checklist validation
    -- -------------------------------------------------------------------------
    ELSIF v_task.checklist IS NOT NULL
       AND jsonb_typeof(v_task.checklist) = 'array'
       AND jsonb_array_length(v_task.checklist) > 0 THEN

        SELECT COUNT(*)
          INTO v_unchecked_legacy
          FROM jsonb_array_elements(v_task.checklist) AS item
         WHERE COALESCE((item->>'checked')::BOOLEAN, FALSE) = FALSE;

        IF v_unchecked_legacy > 0 THEN
            RAISE EXCEPTION 'All checklist items must be completed before the task can be marked done (% remaining)', v_unchecked_legacy;
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- Photo requirement
    -- -------------------------------------------------------------------------
    IF COALESCE(v_task.requires_photo, FALSE) AND v_task.checklist_template_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.maintenance_task_checks mtc
              JOIN public.checklist_template_items cti ON cti.id = mtc.template_item_id
             WHERE mtc.task_id = p_task_id
               AND cti.item_type = 'photo'
               AND NULLIF(BTRIM(mtc.value_photo_url), '') IS NOT NULL
        )
        OR EXISTS (
            SELECT 1
              FROM public.maintenance_task_attachments mta
             WHERE mta.task_id = p_task_id
               AND mta.attachment_type IN ('before_photo', 'after_photo', 'check_photo')
               AND NULLIF(BTRIM(mta.file_url), '') IS NOT NULL
        )
        INTO v_has_required_photo;

        IF NOT v_has_required_photo THEN
            RAISE EXCEPTION 'A photo is required before completing this task';
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- Signature requirement
    -- -------------------------------------------------------------------------
    IF COALESCE(v_task.requires_signature, FALSE) AND v_task.checklist_template_id IS NOT NULL THEN
        IF NULLIF(BTRIM(v_task.executor_signature_url), '') IS NOT NULL THEN
            v_has_required_signature := TRUE;
        ELSE
            SELECT EXISTS (
                SELECT 1
                  FROM public.maintenance_task_checks mtc
                  JOIN public.checklist_template_items cti ON cti.id = mtc.template_item_id
                 WHERE mtc.task_id = p_task_id
                   AND cti.item_type = 'signature'
                   AND NULLIF(BTRIM(mtc.value_signature_url), '') IS NOT NULL
            )
            INTO v_has_required_signature;
        END IF;

        IF NOT v_has_required_signature THEN
            RAISE EXCEPTION 'A signature is required before completing this task';
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- Compute actual duration
    -- -------------------------------------------------------------------------
    IF v_task.started_at IS NOT NULL THEN
        v_actual_duration := GREATEST(0,
            FLOOR(EXTRACT(EPOCH FROM (v_completed_at - v_task.started_at)) / 60.0)::INTEGER
        );
    END IF;

    v_reference := COALESCE(
        v_task.execution_reference,
        'PM-' || UPPER(REPLACE(p_task_id::text, '-', ''))
    );

    -- -------------------------------------------------------------------------
    -- Commit the completed state
    -- -------------------------------------------------------------------------
    UPDATE public.maintenance_tasks
       SET status                  = 'completed',
           completed_at            = v_completed_at,
           completion_notes        = COALESCE(p_completion_notes, completion_notes),
           actual_duration_minutes = CASE
               WHEN v_task.started_at IS NOT NULL THEN v_actual_duration
               ELSE actual_duration_minutes
           END,
           execution_reference     = v_reference,
           execution_status        = 'completed',
           execution_completed_by  = auth.uid(),
           execution_completed_at  = v_completed_at,
           review_status           = 'pending',
           reviewed_by             = NULL,
           reviewed_at             = NULL,
           review_notes            = NULL,
           execution_snapshot      = COALESCE(
               execution_snapshot,
               public.pm_build_task_execution_snapshot(p_task_id, TRUE)
           )
     WHERE id = p_task_id;

    PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);

    PERFORM public.pm_write_audit_log(
        p_action      => 'Submitted preventive maintenance execution sheet',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id',                p_task_id,
            'status',                 'completed',
            'execution_status',       'completed',
            'review_status',          'pending',
            'completed_at',           v_completed_at,
            'actual_duration_minutes', v_actual_duration,
            'completion_notes',       p_completion_notes
        ),
        p_new_values  => jsonb_build_object(
            'status',                 'completed',
            'execution_status',       'completed',
            'review_status',          'pending',
            'completed_at',           v_completed_at,
            'actual_duration_minutes', v_actual_duration
        )
    );

    RETURN jsonb_build_object(
        'success',                TRUE,
        'task_id',                p_task_id,
        'status',                 'completed',
        'execution_status',       'completed',
        'review_status',          'pending',
        'completed_at',           v_completed_at,
        'actual_duration_minutes', v_actual_duration,
        'execution_reference',    v_reference
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pm_complete_task(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_complete_task(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.pm_complete_task(UUID, TEXT) TO authenticated;

-- =============================================================================
-- SECTION 6 (Part 2.1) — checklist_templates.is_active → GENERATED column
-- status is the single source of truth. is_active was redundant and caused
-- dual-field confusion. Converting to a GENERATED ALWAYS AS column ensures
-- is_active is always consistent with status without any application logic.
-- The hook layer must no longer write is_active in INSERT/UPDATE payloads.
-- =============================================================================

-- Ensure any lingering mismatch is resolved (105 already did this but guard again)
UPDATE public.checklist_templates
   SET status = 'archived'
 WHERE is_active = FALSE AND status = 'active';

-- Drop the manual is_active column and replace with a computed one
ALTER TABLE public.checklist_templates DROP COLUMN IF EXISTS is_active;
ALTER TABLE public.checklist_templates
    ADD COLUMN is_active BOOLEAN GENERATED ALWAYS AS (status = 'active') STORED;

-- Index to keep the existing query ordering on is_active efficient
CREATE INDEX IF NOT EXISTS idx_checklist_templates_is_active
    ON public.checklist_templates(is_active);

-- =============================================================================
-- SECTION 7 (Part 2.2) — Sync execution_status when status changes directly
-- This BEFORE UPDATE trigger is a safety net for any code path that updates
-- status without explicitly updating execution_status (e.g., platform admin
-- direct updates). RPCs and the WO sync trigger already set both fields, so
-- this trigger is mostly a no-op in normal operation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_sync_execution_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only intervene when status changed but execution_status was not touched
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.execution_status IS NOT DISTINCT FROM OLD.execution_status THEN
        CASE NEW.status
            WHEN 'cancelled' THEN NEW.execution_status := 'cancelled';
            WHEN 'pending'   THEN NEW.execution_status := 'draft';
            ELSE NULL;
        END CASE;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_sync_execution_status ON public.maintenance_tasks;

CREATE TRIGGER trg_pm_sync_execution_status
BEFORE UPDATE OF status ON public.maintenance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.pm_sync_execution_status();

-- =============================================================================
-- SECTION 8 (Part 2.3) — Deprecate maintenance_plans.building_id
-- Use maintenance_plan_targets with target_type='building' going forward.
-- The column is retained for backward compatibility with existing data and
-- display code that falls back to it.
-- =============================================================================

COMMENT ON COLUMN public.maintenance_plans.building_id IS
    'DEPRECATED: Use maintenance_plan_targets (target_type=building) instead. '
    'Retained for backward compatibility. Do not set on new plans.';

-- =============================================================================
-- SECTION 9 (Part 4.1) — Add updated_at triggers for plans, tasks, and checks
-- The hooks previously set updated_at manually as a JavaScript timestamp.
-- DB-level triggers are authoritative and fire even for direct SQL updates
-- (from other triggers, admin SQL, etc.). Hook payloads should drop the
-- manual updated_at field after this migration.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_maintenance_plans_updated_at ON public.maintenance_plans;
CREATE TRIGGER trg_maintenance_plans_updated_at
BEFORE UPDATE ON public.maintenance_plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_maintenance_tasks_updated_at ON public.maintenance_tasks;
CREATE TRIGGER trg_maintenance_tasks_updated_at
BEFORE UPDATE ON public.maintenance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_maintenance_task_checks_updated_at ON public.maintenance_task_checks;
CREATE TRIGGER trg_maintenance_task_checks_updated_at
BEFORE UPDATE ON public.maintenance_task_checks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SECTION 10 (Part 4.2) — Enable RLS on checklist_template_sections
-- The table was created in migration 105 without explicit RLS. Direct queries
-- (not through a parent template JOIN) had no row-level protection.
-- =============================================================================

ALTER TABLE public.checklist_template_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_template_sections_select ON public.checklist_template_sections;
CREATE POLICY checklist_template_sections_select
ON public.checklist_template_sections
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
          FROM public.checklist_templates ct
         WHERE ct.id = checklist_template_sections.template_id
           AND public.pm_can_view_tenant(ct.tenant_id)
    )
);

DROP POLICY IF EXISTS checklist_template_sections_manage ON public.checklist_template_sections;
CREATE POLICY checklist_template_sections_manage
ON public.checklist_template_sections
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
          FROM public.checklist_templates ct
         WHERE ct.id = checklist_template_sections.template_id
           AND public.pm_can_manage_tenant(ct.tenant_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
          FROM public.checklist_templates ct
         WHERE ct.id = checklist_template_sections.template_id
           AND public.pm_can_manage_tenant(ct.tenant_id)
    )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_template_sections TO authenticated;
