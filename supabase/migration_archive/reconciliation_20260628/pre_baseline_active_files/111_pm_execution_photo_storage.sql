-- =============================================================================
-- Migration: 111_pm_execution_photo_storage
-- Purpose:
--   Add a private Supabase Storage bucket for PM execution photo checks.
--
-- Storage model:
--   bucket: pm-execution-photos
--   path:   {tenant_id}/{work_order_id}/{check_id}/{file}
--
-- The frontend stores a stable storage URI in work_order_checks.value_photo_url:
--   storage://pm-execution-photos/{tenant_id}/{work_order_id}/{check_id}/{file}
--
-- No execution-table schema change is required.
-- =============================================================================

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'pm-execution-photos',
    'pm-execution-photos',
    FALSE,
    5242880,
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
    ]
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "pm_execution_photos_select_tenant" ON storage.objects;
CREATE POLICY "pm_execution_photos_select_tenant"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'pm-execution-photos'
    AND (
        public.is_super_admin()
        OR (storage.foldername(name))[1] = public.get_user_tenant_id()::TEXT
    )
);

DROP POLICY IF EXISTS "pm_execution_photos_insert_tenant" ON storage.objects;
CREATE POLICY "pm_execution_photos_insert_tenant"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'pm-execution-photos'
    AND (
        public.is_super_admin()
        OR (storage.foldername(name))[1] = public.get_user_tenant_id()::TEXT
    )
);

DROP POLICY IF EXISTS "pm_execution_photos_delete_tenant" ON storage.objects;
CREATE POLICY "pm_execution_photos_delete_tenant"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'pm-execution-photos'
    AND (
        public.is_super_admin()
        OR (storage.foldername(name))[1] = public.get_user_tenant_id()::TEXT
    )
);

-- Policy comments are intentionally kept as SQL comments instead of COMMENT ON
-- POLICY statements. Supabase can reject COMMENT ON POLICY for storage.objects
-- from the dashboard SQL role because it is not the owner of that relation.
