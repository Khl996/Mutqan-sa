-- Phase 6: PDF generation for completed work orders
-- Adds snapshot columns, modifies close_work_order, creates storage buckets + policies.
-- Idempotent: uses IF NOT EXISTS throughout.

-- ─────────────────────────────────────────────────────────────
-- 1. Add PDF columns to work_orders
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.work_orders
    ADD COLUMN IF NOT EXISTS pdf_snapshot     JSONB        DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pdf_version      INT          DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pdf_file_url     TEXT;

-- ─────────────────────────────────────────────────────────────
-- 2. Replace close_work_order — adds pdf_snapshot build
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_work_order(
    p_work_order_id uuid,
    p_notes         text DEFAULT ''::text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id               UUID    := auth.uid();
    v_actor_role             TEXT;
    v_actor_tenant           UUID;
    v_is_super               BOOLEAN := FALSE;
    v_tenant_id              UUID;
    v_old_status             TEXT;
    v_reported_by            UUID;
    v_is_platform_override   BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
    v_pdf_snapshot           JSONB;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, reported_by
      INTO v_tenant_id, v_old_status, v_reported_by
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override   := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF NOT v_is_management_override AND v_reported_by IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the original reporter can close this work order';
    END IF;

    IF v_old_status <> 'pending_reporter_closure' THEN
        RAISE EXCEPTION 'Cannot close work order in status: %', v_old_status;
    END IF;

    -- Build snapshot (resolves FK names before they can change).
    SELECT jsonb_build_object(
        'code',               wo.code,
        'description',        wo.description,
        'priority',           wo.priority,
        'created_at',         wo.created_at,
        'closed_at',          NOW(),
        'reporter_notes',     p_notes,
        'reporter_image_url', wo.reporter_image_url,
        'before_images',      COALESCE(wo.before_images, '[]'::jsonb),
        'after_images',       COALESCE(wo.after_images,  '[]'::jsonb),
        'issue_type',         CASE WHEN it.id IS NOT NULL THEN
                                  jsonb_build_object('id', it.id, 'name', it.name, 'name_ar', it.name_ar)
                              ELSE NULL END,
        'building',           CASE WHEN b.id IS NOT NULL THEN
                                  jsonb_build_object('id', b.id, 'name', b.name, 'name_ar', b.name_ar)
                              ELSE NULL END,
        'floor',              CASE WHEN fl.id IS NOT NULL THEN
                                  jsonb_build_object('id', fl.id, 'name', fl.name, 'name_ar', fl.name_ar)
                              ELSE NULL END,
        'room',               CASE WHEN rm.id IS NOT NULL THEN
                                  jsonb_build_object('id', rm.id, 'name', rm.name, 'name_ar', rm.name_ar)
                              ELSE NULL END,
        'assigned_team',      CASE WHEN tm.id IS NOT NULL THEN
                                  jsonb_build_object('id', tm.id, 'name', tm.name, 'name_ar', tm.name_ar)
                              ELSE NULL END,
        'assignee',           CASE WHEN asgn.id IS NOT NULL THEN
                                  jsonb_build_object('id', asgn.id, 'full_name', asgn.full_name)
                              ELSE NULL END,
        'reporter',           CASE WHEN rptr.id IS NOT NULL THEN
                                  jsonb_build_object('id', rptr.id, 'full_name', rptr.full_name)
                              ELSE NULL END,
        'closed_by',          jsonb_build_object('id', v_actor_id, 'full_name', actor_p.full_name)
    )
      INTO v_pdf_snapshot
      FROM public.work_orders                                         wo
      LEFT JOIN public.issue_types  it      ON it.id      = wo.issue_type_id
      LEFT JOIN public.buildings    b       ON b.id       = wo.building_id
      LEFT JOIN public.floors       fl      ON fl.id      = wo.floor_id
      LEFT JOIN public.rooms        rm      ON rm.id      = wo.room_id
      LEFT JOIN public.teams        tm      ON tm.id      = wo.assigned_team
      LEFT JOIN public.profiles     asgn    ON asgn.id    = wo.assigned_to
      LEFT JOIN public.profiles     rptr    ON rptr.id    = wo.reported_by
      LEFT JOIN public.profiles     actor_p ON actor_p.id = v_actor_id
     WHERE wo.id = p_work_order_id;

    -- Authorize the trigger guard before the UPDATE.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status               = 'completed',
           completed_at         = NOW(),
           customer_reviewed_by = v_actor_id,
           customer_reviewed_at = NOW(),
           reporter_notes       = p_notes,
           pdf_snapshot         = v_pdf_snapshot,
           updated_at           = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance', 'Work order closed', v_actor_id
    );
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 3. Storage buckets
-- ─────────────────────────────────────────────────────────────

-- tenant-assets: public read (logos needed for PDF generation),
-- restricted write to tenant admins.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'tenant-assets',
    'tenant-assets',
    TRUE,
    2097152,  -- 2 MB
    ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- work-order-pdfs: private, tenant-scoped.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'work-order-pdfs',
    'work-order-pdfs',
    FALSE,
    10485760,  -- 10 MB
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4. Storage RLS policies
-- ─────────────────────────────────────────────────────────────

-- tenant-assets: write restricted to tenant_admin / maintenance_manager
-- Path convention: {tenant_id}/filename
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'tenant_assets_insert'
    ) THEN
        CREATE POLICY tenant_assets_insert ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'tenant-assets'
                AND (storage.foldername(name))[1] = (public.get_user_tenant_id())::text
                AND EXISTS (
                    SELECT 1 FROM public.profiles
                     WHERE id = auth.uid()
                       AND role IN ('tenant_admin', 'platform_owner', 'platform_admin')
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'tenant_assets_update'
    ) THEN
        CREATE POLICY tenant_assets_update ON storage.objects
            FOR UPDATE TO authenticated
            USING (
                bucket_id = 'tenant-assets'
                AND (storage.foldername(name))[1] = (public.get_user_tenant_id())::text
                AND EXISTS (
                    SELECT 1 FROM public.profiles
                     WHERE id = auth.uid()
                       AND role IN ('tenant_admin', 'platform_owner', 'platform_admin')
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'tenant_assets_delete'
    ) THEN
        CREATE POLICY tenant_assets_delete ON storage.objects
            FOR DELETE TO authenticated
            USING (
                bucket_id = 'tenant-assets'
                AND (storage.foldername(name))[1] = (public.get_user_tenant_id())::text
                AND EXISTS (
                    SELECT 1 FROM public.profiles
                     WHERE id = auth.uid()
                       AND role IN ('tenant_admin', 'platform_owner', 'platform_admin')
                )
            );
    END IF;
END;
$$;

-- work-order-pdfs: same-tenant read/write
-- Path convention: {tenant_id}/{work_order_id}.pdf
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'work_order_pdfs_select'
    ) THEN
        CREATE POLICY work_order_pdfs_select ON storage.objects
            FOR SELECT TO authenticated
            USING (
                bucket_id = 'work-order-pdfs'
                AND (storage.foldername(name))[1] = (public.get_user_tenant_id())::text
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'work_order_pdfs_insert'
    ) THEN
        CREATE POLICY work_order_pdfs_insert ON storage.objects
            FOR INSERT TO authenticated
            WITH CHECK (
                bucket_id = 'work-order-pdfs'
                AND (storage.foldername(name))[1] = (public.get_user_tenant_id())::text
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
          AND policyname = 'work_order_pdfs_update'
    ) THEN
        CREATE POLICY work_order_pdfs_update ON storage.objects
            FOR UPDATE TO authenticated
            USING (
                bucket_id = 'work-order-pdfs'
                AND (storage.foldername(name))[1] = (public.get_user_tenant_id())::text
            );
    END IF;
END;
$$;
