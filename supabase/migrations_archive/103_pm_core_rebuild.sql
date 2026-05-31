-- =============================================================================
-- Migration: 103_pm_core_rebuild.sql
-- Purpose: Rebuild the preventive maintenance database layer with a clear
--          lifecycle, reusable checklist templates, execution checks, and
--          consistent RLS / triggers.
-- =============================================================================

-- =============================================================================
-- SECTION 1: CLEAN UP OBSOLETE PM FUNCTIONS AND DUPLICATE TRIGGERS
-- =============================================================================

DROP FUNCTION IF EXISTS public.can_postpone_maintenance(UUID);
DROP FUNCTION IF EXISTS public.get_maintenance_advance_notice_days(UUID);
DROP FUNCTION IF EXISTS public.is_auto_generate_work_orders_enabled(UUID);
DROP FUNCTION IF EXISTS public.generate_work_orders_from_maintenance(UUID);
DROP FUNCTION IF EXISTS public.generate_work_orders_from_maintenance();
DROP FUNCTION IF EXISTS public.postpone_maintenance_task(UUID, DATE, TEXT);

DROP TRIGGER IF EXISTS trg_sync_pm_task_from_wo ON public.work_orders;
DROP FUNCTION IF EXISTS public.sync_pm_task_from_wo();

DROP TRIGGER IF EXISTS trg_sync_maintenance_task_from_work_order ON public.work_orders;
DROP FUNCTION IF EXISTS public.sync_maintenance_task_from_work_order();

-- =============================================================================
-- SECTION 2: PM ACCESS HELPERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_can_view_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_platform_admin()
        OR p_tenant_id = public.get_user_tenant_id();
$$;

CREATE OR REPLACE FUNCTION public.pm_can_manage_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_tenant_id UUID;
    v_is_super BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT p.role, p.tenant_id, COALESCE(p.is_super_admin, FALSE)
      INTO v_role, v_tenant_id, v_is_super
      FROM public.profiles p
     WHERE p.id = auth.uid();

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN v_is_super
        OR v_role IN ('platform_owner', 'platform_admin')
        OR (
            v_tenant_id = p_tenant_id
            AND v_role IN ('tenant_admin', 'maintenance_manager', 'facility_manager')
        );
END;
$$;

CREATE OR REPLACE FUNCTION public.pm_can_view_task(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_assigned_to UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT mt.tenant_id, mt.assigned_to
      INTO v_tenant_id, v_assigned_to
      FROM public.maintenance_tasks mt
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN public.pm_can_view_tenant(v_tenant_id)
        OR v_assigned_to = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.pm_can_execute_task(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_assigned_to UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT mt.tenant_id, mt.assigned_to
      INTO v_tenant_id, v_assigned_to
      FROM public.maintenance_tasks mt
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN public.pm_can_manage_tenant(v_tenant_id)
        OR v_assigned_to = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.pm_write_audit_log(
    p_action TEXT,
    p_action_type TEXT,
    p_target_type TEXT,
    p_target_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_new_values JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_id_type TEXT;
BEGIN
    SELECT c.data_type
      INTO v_target_id_type
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'platform_audit_logs'
       AND c.column_name = 'target_id'
     LIMIT 1;

    IF v_target_id_type IS NULL THEN
        RETURN;
    END IF;

    IF v_target_id_type = 'uuid' THEN
        INSERT INTO public.platform_audit_logs (
            user_id,
            action,
            action_type,
            target_type,
            target_id,
            new_values,
            metadata
        )
        VALUES (
            auth.uid(),
            p_action,
            p_action_type,
            p_target_type,
            p_target_id,
            p_new_values,
            COALESCE(p_metadata, '{}'::jsonb)
        );
    ELSE
        INSERT INTO public.platform_audit_logs (
            user_id,
            action,
            action_type,
            target_type,
            target_id,
            new_values,
            metadata
        )
        VALUES (
            auth.uid(),
            p_action,
            p_action_type,
            p_target_type,
            p_target_id::TEXT,
            p_new_values,
            COALESCE(p_metadata, '{}'::jsonb)
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RETURN;
END;
$$;

-- =============================================================================
-- SECTION 3: CHECKLIST TEMPLATE TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.checklist_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code VARCHAR(50),
    name VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200),
    description TEXT,
    description_ar TEXT,
    category VARCHAR(50),
    asset_type VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    total_items INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.checklist_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    label VARCHAR(500) NOT NULL,
    label_ar VARCHAR(500),
    item_type VARCHAR(20) NOT NULL DEFAULT 'yes_no'
        CHECK (item_type IN ('yes_no', 'numeric', 'text', 'photo', 'signature', 'select', 'reading')),
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,
    options JSONB,
    description TEXT,
    description_ar TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 4: ALTER maintenance_plans
-- =============================================================================

ALTER TABLE public.maintenance_plans
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20),
    ADD COLUMN IF NOT EXISTS completion_rate DECIMAL(5, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_tasks INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS completed_tasks INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id),
    ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE public.maintenance_plans
   SET status = CASE
       WHEN status IN ('draft', 'active', 'paused', 'completed', 'archived') THEN status
       ELSE 'draft'
   END;

ALTER TABLE public.maintenance_plans
    ALTER COLUMN status TYPE VARCHAR(20),
    ALTER COLUMN status SET DEFAULT 'draft',
    ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.maintenance_plans
    DROP CONSTRAINT IF EXISTS maintenance_plans_status_check;

ALTER TABLE public.maintenance_plans
    ADD CONSTRAINT maintenance_plans_status_check
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived'));

UPDATE public.maintenance_plans
   SET priority = CASE
       WHEN priority IN ('low', 'medium', 'high', 'critical') THEN priority
       ELSE 'medium'
   END;

ALTER TABLE public.maintenance_plans
    ALTER COLUMN priority TYPE VARCHAR(20),
    ALTER COLUMN priority SET DEFAULT 'medium';

ALTER TABLE public.maintenance_plans
    DROP CONSTRAINT IF EXISTS maintenance_plans_priority_check;

ALTER TABLE public.maintenance_plans
    ADD CONSTRAINT maintenance_plans_priority_check
    CHECK (priority IN ('low', 'medium', 'high', 'critical'));

UPDATE public.maintenance_plans
   SET completion_rate = COALESCE(completion_rate, 0),
       total_tasks = COALESCE(total_tasks, 0),
       completed_tasks = COALESCE(completed_tasks, 0);

-- =============================================================================
-- SECTION 5: ALTER maintenance_tasks
-- =============================================================================

ALTER TABLE public.maintenance_tasks
    ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES public.assets(id),
    ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id),
    ADD COLUMN IF NOT EXISTS checklist_template_id UUID REFERENCES public.checklist_templates(id),
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completion_notes TEXT,
    ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS actual_duration_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS requires_photo BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS requires_signature BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

UPDATE public.maintenance_tasks
   SET status = CASE
       WHEN status IN ('pending', 'in_progress', 'completed', 'cancelled') THEN status
       ELSE 'pending'
   END;

ALTER TABLE public.maintenance_tasks
    ALTER COLUMN status TYPE VARCHAR(20),
    ALTER COLUMN status SET DEFAULT 'pending',
    ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.maintenance_tasks
    DROP CONSTRAINT IF EXISTS maintenance_tasks_status_check;

ALTER TABLE public.maintenance_tasks
    ADD CONSTRAINT maintenance_tasks_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'));

-- =============================================================================
-- SECTION 6: CREATE maintenance_task_checks
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.maintenance_task_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.maintenance_tasks(id) ON DELETE CASCADE,
    template_item_id UUID NOT NULL REFERENCES public.checklist_template_items(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    value_bool BOOLEAN,
    value_numeric DECIMAL(12, 4),
    value_text TEXT,
    value_photo_url TEXT,
    value_signature_url TEXT,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'pass', 'fail', 'na')),
    notes TEXT,
    checked_by UUID REFERENCES public.profiles(id),
    checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.maintenance_task_checks
    DROP CONSTRAINT IF EXISTS maintenance_task_checks_task_template_item_key;

ALTER TABLE public.maintenance_task_checks
    ADD CONSTRAINT maintenance_task_checks_task_template_item_key
    UNIQUE (task_id, template_item_id);

-- =============================================================================
-- SECTION 7: ASSET QR CODE COLUMNS
-- =============================================================================

ALTER TABLE public.assets
    ADD COLUMN IF NOT EXISTS qr_code_url TEXT,
    ADD COLUMN IF NOT EXISTS qr_data JSONB;

-- =============================================================================
-- SECTION 8: PERFORMANCE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_checklist_templates_tenant
    ON public.checklist_templates(tenant_id);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_category
    ON public.checklist_templates(category);

CREATE INDEX IF NOT EXISTS idx_checklist_template_items_template
    ON public.checklist_template_items(template_id);

CREATE INDEX IF NOT EXISTS idx_task_checks_task
    ON public.maintenance_task_checks(task_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_asset
    ON public.maintenance_tasks(asset_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_building
    ON public.maintenance_tasks(building_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_template
    ON public.maintenance_tasks(checklist_template_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_status
    ON public.maintenance_tasks(status);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_due_date
    ON public.maintenance_tasks(due_date);

CREATE INDEX IF NOT EXISTS idx_maintenance_plans_status
    ON public.maintenance_plans(status);

CREATE INDEX IF NOT EXISTS idx_maintenance_plans_building
    ON public.maintenance_plans(building_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_related_work_order
    ON public.maintenance_tasks(related_work_order_id);

-- =============================================================================
-- SECTION 9: ENABLE RLS AND REBUILD PM POLICIES
-- =============================================================================

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_task_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their tenant plans" ON public.maintenance_plans;
DROP POLICY IF EXISTS "Admins/Managers can manage plans" ON public.maintenance_plans;
DROP POLICY IF EXISTS "Platform admins can manage maintenance plans" ON public.maintenance_plans;

CREATE POLICY "maintenance_plans_select_scoped"
ON public.maintenance_plans
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

CREATE POLICY "maintenance_plans_manage_scoped"
ON public.maintenance_plans
FOR ALL
TO authenticated
USING (public.pm_can_manage_tenant(tenant_id))
WITH CHECK (public.pm_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS "Users can view tenant tasks" ON public.maintenance_tasks;
DROP POLICY IF EXISTS "Admins and Managers can manage tasks" ON public.maintenance_tasks;
DROP POLICY IF EXISTS "Technicians can update their tasks" ON public.maintenance_tasks;
DROP POLICY IF EXISTS "Platform admins can manage maintenance tasks" ON public.maintenance_tasks;

CREATE POLICY "maintenance_tasks_select_scoped"
ON public.maintenance_tasks
FOR SELECT
TO authenticated
USING (
    public.pm_can_view_tenant(tenant_id)
    OR assigned_to = auth.uid()
);

CREATE POLICY "maintenance_tasks_manage_scoped"
ON public.maintenance_tasks
FOR ALL
TO authenticated
USING (public.pm_can_manage_tenant(tenant_id))
WITH CHECK (public.pm_can_manage_tenant(tenant_id));

CREATE POLICY "maintenance_tasks_update_assigned_technician"
ON public.maintenance_tasks
FOR UPDATE
TO authenticated
USING (assigned_to = auth.uid())
WITH CHECK (assigned_to = auth.uid());

DROP POLICY IF EXISTS "checklist_templates_select_scoped" ON public.checklist_templates;
DROP POLICY IF EXISTS "checklist_templates_manage_scoped" ON public.checklist_templates;

CREATE POLICY "checklist_templates_select_scoped"
ON public.checklist_templates
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

CREATE POLICY "checklist_templates_manage_scoped"
ON public.checklist_templates
FOR ALL
TO authenticated
USING (public.pm_can_manage_tenant(tenant_id))
WITH CHECK (public.pm_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS "checklist_template_items_select_scoped" ON public.checklist_template_items;
DROP POLICY IF EXISTS "checklist_template_items_manage_scoped" ON public.checklist_template_items;

CREATE POLICY "checklist_template_items_select_scoped"
ON public.checklist_template_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
          FROM public.checklist_templates ct
         WHERE ct.id = checklist_template_items.template_id
           AND public.pm_can_view_tenant(ct.tenant_id)
    )
);

CREATE POLICY "checklist_template_items_manage_scoped"
ON public.checklist_template_items
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
          FROM public.checklist_templates ct
         WHERE ct.id = checklist_template_items.template_id
           AND public.pm_can_manage_tenant(ct.tenant_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
          FROM public.checklist_templates ct
         WHERE ct.id = checklist_template_items.template_id
           AND public.pm_can_manage_tenant(ct.tenant_id)
    )
);

DROP POLICY IF EXISTS "maintenance_task_checks_select_scoped" ON public.maintenance_task_checks;
DROP POLICY IF EXISTS "maintenance_task_checks_write_scoped" ON public.maintenance_task_checks;

CREATE POLICY "maintenance_task_checks_select_scoped"
ON public.maintenance_task_checks
FOR SELECT
TO authenticated
USING (public.pm_can_view_task(task_id));

CREATE POLICY "maintenance_task_checks_write_scoped"
ON public.maintenance_task_checks
FOR ALL
TO authenticated
USING (public.pm_can_execute_task(task_id))
WITH CHECK (public.pm_can_execute_task(task_id));

-- =============================================================================
-- SECTION 10: CHECKLIST TEMPLATE TOTALS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_update_template_totals(p_template_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_template_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.checklist_templates
       SET total_items = (
           SELECT COUNT(*)
             FROM public.checklist_template_items cti
            WHERE cti.template_id = p_template_id
       )
     WHERE id = p_template_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_update_template_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.pm_update_template_totals(OLD.template_id);
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.template_id IS DISTINCT FROM NEW.template_id THEN
        PERFORM public.pm_update_template_totals(OLD.template_id);
    END IF;

    PERFORM public.pm_update_template_totals(NEW.template_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checklist_template_items_update_totals ON public.checklist_template_items;

CREATE TRIGGER trg_checklist_template_items_update_totals
AFTER INSERT OR UPDATE OR DELETE ON public.checklist_template_items
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_template_totals();

-- =============================================================================
-- SECTION 11: PM CORE RPCS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_update_plan_stats(p_plan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_tasks INTEGER := 0;
    v_completed_tasks INTEGER := 0;
    v_completion_rate DECIMAL(5, 2) := 0;
BEGIN
    IF p_plan_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status = 'completed')
      INTO v_total_tasks, v_completed_tasks
      FROM public.maintenance_tasks
     WHERE maintenance_plan_id = p_plan_id;

    IF v_total_tasks > 0 THEN
        v_completion_rate := ROUND((v_completed_tasks::NUMERIC * 100.0) / v_total_tasks, 2);
    END IF;

    UPDATE public.maintenance_plans
       SET total_tasks = v_total_tasks,
           completed_tasks = v_completed_tasks,
           completion_rate = v_completion_rate
     WHERE id = p_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pm_populate_task_checks_internal(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_template_id UUID;
BEGIN
    SELECT mt.checklist_template_id
      INTO v_template_id
      FROM public.maintenance_tasks mt
     WHERE mt.id = p_task_id;

    IF NOT FOUND OR v_template_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.maintenance_task_checks (
        task_id,
        template_item_id,
        sort_order,
        status
    )
    SELECT
        p_task_id,
        cti.id,
        cti.sort_order,
        'pending'
      FROM public.checklist_template_items cti
     WHERE cti.template_id = v_template_id
    ON CONFLICT (task_id, template_item_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.pm_populate_task_checks(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT public.pm_can_execute_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to populate checklist rows for this task';
    END IF;

    PERFORM public.pm_populate_task_checks_internal(p_task_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pm_update_plan_status(
    p_plan_id UUID,
    p_new_status VARCHAR,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan public.maintenance_plans%ROWTYPE;
    v_new_status VARCHAR(20) := LOWER(TRIM(COALESCE(p_new_status, '')));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
      INTO v_plan
      FROM public.maintenance_plans
     WHERE id = p_plan_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance plan not found';
    END IF;

    IF NOT public.pm_can_manage_tenant(v_plan.tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized to manage this maintenance plan';
    END IF;

    IF v_new_status NOT IN ('draft', 'active', 'paused', 'completed', 'archived') THEN
        RAISE EXCEPTION 'Invalid maintenance plan status: %', p_new_status;
    END IF;

    IF v_plan.status = v_new_status THEN
        RAISE EXCEPTION 'Maintenance plan is already in status %', v_new_status;
    END IF;

    IF v_plan.status = 'archived' THEN
        RAISE EXCEPTION 'Archived maintenance plans cannot change status';
    END IF;

    IF v_new_status = 'archived' THEN
        NULL;
    ELSIF NOT (
        (v_plan.status = 'draft' AND v_new_status = 'active')
        OR (v_plan.status = 'active' AND v_new_status IN ('paused', 'completed'))
        OR (v_plan.status = 'paused' AND v_new_status = 'active')
    ) THEN
        RAISE EXCEPTION 'Invalid maintenance plan status transition: % -> %', v_plan.status, v_new_status;
    END IF;

    UPDATE public.maintenance_plans
       SET status = v_new_status
     WHERE id = p_plan_id;

    PERFORM public.pm_write_audit_log(
        p_action      => 'Updated preventive maintenance plan status',
        p_action_type => 'update',
        p_target_type => 'maintenance_plan',
        p_target_id   => p_plan_id,
        p_metadata    => jsonb_build_object(
            'plan_id', p_plan_id,
            'old_status', v_plan.status,
            'new_status', v_new_status,
            'note', p_note
        ),
        p_new_values  => jsonb_build_object(
            'status', v_new_status
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'plan_id', p_plan_id,
        'status', v_new_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.pm_start_task(p_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task public.maintenance_tasks%ROWTYPE;
    v_started_at TIMESTAMPTZ := NOW();
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

    UPDATE public.maintenance_tasks
       SET status = 'in_progress',
           started_at = COALESCE(started_at, v_started_at),
           updated_at = NOW()
     WHERE id = p_task_id;

    PERFORM public.pm_populate_task_checks_internal(p_task_id);

    PERFORM public.pm_write_audit_log(
        p_action      => 'Started preventive maintenance task',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'status', 'in_progress',
            'started_at', v_started_at
        ),
        p_new_values  => jsonb_build_object(
            'status', 'in_progress',
            'started_at', v_started_at
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'status', 'in_progress',
        'started_at', v_started_at
    );
END;
$$;

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
        INTO v_has_required_photo;

        IF NOT v_has_required_photo THEN
            RAISE EXCEPTION 'A completed photo checklist item is required before completing this task';
        END IF;
    END IF;

    IF COALESCE(v_task.requires_signature, FALSE) AND v_task.checklist_template_id IS NOT NULL THEN
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

        IF NOT v_has_required_signature THEN
            RAISE EXCEPTION 'A completed signature checklist item is required before completing this task';
        END IF;
    END IF;

    IF v_task.started_at IS NOT NULL THEN
        v_actual_duration := FLOOR(EXTRACT(EPOCH FROM (v_completed_at - v_task.started_at)) / 60.0);
        v_actual_duration := GREATEST(v_actual_duration, 0);
    END IF;

    UPDATE public.maintenance_tasks
       SET status = 'completed',
           completed_at = v_completed_at,
           completion_notes = COALESCE(p_completion_notes, completion_notes),
           actual_duration_minutes = CASE
               WHEN v_task.started_at IS NOT NULL THEN v_actual_duration
               ELSE actual_duration_minutes
           END,
           updated_at = NOW()
     WHERE id = p_task_id;

    PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);

    PERFORM public.pm_write_audit_log(
        p_action      => 'Completed preventive maintenance task',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'status', 'completed',
            'completed_at', v_completed_at,
            'actual_duration_minutes', v_actual_duration,
            'completion_notes', p_completion_notes
        ),
        p_new_values  => jsonb_build_object(
            'status', 'completed',
            'completed_at', v_completed_at,
            'actual_duration_minutes', v_actual_duration
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'status', 'completed',
        'completed_at', v_completed_at,
        'actual_duration_minutes', v_actual_duration
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.pm_cancel_task(
    p_task_id UUID,
    p_reason TEXT
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

    IF v_task.status = 'cancelled' THEN
        RAISE EXCEPTION 'Maintenance task is already cancelled';
    END IF;

    IF v_task.status = 'completed' THEN
        RAISE EXCEPTION 'Completed maintenance tasks cannot be cancelled';
    END IF;

    IF NOT public.pm_can_execute_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to cancel this maintenance task';
    END IF;

    UPDATE public.maintenance_tasks
       SET status = 'cancelled',
           completion_notes = COALESCE(p_reason, completion_notes),
           updated_at = NOW()
     WHERE id = p_task_id;

    PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);

    PERFORM public.pm_write_audit_log(
        p_action      => 'Cancelled preventive maintenance task',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'status', 'cancelled',
            'reason', p_reason
        ),
        p_new_values  => jsonb_build_object(
            'status', 'cancelled',
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'status', 'cancelled'
    );
END;
$$;

-- =============================================================================
-- SECTION 12: PLAN STATS, updated_at, AND PM WORKFLOW TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trigger_update_plan_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.pm_update_plan_stats(OLD.maintenance_plan_id);
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM public.pm_update_plan_stats(NEW.maintenance_plan_id);
        RETURN NEW;
    END IF;

    IF OLD.maintenance_plan_id IS DISTINCT FROM NEW.maintenance_plan_id THEN
        PERFORM public.pm_update_plan_stats(OLD.maintenance_plan_id);
        PERFORM public.pm_update_plan_stats(NEW.maintenance_plan_id);
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
        PERFORM public.pm_update_plan_stats(NEW.maintenance_plan_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_status_change ON public.maintenance_tasks;
DROP TRIGGER IF EXISTS trg_task_created ON public.maintenance_tasks;
DROP TRIGGER IF EXISTS trg_task_deleted ON public.maintenance_tasks;

CREATE TRIGGER trg_task_status_change
AFTER UPDATE OF status, maintenance_plan_id ON public.maintenance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_plan_stats();

CREATE TRIGGER trg_task_created
AFTER INSERT ON public.maintenance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_plan_stats();

CREATE TRIGGER trg_task_deleted
AFTER DELETE ON public.maintenance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_plan_stats();

DROP TRIGGER IF EXISTS trg_maintenance_plans_set_updated_at ON public.maintenance_plans;
DROP TRIGGER IF EXISTS trg_checklist_templates_set_updated_at ON public.checklist_templates;
DROP TRIGGER IF EXISTS trg_maintenance_task_checks_set_updated_at ON public.maintenance_task_checks;

CREATE TRIGGER trg_maintenance_plans_set_updated_at
BEFORE UPDATE ON public.maintenance_plans
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_checklist_templates_set_updated_at
BEFORE UPDATE ON public.checklist_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_maintenance_task_checks_set_updated_at
BEFORE UPDATE ON public.maintenance_task_checks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- SECTION 13: WORK ORDER -> PM TASK STATUS SYNC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_maintenance_task_from_work_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
                   updated_at = NOW()
             WHERE id = v_task.id;

            PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);
        END LOOP;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_maintenance_task_from_work_order
AFTER UPDATE OF status ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_maintenance_task_from_work_order();

-- =============================================================================
-- SECTION 14: ASSET MAINTENANCE HISTORY VIEW
-- =============================================================================

DROP VIEW IF EXISTS public.asset_maintenance_history;

CREATE VIEW public.asset_maintenance_history
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
    t.created_at
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

-- =============================================================================
-- SECTION 15: FUNCTION GRANTS
-- =============================================================================

REVOKE ALL ON FUNCTION public.pm_can_view_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_can_manage_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_can_view_task(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_can_execute_task(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_write_audit_log(TEXT, TEXT, TEXT, UUID, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_update_template_totals(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_update_template_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_populate_task_checks_internal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_update_plan_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_maintenance_task_from_work_order() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.pm_can_view_tenant(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.pm_can_manage_tenant(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.pm_can_view_task(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.pm_can_execute_task(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.pm_write_audit_log(TEXT, TEXT, TEXT, UUID, JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.pm_update_template_totals(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.trigger_update_template_totals() FROM anon;
REVOKE ALL ON FUNCTION public.pm_populate_task_checks_internal(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.trigger_update_plan_stats() FROM anon;
REVOKE ALL ON FUNCTION public.sync_maintenance_task_from_work_order() FROM anon;

REVOKE ALL ON FUNCTION public.pm_write_audit_log(TEXT, TEXT, TEXT, UUID, JSONB, JSONB) FROM authenticated;
REVOKE ALL ON FUNCTION public.pm_update_template_totals(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.trigger_update_template_totals() FROM authenticated;
REVOKE ALL ON FUNCTION public.pm_populate_task_checks_internal(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.trigger_update_plan_stats() FROM authenticated;
REVOKE ALL ON FUNCTION public.sync_maintenance_task_from_work_order() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.pm_can_view_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_manage_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_view_task(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_execute_task(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.pm_update_plan_status(UUID, VARCHAR, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_update_plan_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_start_task(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_complete_task(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_cancel_task(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_populate_task_checks(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.pm_update_plan_status(UUID, VARCHAR, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.pm_update_plan_stats(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.pm_start_task(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.pm_complete_task(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.pm_cancel_task(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.pm_populate_task_checks(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.pm_update_plan_status(UUID, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_update_plan_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_start_task(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_complete_task(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_cancel_task(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_populate_task_checks(UUID) TO authenticated;

-- =============================================================================
-- SECTION 16: BACKFILL STORED STATS
-- =============================================================================

DO $$
DECLARE
    v_plan RECORD;
    v_template RECORD;
BEGIN
    FOR v_plan IN
        SELECT id
          FROM public.maintenance_plans
    LOOP
        PERFORM public.pm_update_plan_stats(v_plan.id);
    END LOOP;

    FOR v_template IN
        SELECT id
          FROM public.checklist_templates
    LOOP
        PERFORM public.pm_update_template_totals(v_template.id);
    END LOOP;
END;
$$;
