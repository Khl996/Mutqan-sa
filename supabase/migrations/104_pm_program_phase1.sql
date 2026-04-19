-- =============================================================================
-- PM Program Core - Phase 1
-- Adds program targets, asset groups, frequency bundles, team assignment, and
-- execution snapshots without removing or rewriting existing PM data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Asset groups
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asset_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code VARCHAR(50),
    name VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200),
    description TEXT,
    building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.asset_group_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_group_id UUID NOT NULL REFERENCES public.asset_groups(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    role VARCHAR(100),
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (asset_group_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_groups_tenant ON public.asset_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_groups_building ON public.asset_groups(building_id);
CREATE INDEX IF NOT EXISTS idx_asset_groups_active ON public.asset_groups(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_asset_group_items_group ON public.asset_group_items(asset_group_id);
CREATE INDEX IF NOT EXISTS idx_asset_group_items_asset ON public.asset_group_items(asset_id);

-- -----------------------------------------------------------------------------
-- Plan targets: asset, building, or asset_group.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_plan_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE CASCADE,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('asset', 'building', 'asset_group')),
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
    building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE,
    asset_group_id UUID REFERENCES public.asset_groups(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    role VARCHAR(100),
    notes TEXT,
    label_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (
        (target_type = 'asset' AND asset_id IS NOT NULL AND building_id IS NULL AND asset_group_id IS NULL)
        OR (target_type = 'building' AND building_id IS NOT NULL AND asset_id IS NULL AND asset_group_id IS NULL)
        OR (target_type = 'asset_group' AND asset_group_id IS NOT NULL AND asset_id IS NULL AND building_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_plan_targets_tenant ON public.maintenance_plan_targets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plan_targets_plan ON public.maintenance_plan_targets(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_targets_asset ON public.maintenance_plan_targets(asset_id);
CREATE INDEX IF NOT EXISTS idx_plan_targets_building ON public.maintenance_plan_targets(building_id);
CREATE INDEX IF NOT EXISTS idx_plan_targets_asset_group ON public.maintenance_plan_targets(asset_group_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_targets_asset
    ON public.maintenance_plan_targets(plan_id, asset_id)
    WHERE target_type = 'asset' AND asset_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_targets_building
    ON public.maintenance_plan_targets(plan_id, building_id)
    WHERE target_type = 'building' AND building_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_targets_asset_group
    ON public.maintenance_plan_targets(plan_id, asset_group_id)
    WHERE target_type = 'asset_group' AND asset_group_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Frequency bundles: each bundle has its own template/sheet.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_frequency_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE CASCADE,
    code VARCHAR(50),
    name VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200),
    frequency_type VARCHAR(20) NOT NULL DEFAULT 'monthly'
        CHECK (frequency_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom')),
    interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count > 0),
    checklist_template_id UUID REFERENCES public.checklist_templates(id) ON DELETE SET NULL,
    default_assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    default_assigned_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    estimated_duration_minutes INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    instructions TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (plan_id, code)
);

CREATE INDEX IF NOT EXISTS idx_pm_bundles_tenant ON public.maintenance_frequency_bundles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pm_bundles_plan ON public.maintenance_frequency_bundles(plan_id);
CREATE INDEX IF NOT EXISTS idx_pm_bundles_template ON public.maintenance_frequency_bundles(checklist_template_id);
CREATE INDEX IF NOT EXISTS idx_pm_bundles_frequency ON public.maintenance_frequency_bundles(frequency_type);
CREATE INDEX IF NOT EXISTS idx_pm_bundles_default_team ON public.maintenance_frequency_bundles(default_assigned_team_id);

-- -----------------------------------------------------------------------------
-- Task extensions for program execution.
-- -----------------------------------------------------------------------------
ALTER TABLE public.maintenance_tasks
    ADD COLUMN IF NOT EXISTS frequency_bundle_id UUID REFERENCES public.maintenance_frequency_bundles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS execution_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_frequency_bundle ON public.maintenance_tasks(frequency_bundle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_assigned_team ON public.maintenance_tasks(assigned_team_id);

-- -----------------------------------------------------------------------------
-- Backfill plan targets from the transitional building_id on maintenance_plans.
-- -----------------------------------------------------------------------------
INSERT INTO public.maintenance_plan_targets (
    tenant_id,
    plan_id,
    target_type,
    building_id,
    is_primary,
    label_snapshot
)
SELECT
    mp.tenant_id,
    mp.id,
    'building',
    mp.building_id,
    TRUE,
    jsonb_build_object(
        'building_id', b.id,
        'building_name', b.name,
        'building_name_ar', b.name_ar
    )
FROM public.maintenance_plans mp
JOIN public.buildings b ON b.id = mp.building_id
WHERE mp.building_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
        FROM public.maintenance_plan_targets mpt
       WHERE mpt.plan_id = mp.id
         AND mpt.target_type = 'building'
         AND mpt.building_id = mp.building_id
  );

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_asset_groups_set_updated_at ON public.asset_groups;
CREATE TRIGGER trg_asset_groups_set_updated_at
BEFORE UPDATE ON public.asset_groups
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_maintenance_plan_targets_set_updated_at ON public.maintenance_plan_targets;
CREATE TRIGGER trg_maintenance_plan_targets_set_updated_at
BEFORE UPDATE ON public.maintenance_plan_targets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pm_bundles_set_updated_at ON public.maintenance_frequency_bundles;
CREATE TRIGGER trg_pm_bundles_set_updated_at
BEFORE UPDATE ON public.maintenance_frequency_bundles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.asset_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_group_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_plan_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_frequency_bundles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_groups_select ON public.asset_groups;
CREATE POLICY asset_groups_select ON public.asset_groups
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

DROP POLICY IF EXISTS asset_groups_manage ON public.asset_groups;
CREATE POLICY asset_groups_manage ON public.asset_groups
FOR ALL
TO authenticated
USING (public.pm_can_manage_tenant(tenant_id))
WITH CHECK (public.pm_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS asset_group_items_select ON public.asset_group_items;
CREATE POLICY asset_group_items_select ON public.asset_group_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
          FROM public.asset_groups ag
         WHERE ag.id = asset_group_id
           AND public.pm_can_view_tenant(ag.tenant_id)
    )
);

DROP POLICY IF EXISTS asset_group_items_manage ON public.asset_group_items;
CREATE POLICY asset_group_items_manage ON public.asset_group_items
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
          FROM public.asset_groups ag
         WHERE ag.id = asset_group_id
           AND public.pm_can_manage_tenant(ag.tenant_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
          FROM public.asset_groups ag
         WHERE ag.id = asset_group_id
           AND public.pm_can_manage_tenant(ag.tenant_id)
    )
);

DROP POLICY IF EXISTS maintenance_plan_targets_select ON public.maintenance_plan_targets;
CREATE POLICY maintenance_plan_targets_select ON public.maintenance_plan_targets
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

DROP POLICY IF EXISTS maintenance_plan_targets_manage ON public.maintenance_plan_targets;
CREATE POLICY maintenance_plan_targets_manage ON public.maintenance_plan_targets
FOR ALL
TO authenticated
USING (public.pm_can_manage_tenant(tenant_id))
WITH CHECK (public.pm_can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS maintenance_frequency_bundles_select ON public.maintenance_frequency_bundles;
CREATE POLICY maintenance_frequency_bundles_select ON public.maintenance_frequency_bundles
FOR SELECT
TO authenticated
USING (public.pm_can_view_tenant(tenant_id));

DROP POLICY IF EXISTS maintenance_frequency_bundles_manage ON public.maintenance_frequency_bundles;
CREATE POLICY maintenance_frequency_bundles_manage ON public.maintenance_frequency_bundles
FOR ALL
TO authenticated
USING (public.pm_can_manage_tenant(tenant_id))
WITH CHECK (public.pm_can_manage_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_group_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_plan_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_frequency_bundles TO authenticated;

-- -----------------------------------------------------------------------------
-- Team-aware task authorization.
-- -----------------------------------------------------------------------------
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
    v_assigned_team_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT mt.tenant_id, mt.assigned_to, mt.assigned_team_id
      INTO v_tenant_id, v_assigned_to, v_assigned_team_id
      FROM public.maintenance_tasks mt
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN public.pm_can_view_tenant(v_tenant_id)
        OR v_assigned_to = auth.uid()
        OR EXISTS (
            SELECT 1
              FROM public.team_members tm
             WHERE tm.team_id = v_assigned_team_id
               AND tm.user_id = auth.uid()
               AND tm.is_active = TRUE
        );
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
    v_assigned_team_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT mt.tenant_id, mt.assigned_to, mt.assigned_team_id
      INTO v_tenant_id, v_assigned_to, v_assigned_team_id
      FROM public.maintenance_tasks mt
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN public.pm_can_manage_tenant(v_tenant_id)
        OR v_assigned_to = auth.uid()
        OR EXISTS (
            SELECT 1
              FROM public.team_members tm
             WHERE tm.team_id = v_assigned_team_id
               AND tm.user_id = auth.uid()
               AND tm.is_active = TRUE
        );
END;
$$;

-- -----------------------------------------------------------------------------
-- Execution snapshot builder. This freezes the PM sheet shape for a task so
-- future template edits do not change the historical execution context.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pm_build_task_execution_snapshot(
    p_task_id UUID,
    p_skip_auth BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_task RECORD;
    v_items JSONB := '[]'::jsonb;
    v_targets JSONB := '[]'::jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

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
        ct.asset_type AS template_asset_type
      INTO v_task
      FROM public.maintenance_tasks mt
      LEFT JOIN public.maintenance_plans mp ON mp.id = mt.maintenance_plan_id
      LEFT JOIN public.maintenance_frequency_bundles mfb ON mfb.id = mt.frequency_bundle_id
      LEFT JOIN public.checklist_templates ct ON ct.id = mt.checklist_template_id
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF NOT p_skip_auth AND NOT public.pm_can_view_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to build execution snapshot';
    END IF;

    IF v_task.checklist_template_id IS NOT NULL THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', cti.id,
                    'template_id', cti.template_id,
                    'sort_order', cti.sort_order,
                    'label', cti.label,
                    'label_ar', cti.label_ar,
                    'item_type', cti.item_type,
                    'is_required', cti.is_required,
                    'is_critical', cti.is_critical,
                    'options', cti.options,
                    'description', cti.description,
                    'description_ar', cti.description_ar,
                    'created_at', cti.created_at
                )
                ORDER BY cti.sort_order, cti.created_at
            ),
            '[]'::jsonb
        )
        INTO v_items
        FROM public.checklist_template_items cti
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
                            'building_name_ar', b.name_ar,
                            'asset_group_code', ag.code,
                            'asset_group_name', ag.name,
                            'asset_group_name_ar', ag.name_ar
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
        LEFT JOIN public.asset_groups ag ON ag.id = mpt.asset_group_id
        WHERE mpt.plan_id = v_task.maintenance_plan_id;
    END IF;

    RETURN jsonb_build_object(
        'version', 1,
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
            'asset_type', v_task.template_asset_type
        ),
        'targets', v_targets,
        'items', v_items
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
           execution_snapshot = COALESCE(execution_snapshot, public.pm_build_task_execution_snapshot(p_task_id, TRUE)),
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
            'started_at', v_started_at,
            'frequency_bundle_id', v_task.frequency_bundle_id,
            'assigned_team_id', v_task.assigned_team_id
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

GRANT EXECUTE ON FUNCTION public.pm_can_view_task(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_execute_task(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_build_task_execution_snapshot(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_start_task(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Keep optional work-order starts aligned with the PM execution snapshot model.
-- -----------------------------------------------------------------------------
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
                   execution_snapshot = COALESCE(execution_snapshot, public.pm_build_task_execution_snapshot(v_task.id, TRUE)),
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
                   execution_snapshot = COALESCE(execution_snapshot, public.pm_build_task_execution_snapshot(v_task.id, TRUE)),
                   updated_at = NOW()
             WHERE id = v_task.id;

            PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);
        END LOOP;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_maintenance_task_from_work_order ON public.work_orders;
CREATE TRIGGER trg_sync_maintenance_task_from_work_order
AFTER UPDATE OF status ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_maintenance_task_from_work_order();

GRANT EXECUTE ON FUNCTION public.sync_maintenance_task_from_work_order() TO authenticated;
