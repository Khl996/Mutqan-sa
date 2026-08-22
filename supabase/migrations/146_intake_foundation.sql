-- =============================================================================
-- Migration: 146_intake_foundation.sql
-- Feature: Intake — "وارد واتساب" (Phase 1 core)
--
-- Purpose:
--   Foundation for converting external maintenance observations (WhatsApp,
--   form, email, manual) into reviewable draft tasks with human approval
--   before any work order is created. The capture layer is external and
--   swappable; Mutqan only sees one unified payload on POST /api/intake.
--
-- Sections:
--   1. Access helpers (intake_can_view_tenant / intake_can_manage_tenant /
--      intake_can_review_tenant) — mirror the pm_can_* pattern from 103.
--   2. intake_sources   — capture configuration (per-source secret, allowlist,
--      kill switch). NOT readable by clients (secret lives here); all access
--      via RPCs or service_role.
--   3. intake_raw_messages  — raw messages exactly as received (dedup on
--      tenant_id + external_message_id).
--   4. intake_drafts    — AI-classified suggestions pending human review.
--   5. Source management RPCs (admin-gated; secret returned ONCE on
--      create/regenerate, never readable afterwards).
--   6. Review RPCs — approve (reuses public.create_work_order, the existing
--      audited creation authority), reject, merge (comment via
--      create_operation_log), manual draft from ignored/failed messages.
--
-- Constraints honoured:
--   * Strictly additive: new tables, new functions, new policies only.
--     No ALTER on any existing table, no change to existing policies.
--   * tenant_id is always resolved server-side (from the per-source secret in
--     the API layer, or from auth.uid() in review RPCs) — never trusted from
--     a client payload.
--   * Source values are generic ('whatsapp', 'form', 'email', 'manual');
--     the adapter detail (source_adapter) is metadata only and never
--     surfaces in UI.
--
-- Idempotency: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--   DROP POLICY IF EXISTS + CREATE, CREATE INDEX IF NOT EXISTS throughout.
--
-- Naming note: the raw-messages table is intake_raw_messages (not
--   intake_messages) because production already carries legacy
--   intake_messages / intake_reports tables from an earlier out-of-band
--   conversational-intake experiment (with data, policies, and functions:
--   create_intake_report_from_public_token, submit_intake_report). Those
--   objects are intentionally NOT touched, reused, or dropped here.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Access helpers
-- ─────────────────────────────────────────────────────────────────────────────
-- Same shape as pm_can_view_tenant / pm_can_manage_tenant (migration 103):
-- SECURITY DEFINER + SET search_path = public for safe RLS evaluation.
-- Defined intake-locally instead of reusing the pm_* helpers so the intake
-- feature never couples to PM-module refactors.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.intake_can_view_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_platform_admin()
        OR p_tenant_id = public.get_user_tenant_id();
$$;

COMMENT ON FUNCTION public.intake_can_view_tenant(UUID) IS
    'RLS helper: caller may read intake rows of this tenant (own tenant or platform admin). Intake phase 1.';

CREATE OR REPLACE FUNCTION public.intake_can_manage_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role      TEXT;
    v_tenant_id UUID;
    v_is_super  BOOLEAN;
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

COMMENT ON FUNCTION public.intake_can_manage_tenant(UUID) IS
    'RLS/RPC helper: caller may manage intake sources/settings of this tenant. Same role set as pm_can_manage_tenant. Intake phase 1.';

-- Reviewers are anyone allowed to create work orders in the tenant — the
-- approve action feeds public.create_work_order, so the gate matches it.
CREATE OR REPLACE FUNCTION public.intake_can_review_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.can_create_work_orders_scope(p_tenant_id);
$$;

COMMENT ON FUNCTION public.intake_can_review_tenant(UUID) IS
    'RPC gate for draft review actions (approve/reject/merge/manual draft). Matches the work-order creation scope so approving cannot outrun create_work_order. Intake phase 1.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — intake_sources
-- ─────────────────────────────────────────────────────────────────────────────
-- Capture configuration lives in the database, not in code/env, so the
-- number, groups, and kill switch are all manageable from the UI.
-- The per-source shared secret is compared server-side only (API layer with
-- service_role). Clients NEVER read this table directly — no grants, no
-- permissive policies. All UI access goes through the SECTION 5 RPCs, which
-- never return the stored secret.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.intake_sources (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    source_type    TEXT NOT NULL,
    display_name   TEXT NOT NULL,
    phone_number   TEXT,
    allowed_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
    secret         TEXT NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    config         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT intake_sources_source_type_check
        CHECK (source_type IN ('whatsapp_baileys', 'whatsapp_cloud', 'form', 'email')),
    CONSTRAINT intake_sources_secret_unique UNIQUE (secret),
    CONSTRAINT intake_sources_allowed_groups_is_array
        CHECK (jsonb_typeof(allowed_groups) = 'array'),
    CONSTRAINT intake_sources_config_is_object
        CHECK (jsonb_typeof(config) = 'object')
);

COMMENT ON TABLE public.intake_sources IS
    'Intake capture-source configuration (وارد). One row per capture channel
    (WhatsApp number, form, email inbox). secret authenticates the external
    capture service on POST /api/intake and GET /api/intake/config and is
    matched server-side only — clients have no read path to this table.
    is_active = FALSE is the kill switch: intake returns {"status":"paused"}
    and stores nothing; the capture service applies it within one poll cycle.
    Intake phase 1.';

COMMENT ON COLUMN public.intake_sources.allowed_groups IS
    'JSONB array of {jid, name} objects for WhatsApp group allowlisting.
    Enforced by the external capture service (fetched via GET /api/intake/config).';

COMMENT ON COLUMN public.intake_sources.config IS
    'Adapter-specific extras (e.g. official Cloud API credentials for customer
    deployments). Never surfaced in generic UI lists.';

CREATE INDEX IF NOT EXISTS idx_intake_sources_tenant
    ON public.intake_sources (tenant_id);

ALTER TABLE public.intake_sources ENABLE ROW LEVEL SECURITY;

-- Deny-all for client roles: RLS enabled with no permissive policies, and no
-- table grants. service_role bypasses RLS; UI uses SECTION 5 RPCs.
REVOKE ALL ON public.intake_sources FROM PUBLIC;
REVOKE ALL ON public.intake_sources FROM anon;
REVOKE ALL ON public.intake_sources FROM authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — intake_raw_messages
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.intake_raw_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    intake_source_id    UUID REFERENCES public.intake_sources(id) ON DELETE SET NULL,
    source              TEXT NOT NULL,
    source_adapter      TEXT,
    external_message_id TEXT NOT NULL,
    sender_name         TEXT,
    sender_phone        TEXT,
    group_name          TEXT,
    message_text        TEXT NOT NULL,
    media_urls          JSONB NOT NULL DEFAULT '[]'::jsonb,
    message_hash        TEXT,
    status              TEXT NOT NULL DEFAULT 'new',
    failure_reason      TEXT,
    sent_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT intake_raw_messages_source_check
        CHECK (source IN ('whatsapp', 'form', 'email', 'manual')),
    CONSTRAINT intake_raw_messages_status_check
        CHECK (status IN ('new', 'classified', 'ignored', 'converted', 'failed')),
    CONSTRAINT intake_raw_messages_media_urls_is_array
        CHECK (jsonb_typeof(media_urls) = 'array'),
    -- Dedup anchor: capture layers retry/reconnect; the same external message
    -- must land exactly once per tenant. The API upserts against this.
    CONSTRAINT intake_raw_messages_tenant_external_unique
        UNIQUE (tenant_id, external_message_id)
);

COMMENT ON TABLE public.intake_raw_messages IS
    'Raw intake messages exactly as received from a capture layer (WhatsApp /
    form / email / manual). tenant_id is resolved server-side from the
    per-source secret — never from the payload. source_adapter (e.g. the
    concrete WhatsApp transport) is metadata only and never surfaces in UI.
    Intake phase 1.';

COMMENT ON COLUMN public.intake_raw_messages.message_hash IS
    'sha256 of normalized message text. Indexed for future duplicate
    detection; no logic runs on it in v1 (duplicates are handled by the
    manual merge review action).';

CREATE INDEX IF NOT EXISTS idx_intake_raw_messages_tenant_status_created
    ON public.intake_raw_messages (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intake_raw_messages_hash
    ON public.intake_raw_messages (message_hash);

ALTER TABLE public.intake_raw_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intake_raw_messages_select ON public.intake_raw_messages;
CREATE POLICY intake_raw_messages_select ON public.intake_raw_messages
    FOR SELECT TO authenticated
    USING (public.intake_can_view_tenant(tenant_id));

-- Writes: service_role (API ingest/classification) and SECURITY DEFINER
-- review RPCs only. No client INSERT/UPDATE/DELETE.
REVOKE ALL ON public.intake_raw_messages FROM PUBLIC;
REVOKE ALL ON public.intake_raw_messages FROM anon;
REVOKE ALL ON public.intake_raw_messages FROM authenticated;
GRANT SELECT ON public.intake_raw_messages TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — intake_drafts
-- ─────────────────────────────────────────────────────────────────────────────
-- Deliberately simple for v1: no confidence_score, no ai_notes, no
-- duplicate_of_id, no automatic duplicate detection. Duplicates are handled
-- by the reviewer's manual merge action.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.intake_drafts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    intake_message_id     UUID NOT NULL REFERENCES public.intake_raw_messages(id) ON DELETE CASCADE,
    suggested_title       TEXT NOT NULL,
    suggested_description TEXT,
    suggested_location    TEXT,
    suggested_priority    TEXT NOT NULL DEFAULT 'medium',
    suggested_category    TEXT,
    review_status         TEXT NOT NULL DEFAULT 'pending',
    reviewed_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at           TIMESTAMPTZ,
    created_work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT intake_drafts_priority_check
        CHECK (suggested_priority IN ('low', 'medium', 'high', 'urgent')),
    CONSTRAINT intake_drafts_review_status_check
        CHECK (review_status IN ('pending', 'approved', 'rejected', 'merged'))
);

COMMENT ON TABLE public.intake_drafts IS
    'AI-classified draft tasks awaiting human review (وارد واتساب page).
    approve → new work order via public.create_work_order (the existing
    audited authority path); merge → comment on an existing work order via
    create_operation_log; reject → closed with audit fields.
    created_work_order_id links the resulting/merged work order back to the
    original intake message (work_orders itself is not altered).
    Intake phase 1.';

CREATE INDEX IF NOT EXISTS idx_intake_drafts_tenant_status_created
    ON public.intake_drafts (tenant_id, review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intake_drafts_message
    ON public.intake_drafts (intake_message_id);

CREATE INDEX IF NOT EXISTS idx_intake_drafts_created_work_order
    ON public.intake_drafts (created_work_order_id);

ALTER TABLE public.intake_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intake_drafts_select ON public.intake_drafts;
CREATE POLICY intake_drafts_select ON public.intake_drafts
    FOR SELECT TO authenticated
    USING (public.intake_can_view_tenant(tenant_id));

REVOKE ALL ON public.intake_drafts FROM PUBLIC;
REVOKE ALL ON public.intake_drafts FROM anon;
REVOKE ALL ON public.intake_drafts FROM authenticated;
GRANT SELECT ON public.intake_drafts TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — Source management RPCs (إعدادات الوارد)
-- ─────────────────────────────────────────────────────────────────────────────
-- All admin-gated via intake_can_manage_tenant. The stored secret is NEVER
-- returned by list/update; it is returned exactly once by create/regenerate
-- so the admin can copy it into the external capture service.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.intake_list_sources()
RETURNS TABLE (
    id             UUID,
    tenant_id      UUID,
    source_type    TEXT,
    display_name   TEXT,
    phone_number   TEXT,
    allowed_groups JSONB,
    is_active      BOOLEAN,
    config         JSONB,
    created_at     TIMESTAMPTZ,
    updated_at     TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT s.id, s.tenant_id, s.source_type, s.display_name, s.phone_number,
           s.allowed_groups, s.is_active, s.config, s.created_at, s.updated_at
      FROM public.intake_sources s
     WHERE s.tenant_id = public.get_user_tenant_id()
       AND public.intake_can_manage_tenant(s.tenant_id)
     ORDER BY s.created_at ASC;
$$;

COMMENT ON FUNCTION public.intake_list_sources() IS
    'Lists the caller''s tenant intake sources WITHOUT the secret column.
    Manage-gated. Intake phase 1.';

CREATE OR REPLACE FUNCTION public.intake_create_source(
    p_source_type  TEXT,
    p_display_name TEXT,
    p_phone_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID := public.get_user_tenant_id();
    v_secret    TEXT := encode(gen_random_bytes(24), 'hex');
    v_id        UUID;
BEGIN
    IF v_tenant_id IS NULL OR NOT public.intake_can_manage_tenant(v_tenant_id) THEN
        RAISE EXCEPTION 'Insufficient permissions to manage intake sources'
            USING ERRCODE = '42501';
    END IF;

    IF p_source_type NOT IN ('whatsapp_baileys', 'whatsapp_cloud', 'form', 'email') THEN
        RAISE EXCEPTION 'Invalid intake source type: %', p_source_type
            USING ERRCODE = '22023';
    END IF;

    IF NULLIF(BTRIM(p_display_name), '') IS NULL THEN
        RAISE EXCEPTION 'Display name is required' USING ERRCODE = '23502';
    END IF;

    INSERT INTO public.intake_sources (tenant_id, source_type, display_name, phone_number, secret)
    VALUES (v_tenant_id, p_source_type, BTRIM(p_display_name), NULLIF(BTRIM(p_phone_number), ''), v_secret)
    RETURNING id INTO v_id;

    -- The secret is returned exactly once, here. It is not readable afterwards.
    RETURN jsonb_build_object('id', v_id, 'secret', v_secret);
END;
$$;

COMMENT ON FUNCTION public.intake_create_source(TEXT, TEXT, TEXT) IS
    'Creates an intake source for the caller''s tenant and returns {id, secret}.
    The secret is shown once and never readable again. Manage-gated. Intake phase 1.';

CREATE OR REPLACE FUNCTION public.intake_update_source(
    p_source_id      UUID,
    p_display_name   TEXT    DEFAULT NULL,
    p_phone_number   TEXT    DEFAULT NULL,
    p_allowed_groups JSONB   DEFAULT NULL,
    p_is_active      BOOLEAN DEFAULT NULL,
    p_config         JSONB   DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    SELECT s.tenant_id INTO v_tenant_id
      FROM public.intake_sources s
     WHERE s.id = p_source_id;

    IF v_tenant_id IS NULL OR NOT public.intake_can_manage_tenant(v_tenant_id) THEN
        -- Same error for "not found" and "not yours": no existence leakage.
        RAISE EXCEPTION 'Intake source not found or not manageable'
            USING ERRCODE = '42501';
    END IF;

    IF p_allowed_groups IS NOT NULL AND jsonb_typeof(p_allowed_groups) <> 'array' THEN
        RAISE EXCEPTION 'allowed_groups must be a JSON array' USING ERRCODE = '22023';
    END IF;

    IF p_config IS NOT NULL AND jsonb_typeof(p_config) <> 'object' THEN
        RAISE EXCEPTION 'config must be a JSON object' USING ERRCODE = '22023';
    END IF;

    UPDATE public.intake_sources s
       SET display_name   = COALESCE(NULLIF(BTRIM(p_display_name), ''), s.display_name),
           phone_number   = CASE WHEN p_phone_number IS NULL THEN s.phone_number
                                 ELSE NULLIF(BTRIM(p_phone_number), '') END,
           allowed_groups = COALESCE(p_allowed_groups, s.allowed_groups),
           is_active      = COALESCE(p_is_active, s.is_active),
           config         = COALESCE(p_config, s.config),
           updated_at     = NOW()
     WHERE s.id = p_source_id;
END;
$$;

COMMENT ON FUNCTION public.intake_update_source(UUID, TEXT, TEXT, JSONB, BOOLEAN, JSONB) IS
    'Partial update of an intake source (NULL params leave fields unchanged;
    empty-string phone clears it). is_active = FALSE is the kill switch.
    Never touches the secret — use intake_regenerate_source_secret.
    Manage-gated. Intake phase 1.';

CREATE OR REPLACE FUNCTION public.intake_regenerate_source_secret(p_source_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_secret    TEXT := encode(gen_random_bytes(24), 'hex');
BEGIN
    SELECT s.tenant_id INTO v_tenant_id
      FROM public.intake_sources s
     WHERE s.id = p_source_id;

    IF v_tenant_id IS NULL OR NOT public.intake_can_manage_tenant(v_tenant_id) THEN
        RAISE EXCEPTION 'Intake source not found or not manageable'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.intake_sources s
       SET secret = v_secret, updated_at = NOW()
     WHERE s.id = p_source_id;

    RETURN jsonb_build_object('id', p_source_id, 'secret', v_secret);
END;
$$;

COMMENT ON FUNCTION public.intake_regenerate_source_secret(UUID) IS
    'Rotates a source secret and returns it once. The old secret stops working
    immediately — the external capture service must be updated. Manage-gated.
    Intake phase 1.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — Review RPCs (وارد واتساب page actions)
-- ─────────────────────────────────────────────────────────────────────────────

-- اعتماد: approve a pending draft → real work order through the EXISTING
-- audited creation path (public.create_work_order). No parallel insert path.
CREATE OR REPLACE FUNCTION public.intake_approve_draft(
    p_draft_id  UUID,
    p_overrides JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_draft        public.intake_drafts%ROWTYPE;
    v_message      public.intake_raw_messages%ROWTYPE;
    v_actor_tenant UUID := public.get_user_tenant_id();
    v_title        TEXT;
    v_description  TEXT;
    v_priority     TEXT;
    v_location     TEXT;
    v_payload      JSONB;
    v_work_order   public.work_orders%ROWTYPE;
BEGIN
    SELECT * INTO v_draft
      FROM public.intake_drafts
     WHERE id = p_draft_id
       FOR UPDATE;

    IF NOT FOUND OR NOT public.intake_can_review_tenant(v_draft.tenant_id) THEN
        RAISE EXCEPTION 'Draft not found or not reviewable' USING ERRCODE = '42501';
    END IF;

    IF v_draft.review_status <> 'pending' THEN
        RAISE EXCEPTION 'Draft has already been reviewed (status: %)', v_draft.review_status
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_message
      FROM public.intake_raw_messages
     WHERE id = v_draft.intake_message_id
       FOR UPDATE;

    IF p_overrides IS NULL OR jsonb_typeof(p_overrides) <> 'object' THEN
        p_overrides := '{}'::jsonb;
    END IF;

    v_title    := COALESCE(NULLIF(BTRIM(p_overrides->>'title'), ''), v_draft.suggested_title);
    v_priority := COALESCE(NULLIF(BTRIM(p_overrides->>'priority'), ''), v_draft.suggested_priority);
    v_location := COALESCE(NULLIF(BTRIM(p_overrides->>'location'), ''), v_draft.suggested_location);

    -- Compose the description: suggestion + free-text location + original text,
    -- so the technician always sees the reporter's exact words.
    v_description := COALESCE(NULLIF(BTRIM(p_overrides->>'description'), ''), v_draft.suggested_description, '');
    IF v_location IS NOT NULL THEN
        v_description := v_description || E'\n\nالموقع (كما ورد): ' || v_location;
    END IF;
    IF v_message.message_text IS NOT NULL THEN
        v_description := v_description || E'\n\n— النص الأصلي —\n' || v_message.message_text;
    END IF;

    v_payload := jsonb_build_object(
        'title',          v_title,
        'description',    v_description,
        'priority',       v_priority,
        'issue_type',     v_draft.suggested_category,
        'reporter_name',  v_message.sender_name,
        'reporter_phone', v_message.sender_phone
    );
    -- Strip NULL-valued keys so only meaningful fields cross the allowed-keys
    -- gate inside create_work_order.
    v_payload := jsonb_strip_nulls(v_payload);

    -- Existing audited authority path: validates actor, tenant, entitlement,
    -- scope, inserts, and writes the create operation log.
    v_work_order := public.create_work_order(
        v_payload,
        CASE WHEN v_actor_tenant = v_draft.tenant_id THEN NULL ELSE v_draft.tenant_id END
    );

    UPDATE public.intake_drafts
       SET review_status         = 'approved',
           reviewed_by           = auth.uid(),
           reviewed_at           = NOW(),
           created_work_order_id = v_work_order.id
     WHERE id = p_draft_id;

    UPDATE public.intake_raw_messages
       SET status = 'converted'
     WHERE id = v_draft.intake_message_id;

    PERFORM public.create_operation_log(
        v_draft.tenant_id,
        v_work_order.id,
        'comment',
        'أُنشئ أمر العمل من الوارد (' ||
            CASE v_message.source WHEN 'whatsapp' THEN 'واتساب' ELSE v_message.source END ||
            ') — المرسل: ' || COALESCE(v_message.sender_name, 'غير معروف'),
        auth.uid()
    );

    RETURN jsonb_build_object(
        'work_order_id', v_work_order.id,
        'code',          v_work_order.code
    );
END;
$$;

COMMENT ON FUNCTION public.intake_approve_draft(UUID, JSONB) IS
    'اعتماد: converts a pending intake draft into a work order via the existing
    public.create_work_order authority path (no parallel creation logic).
    Optional overrides: {title, description, priority, location}. Sets draft
    approved + created_work_order_id and message converted. Intake phase 1.';

-- تجاهل: reject a pending draft.
CREATE OR REPLACE FUNCTION public.intake_reject_draft(p_draft_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_draft public.intake_drafts%ROWTYPE;
BEGIN
    SELECT * INTO v_draft
      FROM public.intake_drafts
     WHERE id = p_draft_id
       FOR UPDATE;

    IF NOT FOUND OR NOT public.intake_can_review_tenant(v_draft.tenant_id) THEN
        RAISE EXCEPTION 'Draft not found or not reviewable' USING ERRCODE = '42501';
    END IF;

    IF v_draft.review_status <> 'pending' THEN
        RAISE EXCEPTION 'Draft has already been reviewed (status: %)', v_draft.review_status
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.intake_drafts
       SET review_status = 'rejected',
           reviewed_by   = auth.uid(),
           reviewed_at   = NOW()
     WHERE id = p_draft_id;

    UPDATE public.intake_raw_messages
       SET status = 'ignored'
     WHERE id = v_draft.intake_message_id;
END;
$$;

COMMENT ON FUNCTION public.intake_reject_draft(UUID) IS
    'تجاهل: rejects a pending intake draft and marks its message ignored
    (recoverable later via intake_create_manual_draft). Intake phase 1.';

-- دمج: merge a pending draft into an existing open work order. The message
-- text is appended to that work order using the existing comments mechanism
-- (operation_logs, type=comment).
CREATE OR REPLACE FUNCTION public.intake_merge_draft(
    p_draft_id      UUID,
    p_work_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_draft   public.intake_drafts%ROWTYPE;
    v_message public.intake_raw_messages%ROWTYPE;
    v_wo_status TEXT;
BEGIN
    SELECT * INTO v_draft
      FROM public.intake_drafts
     WHERE id = p_draft_id
       FOR UPDATE;

    IF NOT FOUND OR NOT public.intake_can_review_tenant(v_draft.tenant_id) THEN
        RAISE EXCEPTION 'Draft not found or not reviewable' USING ERRCODE = '42501';
    END IF;

    IF v_draft.review_status <> 'pending' THEN
        RAISE EXCEPTION 'Draft has already been reviewed (status: %)', v_draft.review_status
            USING ERRCODE = '22023';
    END IF;

    -- Target must be an open work order of the SAME tenant.
    SELECT wo.status INTO v_wo_status
      FROM public.work_orders wo
     WHERE wo.id = p_work_order_id
       AND wo.tenant_id = v_draft.tenant_id;

    IF v_wo_status IS NULL THEN
        RAISE EXCEPTION 'Work order not found for this tenant' USING ERRCODE = '42501';
    END IF;

    IF v_wo_status IN ('completed', 'cancelled', 'archived', 'rejected') THEN
        RAISE EXCEPTION 'Cannot merge into a closed work order (status: %)', v_wo_status
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_message
      FROM public.intake_raw_messages
     WHERE id = v_draft.intake_message_id;

    PERFORM public.create_operation_log(
        v_draft.tenant_id,
        p_work_order_id,
        'comment',
        'بلاغ وارد مدموج (' ||
            CASE v_message.source WHEN 'whatsapp' THEN 'واتساب' ELSE v_message.source END ||
            ') من ' || COALESCE(v_message.sender_name, 'غير معروف') || ': ' ||
            COALESCE(v_message.message_text, ''),
        auth.uid()
    );

    UPDATE public.intake_drafts
       SET review_status         = 'merged',
           reviewed_by           = auth.uid(),
           reviewed_at           = NOW(),
           created_work_order_id = p_work_order_id
     WHERE id = p_draft_id;

    UPDATE public.intake_raw_messages
       SET status = 'converted'
     WHERE id = v_draft.intake_message_id;
END;
$$;

COMMENT ON FUNCTION public.intake_merge_draft(UUID, UUID) IS
    'دمج: merges a pending intake draft into an existing open work order of the
    same tenant. Appends the original message as an operation-log comment
    (existing mechanism), sets draft merged + created_work_order_id, message
    converted. Intake phase 1.';

-- Recovery path: turn an ignored/failed message into a reviewable draft
-- (misclassified chatter, or classification failures).
CREATE OR REPLACE FUNCTION public.intake_create_manual_draft(p_message_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_message  public.intake_raw_messages%ROWTYPE;
    v_draft_id UUID;
BEGIN
    SELECT * INTO v_message
      FROM public.intake_raw_messages
     WHERE id = p_message_id
       FOR UPDATE;

    IF NOT FOUND OR NOT public.intake_can_review_tenant(v_message.tenant_id) THEN
        RAISE EXCEPTION 'Message not found or not reviewable' USING ERRCODE = '42501';
    END IF;

    IF v_message.status NOT IN ('ignored', 'failed', 'new') THEN
        RAISE EXCEPTION 'Message is not recoverable (status: %)', v_message.status
            USING ERRCODE = '22023';
    END IF;

    -- Guard against double recovery: one pending draft per message.
    IF EXISTS (
        SELECT 1 FROM public.intake_drafts d
         WHERE d.intake_message_id = p_message_id
           AND d.review_status = 'pending'
    ) THEN
        RAISE EXCEPTION 'Message already has a pending draft' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.intake_drafts (
        tenant_id,
        intake_message_id,
        suggested_title,
        suggested_description,
        suggested_priority
    ) VALUES (
        v_message.tenant_id,
        p_message_id,
        COALESCE(NULLIF(substring(BTRIM(v_message.message_text) from 1 for 60), ''), 'بلاغ وارد'),
        v_message.message_text,
        'medium'
    )
    RETURNING id INTO v_draft_id;

    UPDATE public.intake_raw_messages
       SET status = 'classified'
     WHERE id = p_message_id;

    RETURN v_draft_id;
END;
$$;

COMMENT ON FUNCTION public.intake_create_manual_draft(UUID) IS
    'Recovers an ignored/failed intake message into a pending draft prefilled
    from the raw text (reviewer edits on approve). Intake phase 1.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7 — Function grants
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.intake_can_view_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_can_manage_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_can_review_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_list_sources() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_create_source(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_update_source(UUID, TEXT, TEXT, JSONB, BOOLEAN, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_regenerate_source_secret(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_approve_draft(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_reject_draft(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_merge_draft(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intake_create_manual_draft(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.intake_can_view_tenant(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.intake_can_manage_tenant(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.intake_can_review_tenant(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.intake_list_sources() FROM anon;
REVOKE ALL ON FUNCTION public.intake_create_source(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.intake_update_source(UUID, TEXT, TEXT, JSONB, BOOLEAN, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.intake_regenerate_source_secret(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.intake_approve_draft(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.intake_reject_draft(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.intake_merge_draft(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.intake_create_manual_draft(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.intake_can_view_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_can_manage_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_can_review_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_list_sources() TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_create_source(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_update_source(UUID, TEXT, TEXT, JSONB, BOOLEAN, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_regenerate_source_secret(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_approve_draft(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_reject_draft(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_merge_draft(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_create_manual_draft(UUID) TO authenticated;
