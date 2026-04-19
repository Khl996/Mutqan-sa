-- =============================================================================
-- Migration: 108_pm_rebuild_foundation.sql
-- Purpose: Phase 1 of the PM module full rebuild — new data model foundation.
--
-- WHY THIS REBUILD:
--   The previous model collapsed three distinct concepts into a single table
--   (maintenance_tasks): schedule template, work order instance, and execution
--   record. This caused cascading complexity in every RLS policy, trigger, and
--   RPC written on top of it.
--
-- THE FOUR NEW CONCEPTS:
--   1. Job Plan         — reusable checklist template (what to do)
--   2. PM Schedule      — asset + job plan + recurrence rule (when to do it)
--   3. Work Order       — one execution instance (a specific occurrence)
--   4. Execution Checks — recorded results per check item per asset
--
-- HOW THIS DIFFERS FROM THE OLD MODEL:
--   Old: maintenance_plans → maintenance_tasks (template + WO + execution mixed)
--   New: job_plans → pm_schedules → work_orders → work_order_checks (clean chain)
--
-- OLD TABLES RETAINED:
--   maintenance_plans, maintenance_tasks, checklist_templates, etc. are LEFT
--   INTACT. They are archived here but not dropped. Frontend pages that use
--   the old tables continue to work unchanged. Cleanup happens in a future
--   migration after the new model is validated in production.
--
-- ROLLBACK:
--   DROP the new tables (job_plans, job_plan_items, pm_schedules,
--   pm_schedule_assets, work_order_assets, work_order_checks,
--   work_order_attachments) plus the pm_legacy_archive schema.
--   The old tables and all their data remain unaffected.
-- =============================================================================

-- =============================================================================
-- SECTION 0 — Archive legacy PM tables into pm_legacy_archive schema
-- Data is copied as-is (no FK constraints) for historical reference.
-- The originals are NOT touched.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS pm_legacy_archive;

CREATE TABLE IF NOT EXISTS pm_legacy_archive.maintenance_plans_archive AS
    SELECT *, now() AS archived_at FROM public.maintenance_plans;

CREATE TABLE IF NOT EXISTS pm_legacy_archive.maintenance_tasks_archive AS
    SELECT *, now() AS archived_at FROM public.maintenance_tasks;

CREATE TABLE IF NOT EXISTS pm_legacy_archive.checklist_templates_archive AS
    SELECT *, now() AS archived_at FROM public.checklist_templates;

CREATE TABLE IF NOT EXISTS pm_legacy_archive.checklist_template_sections_archive AS
    SELECT *, now() AS archived_at FROM public.checklist_template_sections;

CREATE TABLE IF NOT EXISTS pm_legacy_archive.checklist_template_items_archive AS
    SELECT *, now() AS archived_at FROM public.checklist_template_items;

CREATE TABLE IF NOT EXISTS pm_legacy_archive.maintenance_task_checks_archive AS
    SELECT *, now() AS archived_at FROM public.maintenance_task_checks;

CREATE TABLE IF NOT EXISTS pm_legacy_archive.maintenance_task_attachments_archive AS
    SELECT *, now() AS archived_at FROM public.maintenance_task_attachments;

CREATE TABLE IF NOT EXISTS pm_legacy_archive.maintenance_plan_targets_archive AS
    SELECT *, now() AS archived_at FROM public.maintenance_plan_targets;

CREATE TABLE IF NOT EXISTS pm_legacy_archive.maintenance_frequency_bundles_archive AS
    SELECT *, now() AS archived_at FROM public.maintenance_frequency_bundles;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'pm_pdf_exports'
    ) THEN
        CREATE TABLE IF NOT EXISTS pm_legacy_archive.pm_pdf_exports_archive AS
            SELECT *, now() AS archived_at FROM public.pm_pdf_exports;
    END IF;
END $$;

-- =============================================================================
-- SECTION 1 — Asset hierarchy: add asset_level classification
-- parent_asset_id already exists from migration 002 (left as-is).
-- criticality already exists with ('low','medium','high','critical') — retained.
-- qr_code_url / qr_data (added in 103) are removed: QR is generated client-side
-- from asset_id and needs no DB storage.
-- =============================================================================

ALTER TABLE public.assets
    ADD COLUMN IF NOT EXISTS asset_level VARCHAR(20) NOT NULL DEFAULT 'equipment'
        CHECK (asset_level IN ('system', 'equipment', 'component'));
-- system    = a logical system (HVAC system, water treatment system)
-- equipment = a standalone asset (chiller, pump, AHU)
-- component = a sub-part inside an asset (compressor inside a chiller)

-- NOTE: qr_code_url / qr_data are retained to avoid breaking dependent views.
-- They can be dropped in a future migration after auditing all view dependencies.
-- QR codes should be generated client-side from asset_id — no DB storage needed.
COMMENT ON COLUMN public.assets.qr_code_url IS 'DEPRECATED: Generate QR client-side from asset_id.';
COMMENT ON COLUMN public.assets.qr_data     IS 'DEPRECATED: Generate QR client-side from asset_id.';

CREATE INDEX IF NOT EXISTS idx_assets_level        ON public.assets(asset_level);
CREATE INDEX IF NOT EXISTS idx_assets_parent       ON public.assets(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_assets_criticality  ON public.assets(criticality);

-- =============================================================================
-- SECTION 2 — Retain asset_groups as a legacy operational layer
-- asset_groups / asset_group_items still have operational value as named sets of
-- similar assets. pm_schedule_assets is the execution target list for one PM
-- schedule; it does not replace a reusable "asset set" concept by itself.
--
-- Do NOT drop these tables in Phase 1. They remain available to legacy PM
-- screens/functions and can later be redefined as maintenance scopes / asset
-- sets after real usage is validated.
-- =============================================================================

DO $$
BEGIN
    IF to_regclass('public.asset_groups') IS NOT NULL THEN
        COMMENT ON TABLE public.asset_groups IS
            'LEGACY: retained during PM rebuild. Candidate future rename: maintenance_asset_sets / maintenance scopes.';
    END IF;

    IF to_regclass('public.asset_group_items') IS NOT NULL THEN
        COMMENT ON TABLE public.asset_group_items IS
            'LEGACY: retained during PM rebuild. Defines reusable membership for asset groups.';
    END IF;
END $$;

-- =============================================================================
-- SECTION 3 — Job Plans (reusable checklist templates — "what to do")
-- Replaces checklist_templates with a cleaner model. Old templates remain.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.job_plans (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code                        VARCHAR(50),
    name                        VARCHAR(200) NOT NULL,
    name_ar                     VARCHAR(200),
    description                 TEXT,
    description_ar              TEXT,
    -- Classification
    category                    VARCHAR(50),
    -- 'hvac','electrical','plumbing','mechanical','safety','general'
    asset_type_hint             VARCHAR(50),
    -- optional filter hint: 'ac_chiller','pump','generator','elevator'
    -- Lifecycle
    status                      VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived')),
    version                     INTEGER NOT NULL DEFAULT 1,
    -- Execution metadata
    estimated_duration_minutes  INTEGER,
    requires_safety_checks      BOOLEAN NOT NULL DEFAULT FALSE,
    safety_notes                TEXT,
    safety_notes_ar             TEXT,
    required_parts              JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- Stats (maintained by trigger)
    total_items                 INTEGER NOT NULL DEFAULT 0,
    usage_count                 INTEGER NOT NULL DEFAULT 0,
    -- Audit
    created_by                  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_plans_tenant   ON public.job_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_plans_status   ON public.job_plans(status);
CREATE INDEX IF NOT EXISTS idx_job_plans_category ON public.job_plans(category);

-- =============================================================================
-- SECTION 4 — Job Plan Items (checklist entries — "the actual steps")
-- Deliberately flat (no sections table): a section_name column provides visual
-- grouping without the overhead of a separate table. Sections can be added as
-- a table later if multi-plan reuse becomes a requirement.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.job_plan_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_plan_id     UUID NOT NULL REFERENCES public.job_plans(id) ON DELETE CASCADE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    -- Visual grouping (optional)
    section_name    VARCHAR(100),
    section_name_ar VARCHAR(100),
    -- Content
    label           VARCHAR(500) NOT NULL,
    label_ar        VARCHAR(500),
    description     TEXT,
    description_ar  TEXT,
    help_text       TEXT,
    help_text_ar    TEXT,
    -- Type
    item_type       VARCHAR(20) NOT NULL DEFAULT 'yes_no'
        CHECK (item_type IN (
            'yes_no',        -- Yes / No
            'pass_fail',     -- Pass / Fail (clearer for inspections)
            'numeric',       -- Numeric reading
            'text',          -- Free text note
            'photo',         -- Photo upload
            'signature',     -- Signature capture
            'select',        -- Single choice from list
            'multi_select',  -- Multiple choices
            'header'         -- Visual divider / section heading (no value)
        )),
    is_required     BOOLEAN NOT NULL DEFAULT FALSE,
    is_critical     BOOLEAN NOT NULL DEFAULT FALSE,
    -- Numeric range (for 'numeric' / 'reading' types)
    unit            VARCHAR(20),
    min_value       DECIMAL(14, 4),
    max_value       DECIMAL(14, 4),
    warning_min     DECIMAL(14, 4),
    warning_max     DECIMAL(14, 4),
    -- Select options: [{"value":"good","label":"جيد","label_en":"Good"}, ...]
    options         JSONB,
    -- Extensible metadata
    metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_plan_items_plan ON public.job_plan_items(job_plan_id);
CREATE INDEX IF NOT EXISTS idx_job_plan_items_sort ON public.job_plan_items(job_plan_id, sort_order);

-- =============================================================================
-- SECTION 5 — PM Schedules ("when to do it" — the recurrence engine core)
-- Each row = one asset (or group) + one job plan + one recurrence rule.
-- The cron job reads this table daily and creates Work Orders.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pm_schedules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code                    VARCHAR(50),
    name                    VARCHAR(200) NOT NULL,
    name_ar                 VARCHAR(200),
    description             TEXT,
    -- Job plan linkage
    job_plan_id             UUID NOT NULL REFERENCES public.job_plans(id),
    -- Primary asset (optional shortcut; full multi-asset list in pm_schedule_assets)
    primary_asset_id        UUID REFERENCES public.assets(id) ON DELETE SET NULL,
    -- Trigger type
    trigger_type            VARCHAR(20) NOT NULL DEFAULT 'calendar'
        CHECK (trigger_type IN ('calendar', 'meter', 'condition')),
    -- Calendar-based recurrence
    frequency_type          VARCHAR(20)
        CHECK (frequency_type IN (
            'daily', 'weekly', 'monthly', 'quarterly',
            'semi_annual', 'annual', 'custom'
        )),
    frequency_interval      INTEGER DEFAULT 1 CHECK (frequency_interval > 0),
    -- Meter-based (future — schema ready)
    meter_field             VARCHAR(50),    -- 'operating_hours', 'cycles', 'km'
    meter_threshold         DECIMAL(14, 4),
    -- Condition-based (future — schema ready)
    condition_rule          JSONB,
    -- Schedule dates
    start_date              DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date                DATE,
    next_due_date           DATE,
    last_generated_date     DATE,
    -- WO generation lead time (create WO N days before due date)
    lead_time_days          INTEGER NOT NULL DEFAULT 0,
    -- Compliance window override (NULL = auto-calculated via 10% rule)
    compliance_window_days  INTEGER,
    -- Default WO assignments
    default_assignee_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    default_team_id         UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    default_priority        VARCHAR(10) NOT NULL DEFAULT 'medium'
        CHECK (default_priority IN ('low', 'medium', 'high', 'critical')),
    -- Lifecycle
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
    -- Rolling stats
    total_generated         INTEGER NOT NULL DEFAULT 0,
    total_completed         INTEGER NOT NULL DEFAULT 0,
    total_overdue           INTEGER NOT NULL DEFAULT 0,
    compliance_rate         DECIMAL(5, 2) DEFAULT 0,
    notes                   TEXT,
    -- Audit
    created_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_schedules_tenant   ON public.pm_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pm_schedules_status   ON public.pm_schedules(status);
CREATE INDEX IF NOT EXISTS idx_pm_schedules_next_due ON public.pm_schedules(next_due_date)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pm_schedules_asset    ON public.pm_schedules(primary_asset_id);

-- =============================================================================
-- SECTION 6 — PM Schedule Assets (multi-asset support per schedule)
-- When a schedule covers multiple assets (e.g., 2 chillers on the same plan),
-- all assets are listed here. The cron job creates ONE Work Order that covers
-- ALL assets in the list, mirroring real-world practice.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pm_schedule_assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES public.pm_schedules(id) ON DELETE CASCADE,
    asset_id    UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (schedule_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_pm_schedule_assets_schedule ON public.pm_schedule_assets(schedule_id);
CREATE INDEX IF NOT EXISTS idx_pm_schedule_assets_asset    ON public.pm_schedule_assets(asset_id);

-- =============================================================================
-- SECTION 7 — Extend work_orders for PM support
-- The existing work_orders table handles reactive WOs. We add PM-specific
-- columns without removing or changing any existing column.
-- NOTE: work_orders uses 'assigned_team' (not 'assigned_team_id') for the FK.
-- =============================================================================

ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS work_type           VARCHAR(20) NOT NULL DEFAULT 'reactive'
        CHECK (work_type IN ('preventive', 'reactive', 'corrective', 'inspection', 'project')),
    ADD COLUMN IF NOT EXISTS source_schedule_id  UUID REFERENCES public.pm_schedules(id),
    ADD COLUMN IF NOT EXISTS job_plan_id         UUID REFERENCES public.job_plans(id),
    ADD COLUMN IF NOT EXISTS scheduled_date      DATE,
    ADD COLUMN IF NOT EXISTS compliance_deadline DATE,
    ADD COLUMN IF NOT EXISTS completion_notes    TEXT,
    ADD COLUMN IF NOT EXISTS actual_duration_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS started_at          TIMESTAMPTZ;

-- Retroactively mark all existing work orders as 'reactive'
UPDATE public.work_orders
   SET work_type = 'reactive'
 WHERE work_type IS NULL OR work_type = 'reactive';

CREATE INDEX IF NOT EXISTS idx_work_orders_work_type      ON public.work_orders(work_type);
CREATE INDEX IF NOT EXISTS idx_work_orders_source_schedule ON public.work_orders(source_schedule_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_compliance     ON public.work_orders(compliance_deadline)
    WHERE status NOT IN ('completed', 'cancelled');

-- Sequence for PM-generated WO codes
CREATE SEQUENCE IF NOT EXISTS public.work_order_number_seq;

-- =============================================================================
-- SECTION 8 — Work Order Assets (multi-asset per WO)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.work_order_assets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id  UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
    asset_id       UUID NOT NULL REFERENCES public.assets(id),
    sort_order     INTEGER NOT NULL DEFAULT 0,
    is_completed   BOOLEAN NOT NULL DEFAULT FALSE,
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (work_order_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_wo_assets_wo    ON public.work_order_assets(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_assets_asset ON public.work_order_assets(asset_id);

-- =============================================================================
-- SECTION 9 — Work Order Checks (execution record per item per asset)
-- item_snapshot stores a frozen copy of the job_plan_item at execution time,
-- so historical records remain accurate even if the job plan is later edited.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.work_order_checks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id       UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
    asset_id            UUID REFERENCES public.assets(id),
    job_plan_item_id    UUID REFERENCES public.job_plan_items(id),
    -- Frozen snapshot of the item at execution time
    item_snapshot       JSONB NOT NULL,
    -- {label, label_ar, item_type, is_required, is_critical, unit,
    --  min_value, max_value, warning_min, warning_max, options,
    --  help_text, help_text_ar}
    sort_order          INTEGER NOT NULL DEFAULT 0,
    -- Recorded values (only the relevant one will be non-NULL per item_type)
    value_bool          BOOLEAN,
    value_numeric       DECIMAL(14, 4),
    value_text          TEXT,
    value_options       JSONB,   -- for multi_select
    value_photo_url     TEXT,
    value_signature_url TEXT,
    -- Pass / fail / NA outcome
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'pass', 'fail', 'na')),
    notes               TEXT,
    -- Audit
    checked_by          UUID REFERENCES public.profiles(id),
    checked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_checks_wo     ON public.work_order_checks(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_checks_asset  ON public.work_order_checks(asset_id);
CREATE INDEX IF NOT EXISTS idx_wo_checks_status ON public.work_order_checks(status);

-- =============================================================================
-- SECTION 10 — Work Order Attachments
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.work_order_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    work_order_id   UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
    check_id        UUID REFERENCES public.work_order_checks(id) ON DELETE SET NULL,
    attachment_type VARCHAR(20) NOT NULL DEFAULT 'general'
        CHECK (attachment_type IN (
            'general', 'before_photo', 'after_photo',
            'check_photo', 'signature', 'document'
        )),
    file_name       VARCHAR(200),
    file_url        TEXT NOT NULL,
    mime_type       VARCHAR(50),
    file_size       INTEGER,
    notes           TEXT,
    uploaded_by     UUID REFERENCES public.profiles(id),
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_attachments_wo    ON public.work_order_attachments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_attachments_check ON public.work_order_attachments(check_id);

-- =============================================================================
-- SECTION 11 — Helper functions (IMMUTABLE — safe to use in indexes/queries)
-- =============================================================================

-- Calculate the next due date after a completed occurrence
CREATE OR REPLACE FUNCTION public.pm_calculate_next_due(
    p_current_due       DATE,
    p_frequency_type    VARCHAR,
    p_frequency_interval INTEGER
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE p_frequency_type
        WHEN 'daily'       THEN p_current_due + (p_frequency_interval || ' days')::INTERVAL
        WHEN 'weekly'      THEN p_current_due + (p_frequency_interval || ' weeks')::INTERVAL
        WHEN 'monthly'     THEN p_current_due + (p_frequency_interval || ' months')::INTERVAL
        WHEN 'quarterly'   THEN p_current_due + (p_frequency_interval * 3 || ' months')::INTERVAL
        WHEN 'semi_annual' THEN p_current_due + (p_frequency_interval * 6 || ' months')::INTERVAL
        WHEN 'annual'      THEN p_current_due + (p_frequency_interval || ' years')::INTERVAL
        ELSE                    p_current_due + '1 month'::INTERVAL
    END;
END;
$$;

-- Calculate the compliance window (10% rule, clamped 1–30 days)
-- Example: monthly → 30 days × 10% = 3 days
CREATE OR REPLACE FUNCTION public.pm_calculate_compliance_window(
    p_frequency_type     VARCHAR,
    p_frequency_interval INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_days INTEGER;
BEGIN
    v_days := CASE p_frequency_type
        WHEN 'daily'       THEN p_frequency_interval
        WHEN 'weekly'      THEN p_frequency_interval * 7
        WHEN 'monthly'     THEN p_frequency_interval * 30
        WHEN 'quarterly'   THEN p_frequency_interval * 90
        WHEN 'semi_annual' THEN p_frequency_interval * 180
        WHEN 'annual'      THEN p_frequency_interval * 365
        ELSE 30
    END;
    RETURN GREATEST(1, LEAST(30, (v_days * 0.10)::INTEGER));
END;
$$;

-- =============================================================================
-- SECTION 12 — pm_generate_due_work_orders() — the daily cron function
-- Scans all active calendar-based schedules whose due date (minus lead_time)
-- has arrived. For each, creates a Work Order with checks pre-populated per
-- job plan item × asset. Then advances next_due_date.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_generate_due_work_orders()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_schedule          RECORD;
    v_wo_id             UUID;
    v_wo_code           VARCHAR(30);
    v_asset             RECORD;
    v_item              RECORD;
    v_next_due          DATE;
    v_generated_count   INTEGER := 0;
BEGIN
    -- Iterate every active calendar-based schedule whose time has come
    FOR v_schedule IN
        SELECT *
          FROM public.pm_schedules
         WHERE status = 'active'
           AND trigger_type = 'calendar'
           AND next_due_date IS NOT NULL
           AND (next_due_date - COALESCE(lead_time_days, 0)) <= CURRENT_DATE
           AND (end_date IS NULL OR next_due_date <= end_date)
    LOOP
        -- Skip if a non-terminal WO already exists for this cycle
        IF EXISTS (
            SELECT 1
              FROM public.work_orders
             WHERE source_schedule_id = v_schedule.id
               AND status NOT IN ('completed', 'cancelled')
               AND scheduled_date = v_schedule.next_due_date
        ) THEN
            CONTINUE;
        END IF;

        -- Generate a unique WO code
        v_wo_code := 'WO-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
                     || '-' || LPAD(nextval('public.work_order_number_seq')::TEXT, 6, '0');

        -- Create the Work Order
        -- Note: work_orders uses 'assigned_team' (not 'assigned_team_id')
        INSERT INTO public.work_orders (
            tenant_id,
            code,
            title,
            description,
            work_type,
            source_schedule_id,
            job_plan_id,
            status,
            priority,
            scheduled_date,
            compliance_deadline,
            assigned_to,
            assigned_team,
            created_at,
            updated_at
        )
        VALUES (
            v_schedule.tenant_id,
            v_wo_code,
            v_schedule.name,
            v_schedule.description,
            'preventive',
            v_schedule.id,
            v_schedule.job_plan_id,
            'pending',
            v_schedule.default_priority,
            v_schedule.next_due_date,
            v_schedule.next_due_date + COALESCE(
                v_schedule.compliance_window_days,
                public.pm_calculate_compliance_window(
                    v_schedule.frequency_type,
                    COALESCE(v_schedule.frequency_interval, 1)
                )
            ),
            v_schedule.default_assignee_id,
            v_schedule.default_team_id,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_wo_id;

        -- Link schedule assets to the new WO
        INSERT INTO public.work_order_assets (work_order_id, asset_id, sort_order)
        SELECT v_wo_id, asset_id, sort_order
          FROM public.pm_schedule_assets
         WHERE schedule_id = v_schedule.id;

        -- Populate work order checks (one row per item × per asset)
        -- If no schedule assets, fall back to primary_asset_id
        FOR v_asset IN
            SELECT asset_id
              FROM public.pm_schedule_assets
             WHERE schedule_id = v_schedule.id

            UNION ALL

            SELECT v_schedule.primary_asset_id
             WHERE v_schedule.primary_asset_id IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.pm_schedule_assets
                    WHERE schedule_id = v_schedule.id
               )
        LOOP
            FOR v_item IN
                SELECT *
                  FROM public.job_plan_items
                 WHERE job_plan_id = v_schedule.job_plan_id
                 ORDER BY sort_order
            LOOP
                -- Headers have no input value — skip them
                CONTINUE WHEN v_item.item_type = 'header';

                INSERT INTO public.work_order_checks (
                    work_order_id,
                    asset_id,
                    job_plan_item_id,
                    item_snapshot,
                    sort_order,
                    status
                )
                VALUES (
                    v_wo_id,
                    v_asset.asset_id,
                    v_item.id,
                    jsonb_build_object(
                        'label',        v_item.label,
                        'label_ar',     v_item.label_ar,
                        'description',  v_item.description,
                        'description_ar', v_item.description_ar,
                        'item_type',    v_item.item_type,
                        'is_required',  v_item.is_required,
                        'is_critical',  v_item.is_critical,
                        'unit',         v_item.unit,
                        'min_value',    v_item.min_value,
                        'max_value',    v_item.max_value,
                        'warning_min',  v_item.warning_min,
                        'warning_max',  v_item.warning_max,
                        'options',      v_item.options,
                        'help_text',    v_item.help_text,
                        'help_text_ar', v_item.help_text_ar
                    ),
                    v_item.sort_order,
                    'pending'
                );
            END LOOP;
        END LOOP;

        -- Advance the schedule's next_due_date
        v_next_due := public.pm_calculate_next_due(
            v_schedule.next_due_date,
            v_schedule.frequency_type,
            COALESCE(v_schedule.frequency_interval, 1)
        );

        UPDATE public.pm_schedules
           SET next_due_date       = v_next_due,
               last_generated_date = v_schedule.next_due_date,
               total_generated     = total_generated + 1,
               updated_at          = NOW()
         WHERE id = v_schedule.id;

        v_generated_count := v_generated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success',   TRUE,
        'generated', v_generated_count,
        'run_at',    NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pm_generate_due_work_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_generate_due_work_orders() FROM anon;
-- Called only by the service-role cron — no grant to 'authenticated'

-- =============================================================================
-- SECTION 13 — Work Order lifecycle RPCs
-- =============================================================================

-- Start a WO: pending → in_progress
CREATE OR REPLACE FUNCTION public.wo_start(p_wo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    UPDATE public.work_orders
       SET status     = 'in_progress',
           start_time = COALESCE(start_time, NOW()),   -- existing column
           started_at = COALESCE(started_at, NOW()),   -- new PM column
           updated_at = NOW()
     WHERE id = p_wo_id
       AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found or already started';
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_wo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.wo_start(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wo_start(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.wo_start(UUID) TO authenticated;

-- Complete a WO: validates required checks, then marks completed
CREATE OR REPLACE FUNCTION public.wo_complete(
    p_wo_id            UUID,
    p_completion_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wo            RECORD;
    v_missing_labels TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_wo_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    IF v_wo.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress work orders can be completed';
    END IF;

    -- Validate required checks — build list of incomplete required items
    SELECT string_agg(
        (item_snapshot->>'label')
        || CASE
               WHEN asset_id IS NOT NULL THEN
                   ' (' || COALESCE(
                       (SELECT name FROM public.assets WHERE id = asset_id),
                       'Asset'
                   ) || ')'
               ELSE ''
           END,
        ', '
        ORDER BY sort_order
    )
    INTO v_missing_labels
    FROM public.work_order_checks
    WHERE work_order_id = p_wo_id
      AND COALESCE((item_snapshot->>'is_required')::BOOLEAN, FALSE) = TRUE
      AND status = 'pending';

    IF v_missing_labels IS NOT NULL THEN
        RAISE EXCEPTION 'Required items incomplete: %', v_missing_labels;
    END IF;

    -- Mark the WO completed
    UPDATE public.work_orders
       SET status                  = 'completed',
           completed_at            = NOW(),
           completion_notes        = COALESCE(p_completion_notes, completion_notes),
           actual_duration_minutes = CASE
               WHEN started_at IS NOT NULL
               THEN GREATEST(0,
                   (EXTRACT(EPOCH FROM (NOW() - started_at)) / 60.0)::INTEGER
               )
               WHEN start_time IS NOT NULL
               THEN GREATEST(0,
                   (EXTRACT(EPOCH FROM (NOW() - start_time)) / 60.0)::INTEGER
               )
               ELSE NULL
           END,
           updated_at = NOW()
     WHERE id = p_wo_id;

    -- Update schedule compliance stats
    IF v_wo.source_schedule_id IS NOT NULL THEN
        UPDATE public.pm_schedules
           SET total_completed = total_completed + 1,
               compliance_rate = CASE
                   WHEN total_generated > 0
                   THEN ((total_completed + 1)::DECIMAL / total_generated * 100.0)
                   ELSE 0
               END,
               updated_at = NOW()
         WHERE id = v_wo.source_schedule_id;
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_wo_id);
END;
$$;

REVOKE ALL ON FUNCTION public.wo_complete(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wo_complete(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.wo_complete(UUID, TEXT) TO authenticated;

-- =============================================================================
-- SECTION 14 — pm_calculate_compliance_stats(tenant_id)
-- Returns compliance metrics for the last 30 days of PM work orders.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pm_calculate_compliance_stats(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total              INTEGER;
    v_completed_on_time  INTEGER;
    v_overdue            INTEGER;
    v_due_soon           INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total
      FROM public.work_orders
     WHERE tenant_id   = p_tenant_id
       AND work_type   = 'preventive'
       AND scheduled_date >= CURRENT_DATE - 30;

    SELECT COUNT(*) INTO v_completed_on_time
      FROM public.work_orders
     WHERE tenant_id   = p_tenant_id
       AND work_type   = 'preventive'
       AND scheduled_date >= CURRENT_DATE - 30
       AND status      = 'completed'
       AND completed_at::DATE <= compliance_deadline;

    SELECT COUNT(*) INTO v_overdue
      FROM public.work_orders
     WHERE tenant_id   = p_tenant_id
       AND work_type   = 'preventive'
       AND status NOT IN ('completed', 'cancelled')
       AND compliance_deadline < CURRENT_DATE;

    SELECT COUNT(*) INTO v_due_soon
      FROM public.work_orders
     WHERE tenant_id   = p_tenant_id
       AND work_type   = 'preventive'
       AND status      = 'pending'
       AND scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7;

    RETURN jsonb_build_object(
        'total',             v_total,
        'completed_on_time', v_completed_on_time,
        'overdue',           v_overdue,
        'due_soon',          v_due_soon,
        'compliance_rate',   CASE
            WHEN v_total > 0
            THEN ROUND((v_completed_on_time::DECIMAL / v_total * 100.0)::NUMERIC, 2)
            ELSE NULL
        END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.pm_calculate_compliance_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pm_calculate_compliance_stats(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.pm_calculate_compliance_stats(UUID) TO authenticated;

-- =============================================================================
-- SECTION 15 — RLS Policies
-- Pattern: pm_can_view_tenant for SELECT, pm_can_manage_tenant for mutations.
-- =============================================================================

-- ── Job Plans ─────────────────────────────────────────────────────────────────
ALTER TABLE public.job_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_plans_select ON public.job_plans;
CREATE POLICY job_plans_select ON public.job_plans
    FOR SELECT TO authenticated
    USING (public.pm_can_view_tenant(tenant_id));

DROP POLICY IF EXISTS job_plans_manage ON public.job_plans;
CREATE POLICY job_plans_manage ON public.job_plans
    FOR ALL TO authenticated
    USING (public.pm_can_manage_tenant(tenant_id))
    WITH CHECK (public.pm_can_manage_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_plans TO authenticated;

-- ── Job Plan Items ────────────────────────────────────────────────────────────
ALTER TABLE public.job_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_plan_items_select ON public.job_plan_items;
CREATE POLICY job_plan_items_select ON public.job_plan_items
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.job_plans jp
         WHERE jp.id = job_plan_items.job_plan_id
           AND public.pm_can_view_tenant(jp.tenant_id)
    ));

DROP POLICY IF EXISTS job_plan_items_manage ON public.job_plan_items;
CREATE POLICY job_plan_items_manage ON public.job_plan_items
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.job_plans jp
         WHERE jp.id = job_plan_items.job_plan_id
           AND public.pm_can_manage_tenant(jp.tenant_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.job_plans jp
         WHERE jp.id = job_plan_items.job_plan_id
           AND public.pm_can_manage_tenant(jp.tenant_id)
    ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_plan_items TO authenticated;

-- ── PM Schedules ──────────────────────────────────────────────────────────────
ALTER TABLE public.pm_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_schedules_select ON public.pm_schedules;
CREATE POLICY pm_schedules_select ON public.pm_schedules
    FOR SELECT TO authenticated
    USING (public.pm_can_view_tenant(tenant_id));

DROP POLICY IF EXISTS pm_schedules_manage ON public.pm_schedules;
CREATE POLICY pm_schedules_manage ON public.pm_schedules
    FOR ALL TO authenticated
    USING (public.pm_can_manage_tenant(tenant_id))
    WITH CHECK (public.pm_can_manage_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_schedules TO authenticated;

-- ── PM Schedule Assets ────────────────────────────────────────────────────────
ALTER TABLE public.pm_schedule_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_schedule_assets_select ON public.pm_schedule_assets;
CREATE POLICY pm_schedule_assets_select ON public.pm_schedule_assets
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.pm_schedules s
         WHERE s.id = pm_schedule_assets.schedule_id
           AND public.pm_can_view_tenant(s.tenant_id)
    ));

DROP POLICY IF EXISTS pm_schedule_assets_manage ON public.pm_schedule_assets;
CREATE POLICY pm_schedule_assets_manage ON public.pm_schedule_assets
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.pm_schedules s
         WHERE s.id = pm_schedule_assets.schedule_id
           AND public.pm_can_manage_tenant(s.tenant_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.pm_schedules s
         WHERE s.id = pm_schedule_assets.schedule_id
           AND public.pm_can_manage_tenant(s.tenant_id)
    ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_schedule_assets TO authenticated;

-- ── Work Order Assets ─────────────────────────────────────────────────────────
ALTER TABLE public.work_order_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_assets_select ON public.work_order_assets;
CREATE POLICY wo_assets_select ON public.work_order_assets
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = work_order_assets.work_order_id
           AND public.pm_can_view_tenant(wo.tenant_id)
    ));

DROP POLICY IF EXISTS wo_assets_manage ON public.work_order_assets;
CREATE POLICY wo_assets_manage ON public.work_order_assets
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = work_order_assets.work_order_id
           AND public.pm_can_manage_tenant(wo.tenant_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = work_order_assets.work_order_id
           AND public.pm_can_manage_tenant(wo.tenant_id)
    ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_assets TO authenticated;

-- ── Work Order Checks ─────────────────────────────────────────────────────────
ALTER TABLE public.work_order_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_checks_select ON public.work_order_checks;
CREATE POLICY wo_checks_select ON public.work_order_checks
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = work_order_checks.work_order_id
           AND public.pm_can_view_tenant(wo.tenant_id)
    ));

-- Managers can insert/delete checks
DROP POLICY IF EXISTS wo_checks_manage ON public.work_order_checks;
CREATE POLICY wo_checks_manage ON public.work_order_checks
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = work_order_checks.work_order_id
           AND public.pm_can_manage_tenant(wo.tenant_id)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = work_order_checks.work_order_id
           AND public.pm_can_manage_tenant(wo.tenant_id)
    ));

-- Assigned technician can fill in check values (UPDATE only, not status change on WO)
DROP POLICY IF EXISTS wo_checks_technician_update ON public.work_order_checks;
CREATE POLICY wo_checks_technician_update ON public.work_order_checks
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = work_order_checks.work_order_id
           AND (
               wo.assigned_to = auth.uid()
               OR public.pm_can_manage_tenant(wo.tenant_id)
           )
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.work_orders wo
         WHERE wo.id = work_order_checks.work_order_id
           AND (
               wo.assigned_to = auth.uid()
               OR public.pm_can_manage_tenant(wo.tenant_id)
           )
    ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_checks TO authenticated;

-- ── Work Order Attachments ────────────────────────────────────────────────────
ALTER TABLE public.work_order_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wo_attachments_select ON public.work_order_attachments;
CREATE POLICY wo_attachments_select ON public.work_order_attachments
    FOR SELECT TO authenticated
    USING (public.pm_can_view_tenant(tenant_id));

DROP POLICY IF EXISTS wo_attachments_manage ON public.work_order_attachments;
CREATE POLICY wo_attachments_manage ON public.work_order_attachments
    FOR ALL TO authenticated
    USING (
        public.pm_can_manage_tenant(tenant_id)
        OR uploaded_by = auth.uid()
    )
    WITH CHECK (
        public.pm_can_manage_tenant(tenant_id)
        OR uploaded_by = auth.uid()
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_attachments TO authenticated;

-- =============================================================================
-- SECTION 16 — Triggers
-- =============================================================================

-- updated_at triggers for all new tables
DROP TRIGGER IF EXISTS trg_job_plans_updated_at ON public.job_plans;
CREATE TRIGGER trg_job_plans_updated_at
BEFORE UPDATE ON public.job_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_job_plan_items_updated_at ON public.job_plan_items;
CREATE TRIGGER trg_job_plan_items_updated_at
BEFORE UPDATE ON public.job_plan_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pm_schedules_updated_at ON public.pm_schedules;
CREATE TRIGGER trg_pm_schedules_updated_at
BEFORE UPDATE ON public.pm_schedules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_wo_checks_updated_at ON public.work_order_checks;
CREATE TRIGGER trg_wo_checks_updated_at
BEFORE UPDATE ON public.work_order_checks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Keep job_plans.total_items in sync with actual item count (excluding headers)
CREATE OR REPLACE FUNCTION public.update_job_plan_total_items()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_plan_id UUID;
BEGIN
    v_plan_id := CASE TG_OP WHEN 'DELETE' THEN OLD.job_plan_id ELSE NEW.job_plan_id END;

    UPDATE public.job_plans
       SET total_items = (
           SELECT COUNT(*)
             FROM public.job_plan_items
            WHERE job_plan_id = v_plan_id
              AND item_type  <> 'header'
       )
     WHERE id = v_plan_id;

    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_job_plan_items ON public.job_plan_items;
CREATE TRIGGER trg_update_job_plan_items
AFTER INSERT OR UPDATE OR DELETE ON public.job_plan_items
FOR EACH ROW EXECUTE FUNCTION public.update_job_plan_total_items();

-- =============================================================================
-- SECTION 17 — pm_work_order_history view
-- Asset-centric view of all PM work orders in the new model.
-- Named separately from asset_maintenance_history (migration 106) which covers
-- the legacy maintenance_tasks model and must remain intact for the old frontend.
-- =============================================================================

CREATE OR REPLACE VIEW public.pm_work_order_history AS
SELECT
    woa.asset_id,
    wo.id                AS work_order_id,
    wo.code              AS work_order_code,
    wo.title,
    wo.work_type,
    wo.status,
    wo.scheduled_date,
    wo.completed_at,
    wo.assigned_to,
    p.full_name          AS technician_name,
    wo.source_schedule_id,
    s.name               AS schedule_name,
    wo.job_plan_id,
    jp.name              AS job_plan_name,
    wo.tenant_id,
    wo.created_at
FROM public.work_orders wo
JOIN public.work_order_assets woa ON woa.work_order_id = wo.id
LEFT JOIN public.profiles p       ON p.id = wo.assigned_to
LEFT JOIN public.pm_schedules s   ON s.id = wo.source_schedule_id
LEFT JOIN public.job_plans jp     ON jp.id = wo.job_plan_id
ORDER BY wo.created_at DESC;

GRANT SELECT ON public.pm_work_order_history TO authenticated;

-- =============================================================================
-- SECTION 18 — Cron schedule
-- The daily WO generation is handled by the Vercel cron route:
--   api/pm-generate-wos.ts  (schedule: "0 6 * * *" in vercel.json)
--
-- If you want pg_cron instead, run the following manually from Supabase
-- Dashboard → Database → Extensions → pg_cron, then in SQL Editor:
--
--   SELECT cron.schedule(
--       'pm-generate-work-orders',
--       '0 6 * * *',
--       'SELECT public.pm_generate_due_work_orders()'
--   );
-- =============================================================================
-- (no-op — cron registration done via Vercel or manual pg_cron setup)
