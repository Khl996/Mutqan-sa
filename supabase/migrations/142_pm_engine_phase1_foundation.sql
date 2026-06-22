-- =============================================================================
-- Migration: 142_pm_engine_phase1_foundation
-- Purpose:
--   PM Engine Phase 1 — schema foundation only (no generator changes yet).
--   Reviewed and revised per Khalid's feedback on the first draft. This
--   migration is additive-only: no existing column is dropped, renamed, or
--   retyped, so it is reversible by dropping the new objects it creates.
--
-- Scope: schema for Invariants 1, 2, 4, 5 (partial), 6. The generator rewrite
--   (anchor-aware advancement, blackout-aware skip, Master PM propagation RPC,
--   pure-read Forecast RPC) is a SEPARATE migration, written only after this
--   one is approved and applied to the demo tenant.
--
-- Decisions baked into this version (see review thread, do not relitigate
-- without going back to Khalid):
--   1. contract_id is a plain UUID with NO foreign key. public.contracts does
--      not exist yet (confirmed: no CREATE TABLE for it anywhere in
--      supabase/migrations/). The FK is added in Phase 3 when contracts ships.
--   2. Idempotency unique indexes do NOT exclude cancelled work orders. A
--      generated (schedule, due_date[, asset]) slot is consumed permanently,
--      even if the resulting WO is later cancelled. Redoing a cancelled cycle
--      is a manual WO, never an automatic regeneration by this generator.
--   3. Master PM propagation touches pm_schedules.frequency_* / anchor_mode
--      only, never work_orders. A schedule linked to a master is read-only on
--      those three columns from the schedule-editor side — enforced here by
--      trigger, not left as a convention. To customize one schedule, unlink
--      it from the master first.
--   4. Blackout windows: v1 behavior is 'skip' only (CHECK constraint allows
--      only 'skip' — 'reduce_frequency' is intentionally NOT in the allowed
--      list yet, so it cannot be selected and then silently do nothing, the
--      same trap meter_field/meter_threshold fell into pre-Phase-1).
--      'skip' means: a due_date landing inside a window is deferred to the
--      first day after end_date — exactly one WO generates after the window,
--      never zero, never multiples. (Enforced in the generator migration,
--      not here — this migration only adds the table + constraint.)
--   5. Blackout dates are Gregorian ranges, not Hijri-computed. Ramadan/Eid
--      shift ~11 days/year on the Gregorian calendar, so platform-wide
--      windows must be reseeded yearly. Seed data is NOT in this migration —
--      it lives in a separate, yearly-maintained migration
--      (143_seed_blackout_windows.sql) so reference-data updates never need
--      to touch this structural file. v1 seeds Eid windows only (full-stop
--      'skip' is correct for a 3-4 day holiday); Ramadan is intentionally
--      NOT seeded as 'skip' — deferring a month of PM is an SLA risk, and
--      the correct behavior for Ramadan is 'reduce_frequency', which is not
--      yet buildable (see decision 4).
-- =============================================================================


-- =============================================================================
-- SECTION 1 — anchor_mode (Invariant 2)
-- =============================================================================

ALTER TABLE public.pm_schedules
    ADD COLUMN IF NOT EXISTS anchor_mode VARCHAR(10) NOT NULL DEFAULT 'fixed';

ALTER TABLE public.pm_schedules
    DROP CONSTRAINT IF EXISTS pm_schedules_anchor_mode_check;

ALTER TABLE public.pm_schedules
    ADD CONSTRAINT pm_schedules_anchor_mode_check
    CHECK (anchor_mode IN ('fixed', 'floating'));

COMMENT ON COLUMN public.pm_schedules.anchor_mode IS
    'fixed: next_due = prior_due + interval, advances on date regardless of '
    'completion/cancellation. floating: next_due = completion_date + interval '
    'on completion; on cancellation (no completion), falls back to '
    'cancelled_due_date + interval so the schedule never freezes. '
    'Advancement logic lives in pm_generate_due_work_orders() / wo_complete(), '
    'not in this column''s definition.';


-- =============================================================================
-- SECTION 2 — DB-level idempotent generation (Invariant 1)
--
-- Two partial unique indexes because there are genuinely two generation
-- modes that key differently:
--   batch_route : one WO per (schedule, due_date), asset is NULL on the slot
--   per_asset   : one WO per (schedule, due_date, asset)
--
-- Neither index filters out 'cancelled' — see decision 2 above. The slot is
-- consumed the moment a WO is created for it, full stop.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_pm_wo_cycle_batch
    ON public.work_orders (source_schedule_id, scheduled_date)
    WHERE work_type = 'preventive'
      AND source_schedule_asset_id IS NULL
      AND source_schedule_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pm_wo_cycle_per_asset
    ON public.work_orders (source_schedule_id, scheduled_date, asset_id)
    WHERE work_type = 'preventive'
      AND source_schedule_asset_id IS NOT NULL
      AND source_schedule_id IS NOT NULL;

COMMENT ON INDEX public.uq_pm_wo_cycle_batch IS
    'Invariant 1: DB-level idempotency for batch_route PM generation. The '
    'generator must INSERT ... ON CONFLICT DO NOTHING against this index '
    'instead of relying on an app-level IF EXISTS check.';

COMMENT ON INDEX public.uq_pm_wo_cycle_per_asset IS
    'Invariant 1: DB-level idempotency for per_asset PM generation.';


-- =============================================================================
-- SECTION 3 — contract_id forward-compat hook (Phase 3 prep, no FK yet)
-- =============================================================================

ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS contract_id UUID;

COMMENT ON COLUMN public.work_orders.contract_id IS
    'Forward-compat hook for Phase 3 contract linkage. No FK yet: '
    'public.contracts does not exist as of migration 142. Add the FK '
    'constraint in the Phase 3 migration that creates that table.';


-- =============================================================================
-- SECTION 4 — pm_meter_readings (Invariant 6, IoT-ready from day one)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pm_meter_readings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    asset_id    UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES public.pm_schedules(id) ON DELETE SET NULL,
    meter_field VARCHAR(100) NOT NULL,
    value       NUMERIC NOT NULL,
    source      VARCHAR(20) NOT NULL DEFAULT 'manual',
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pm_meter_readings_source_check CHECK (source IN ('manual', 'iot', 'bms'))
);

COMMENT ON TABLE public.pm_meter_readings IS
    'Meter readings for meter-triggered PM. v1 only writes source=manual '
    'rows (via the frontend); source=iot/bms are allowed by the schema so a '
    'later phase can wire a feed without redesigning this table.';

CREATE INDEX IF NOT EXISTS idx_pm_meter_readings_asset_field_recorded
    ON public.pm_meter_readings (asset_id, meter_field, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_pm_meter_readings_tenant
    ON public.pm_meter_readings (tenant_id);

ALTER TABLE public.pm_meter_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_meter_readings_select ON public.pm_meter_readings;
CREATE POLICY pm_meter_readings_select ON public.pm_meter_readings
    FOR SELECT TO authenticated
    USING (public.pm_can_view_tenant(tenant_id));

DROP POLICY IF EXISTS pm_meter_readings_manage ON public.pm_meter_readings;
CREATE POLICY pm_meter_readings_manage ON public.pm_meter_readings
    FOR ALL TO authenticated
    USING (public.pm_can_manage_tenant(tenant_id))
    WITH CHECK (public.pm_can_manage_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_meter_readings TO authenticated;


-- =============================================================================
-- SECTION 5 — pm_master_templates + lock semantics (Invariant 4)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pm_master_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    job_plan_id         UUID NOT NULL REFERENCES public.job_plans(id) ON DELETE RESTRICT,
    name                VARCHAR(255) NOT NULL,
    name_ar             VARCHAR(255),
    frequency_type      VARCHAR(20),
    frequency_interval  INTEGER NOT NULL DEFAULT 1,
    anchor_mode         VARCHAR(10) NOT NULL DEFAULT 'fixed',
    created_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pm_master_templates_anchor_mode_check CHECK (anchor_mode IN ('fixed', 'floating'))
);

COMMENT ON TABLE public.pm_master_templates IS
    'Type-level PM definition. Editing a master pushes frequency_type / '
    'frequency_interval / anchor_mode forward to every linked pm_schedules '
    'row (WHERE master_template_id = this.id) — schedules only, never '
    'work_orders, and never touches already-generated WOs regardless of '
    'their status. Propagation RPC ships in the generator migration; this '
    'migration only adds the table, the link column, and the lock trigger.';

ALTER TABLE public.pm_schedules
    ADD COLUMN IF NOT EXISTS master_template_id UUID REFERENCES public.pm_master_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pm_schedules_master_template
    ON public.pm_schedules (master_template_id);

ALTER TABLE public.pm_master_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_master_templates_select ON public.pm_master_templates;
CREATE POLICY pm_master_templates_select ON public.pm_master_templates
    FOR SELECT TO authenticated
    USING (public.pm_can_view_tenant(tenant_id));

DROP POLICY IF EXISTS pm_master_templates_manage ON public.pm_master_templates;
CREATE POLICY pm_master_templates_manage ON public.pm_master_templates
    FOR ALL TO authenticated
    USING (public.pm_can_manage_tenant(tenant_id))
    WITH CHECK (public.pm_can_manage_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_master_templates TO authenticated;

-- Lock semantics: a schedule linked to a master cannot have its
-- frequency_type / frequency_interval / anchor_mode changed directly. Only
-- the (not-yet-written) propagation RPC may change them, by setting the
-- bypass flag below before its UPDATE — same pattern as
-- app.work_order_workflow_authorized from migration 120.
CREATE OR REPLACE FUNCTION public.pm_schedules_master_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.master_template_id IS NOT NULL
       AND (
           NEW.frequency_type IS DISTINCT FROM OLD.frequency_type
           OR NEW.frequency_interval IS DISTINCT FROM OLD.frequency_interval
           OR NEW.anchor_mode IS DISTINCT FROM OLD.anchor_mode
       )
       AND COALESCE(current_setting('app.master_pm_propagation_authorized', TRUE), 'false') <> 'true'
    THEN
        RAISE EXCEPTION
            'This schedule is linked to a Master PM template; frequency_type, '
            'frequency_interval, and anchor_mode are controlled by the master. '
            'Unlink master_template_id first to customize this schedule.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_schedules_master_lock ON public.pm_schedules;
CREATE TRIGGER trg_pm_schedules_master_lock
    BEFORE UPDATE ON public.pm_schedules
    FOR EACH ROW
    EXECUTE FUNCTION public.pm_schedules_master_lock();


-- =============================================================================
-- SECTION 6 — pm_blackout_windows (Invariant 5, partial — table + constraint
-- only; the generator's defer-after-window behavior is the next migration)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pm_blackout_windows (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,  -- NULL = platform-wide (Ramadan/Eid)
    label       VARCHAR(100) NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    behavior    VARCHAR(20) NOT NULL DEFAULT 'skip',
    created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pm_blackout_windows_behavior_check CHECK (behavior IN ('skip')),
    CONSTRAINT pm_blackout_windows_date_order_check CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.pm_blackout_windows IS
    'PM generation blackout calendar. tenant_id IS NULL rows are platform-wide '
    'defaults (v1: Eid al-Fitr, Eid al-Adha — see 143_seed_blackout_windows.sql). '
    'v1 behavior is skip only: a due_date inside [start_date, end_date] defers '
    'to the first day after end_date, generating exactly one WO after the '
    'window — never zero, never duplicated. reduce_frequency is deliberately '
    'NOT in the allowed values yet; it will be added with a real parameter '
    'when actually built (Ramadan needs this, not skip — a full month of '
    'deferred PM is an SLA risk, so Ramadan is not seeded in v1 at all). '
    'Dates are Gregorian and shift ~11 days/year against the Hijri calendar — '
    'platform-wide rows must be reseeded yearly via a dedicated seed '
    'migration, never edited in place here.';

CREATE INDEX IF NOT EXISTS idx_pm_blackout_windows_tenant_dates
    ON public.pm_blackout_windows (tenant_id, start_date, end_date);

ALTER TABLE public.pm_blackout_windows ENABLE ROW LEVEL SECURITY;

-- SELECT: own tenant's windows + platform-wide defaults are visible to everyone.
DROP POLICY IF EXISTS pm_blackout_windows_select ON public.pm_blackout_windows;
CREATE POLICY pm_blackout_windows_select ON public.pm_blackout_windows
    FOR SELECT TO authenticated
    USING (
        tenant_id IS NULL
        OR public.pm_can_view_tenant(tenant_id)
    );

-- Writes to tenant-scoped rows: tenant managers, same pm_can_manage_tenant rule.
DROP POLICY IF EXISTS pm_blackout_windows_manage_tenant ON public.pm_blackout_windows;
CREATE POLICY pm_blackout_windows_manage_tenant ON public.pm_blackout_windows
    FOR ALL TO authenticated
    USING (tenant_id IS NOT NULL AND public.pm_can_manage_tenant(tenant_id))
    WITH CHECK (tenant_id IS NOT NULL AND public.pm_can_manage_tenant(tenant_id));

-- Writes to platform-wide rows (tenant_id IS NULL): platform admin only.
DROP POLICY IF EXISTS pm_blackout_windows_manage_platform ON public.pm_blackout_windows;
CREATE POLICY pm_blackout_windows_manage_platform ON public.pm_blackout_windows
    FOR ALL TO authenticated
    USING (tenant_id IS NULL AND public.is_platform_admin())
    WITH CHECK (tenant_id IS NULL AND public.is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_blackout_windows TO authenticated;

-- No seed data in this migration. Platform-wide blackout rows (Eid, etc.)
-- are seeded by 143_seed_blackout_windows.sql, a separate yearly-maintained
-- file, so reference-data updates never require touching this schema
-- migration.
