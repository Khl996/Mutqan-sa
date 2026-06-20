-- =============================================================================
-- Migration: 140_fix_public_report_photos_rls
-- Purpose:
--   Close a storage RLS gap on the public-report-photos bucket (introduced in
--   133_hospital_lite_public_portal_phase3.sql).
--
-- Problem:
--   storage.objects RLS is evaluated per-row with no distinction between
--   list() (folder enumeration) and createSignedUrl()/download() for a known
--   path. The previous anon and authenticated SELECT policies only checked
--   bucket_id, so ANY anon visitor (or any logged-in user of any tenant)
--   could call storage.list('public-report-photos') and enumerate every
--   reporter's photo across every tenant, defeating the "path contains the
--   secret tracking_token" model the bucket was designed around.
--
-- Product decision (confirmed with founder): the public tracking page
--   (/track/:token) only needs to show report STATUS to the anonymous
--   reporter. The photo itself is only relevant to staff inside the tenant
--   that owns the work order. So anon needs zero storage access to this
--   bucket, and staff access should be scoped to their own tenant.
--
-- Fix:
--   1. Drop the anon SELECT policy entirely. Anon has no storage access to
--      this bucket (matches the upload path, which is already
--      service_role-only via the upload-report-photo Edge Function).
--   2. Replace the unscoped authenticated SELECT policy with one that joins
--      back to work_orders via the tracking_token embedded in the object
--      path ({tracking_token}/reporter/{file}) and only allows a match when
--      the work order belongs to the caller's own tenant (or the caller is
--      a super admin).
-- =============================================================================

DROP POLICY IF EXISTS "public_report_photos_anon_select" ON storage.objects;

DROP POLICY IF EXISTS "public_report_photos_auth_select" ON storage.objects;
CREATE POLICY "public_report_photos_auth_select"
ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'public-report-photos'
    AND (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1
            FROM public.work_orders wo
            WHERE wo.tracking_token = (storage.foldername(name))[1]
              AND wo.tenant_id = get_user_tenant_id()
        )
    )
);
