-- =============================================================================
-- PM Execution Sheet - Phase 3
-- Adds lightweight execution sheet review, task attachments, PDF export history,
-- and richer execution metadata without introducing recurrence automation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Execution and review fields on task instances
-- -----------------------------------------------------------------------------
ALTER TABLE public.maintenance_tasks
    ADD COLUMN IF NOT EXISTS execution_reference VARCHAR(80),
    ADD COLUMN IF NOT EXISTS execution_status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (execution_status IN ('draft', 'in_progress', 'completed', 'approved', 'needs_rework')),
    ADD COLUMN IF NOT EXISTS execution_started_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS execution_completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS execution_completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS executor_signature_url TEXT,
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'not_required'
        CHECK (review_status IN ('not_required', 'pending', 'approved', 'needs_rework')),
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS review_notes TEXT,
    ADD COLUMN IF NOT EXISTS reviewer_signature_url TEXT,
    ADD COLUMN IF NOT EXISTS pdf_export_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS latest_pdf_url TEXT,
    ADD COLUMN IF NOT EXISTS latest_pdf_exported_at TIMESTAMPTZ;

UPDATE public.maintenance_tasks
   SET execution_reference = COALESCE(execution_reference, 'PM-' || UPPER(REPLACE(id::text, '-', ''))),
       execution_status = CASE
           WHEN status = 'pending' THEN 'draft'
           WHEN status = 'in_progress' THEN 'in_progress'
           WHEN status = 'completed' THEN 'completed'
           ELSE execution_status
       END,
       execution_completed_at = CASE
           WHEN status = 'completed' THEN COALESCE(execution_completed_at, completed_at)
           ELSE execution_completed_at
       END
 WHERE execution_reference IS NULL
    OR execution_completed_at IS NULL
    OR execution_status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_tasks_execution_reference
    ON public.maintenance_tasks(execution_reference)
    WHERE execution_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_review_status
    ON public.maintenance_tasks(review_status);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_execution_status
    ON public.maintenance_tasks(execution_status);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_reviewed_by
    ON public.maintenance_tasks(reviewed_by);

-- -----------------------------------------------------------------------------
-- Task attachments: photos, files, signatures, and execution evidence.
-- file_url may be a public URL or a data URL during the pre-storage phase.
-- storage_bucket/storage_path are reserved for a later storage-backed upgrade.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_task_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.maintenance_tasks(id) ON DELETE CASCADE,
    check_id UUID REFERENCES public.maintenance_task_checks(id) ON DELETE SET NULL,
    attachment_type VARCHAR(30) NOT NULL DEFAULT 'general'
        CHECK (attachment_type IN ('general', 'before_photo', 'after_photo', 'check_photo', 'signature', 'review_signature', 'pdf_reference')),
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    storage_bucket TEXT,
    storage_path TEXT,
    mime_type VARCHAR(120),
    file_size INTEGER,
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_task_attachments_tenant
    ON public.maintenance_task_attachments(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pm_task_attachments_task
    ON public.maintenance_task_attachments(task_id);

CREATE INDEX IF NOT EXISTS idx_pm_task_attachments_check
    ON public.maintenance_task_attachments(check_id);

CREATE INDEX IF NOT EXISTS idx_pm_task_attachments_type
    ON public.maintenance_task_attachments(task_id, attachment_type);

-- -----------------------------------------------------------------------------
-- PDF export history. The generated binary may be downloaded locally now; the
-- structured snapshots let the PDF be regenerated later even without a file URL.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pm_pdf_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.maintenance_tasks(id) ON DELETE CASCADE,
    export_number INTEGER NOT NULL DEFAULT 1,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT,
    export_format VARCHAR(20) NOT NULL DEFAULT 'pdf' CHECK (export_format IN ('pdf')),
    rendered_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    results_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, export_number)
);

CREATE INDEX IF NOT EXISTS idx_pm_pdf_exports_tenant
    ON public.pm_pdf_exports(tenant_id);

CREATE INDEX IF NOT EXISTS idx_pm_pdf_exports_task
    ON public.pm_pdf_exports(task_id);

CREATE INDEX IF NOT EXISTS idx_pm_pdf_exports_generated_at
    ON public.pm_pdf_exports(generated_at DESC);

ALTER TABLE public.maintenance_tasks
    ADD COLUMN IF NOT EXISTS latest_pdf_export_id UUID REFERENCES public.pm_pdf_exports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_latest_pdf_export
    ON public.maintenance_tasks(latest_pdf_export_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.maintenance_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_pdf_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_task_attachments_select_scoped ON public.maintenance_task_attachments;
CREATE POLICY maintenance_task_attachments_select_scoped
ON public.maintenance_task_attachments
FOR SELECT
TO authenticated
USING (public.pm_can_view_task(task_id));

DROP POLICY IF EXISTS maintenance_task_attachments_insert_scoped ON public.maintenance_task_attachments;
CREATE POLICY maintenance_task_attachments_insert_scoped
ON public.maintenance_task_attachments
FOR INSERT
TO authenticated
WITH CHECK (
    public.pm_can_execute_task(task_id)
    AND EXISTS (
        SELECT 1
          FROM public.maintenance_tasks mt
         WHERE mt.id = task_id
           AND mt.tenant_id = tenant_id
    )
);

DROP POLICY IF EXISTS maintenance_task_attachments_update_scoped ON public.maintenance_task_attachments;
CREATE POLICY maintenance_task_attachments_update_scoped
ON public.maintenance_task_attachments
FOR UPDATE
TO authenticated
USING (public.pm_can_execute_task(task_id))
WITH CHECK (
    public.pm_can_execute_task(task_id)
    AND EXISTS (
        SELECT 1
          FROM public.maintenance_tasks mt
         WHERE mt.id = task_id
           AND mt.tenant_id = tenant_id
    )
);

DROP POLICY IF EXISTS maintenance_task_attachments_delete_scoped ON public.maintenance_task_attachments;
CREATE POLICY maintenance_task_attachments_delete_scoped
ON public.maintenance_task_attachments
FOR DELETE
TO authenticated
USING (public.pm_can_execute_task(task_id));

DROP POLICY IF EXISTS pm_pdf_exports_select_scoped ON public.pm_pdf_exports;
CREATE POLICY pm_pdf_exports_select_scoped
ON public.pm_pdf_exports
FOR SELECT
TO authenticated
USING (public.pm_can_view_task(task_id));

DROP POLICY IF EXISTS pm_pdf_exports_insert_scoped ON public.pm_pdf_exports;
CREATE POLICY pm_pdf_exports_insert_scoped
ON public.pm_pdf_exports
FOR INSERT
TO authenticated
WITH CHECK (
    public.pm_can_view_task(task_id)
    AND EXISTS (
        SELECT 1
          FROM public.maintenance_tasks mt
         WHERE mt.id = task_id
           AND mt.tenant_id = tenant_id
    )
);

DROP POLICY IF EXISTS pm_pdf_exports_manage_scoped ON public.pm_pdf_exports;
CREATE POLICY pm_pdf_exports_manage_scoped
ON public.pm_pdf_exports
FOR UPDATE
TO authenticated
USING (public.pm_can_manage_tenant(tenant_id))
WITH CHECK (public.pm_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS pm_pdf_exports_delete_scoped ON public.pm_pdf_exports;
CREATE POLICY pm_pdf_exports_delete_scoped
ON public.pm_pdf_exports
FOR DELETE
TO authenticated
USING (public.pm_can_manage_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_task_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_pdf_exports TO authenticated;

-- -----------------------------------------------------------------------------
-- Start task v3: keeps the execution sheet metadata aligned.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pm_start_task(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task public.maintenance_tasks%ROWTYPE;
    v_started_at TIMESTAMPTZ := NOW();
    v_reference TEXT;
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

    IF v_task.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending maintenance tasks can be started';
    END IF;

    IF NOT public.pm_can_execute_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to start this maintenance task';
    END IF;

    v_reference := COALESCE(v_task.execution_reference, 'PM-' || UPPER(REPLACE(p_task_id::text, '-', '')));

    UPDATE public.maintenance_tasks
       SET status = 'in_progress',
           started_at = COALESCE(started_at, v_started_at),
           execution_reference = v_reference,
           execution_status = 'in_progress',
           execution_started_by = COALESCE(execution_started_by, auth.uid()),
           execution_snapshot = COALESCE(execution_snapshot, public.pm_build_task_execution_snapshot(p_task_id, TRUE)),
           updated_at = NOW()
     WHERE id = p_task_id;

    PERFORM public.pm_populate_task_checks_internal(p_task_id);

    PERFORM public.pm_write_audit_log(
        p_action      => 'Started preventive maintenance execution sheet',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'status', 'in_progress',
            'execution_status', 'in_progress',
            'started_at', v_started_at,
            'execution_reference', v_reference,
            'frequency_bundle_id', v_task.frequency_bundle_id,
            'assigned_team_id', v_task.assigned_team_id
        ),
        p_new_values  => jsonb_build_object(
            'status', 'in_progress',
            'execution_status', 'in_progress',
            'started_at', v_started_at
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'status', 'in_progress',
        'execution_status', 'in_progress',
        'started_at', v_started_at,
        'execution_reference', v_reference
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Complete task v3: submits the execution sheet for lightweight review.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pm_complete_task(
    p_task_id UUID,
    p_completion_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task public.maintenance_tasks%ROWTYPE;
    v_completed_at TIMESTAMPTZ := NOW();
    v_missing_required INTEGER := 0;
    v_unchecked_legacy INTEGER := 0;
    v_has_required_photo BOOLEAN := FALSE;
    v_has_required_signature BOOLEAN := FALSE;
    v_actual_duration INTEGER := 0;
    v_reference TEXT;
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

    IF v_task.checklist_template_id IS NOT NULL THEN
        PERFORM public.pm_populate_task_checks_internal(p_task_id);

        SELECT COUNT(*)
          INTO v_missing_required
          FROM public.checklist_template_items cti
          LEFT JOIN public.maintenance_task_checks mtc
                 ON mtc.task_id = p_task_id
                AND mtc.template_item_id = cti.id
         WHERE cti.template_id = v_task.checklist_template_id
           AND cti.is_required = TRUE
           AND COALESCE(
               CASE
                   WHEN cti.item_type = 'yes_no' THEN mtc.value_bool IS NOT NULL
                   WHEN cti.item_type IN ('numeric', 'reading') THEN mtc.value_numeric IS NOT NULL
                   WHEN cti.item_type IN ('text', 'select') THEN NULLIF(BTRIM(mtc.value_text), '') IS NOT NULL
                   WHEN cti.item_type = 'photo' THEN NULLIF(BTRIM(mtc.value_photo_url), '') IS NOT NULL
                   WHEN cti.item_type = 'signature' THEN NULLIF(BTRIM(mtc.value_signature_url), '') IS NOT NULL
                   ELSE FALSE
               END,
               FALSE
           ) = FALSE;

        IF v_missing_required > 0 THEN
            RAISE EXCEPTION 'Required checklist items are still missing values';
        END IF;
    ELSIF v_task.checklist IS NOT NULL
       AND jsonb_typeof(v_task.checklist) = 'array'
       AND jsonb_array_length(v_task.checklist) > 0 THEN
        SELECT COUNT(*)
          INTO v_unchecked_legacy
          FROM jsonb_array_elements(v_task.checklist) AS item
         WHERE COALESCE((item->>'checked')::BOOLEAN, FALSE) = FALSE;

        IF v_unchecked_legacy > 0 THEN
            RAISE EXCEPTION 'All legacy checklist items must be completed before the task can be completed';
        END IF;
    END IF;

    IF COALESCE(v_task.requires_photo, FALSE) AND v_task.checklist_template_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.maintenance_task_checks mtc
              JOIN public.checklist_template_items cti
                ON cti.id = mtc.template_item_id
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
            RAISE EXCEPTION 'A completed photo checklist item is required before completing this task';
        END IF;
    END IF;

    IF COALESCE(v_task.requires_signature, FALSE) AND v_task.checklist_template_id IS NOT NULL THEN
        IF NULLIF(BTRIM(v_task.executor_signature_url), '') IS NOT NULL THEN
            v_has_required_signature := TRUE;
        ELSE
            SELECT EXISTS (
                SELECT 1
                  FROM public.maintenance_task_checks mtc
                  JOIN public.checklist_template_items cti
                    ON cti.id = mtc.template_item_id
                 WHERE mtc.task_id = p_task_id
                   AND cti.item_type = 'signature'
                   AND NULLIF(BTRIM(mtc.value_signature_url), '') IS NOT NULL
            )
            INTO v_has_required_signature;
        END IF;

        IF NOT v_has_required_signature THEN
            RAISE EXCEPTION 'A completed signature checklist item is required before completing this task';
        END IF;
    END IF;

    IF v_task.started_at IS NOT NULL THEN
        v_actual_duration := FLOOR(EXTRACT(EPOCH FROM (v_completed_at - v_task.started_at)) / 60.0);
        v_actual_duration := GREATEST(v_actual_duration, 0);
    END IF;

    v_reference := COALESCE(v_task.execution_reference, 'PM-' || UPPER(REPLACE(p_task_id::text, '-', '')));

    UPDATE public.maintenance_tasks
       SET status = 'completed',
           completed_at = v_completed_at,
           completion_notes = COALESCE(p_completion_notes, completion_notes),
           actual_duration_minutes = CASE
               WHEN v_task.started_at IS NOT NULL THEN v_actual_duration
               ELSE actual_duration_minutes
           END,
           execution_reference = v_reference,
           execution_status = 'completed',
           execution_completed_by = auth.uid(),
           execution_completed_at = v_completed_at,
           review_status = 'pending',
           reviewed_by = NULL,
           reviewed_at = NULL,
           review_notes = NULL,
           execution_snapshot = COALESCE(execution_snapshot, public.pm_build_task_execution_snapshot(p_task_id, TRUE)),
           updated_at = NOW()
     WHERE id = p_task_id;

    PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);

    PERFORM public.pm_write_audit_log(
        p_action      => 'Submitted preventive maintenance execution sheet',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'status', 'completed',
            'execution_status', 'completed',
            'review_status', 'pending',
            'completed_at', v_completed_at,
            'actual_duration_minutes', v_actual_duration,
            'completion_notes', p_completion_notes
        ),
        p_new_values  => jsonb_build_object(
            'status', 'completed',
            'execution_status', 'completed',
            'review_status', 'pending',
            'completed_at', v_completed_at,
            'actual_duration_minutes', v_actual_duration
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'status', 'completed',
        'execution_status', 'completed',
        'review_status', 'pending',
        'completed_at', v_completed_at,
        'actual_duration_minutes', v_actual_duration,
        'execution_reference', v_reference
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Lightweight review: approve or request rework without complex approval chains.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pm_review_task(
    p_task_id UUID,
    p_review_status VARCHAR,
    p_review_notes TEXT DEFAULT NULL,
    p_reviewer_signature_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task public.maintenance_tasks%ROWTYPE;
    v_reviewed_at TIMESTAMPTZ := NOW();
    v_execution_status VARCHAR(20);
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_review_status NOT IN ('approved', 'needs_rework') THEN
        RAISE EXCEPTION 'Invalid review status';
    END IF;

    SELECT *
      INTO v_task
      FROM public.maintenance_tasks
     WHERE id = p_task_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF NOT public.pm_can_manage_tenant(v_task.tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized to review this maintenance task';
    END IF;

    IF v_task.status <> 'completed' THEN
        RAISE EXCEPTION 'Only completed maintenance tasks can be reviewed';
    END IF;

    v_execution_status := CASE
        WHEN p_review_status = 'approved' THEN 'approved'
        ELSE 'needs_rework'
    END;

    UPDATE public.maintenance_tasks
       SET status = CASE
               WHEN p_review_status = 'needs_rework' THEN 'in_progress'
               ELSE status
           END,
           completed_at = CASE
               WHEN p_review_status = 'needs_rework' THEN NULL
               ELSE completed_at
           END,
           execution_completed_at = CASE
               WHEN p_review_status = 'needs_rework' THEN NULL
               ELSE execution_completed_at
           END,
           review_status = p_review_status,
           reviewed_by = auth.uid(),
           reviewed_at = v_reviewed_at,
           review_notes = p_review_notes,
           reviewer_signature_url = COALESCE(p_reviewer_signature_url, reviewer_signature_url),
           execution_status = v_execution_status,
           updated_at = NOW()
     WHERE id = p_task_id;

    IF p_review_status = 'needs_rework' THEN
        PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);
    END IF;

    PERFORM public.pm_write_audit_log(
        p_action      => 'Reviewed preventive maintenance execution sheet',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'review_status', p_review_status,
            'reviewed_at', v_reviewed_at,
            'review_notes', p_review_notes
        ),
        p_new_values  => jsonb_build_object(
            'status', CASE WHEN p_review_status = 'needs_rework' THEN 'in_progress' ELSE v_task.status END,
            'review_status', p_review_status,
            'execution_status', v_execution_status,
            'reviewed_at', v_reviewed_at
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'status', CASE WHEN p_review_status = 'needs_rework' THEN 'in_progress' ELSE v_task.status END,
        'review_status', p_review_status,
        'execution_status', v_execution_status,
        'reviewed_at', v_reviewed_at
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Record PDF export metadata and keep the task latest export pointer current.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pm_record_pdf_export(
    p_task_id UUID,
    p_file_name TEXT,
    p_file_url TEXT DEFAULT NULL,
    p_rendered_snapshot JSONB DEFAULT '{}'::jsonb,
    p_results_snapshot JSONB DEFAULT '{}'::jsonb,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task public.maintenance_tasks%ROWTYPE;
    v_export_id UUID;
    v_export_number INTEGER;
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

    IF NOT public.pm_can_view_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to export this maintenance task';
    END IF;

    SELECT COALESCE(MAX(export_number), 0) + 1
      INTO v_export_number
      FROM public.pm_pdf_exports
     WHERE task_id = p_task_id;

    INSERT INTO public.pm_pdf_exports (
        tenant_id,
        task_id,
        export_number,
        file_name,
        file_url,
        rendered_snapshot,
        results_snapshot,
        metadata,
        generated_by
    )
    VALUES (
        v_task.tenant_id,
        p_task_id,
        v_export_number,
        p_file_name,
        p_file_url,
        COALESCE(p_rendered_snapshot, '{}'::jsonb),
        COALESCE(p_results_snapshot, '{}'::jsonb),
        COALESCE(p_metadata, '{}'::jsonb),
        auth.uid()
    )
    RETURNING id INTO v_export_id;

    UPDATE public.maintenance_tasks
       SET latest_pdf_export_id = v_export_id,
           latest_pdf_url = p_file_url,
           latest_pdf_exported_at = NOW(),
           pdf_export_count = COALESCE(pdf_export_count, 0) + 1,
           updated_at = NOW()
     WHERE id = p_task_id;

    PERFORM public.pm_write_audit_log(
        p_action      => 'Exported preventive maintenance PDF',
        p_action_type => 'export',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'export_id', v_export_id,
            'export_number', v_export_number,
            'file_name', p_file_name
        ),
        p_new_values  => jsonb_build_object(
            'latest_pdf_export_id', v_export_id,
            'pdf_export_count', COALESCE(v_task.pdf_export_count, 0) + 1
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'export_id', v_export_id,
        'export_number', v_export_number,
        'file_name', p_file_name,
        'file_url', p_file_url
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Asset maintenance history enrichment
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.asset_maintenance_history
WITH (security_invoker = true)
AS
SELECT
    t.asset_id,
    t.id AS task_id,
    t.title AS task_title,
    t.status AS task_status,
    t.due_date,
    t.completed_at,
    t.assigned_to,
    p.full_name AS technician_name,
    t.maintenance_plan_id,
    mp.name AS plan_name,
    t.related_work_order_id,
    t.checklist_template_id,
    ct.name AS template_name,
    t.tenant_id,
    t.created_at,
    t.execution_reference,
    t.execution_status,
    t.review_status,
    t.reviewed_at,
    t.latest_pdf_export_id,
    t.latest_pdf_url,
    t.latest_pdf_exported_at
FROM public.maintenance_tasks t
LEFT JOIN public.profiles p
       ON p.id = t.assigned_to
LEFT JOIN public.maintenance_plans mp
       ON mp.id = t.maintenance_plan_id
LEFT JOIN public.checklist_templates ct
       ON ct.id = t.checklist_template_id
WHERE t.asset_id IS NOT NULL
ORDER BY t.created_at DESC;

GRANT SELECT ON public.asset_maintenance_history TO authenticated;

-- -----------------------------------------------------------------------------
-- Function grants
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.pm_start_task(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_complete_task(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_review_task(UUID, VARCHAR, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_record_pdf_export(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.pm_start_task(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.pm_complete_task(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.pm_review_task(UUID, VARCHAR, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.pm_record_pdf_export(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) FROM anon;

GRANT EXECUTE ON FUNCTION public.pm_start_task(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_complete_task(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_review_task(UUID, VARCHAR, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_record_pdf_export(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) TO authenticated;
