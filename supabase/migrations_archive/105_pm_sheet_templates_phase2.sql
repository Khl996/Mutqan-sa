-- =============================================================================
-- PM Sheet Templates - Phase 2
-- Upgrades checklist templates into structured PM sheet templates with sections,
-- richer item metadata, and execution snapshots that preserve the sheet layout.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Template-level PM sheet metadata
-- -----------------------------------------------------------------------------
ALTER TABLE public.checklist_templates
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'active', 'archived')),
    ADD COLUMN IF NOT EXISTS template_type VARCHAR(30) NOT NULL DEFAULT 'pm_sheet'
        CHECK (template_type IN ('pm_sheet', 'inspection_sheet', 'safety_sheet', 'general')),
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.checklist_templates
   SET status = CASE WHEN is_active THEN status ELSE 'archived' END;

-- -----------------------------------------------------------------------------
-- Template sections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_template_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
    code VARCHAR(50),
    title VARCHAR(200) NOT NULL,
    title_ar VARCHAR(200),
    description TEXT,
    description_ar TEXT,
    section_type VARCHAR(30) NOT NULL DEFAULT 'general'
        CHECK (section_type IN ('readings', 'visual', 'safety', 'notes', 'photos', 'approval', 'general', 'custom')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_collapsible BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_sections_template
    ON public.checklist_template_sections(template_id);

CREATE INDEX IF NOT EXISTS idx_checklist_sections_sort
    ON public.checklist_template_sections(template_id, sort_order);

DROP TRIGGER IF EXISTS trg_checklist_template_sections_set_updated_at ON public.checklist_template_sections;
CREATE TRIGGER trg_checklist_template_sections_set_updated_at
BEFORE UPDATE ON public.checklist_template_sections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Rich item metadata
-- -----------------------------------------------------------------------------
ALTER TABLE public.checklist_template_items
    ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.checklist_template_sections(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
    ADD COLUMN IF NOT EXISTS min_value DECIMAL(12, 4),
    ADD COLUMN IF NOT EXISTS max_value DECIMAL(12, 4),
    ADD COLUMN IF NOT EXISTS warning_min_value DECIMAL(12, 4),
    ADD COLUMN IF NOT EXISTS warning_max_value DECIMAL(12, 4),
    ADD COLUMN IF NOT EXISTS placeholder TEXT,
    ADD COLUMN IF NOT EXISTS placeholder_ar TEXT,
    ADD COLUMN IF NOT EXISTS help_text TEXT,
    ADD COLUMN IF NOT EXISTS help_text_ar TEXT,
    ADD COLUMN IF NOT EXISTS applies_to_target_type VARCHAR(20) NOT NULL DEFAULT 'all'
        CHECK (applies_to_target_type IN ('all', 'asset', 'building', 'asset_group')),
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_checklist_items_section
    ON public.checklist_template_items(section_id);

CREATE INDEX IF NOT EXISTS idx_checklist_items_applies_to
    ON public.checklist_template_items(applies_to_target_type);

-- -----------------------------------------------------------------------------
-- Backfill a default section per existing template and attach legacy items.
-- -----------------------------------------------------------------------------
INSERT INTO public.checklist_template_sections (
    template_id,
    code,
    title,
    title_ar,
    section_type,
    sort_order,
    metadata
)
SELECT
    ct.id,
    'general',
    'General checks',
    'فحوصات عامة',
    'general',
    1,
    jsonb_build_object('phase2_backfill', TRUE)
FROM public.checklist_templates ct
WHERE NOT EXISTS (
    SELECT 1
      FROM public.checklist_template_sections cts
     WHERE cts.template_id = ct.id
);

UPDATE public.checklist_template_items cti
   SET section_id = cts.id
  FROM public.checklist_template_sections cts
 WHERE cti.template_id = cts.template_id
   AND cti.section_id IS NULL
   AND cts.code = 'general';

-- -----------------------------------------------------------------------------
-- RLS for sections mirrors parent checklist_templates.
-- -----------------------------------------------------------------------------
ALTER TABLE public.checklist_template_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_template_sections_select_scoped ON public.checklist_template_sections;
CREATE POLICY checklist_template_sections_select_scoped
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

DROP POLICY IF EXISTS checklist_template_sections_manage_scoped ON public.checklist_template_sections;
CREATE POLICY checklist_template_sections_manage_scoped
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

-- -----------------------------------------------------------------------------
-- Execution snapshot builder v2: includes sections, richer item fields, and
-- template versioning while staying backward-compatible with Phase 1 tasks.
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
    v_sections JSONB := '[]'::jsonb;
    v_items JSONB := '[]'::jsonb;
    v_targets JSONB := '[]'::jsonb;
BEGIN
    IF auth.uid() IS NULL AND NOT p_skip_auth THEN
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

    IF NOT p_skip_auth AND NOT public.pm_can_view_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to build execution snapshot';
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
$$;

GRANT EXECUTE ON FUNCTION public.pm_build_task_execution_snapshot(UUID, BOOLEAN) TO authenticated;
