# Hospital Lite Mode — Roadmap

Tracking phases for the hospital-lite feature set (simplified SaaS for hospitals).
Governing principle: **إخفاء على مستوى الواجهة فقط — لا حذف من قاعدة البيانات.**

---

## Completed Phases

### Phase 1 — Core Work Orders
Baseline work order creation, listing, and detail pages scoped to a tenant.

### Phase 2 — Public Portal
QR-code-accessible public submission form at `/portal/:token`.  Allows reporters to
submit work orders without authentication.

### Phase 3 — Tracking Page + Reporter Photo
- Public tracking page at `/track/:token` — reporters follow their submission status.
- Edge Function `upload-report-photo` — reporters upload a photo after submission.
- Migration 133: `reporter_image_url`, `location_note` columns; `submit_public_work_order`
  expanded to 11 params; `get_public_tenant_data` returns floors/departments/issue_types;
  `public-report-photos` storage bucket with RLS.

### Phase 4 — Technician RLS + Deep-link
- Migration 134: `is_technician_role()` SECURITY DEFINER + RESTRICTIVE SELECT policy on
  `work_orders` — technicians see only orders where they are assigned/reporter/creator.
- `ProtectedRoute`: saves intended path to `sessionStorage` before redirect to `/login`.
- `LoginPage`: consumes `sessionStorage` redirect after successful sign-in.
- Seed: demo technician `tech1@hospital-lite.test` linked to hospital tenant.

### Phase 5 — WhatsApp Copy Notification
- `src/lib/whatsapp.ts`: `normalizePhone` (Saudi +966, 3 input forms) +
  `buildWhatsAppMessage` (bilingual AR/EN template: رقم / نوع / موقع / فريق / مكلَّف
  (conditional) / وصف / رابط مطلق).
- `WorkOrderActions`: single **"نسخ رسالة واتساب"** button visible to non-technicians
  when `status === 'assigned'`.  Engineer copies the message, opens the group manually,
  and pastes.  No API, no automatic sending.

### Phase 6 — PDF Report Generation
- Migration 135: `pdf_snapshot JSONB`, `pdf_generated_at TIMESTAMPTZ`, `pdf_version INT`, `pdf_file_url TEXT` columns on `work_orders`.
- `close_work_order` RPC extended: builds `v_pdf_snapshot` JSONB via LEFT JOINs (issue_type, building, floor, room, team, assignee, reporter, actor) immediately before the UPDATE; snapshot frozen at closure.
- Storage buckets: `tenant-assets` (public, 2 MB, image types) + `work-order-pdfs` (private, 10 MB, PDF).  Policies use `(storage.foldername(name))[1] = get_user_tenant_id()::text`; tenant-asset writes restricted to tenant_admin/platform roles.
- `src/config/tenantSettings.ts`: `pdf_identity` category added — `organization_name`, `organization_name_ar`, `logo_path`, `footer_note`, `show_reporter_images`, `show_before_after_images`.
- `src/hooks/useWorkOrders.ts`: `WorkOrderPdfSnapshot` type + 4 optional PDF fields on `WorkOrder`.
- `src/utils/workOrderPdf.ts`: async PDF generator — Amiri font (GitHub CDN), `shape()` Arabic wrapper, safe image normalizer (`extractImagePath`), signed URLs resolved at render time, autoTable info grid + description/notes/photos sections, per-page footer.
- `src/components/work-orders/WorkOrderPdfButton.tsx`: button in sidebar when `status === 'completed'`; generates PDF → uploads to `work-order-pdfs/{tenant_id}/{id}.pdf` → downloads to browser → updates `pdf_generated_at`/`pdf_version`.
- `src/pages/work-orders/WorkOrderDetailsPage.tsx`: `WorkOrderPdfButton` injected into sidebar.
- `src/pages/settings/TenantSettingsPage.tsx`: `pdf_identity` tab with `LogoUploadRow` (upload to `tenant-assets`) + generic settings for org names, footer, image toggles.

---

## Deferred / Future

### WhatsApp Business API Notifications (Phase N)
**Status:** Deferred — implement when paying hospital customers require it.

**What it is:** Automated WhatsApp messages via Meta's WhatsApp Business API (BSP
required: Twilio, Unifonic, etc.) — triggered on work order assignment, status change,
or escalation.

**Why deferred:**
- Requires a Meta Business account, BSP contract, and pre-approved message templates
  (Arabic + English).
- Monthly cost varies by message volume; not justified until customers are paying.
- No current BSP integration or `WHATSAPP_API_KEY` secret in the project.

**Foundation already in place:**
- `normalizePhone()` in `src/lib/whatsapp.ts` handles Saudi number normalization.
- `buildWhatsAppMessage()` produces the bilingual template; can be reused as a BSP
  template body.
- `profiles.phone` stores technician numbers (populated via Phase 4 seed).

**When to implement:**
1. Sign BSP contract and obtain API credentials.
2. Register message templates with Meta (AR + EN, one per trigger type).
3. Add `WHATSAPP_API_KEY` and `WHATSAPP_PHONE_ID` to Supabase secrets.
4. Create an Edge Function `send-whatsapp-notification` (Deno, calls BSP REST API).
5. Trigger from `work_orders` DB webhook or from existing workflow mutation hooks.
