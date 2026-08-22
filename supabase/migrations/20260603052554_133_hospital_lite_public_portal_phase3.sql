-- =============================================================================
-- Migration: 133_hospital_lite_public_portal_phase3.sql
-- Phase: Hospital Lite Mode — Phase 3 (Structured Public Form + Tracking)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Fix issue_types duplicates
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
        SELECT id INTO v_canonical_id
          FROM public.issue_types
         WHERE tenant_id IS NULL AND code = r.code
         ORDER BY created_at ASC, id::text ASC
         LIMIT 1;

        SELECT ARRAY_AGG(id)
          INTO v_dupe_ids
          FROM public.issue_types
         WHERE tenant_id IS NULL
           AND code = r.code
           AND id  != v_canonical_id;

        UPDATE public.work_orders
           SET issue_type_id = v_canonical_id
         WHERE issue_type_id = ANY(v_dupe_ids);

        DELETE FROM public.issue_types
         WHERE id = ANY(v_dupe_ids);

        RAISE NOTICE 'issue_types dedup: code=% canonical=% removed=%',
            r.code, v_canonical_id, array_length(v_dupe_ids, 1);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_types_global_unique_code
    ON public.issue_types (code)
    WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_types_per_tenant_unique_code
    ON public.issue_types (tenant_id, code)
    WHERE tenant_id IS NOT NULL;

COMMENT ON INDEX idx_issue_types_global_unique_code IS
    'Phase 3: prevents future duplicate global issue_type codes (tenant_id IS NULL).';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — New columns on work_orders
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS reporter_image_url TEXT;

COMMENT ON COLUMN public.work_orders.reporter_image_url IS
    'Storage path in the private public-report-photos bucket for the reporter''s
    original photo. Pattern: {tracking_token}/reporter/{filename}. Set by the
    upload-report-photo Edge Function. Never set by internal staff paths.
    Hospital Lite phase 3.';

ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS location_note TEXT;

COMMENT ON COLUMN public.work_orders.location_note IS
    'Free-text location note entered by the reporter when they pick "أخرى" in
    the public intake form. Supplements building_id / floor_id / department_id.
    Hospital Lite phase 3.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — Expand submit_public_work_order
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.submit_public_work_order(text, text, text, text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.submit_public_work_order(text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.submit_public_work_order(
    p_token          TEXT,
    p_reporter_name  TEXT,
    p_reporter_phone TEXT,
    p_description    TEXT,
    p_building_id    UUID    DEFAULT NULL,
    p_floor_id       UUID    DEFAULT NULL,
    p_asset_id       UUID    DEFAULT NULL,
    p_issue_type_id  UUID    DEFAULT NULL,
    p_department_id  UUID    DEFAULT NULL,
    p_room_id        UUID    DEFAULT NULL,
    p_location_note  TEXT    DEFAULT NULL
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
        PERFORM 1 FROM public.issue_types
         WHERE id = p_issue_type_id
           AND is_active = TRUE
           AND (tenant_id IS NULL OR tenant_id = v_tenant_id);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid issue type for this organization';
        END IF;
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

    v_code := 'PUB-' || to_char(NOW(), 'YYMMDD') || '-'
              || substring(gen_random_uuid()::text from 1 for 4);

    INSERT INTO public.work_orders (
        tenant_id, code, title, description, status, priority,
        building_id, floor_id, department_id, room_id, asset_id,
        issue_type_id, issue_type, location_note,
        reporter_name, reporter_phone, reported_at, created_at
    ) VALUES (
        v_tenant_id, v_code,
        'بلاغ عام' || COALESCE(': ' || v_issue_type_name, '') || ': '
            || COALESCE(substring(p_description from 1 for 30), 'General Issue'),
        p_description, 'pending', 'medium',
        p_building_id, p_floor_id, p_department_id, p_room_id, p_asset_id,
        p_issue_type_id, v_issue_type_name, p_location_note,
        p_reporter_name, p_reporter_phone, NOW(), NOW()
    )
    RETURNING id, tracking_token INTO v_new_id, v_tracking_token;

    PERFORM public.create_operation_log(
        v_tenant_id, v_new_id, 'create',
        'Public report submitted by: ' || p_reporter_name, NULL
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

DROP FUNCTION IF EXISTS public.get_public_tenant_data(TEXT);

CREATE OR REPLACE FUNCTION public.get_public_tenant_data(p_token TEXT)
RETURNS TABLE (
    tenant_id       UUID,
    tenant_name     TEXT,
    buildings       JSON,
    portal_settings JSON,
    floors          JSON,
    departments     JSON,
    issue_types     JSON
)
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id       UUID;
    v_tenant_name     TEXT;
    v_portal_settings JSON;
BEGIN
    SELECT tat.tenant_id
      INTO v_tenant_id
      FROM public.tenant_access_tokens tat
     WHERE tat.token    = p_token
       AND tat.is_active = TRUE
       AND public.has_public_portal_access(tat.tenant_id);

    IF v_tenant_id IS NULL THEN
        RETURN;
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
        COALESCE(
            (SELECT json_agg(json_build_object('id', b.id, 'name', b.name, 'name_ar', b.name_ar) ORDER BY b.name)
               FROM public.buildings b WHERE b.tenant_id = v_tenant_id AND b.is_active = TRUE),
            '[]'::JSON
        ),
        v_portal_settings,
        COALESCE(
            (SELECT json_agg(json_build_object('id', f.id, 'name', f.name, 'name_ar', f.name_ar, 'building_id', f.building_id) ORDER BY f.building_id, f.level)
               FROM public.floors f JOIN public.buildings b ON b.id = f.building_id
              WHERE b.tenant_id = v_tenant_id AND f.is_active = TRUE),
            '[]'::JSON
        ),
        COALESCE(
            (SELECT json_agg(json_build_object('id', d.id, 'name', d.name, 'name_ar', d.name_ar, 'building_id', d.building_id, 'floor_id', d.floor_id) ORDER BY d.building_id, d.name)
               FROM public.departments d WHERE d.tenant_id = v_tenant_id AND d.is_active = TRUE),
            '[]'::JSON
        ),
        COALESCE(
            (SELECT json_agg(json_build_object('id', it.id, 'code', it.code, 'name', it.name, 'name_ar', it.name_ar, 'icon', it.icon) ORDER BY it.display_order)
               FROM public.issue_types it
              WHERE it.is_active = TRUE AND (it.tenant_id IS NULL OR it.tenant_id = v_tenant_id)),
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

DROP FUNCTION IF EXISTS public.get_public_work_order_status(TEXT);

CREATE OR REPLACE FUNCTION public.get_public_work_order_status(p_tracking_token TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row            RECORD;
    v_display_status TEXT;
    v_status_key     TEXT;
BEGIN
    SELECT wo.code, wo.status, wo.created_at, wo.updated_at,
           wo.rejection_reason, wo.reporter_image_url
      INTO v_row
      FROM public.work_orders wo
     WHERE wo.tracking_token = p_tracking_token;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

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
        'code',             v_row.code,
        'display_status',   v_display_status,
        'status_key',       v_status_key,
        'created_at',       v_row.created_at,
        'updated_at',       v_row.updated_at,
        'rejection_reason', CASE WHEN v_row.status = 'rejected' THEN v_row.rejection_reason ELSE NULL END,
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'public-report-photos', 'public-report-photos', FALSE, 5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
    SET public             = EXCLUDED.public,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "public_report_photos_anon_select"       ON storage.objects;
DROP POLICY IF EXISTS "public_report_photos_auth_select"       ON storage.objects;
DROP POLICY IF EXISTS "public_report_photos_superadmin_delete" ON storage.objects;

CREATE POLICY "public_report_photos_anon_select"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'public-report-photos');

CREATE POLICY "public_report_photos_auth_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'public-report-photos');

CREATE POLICY "public_report_photos_superadmin_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'public-report-photos' AND public.is_super_admin());
