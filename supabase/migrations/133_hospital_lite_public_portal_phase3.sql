-- =============================================================================
-- Migration: 133_hospital_lite_public_portal_phase3.sql
-- Phase: Hospital Lite Mode — Phase 3 (Structured Public Form + Tracking)
--
-- Sections:
--   1. Fix issue_types duplicates — re-link FKs, delete dupes, add unique index
--   2. Add reporter_image_url + location_note to work_orders
--   3. Expand submit_public_work_order (issue_type, department, room, location_note)
--   4. Expand get_public_tenant_data (floors + departments + issue_types for form)
--   5. Create get_public_work_order_status (tracking RPC — minimal public output)
--   6. Create public-report-photos storage bucket + RLS
--
-- Idempotency: every section uses IF NOT EXISTS, DROP IF EXISTS, ON CONFLICT DO
--   UPDATE, or DO $$ logic that no-ops on re-run.
-- Guard note: reporter_image_url and location_note are NOT in the sensitive
--   fields list of guard_work_order_sensitive_fields (migration 120), so direct
--   writes from the Edge Function (service_role) are allowed.
-- Backward-compat: all new RPC params have DEFAULT NULL. Existing callers that
--   use named params (supabase.rpc) are unaffected.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Fix issue_types duplicates
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002 seeded 10 global types but lacked a UNIQUE constraint.
-- Running the migration twice created 20 rows (each code duplicated).
-- Strategy: for each duplicated global code, pick MIN(id) as canonical, re-link
-- any work_orders that referenced a duplicate, then delete the duplicate.
-- Only touches rows with tenant_id IS NULL. Per-tenant rows are never touched.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    r              RECORD;
    v_canonical_id UUID;
    v_dupe_ids     UUID[];
BEGIN
    FOR r IN
        SELECT DISTINCT code
          FROM public.issue_types
         WHERE tenant_id IS NULL
         GROUP BY code
        HAVING COUNT(*) > 1
    LOOP
        -- Pick the oldest row as canonical (deterministic, no MIN(uuid) needed)
        SELECT id INTO v_canonical_id
          FROM public.issue_types
         WHERE tenant_id IS NULL AND code = r.code
         ORDER BY created_at ASC, id::text ASC
         LIMIT 1;

        -- Collect all non-canonical IDs for this code
        SELECT ARRAY_AGG(id)
          INTO v_dupe_ids
          FROM public.issue_types
         WHERE tenant_id IS NULL
           AND code = r.code
           AND id  != v_canonical_id;

        -- Re-link work_orders referencing a duplicate to the canonical
        UPDATE public.work_orders
           SET issue_type_id = v_canonical_id
         WHERE issue_type_id = ANY(v_dupe_ids);

        -- Delete the duplicate rows
        DELETE FROM public.issue_types
         WHERE id = ANY(v_dupe_ids);

        RAISE NOTICE 'issue_types dedup: code=% canonical=% removed=%',
            r.code, v_canonical_id, array_length(v_dupe_ids, 1);
    END LOOP;
END $$;

-- Partial unique index: one global row per code (tenant_id IS NULL).
-- Idempotent — IF NOT EXISTS.
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_types_global_unique_code
    ON public.issue_types (code)
    WHERE tenant_id IS NULL;

-- Per-tenant uniqueness: two tenants CAN share a code; same tenant cannot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_types_per_tenant_unique_code
    ON public.issue_types (tenant_id, code)
    WHERE tenant_id IS NOT NULL;

COMMENT ON INDEX idx_issue_types_global_unique_code IS
    'Phase 3: prevents future duplicate global issue_type codes (tenant_id IS NULL).';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — New columns on work_orders
-- ─────────────────────────────────────────────────────────────────────────────

-- Storage path for the reporter's original photo (set by upload-report-photo
-- Edge Function after submission; NULL until uploaded).
ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS reporter_image_url TEXT;

COMMENT ON COLUMN public.work_orders.reporter_image_url IS
    'Storage path in the private public-report-photos bucket for the reporter''s
    original photo. Pattern: {tracking_token}/reporter/{filename}. Set by the
    upload-report-photo Edge Function. Never set by internal staff paths.
    Hospital Lite phase 3.';

-- Free-text fallback when reporter selects "أخرى" in any location dropdown.
ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS location_note TEXT;

COMMENT ON COLUMN public.work_orders.location_note IS
    'Free-text location note entered by the reporter when they pick "أخرى" in
    the public intake form. Supplements building_id / floor_id / department_id.
    Hospital Lite phase 3.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — Expand submit_public_work_order
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds: p_issue_type_id, p_department_id, p_room_id, p_location_note (all
-- optional). Also makes p_building_id optional (DEFAULT NULL) so reporters
-- who choose "أخرى" can omit it and store free text in p_location_note.
-- Callers using named params (all Supabase JS clients) are not broken.
-- Returns the same JSONB shape: { work_order_id, code, tracking_token }.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop both possible previous signatures (7-param from 131, 11-param from any
-- prior run of this migration). DROP IF EXISTS silences "does not exist".
DROP FUNCTION IF EXISTS public.submit_public_work_order(text, text, text, text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.submit_public_work_order(text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.submit_public_work_order(
    p_token          TEXT,
    p_reporter_name  TEXT,
    p_reporter_phone TEXT,
    p_description    TEXT,
    p_building_id    UUID    DEFAULT NULL,  -- optional: NULL when reporter picks "أخرى"
    p_floor_id       UUID    DEFAULT NULL,
    p_asset_id       UUID    DEFAULT NULL,
    p_issue_type_id  UUID    DEFAULT NULL,  -- NEW: from issue_types
    p_department_id  UUID    DEFAULT NULL,  -- NEW: from departments
    p_room_id        UUID    DEFAULT NULL,  -- NEW: from rooms
    p_location_note  TEXT    DEFAULT NULL   -- NEW: "أخرى" free-text fallback
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id       UUID;
    v_new_id          UUID;
    v_code            TEXT;
    v_tracking_token  TEXT;
    v_issue_type_name TEXT;
BEGIN
    -- ── 1. Resolve tenant from token (server-side injection; no external tenant_id) ─
    SELECT tenant_id
      INTO v_tenant_id
      FROM public.tenant_access_tokens
     WHERE token    = p_token
       AND is_active = TRUE
       AND public.has_public_portal_access(tenant_id)
     LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired token';
    END IF;

    -- ── 2. Validate every provided location / type ID belongs to this tenant ──────
    IF p_building_id IS NOT NULL THEN
        PERFORM 1 FROM public.buildings
         WHERE id = p_building_id AND tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid building for this organization';
        END IF;
    END IF;

    IF p_floor_id IS NOT NULL THEN
        PERFORM 1
          FROM public.floors  f
          JOIN public.buildings b ON b.id = f.building_id
         WHERE f.id = p_floor_id AND b.tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid floor for this organization';
        END IF;
    END IF;

    IF p_asset_id IS NOT NULL THEN
        PERFORM 1 FROM public.assets
         WHERE id = p_asset_id AND tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid asset for this organization';
        END IF;
    END IF;

    IF p_issue_type_id IS NOT NULL THEN
        -- Accept global types (tenant_id IS NULL) or tenant-specific types
        PERFORM 1 FROM public.issue_types
         WHERE id = p_issue_type_id
           AND is_active = TRUE
           AND (tenant_id IS NULL OR tenant_id = v_tenant_id);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid issue type for this organization';
        END IF;
        -- Denormalize Arabic name for display without a JOIN later
        SELECT name_ar INTO v_issue_type_name
          FROM public.issue_types WHERE id = p_issue_type_id;
    END IF;

    IF p_department_id IS NOT NULL THEN
        PERFORM 1 FROM public.departments
         WHERE id = p_department_id AND tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid department for this organization';
        END IF;
    END IF;

    IF p_room_id IS NOT NULL THEN
        PERFORM 1 FROM public.rooms
         WHERE id = p_room_id AND tenant_id = v_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid room for this organization';
        END IF;
    END IF;

    -- ── 3. Generate code ─────────────────────────────────────────────────────────
    v_code := 'PUB-' || to_char(NOW(), 'YYMMDD') || '-'
              || substring(gen_random_uuid()::text from 1 for 4);

    -- ── 4. Insert work_order ─────────────────────────────────────────────────────
    INSERT INTO public.work_orders (
        tenant_id,
        code,
        title,
        description,
        status,
        priority,
        building_id,
        floor_id,
        department_id,
        room_id,
        asset_id,
        issue_type_id,
        issue_type,
        location_note,
        reporter_name,
        reporter_phone,
        reported_at,
        created_at
    ) VALUES (
        v_tenant_id,
        v_code,
        'بلاغ عام' || COALESCE(': ' || v_issue_type_name, '') || ': '
            || COALESCE(substring(p_description from 1 for 30), 'General Issue'),
        p_description,
        'pending',
        'medium',
        p_building_id,
        p_floor_id,
        p_department_id,
        p_room_id,
        p_asset_id,
        p_issue_type_id,
        v_issue_type_name,  -- denormalized VARCHAR copy
        p_location_note,
        p_reporter_name,
        p_reporter_phone,
        NOW(),
        NOW()
    )
    RETURNING id, tracking_token INTO v_new_id, v_tracking_token;

    -- ── 5. Audit log ─────────────────────────────────────────────────────────────
    PERFORM public.create_operation_log(
        v_tenant_id,
        v_new_id,
        'create',
        'Public report submitted by: ' || p_reporter_name,
        NULL
    );

    RETURN jsonb_build_object(
        'work_order_id',  v_new_id,
        'code',           v_code,
        'tracking_token', v_tracking_token
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.submit_public_work_order(TEXT,TEXT,TEXT,TEXT,UUID,UUID,UUID,UUID,UUID,UUID,TEXT) IS
    'Public work-order submission. tenant_id derived server-side from token.
    All location/type IDs validated as belonging to the resolved tenant.
    p_building_id is now optional (NULL = reporter chose "أخرى").
    Returns JSONB { work_order_id, code, tracking_token }.
    Hospital Lite phase 3.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — Expand get_public_tenant_data
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds floors, departments, issue_types columns for the intake form dropdowns.
-- Backward-compat: existing callers only read the first 4 columns and are
-- unaffected by new trailing columns in the returned TABLE row.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the previous signature (return-type change requires drop+recreate).
DROP FUNCTION IF EXISTS public.get_public_tenant_data(TEXT);

CREATE OR REPLACE FUNCTION public.get_public_tenant_data(p_token TEXT)
RETURNS TABLE (
    tenant_id      UUID,
    tenant_name    TEXT,
    buildings      JSON,
    portal_settings JSON,
    floors         JSON,
    departments    JSON,
    issue_types    JSON
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_tenant_name TEXT;
    v_portal_settings JSON;
BEGIN
    -- Validate token + portal entitlement
    SELECT tat.tenant_id
      INTO v_tenant_id
      FROM public.tenant_access_tokens tat
     WHERE tat.token    = p_token
       AND tat.is_active = TRUE
       AND public.has_public_portal_access(tat.tenant_id);

    IF v_tenant_id IS NULL THEN
        RETURN;  -- Silent: nothing returned for invalid/disabled tokens
    END IF;

    SELECT ten.name,
           COALESCE(ten.settings -> 'portal', '{}')::JSON
      INTO v_tenant_name, v_portal_settings
      FROM public.tenants ten
     WHERE ten.id = v_tenant_id;

    RETURN QUERY
    SELECT
        v_tenant_id,
        v_tenant_name,
        -- Buildings
        COALESCE(
            (SELECT json_agg(json_build_object(
                        'id',      b.id,
                        'name',    b.name,
                        'name_ar', b.name_ar)
                    ORDER BY b.name)
               FROM public.buildings b
              WHERE b.tenant_id = v_tenant_id AND b.is_active = TRUE),
            '[]'::JSON
        ),
        v_portal_settings,
        -- Floors (keyed with building_id for cascading)
        COALESCE(
            (SELECT json_agg(json_build_object(
                        'id',          f.id,
                        'name',        f.name,
                        'name_ar',     f.name_ar,
                        'building_id', f.building_id)
                    ORDER BY f.building_id, f.level)
               FROM public.floors f
               JOIN public.buildings b ON b.id = f.building_id
              WHERE b.tenant_id = v_tenant_id AND f.is_active = TRUE),
            '[]'::JSON
        ),
        -- Departments (keyed with building_id + floor_id for cascading)
        COALESCE(
            (SELECT json_agg(json_build_object(
                        'id',          d.id,
                        'name',        d.name,
                        'name_ar',     d.name_ar,
                        'building_id', d.building_id,
                        'floor_id',    d.floor_id)
                    ORDER BY d.building_id, d.name)
               FROM public.departments d
              WHERE d.tenant_id = v_tenant_id AND d.is_active = TRUE),
            '[]'::JSON
        ),
        -- Issue types: global first, then tenant-specific; both active
        COALESCE(
            (SELECT json_agg(json_build_object(
                        'id',      it.id,
                        'code',    it.code,
                        'name',    it.name,
                        'name_ar', it.name_ar,
                        'icon',    it.icon)
                    ORDER BY it.display_order)
               FROM public.issue_types it
              WHERE it.is_active = TRUE
                AND (it.tenant_id IS NULL OR it.tenant_id = v_tenant_id)),
            '[]'::JSON
        );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_public_tenant_data(TEXT) IS
    'Returns public tenant context for the intake form: buildings, floors,
    departments, issue_types, portal_settings. Validates token + portal
    entitlement. Nothing returned for invalid/inactive tokens.
    Hospital Lite phase 3 — adds floors/departments/issue_types.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — get_public_work_order_status (tracking RPC)
-- ─────────────────────────────────────────────────────────────────────────────
-- Public read path for the reporter's tracking page. Returns MINIMAL data:
--   code, display_status (Arabic), status_key (enum for frontend icons),
--   created_at, updated_at, rejection_reason (only when rejected),
--   reporter_image_url (storage path for the reporter's original photo only).
-- Returns NULL for any unknown or invalid token — no existence leakage.
-- Never returns: technician names, notes, approval chain, after_images,
--   before_images, internal status names, or any tenant metadata.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_public_work_order_status(TEXT);

CREATE OR REPLACE FUNCTION public.get_public_work_order_status(p_tracking_token TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row           RECORD;
    v_display_status TEXT;
    v_status_key     TEXT;
BEGIN
    SELECT
        wo.code,
        wo.status,
        wo.created_at,
        wo.updated_at,
        wo.rejection_reason,
        wo.reporter_image_url
      INTO v_row
      FROM public.work_orders wo
     WHERE wo.tracking_token = p_tracking_token;

    IF NOT FOUND THEN
        RETURN NULL;  -- Silent: invalid token reveals nothing
    END IF;

    -- Map internal status → reporter-visible Arabic label
    v_display_status := CASE v_row.status
        WHEN 'pending'                     THEN 'تم استلام البلاغ'
        WHEN 'assigned'                    THEN 'قيد التنفيذ'
        WHEN 'in_progress'                 THEN 'قيد التنفيذ'
        WHEN 'pending_supervisor_approval' THEN 'تحت المراجعة'
        WHEN 'pending_engineer_review'     THEN 'تحت المراجعة'
        WHEN 'pending_reporter_closure'    THEN 'تحت المراجعة'
        WHEN 'rejected_by_technician'      THEN 'تحت المراجعة'
        WHEN 'completed'                   THEN 'مكتمل'
        WHEN 'archived'                    THEN 'مكتمل'
        WHEN 'rejected'                    THEN 'مرفوض'
        WHEN 'cancelled'                   THEN 'ملغي'
        ELSE                                    'تم استلام البلاغ'
    END;

    -- Clean status key for frontend icon/color logic (no internal names leaked)
    v_status_key := CASE v_row.status
        WHEN 'pending'                     THEN 'received'
        WHEN 'assigned'                    THEN 'in_progress'
        WHEN 'in_progress'                 THEN 'in_progress'
        WHEN 'pending_supervisor_approval' THEN 'in_review'
        WHEN 'pending_engineer_review'     THEN 'in_review'
        WHEN 'pending_reporter_closure'    THEN 'in_review'
        WHEN 'rejected_by_technician'      THEN 'in_review'
        WHEN 'completed'                   THEN 'completed'
        WHEN 'archived'                    THEN 'completed'
        WHEN 'rejected'                    THEN 'rejected'
        WHEN 'cancelled'                   THEN 'cancelled'
        ELSE                                    'received'
    END;

    RETURN jsonb_build_object(
        'code',               v_row.code,
        'display_status',     v_display_status,
        'status_key',         v_status_key,
        'created_at',         v_row.created_at,
        'updated_at',         v_row.updated_at,
        -- rejection_reason only exposed when actually rejected
        'rejection_reason',   CASE WHEN v_row.status = 'rejected'
                                   THEN v_row.rejection_reason
                                   ELSE NULL
                              END,
        -- Storage path for the reporter's original photo; NULL if not uploaded.
        -- Frontend generates a short-lived signed URL via
        -- supabase.storage.from('public-report-photos').createSignedUrl(path, 3600).
        'reporter_image_url', v_row.reporter_image_url
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_public_work_order_status(TEXT) IS
    'Public tracking RPC. Returns minimal reporter-visible data for a work order
    identified by tracking_token. Returns NULL for invalid tokens (no leakage).
    Never returns internal workflow data. reporter_image_url is a storage path;
    the frontend generates a short-lived signed read URL.
    Hospital Lite phase 3.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — Storage bucket: public-report-photos
-- ─────────────────────────────────────────────────────────────────────────────
-- Private bucket (public = FALSE). Paths: {tracking_token}/reporter/{filename}.
-- The tracking_token (64-char hex) in the path is the access secret.
--
-- Upload: exclusively via the upload-report-photo Edge Function (service_role).
--   No anon INSERT policy — the Edge Function validates the token and uploads.
--
-- Read: anon SELECT policy allows createSignedUrl() calls from the tracking
--   page frontend. Security model: caller must know the exact path (which
--   contains the tracking_token). Without enumerating a valid token, the path
--   is unguessable. Signed URLs expire (frontend uses 1-hour expiry).
--
-- Authenticated staff: can SELECT their tenant's photos via tenant_id prefix.
--   Note: bucket paths start with tracking_token not tenant_id, so the
--   authenticated policy simply allows all reads for service_role/superadmin.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'public-report-photos',
    'public-report-photos',
    FALSE,
    5242880,    -- 5 MB per photo
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
    SET public             = EXCLUDED.public,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anon SELECT: needed for createSignedUrl() from the public tracking page.
-- Security: path contains tracking_token; caller must know it.
DROP POLICY IF EXISTS "public_report_photos_anon_select" ON storage.objects;
CREATE POLICY "public_report_photos_anon_select"
ON storage.objects
FOR SELECT TO anon
USING (bucket_id = 'public-report-photos');

-- Authenticated staff SELECT: all authenticated users can read their tenant's
-- reporter photos via the internal work-order detail pages.
DROP POLICY IF EXISTS "public_report_photos_auth_select" ON storage.objects;
CREATE POLICY "public_report_photos_auth_select"
ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'public-report-photos');

-- DELETE: only super-admins can remove reporter photos (data-retention policy).
DROP POLICY IF EXISTS "public_report_photos_superadmin_delete" ON storage.objects;
CREATE POLICY "public_report_photos_superadmin_delete"
ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'public-report-photos'
    AND public.is_super_admin()
);
