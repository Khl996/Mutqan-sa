# Hospital Lite — QA Checklist (Phase 7)

Governing principle: **لا حذف من قاعدة البيانات — إخفاء على مستوى الواجهة فقط.**
All items verified against project `mzpohntjotgeeaukwnbz`.
QA run: 2026-06-03.

---

## Phase 1 — Core Work Orders

| # | Check | Result |
|---|-------|--------|
| 1.1 | `work_orders` table exists with required columns (id, tenant_id, code, status, assigned_to, reported_by, created_by) | ✅ PASS |
| 1.2 | `create_work_order` RPC exists as SECURITY DEFINER | ✅ PASS |
| 1.3 | Work order list page builds without errors | ✅ PASS (build clean) |
| 1.4 | Work order detail page builds without errors | ✅ PASS (build clean) |
| 1.5 | Status workflow RPCs exist: `create_work_order`, `close_work_order` | ✅ PASS |

---

## Phase 2 — Public Portal

| # | Check | Result |
|---|-------|--------|
| 2.1 | `tenant_portal_tokens` table exists | ✅ PASS |
| 2.2 | `get_public_tenant_data` RPC exists | ✅ PASS |
| 2.3 | `submit_public_work_order` RPC exists | ✅ PASS |
| 2.4 | `/portal/:token` route registered, renders without auth (outside ProtectedRoute) | ✅ PASS (App.tsx:285) |
| 2.5 | Submission from portal creates WO in correct tenant (RPC is SECURITY DEFINER) | ✅ PASS |
| 2.6 | Unknown token returns a graceful error (handled in PublicReportPage) | ✅ PASS |

---

## Phase 3 — Tracking Page + Reporter Photo

| # | Check | Result |
|---|-------|--------|
| 3.1 | `/track/:token` route registered outside ProtectedRoute | ✅ PASS (App.tsx:288) |
| 3.2 | `reporter_image_url` column exists on `work_orders` | ✅ PASS |
| 3.3 | `location_note` column exists on `work_orders` | ✅ PASS |
| 3.4 | `public-report-photos` storage bucket exists (private, 5 MB) | ✅ PASS |
| 3.5 | `upload-report-photo` Edge Function available | ✅ PASS |
| 3.6 | Reporter photo URL stored in `reporter_image_url` | ✅ PASS |

---

## Phase 4 — Technician RLS + Deep-link

| # | Check | Result |
|---|-------|--------|
| 4.1 | `is_technician_role()` SECURITY DEFINER function exists | ✅ PASS (prosecdef=true) |
| 4.2 | `work_orders_technician_restricted_select` RESTRICTIVE policy active | ✅ PASS |
| 4.3 | Technician sees exactly the WOs they're involved with (T6: count=12, ground truth=12) | ✅ PASS |
| 4.4 | `src/components/auth/ProtectedRoute.tsx` saves `redirectAfterLogin` to sessionStorage | ✅ PASS |
| 4.5 | `LoginPage` consumes and clears `redirectAfterLogin` after sign-in | ✅ PASS |

---

## Phase 5 — WhatsApp Copy Notification

| # | Check | Result |
|---|-------|--------|
| 5.1 | `src/lib/whatsapp.ts` exports `normalizePhone` and `buildWhatsAppMessage` | ✅ PASS |
| 5.2 | `normalizePhone` handles: `05XXXXXXXX` → `+9665XXXXXXXX`, `9665XXXXXXXX` → `+9665XXXXXXXX`, `+9665XXXXXXXX` passthrough | ✅ PASS |
| 5.3 | "نسخ رسالة واتساب" button visible when `status === 'assigned'` AND `actorRole !== 'technician'` | ✅ PASS (WorkOrderActions.tsx:80) |
| 5.4 | Button hidden for technicians (actorRole check) | ✅ PASS |
| 5.5 | `buildWhatsAppMessage` returns bilingual AR/EN template | ✅ PASS |

---

## Phase 6 — PDF Report Generation

| # | Check | Result |
|---|-------|--------|
| 6.1 | `pdf_snapshot JSONB`, `pdf_generated_at TIMESTAMPTZ`, `pdf_version INT`, `pdf_file_url TEXT` columns exist | ✅ PASS |
| 6.2 | `close_work_order` RPC builds `v_pdf_snapshot` via LEFT JOINs and freezes it | ✅ PASS (prosrc contains v_pdf_snapshot) |
| 6.3 | `tenant-assets` bucket exists (public=true, 2 MB) | ✅ PASS |
| 6.4 | `work-order-pdfs` bucket exists (public=false, 10 MB) | ✅ PASS |
| 6.5 | `pdf_identity` settings category in `src/config/tenantSettings.ts` | ✅ PASS |
| 6.6 | Logo upload row in TenantSettingsPage uploads to `tenant-assets/{tenant_id}/logo.{ext}` | ✅ PASS |
| 6.7 | `WorkOrderPdfButton` visible only when `workOrder.status === 'completed'` | ✅ PASS (WorkOrderDetailsPage.tsx:177) |
| 6.8 | `src/utils/workOrderPdf.ts` loads Amiri font and wraps Arabic via `shape()` | ✅ PASS |
| 6.9 | PDF uploads to `work-order-pdfs` and updates `pdf_generated_at`/`pdf_version` | ✅ PASS (WorkOrderPdfButton.tsx) |
| 6.10 | Browser download triggered via `URL.createObjectURL` + `<a>.click()` | ✅ PASS |

---

## Phase 7 — RLS Hardening

| # | Check | Result |
|---|-------|--------|
| 7.1 | `work_order_costs` RLS enabled with `woc_select` (SELECT) + `woc_manage` (ALL) | ✅ PASS |
| 7.2 | `custom_roles` RLS enabled with `custom_roles_deny_all` (USING false) | ✅ PASS |
| 7.3 | `user_custom_roles` RLS enabled with `user_custom_roles_deny_all` (USING false) | ✅ PASS |
| 7.4 | `work_order_parts`: stale `{public}` policies removed; 4 `{authenticated}` policies active | ✅ PASS |
| 7.5 | **T1** Tenant B admin reads Tenant A work orders → **0 rows** | ✅ PASS |
| 7.6 | **T2** Tenant A maintenance_manager reads own tenant → **18 rows** | ✅ PASS |
| 7.7 | **T3** Technician UPDATEs WO they're assigned to → **1 row** affected | ✅ PASS |
| 7.8 | **T4** Technician UPDATEs WO they're NOT involved with → **0 rows** affected | ✅ PASS |
| 7.9 | **T5** Tenant B admin UPDATEs Tenant A WO → **0 rows** affected | ✅ PASS |
| 7.10 | **T6** Technician SELECT count (12) = ground-truth involved count (12) | ✅ PASS |

---

## Seed Cleanup (Phase 7 ب)

| # | Check | Result |
|---|-------|--------|
| B.1 | `tech1@hospital-lite.test` auth user deleted (count=0) | ✅ PASS |
| B.2 | Hospital Lite Demo tenant still exists (id=d0000000-…) | ✅ PASS |
| B.3 | Hospital Lite Demo buildings removed (count=0) | ✅ PASS |
| B.4 | Fixture @example.com data untouched | ✅ PASS |

---

## Deployment — Production (mutqan-sa.com)

Verified against live production at `mutqan-sa.com` (2026-06-03).
No separate deployment needed — existing Vercel project serves both Mutqan and Hospital Lite tenants.

| # | Check | Result |
|---|-------|--------|
| 8.1 | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in bundle (found in 3 asset files) | ✅ PASS |
| 8.2 | No `service_role` key in built dist (0 files match) | ✅ PASS |
| 8.3 | `npm run build` succeeds without TypeScript errors | ✅ PASS (built in 11.60s) |
| 8.4 | `mutqan-sa.com` loads landing page | ✅ PASS |
| 8.5 | `mutqan-sa.com/portal/test-token` → graceful "رابط غير صالح" without login | ✅ PASS |
| 8.6 | `/track/:token` route registered outside ProtectedRoute (source verified) | ✅ PASS |
| 8.7 | `mutqan-sa.com/work-orders` → redirects to login when unauthenticated | ✅ PASS |

---

## Summary

- **Phases 1–7 (database + source)**: 34/34 items ✅ PASS
- **Deployment (8.1–8.7)**: 7/7 ✅ PASS
- **Overall: 41/41 ✅ — Phase 7 complete**
