# Demo Browser Rehearsal Report

Status: External Demo GO after Browser Rehearsal 2; Task 004-G implemented  
Tenant: Noura Gardens Compound Demo (staging)  
Rehearsal date: 2026-04-27  
Verification baseline: verify:demo-tenant 44/44 PASS from rehearsal baseline; current local rerun is guarded by DEMO_SEED_ALLOWED  
Prepared by: internal review session

---

## 1. Executive Summary

A full manual browser rehearsal was completed against the Noura Gardens Compound Demo tenant on staging. The automated verification baseline (44/44 PASS) held throughout the session. No real customer data was visible. After the P1 fixes and Browser Rehearsal 2, the tenant is External Demo GO.

Task 004-G adds Reports Decision Brief v1 so the reports demo can close with management actions, not just metrics. The remaining findings are P2 polish items.

---

## 2. Current Go/No-Go

| Audience | Status | Condition |
|---|---|---|
| Internal demo / stakeholder review | **GO** | No blockers for an internal walkthrough with a prepared presenter. |
| External sales demo | **GO** | P1 blockers completed and Browser Rehearsal 2 cleared. Reports now include a decision-oriented close. |

Historical findings are kept below for traceability.

---

## 3. Reviewed Screens

| # | Screen | Rehearsal result |
|---|---|---|
| 1 | Dashboard | Mostly OK |
| 2 | Work Order List | Mostly OK |
| 3 | Work Order Detail | OK |
| 4 | Execution Flow | OK |
| 5 | Completed Work Order | Mostly OK |
| 6 | Cancelled Work Order | OK |
| 7 | Asset Detail | Problem — see findings |
| 8 | PM Work Order (PM page) | OK |
| 9 | PM Work Order (WO context) | Problem — see findings |
| 10 | Reports | Acceptable — improvement needed |

---

## 4. Findings Table

| ID | Screen | Issue | Severity | Demo impact | Recommended fix | Owner |
|---|---|---|---|---|---|---|
| F-01 | Asset List | Clicking an asset from the assets list/page does not navigate to asset detail. Users must reach asset detail via a work-order asset link. | **P1** | High — the asset story cannot be told from the asset list. A buyer exploring independently will hit a dead end. | Fix the asset list row/card click handler to route to the asset detail page. | Frontend |
| F-02 | Asset Detail | The preventive maintenance section on asset detail does not show or open useful details. The overall asset detail page is confusing enough to require a UX review or partial rebuild. | **P1** | High — asset memory and PM scheduling are key demo claims. A broken or empty PM section undermines credibility. | UX review of asset detail layout. At minimum: make the PM section show linked PM schedule name, frequency, and next/last date. Consider restructuring the page into clear tabs: Overview, Work History, PM Schedule. | Frontend / Product |
| F-03 | Work Order List | Preventive (PM-generated) and corrective work orders look identical. There is no visual badge, label, or filter that distinguishes them. | **P1** | High — differentiation between planned and reactive maintenance is a core demo claim. Without it the list looks like undifferentiated tickets. | Add a type badge (Preventive / Corrective) to the work order list row and detail header. Add a type filter to the list. Source the value from the existing work order type or origin field. | Frontend |
| F-04 | PM Work Order in WO context | A PM-generated work order opened from the Work Orders page shows the standard corrective approval flow and no checklist. The checklist and PM context are only visible in the dedicated PM execution page. | **P1** | High — if a presenter opens a PM work order from the WO list, it looks indistinguishable from a corrective WO with no checklist evidence. | In the Work Order detail view, when `type = preventive` or `origin = pm`, display a read-only PM context section: PM schedule name, checklist summary (items and statuses), and a link to the full PM execution dialog if appropriate. | Frontend |
| F-05 | Completed Work Order | Completion notes do not appear on the completed work order detail view. | **P1** | Medium — completion notes are part of the proof-of-work story. Their absence makes completed records look incomplete. | Ensure the completion notes field is rendered in the completed work order detail. Check whether the field is populated in seed data and whether the component renders it when the status is `completed`. | Frontend / Data |
| F-06 | Dashboard | The inventory indicator is present but weak and does not add meaningful signal to the demo story at this stage. | **P2** | Low — inventory is not a primary demo claim for Pilot v1. A weak indicator is neutral, not harmful. | Polish the inventory low-stock widget to show item name, current stock, and reorder threshold. Defer until after P1 items are complete. | Frontend |
| F-07 | Reports | Mixed Arabic/English labels appear on the same screen (e.g., "corrective" / "PM" and "SLA met" / "SLA breached" in different languages on the same report). | **P1** | Medium — bilingual inconsistency on a screen that buyers will screenshot is a credibility risk. | Audit the reports page for hard-coded English strings that should be localized. Apply consistent locale to all label sets on the same screen. Prioritize the work-order type and SLA labels. | Frontend / i18n |
| F-08 | Reports | Reports show metrics but are not framed around decisions. A buyer cannot immediately see what action to take from the current layout. | **P2** | Medium — reports are the demo closing screen. If the buyer leaves remembering charts rather than a decision, the demo loses its landing. | Introduce a "Decision Brief" section at the top of the reports page with 3–5 pre-framed signals: overdue work to escalate, repeated asset issue, PM compliance rate, low-stock item to restock, workload imbalance by location. Each signal should link to its supporting metric. | Product / Frontend |
| F-09 | Reports | Visual polish is below the standard of the rest of the application — spacing, chart sizing, and label wrapping need improvement. | **P2** | Low — noticeable but not a blocker given the overall acceptable rating. | General visual polish pass on the reports page after the Decision Brief is in place. | Frontend |
| F-10 | All screens | Some bilingual label inconsistency appears beyond reports (mixed script in work order status labels and button text depending on the locale active at seed time). | **P2** | Low — distracting but not story-breaking if the presenter is fluent in both languages. | Systematic bilingual copy audit across all demo-path screens. Align all labels to a single locale per screen session. | Frontend / i18n |

**Severity summary: P0 — 0 | P1 — 6 | P2 — 4**

---

## 5. P1 Implementation Plan

The following P1 items should be completed in order before the next external demo rehearsal. Each item is scoped to the minimum change that resolves the demo impact.

### P1-A: Asset List Navigation Fix — IMPLEMENTED 2026-04-27

**Root cause:** `AssetCard` component had `cursor-pointer` styling but no `onClick` handler and no `Link` wrapper. The `TreeNode` content area for asset-type nodes also had no navigation logic (`onClick` only toggled expand for non-asset nodes and did nothing for assets).

**Fix applied:**

- Added `import { useNavigate } from 'react-router-dom'` to `src/pages/assets/AssetsPage.tsx`.
- Added `const navigate = useNavigate()` inside `AssetCard` and added `onClick={() => navigate(`/assets/${asset.id}`)}` to the outer card `<div>`. Existing action buttons inside the card already call `e.stopPropagation()` so they are unaffected.
- Added `const navigate = useNavigate()` inside `TreeNode` and updated the content click area to call `navigate(`/assets/${node.id}`)` when `node.type === 'asset'`, instead of doing nothing.

**Route used:** `/assets/:id` (already existed in `src/App.tsx`).

**Remaining risk:** The `AssetDetailsPage` PM schedule section is still sparse (P1-B). Navigation now works but the destination page still needs UX work.

**Verification:** Build passes clean. Lint shows 0 new errors (2 pre-existing warnings in `AssetsPage.tsx` unrelated to this change).

### P1-B: Asset Detail UX Cleanup — IMPLEMENTED 2026-04-27

**Target file:** `src/pages/assets/AssetDetailsPage.tsx` (no sub-components created — all changes inline).

**Root cause:** The asset detail page had four gaps: (1) criticality was defined on the Asset type and fetched but never displayed; (2) location breadcrumb showed only the building name, not floor/room; (3) work order rows showed only title, date, and code — no status or type badges; (4) the PM tab showed legacy `asset_maintenance_history` data but the Overview tab had no section showing which active PM schedules are linked to the asset via `pm_schedule_assets`.

**Fix applied:**

- **Criticality badge in header:** Added `CRITICALITY_CONFIG` map (critical/high/medium/low → border colors). Criticality badge renders alongside the status badge in the header using `ShieldAlert` icon and the `assets.critical/high/medium/low` i18n keys.
- **Location breadcrumb in header:** Added a `MapPin`-prefixed line under the asset name joining building / floor / room names (bilingual, RTL-aware). Only rendered if at least one location field is set.
- **Details card (Section A):** Full location path replaces the building-only `InfoLine`. Added a criticality `InfoLine`. Moved model and serial number above purchase/warranty to prioritise operational identity fields.
- **PM Schedules section (Section C):** Calls `usePMSchedules()` (already cached for the PM page), filters client-side for schedules whose `assets` array contains the current asset id. Displays schedule name (bilingual), code, frequency badge, status badge (active = success tint), next due date, last run date, and compliance rate with colour coding (≥80% green, ≥50% amber, <50% red). `FREQUENCY_LABEL` constant maps `PMFrequencyType` values to bilingual strings without touching i18n files. Clean empty state when no schedules are linked. Section only shown when `canViewPm` is true.
- **Work Orders card (Section B):** Each row now shows: title (truncated), status badge (from `STATUS_DISPLAY`), type badge (Preventive/Corrective via `isPreventiveWorkOrder`), Overdue badge (when applicable), code and creation date in a right column. Overdue rows get a destructive background tint. Increased slice from 6 to 8 rows.
- **Attention Signals (Section D):** Banner strip above the main grid — appears when there are overdue work orders (count + message) or when the asset is `out_of_service` with no open work orders (no-action warning). Does not appear when the asset is healthy.

**Remaining risk:** `usePMSchedules()` fetches all tenant PM schedules. For tenants with hundreds of schedules this is a full table scan + client-side filter. Acceptable for demo scale; a targeted `?asset_id=eq.X` query would be the production optimisation.

**Verification:** Build passes clean. `npx eslint src/pages/assets/AssetDetailsPage.tsx` returns 0 errors, 0 warnings.

### P1-C: Preventive vs Corrective Badge and Filter in Work Orders — IMPLEMENTED 2026-04-28

**Classification field:** `work_type` (DB column, seeded as `'preventive'` for DEMO-WO-PM-001, `'corrective'` for all others). Secondary signal: `source_schedule_id` (non-null for PM-generated work orders). A work order is Preventive if `work_type === 'preventive'` OR `source_schedule_id` is present; otherwise Corrective.

**Fix applied:**

- Added `work_type` and `source_schedule_id` fields to the `WorkOrder` interface in `src/hooks/useWorkOrders.ts`. Both are already fetched via `*` select; the interface was the only gap.
- Exported `isPreventiveWorkOrder(wo)` helper from `src/hooks/useWorkOrders.ts` for reuse across list and detail.
- Added `"preventive"` / `"corrective"` short label keys to `src/i18n/locales/en.json` and `src/i18n/locales/ar.json` under `workOrders`.
- **Work Order List (`src/pages/work-orders/WorkOrdersPage.tsx`):**
  - Added `typeFilter` state (`'all' | 'preventive' | 'corrective'`, defaults to `'all'`).
  - Type filter AND-combines with existing status filter and search.
  - Type filter UI added as a labeled row inside the existing filter panel, below the status filter chips, separated by a divider.
  - Type badge added to each table row's title/code cell (inline pill badge).
  - Type badge added to each mobile card's right-side badge stack.
- **Work Order Detail Header (`src/components/work-orders/WorkOrderHeader.tsx`):**
  - Type badge added alongside the existing status and priority badges.

**Badge colors:** Preventive = `text-info bg-info/10 border-info/20` (blue teal = planned). Corrective = `text-muted-foreground bg-muted/10 border-muted/20` (neutral = reactive).

**i18n:** Translation keys `workOrders.preventive` and `workOrders.corrective` in both locale files. Components use `t('workOrders.preventive')` / `t('workOrders.corrective')`.

**Remaining risk:** Classification depends on `work_type` being correctly set in the DB seed. `DEMO-WO-PM-001` must have `work_type = 'preventive'` — confirm in the next browser rehearsal. If a newly created reactive work order is incorrectly stored with `work_type = 'preventive'`, it will be misclassified, but this is a data concern, not a UI bug.

**Verification:** Build passes clean. Lint shows 0 new errors (5 pre-existing `any` warnings in useWorkOrders.ts query functions, unrelated to this change).

### P1-D: Completed Work Order Notes Visibility — IMPLEMENTED 2026-04-27

**Root cause:** `WorkOrderInfo.tsx` rendered only `description`. The four workflow notes fields (`technician_notes`, `supervisor_notes`, `engineer_notes`, `reporter_notes`) were defined on the `WorkOrder` type, fetched via `*` select, but never rendered as a standalone visible section. They only appeared transiently inside `WorkOrderActions` during active workflow steps.

**Fix applied:** Added a "Work Notes" / "ملاحظات العمل" section to `src/components/work-orders/WorkOrderInfo.tsx` that renders each non-null notes field in its own labeled block. The section is conditionally rendered — it is hidden when all four fields are null, so corrective work orders with no notes do not show an empty block.

**Fields rendered:**

- `technician_notes` — Technician Notes / ملاحظات الفني
- `supervisor_notes` — Supervisor Notes / ملاحظات المشرف
- `engineer_notes` — Engineer Notes / ملاحظات المهندس
- `reporter_notes` — Reporter Notes / ملاحظات المراسل

**Remaining risk:** Seed data must actually populate `technician_notes` on `DEMO-WO-COMPLETE-001` for the section to appear. If the field is null in the database, the section will be hidden (by design — no fake notes are rendered). Confirm in the next browser rehearsal.

**Verification:** Build passes clean. Lint shows 0 new errors.

### P1-E: PM Checklist and Context Visibility in Work Order Detail — IMPLEMENTED 2026-04-28

**Approach:** Created a new self-contained component `src/components/work-orders/WorkOrderPMContext.tsx`. Mounted conditionally in `src/pages/work-orders/WorkOrderDetailsPage.tsx` after the Work Notes section, only when `isPreventiveWorkOrder(workOrder)` is true.

**Data source:** Calls the existing `usePMWorkOrderDetail(workOrderId)` hook from `src/hooks/usePMFoundation.ts`, which fetches `work_order_checks`, `source_schedule`, and `job_plan` in a single query. No new Supabase queries were written.

**Context fields displayed:**

- PM Schedule name (bilingual: `name_ar` / `name`) and code
- Job Plan name (bilingual) and code
- Scheduled date (locale-formatted)
- Compliance deadline (locale-formatted, highlighted in warning color)
- Checklist progress summary: "X of Y completed" + count of required-pending items
- Checklist progress bar
- Checklist rows: item label (bilingual), Required / Critical badge, check status icon, resolved value (bool/numeric/text)
- Clean empty state if no checks are linked

**Section does not appear on corrective work orders** — the mount condition is `isPreventiveWorkOrder(workOrder)`.

**Execution link:** An "Open PM Execution" / "فتح تنفيذ الصيانة" button is shown in the section header. Clicking it opens the existing `ExecutionDialog` from `src/components/maintenance/ExecutionDialog.tsx` with the full PM work order. The dialog state is managed in `WorkOrderDetailsPage`. This reuses the identical execution flow the maintenance page uses — no new dialog was built.

**i18n:** Inline `isRTL ? Arabic : English` pattern consistent with F1/F2. No new i18n key files modified.

**Remaining limitation:** The `ExecutionDialog` opens for execution (allows completing checks). If the work order's workflow status does not permit completion (e.g., it is already completed), the dialog will show the completed checklist read-only. This is correct behavior — no guard needed.

**Remaining risk:** `DEMO-WO-PM-001` must have seeded `work_order_checks` linked to it. The seed script calls `ensureWorkOrderChecks()` for this work order. Confirm the section renders 5 checks in the next browser rehearsal.

**Verification:** Build passes clean. Lint shows 0 new errors (4 pre-existing warnings in WorkOrderDetailsPage.tsx — ErrorBoundary, t, queryClient, any — all pre-existing).

### P1-F: Reports Bilingual Label Consistency — IMPLEMENTED 2026-04-28

**Target file:** `src/pages/reports/ReportsPage.tsx` only (346 lines). No chart library is used; the page is pure metric cards, ratio rows, and value pairs.

**Root cause audit:** Most strings in ReportsPage.tsx already followed the correct `isRTL ? Arabic : English` inline ternary pattern. Four specific spots leaked English regardless of locale:

1. **Preventive/Corrective hint (line 201):** `"... PM / ... corrective"` — both `"PM"` and `"corrective"` were hard-coded English with no Arabic branch.
2. **SLA row label (line 204-205):** `label={isRTL ? 'SLA met vs breached' : 'SLA Met vs Breached'}` — the Arabic branch contained English text instead of Arabic (`'التزام SLA مقابل الانتهاكات'`). This was the most visible bug: in Arabic locale the heading literally showed English.
3. **SLA hint (line 207):** `"... met / ... breached"` — both `"met"` and `"breached"` were hard-coded English with no Arabic branch.
4. **CSV export (lines 78-89):** All row headers were English-only regardless of locale.

**Fix applied:**

- **Preventive/Corrective hint:** Wrapped in `isRTL ? ... : ...` producing `وقائي / تصحيحي` in Arabic and `PM / corrective` in English.
- **SLA row label:** Fixed the Arabic branch from `'SLA met vs breached'` to `'التزام SLA مقابل الانتهاكات'`.
- **SLA hint:** Wrapped in `isRTL ? ... : ...` producing `محقق / منتهك` in Arabic and `met / breached` in English.
- **CSV export:** Replaced the single English row array with `isRTL ? [...Arabic rows...] : [...English rows...]`. Arabic headers: `المقياس / القيمة` with all 9 metric labels in Arabic. English headers unchanged.

**i18n approach:** Consistent with the existing page pattern — inline `isRTL ? ar : en` ternaries throughout ReportsPage.tsx. The `reports` i18n namespace in the locale JSON files was not expanded; the inline pattern is simpler and already established for this page.

**No changes to:** i18n JSON files, backend RPCs, chart config (no chart library on this page), data calculations, or any other component.

**Verification:** Build passes clean. `npx eslint src/pages/reports/ReportsPage.tsx` returns 0 errors, 0 warnings. `verify:demo-tenant` refused to run (requires DEMO_SEED_ALLOWED=true on staging — correct safety guard). `verify:pm-generation` failures are pre-existing HTTP 401 staging token issues unrelated to these changes.

**Manual browser verification steps:**

1. Switch locale to Arabic (AR). Open `/reports`. Confirm the "Operational Performance Summary" card shows `الوقائي مقابل التصحيحي` as the row label and the hint shows numbers with `وقائي` / `تصحيحي`.
2. Confirm the SLA row label shows `التزام SLA مقابل الانتهاكات` (not the old English `SLA met vs breached`).
3. Confirm the SLA hint shows `محقق` / `منتهك`.
4. Click "تصدير الملخص". Open the CSV. Confirm column A header is `المقياس` and all row labels are Arabic.
5. Switch to English locale. Confirm all labels are English. Export CSV. Confirm headers are `Metric / Value`.

### P2-B: Reports Decision Brief v1 — IMPLEMENTED 2026-04-28

**Target files:**

- `src/components/reports/ReportsDecisionBrief.tsx`
- `src/pages/reports/ReportsPage.tsx`
- `src/hooks/useReports.ts`

**Fix applied:**

- Added a lightweight Decision Brief section immediately below the Reports page header and before the existing metric cards.
- Renders 3-5 action cards when data supports them, each with signal title, current value, suggested action, and priority label: `Urgent / Medium / Monitor` or `عاجل / متوسط / متابعة`.
- Keeps the existing Reports layout intact. No chart redesign, no backend reporting RPC change, no migration, and no demo data change.

**Decision signal data sources:**

- **Overdue work:** `metrics.work_orders.overdue_open` from `useReportingFoundation()`.
- **Repeated issue:** `useWorkOrdersReport()` now exposes `topAssetDemand`, `topIssueType`, and `topLocationPressure` from existing work-order report data joined to assets, issue types, and buildings. For Noura Gardens this should surface AHU-3A or the Cooling category when the report hook loads.
- **PM compliance:** calculated in `ReportsPage.tsx` from `metrics.pm.schedules_active` and `metrics.pm.schedules_overdue`.
- **Inventory risk:** `useInventoryReport()` now exposes `lowStockItems`; falls back to `metrics.inventory.low_stock_items + metrics.inventory.out_of_stock_items` if item detail is not loaded yet. For Noura Gardens this should surface AHU Filter 20x24.
- **Workload/location pressure:** `useWorkOrdersReport().topLocationPressure`, counted from open work orders by building; falls back to aggregate open workload only when no location detail is available.

**Fallback behavior:** If no actionable signals are supported by available data, the section shows one neutral card: `No high operational risks detected` / `لا توجد مخاطر تشغيلية عالية حالياً`. It does not show fake asset, location, or stock names.

**i18n approach:** The component follows the Reports page pattern by receiving `isRTL` and `locale` from `ReportsPage.tsx` and using local Arabic/English labels. Tenant data names still display from `name_ar` when present, otherwise `name`.

**Verification notes:**

- `npm run build`: PASS.
- `npm run lint`: PASS with existing repository warning backlog (219 warnings, 0 errors).
- `npm run verify:demo-tenant`: blocked by the script safety guard: `Refusing to run. Set DEMO_SEED_ALLOWED=true for the approved staging/demo project.` This was not bypassed because Task 004-G must not modify demo data.
- `npm run verify:pm-generation`: attempted; still fails on staging HTTP 401 authorization checks. Reporter/technician denial checks pass. This is unrelated to the frontend Decision Brief change.

**Manual browser verification steps:**

1. Open `/reports` for Noura Gardens in Arabic. Confirm `ملخص القرار` appears directly below the Reports header and above the four metric cards.
2. Confirm cards use Arabic labels only: overdue work, repeated AHU-3A or Cooling demand, PM compliance, AHU Filter 20x24 low stock, and Palm Tower/location pressure when the report hooks finish loading.
3. Switch to English. Confirm the title changes to `Decision Brief` and priority labels are `Urgent`, `Medium`, or `Monitor`.
4. Confirm the existing metric cards, performance summary, cost/SLA card, and export button remain in their previous layout.
5. For a tenant with no operational risk data, confirm the neutral card appears instead of empty or fabricated signals.

---

## 6. P2 Backlog

These items improve the demo but do not block an external presentation now that P1 and P2-B are complete.

| ID | Item | Effort estimate | Notes |
|---|---|---|---|
| P2-A | Inventory indicator polish | Small | Show item name, current stock, reorder threshold in the dashboard/inventory indicator. |
| P2-B | Reports Decision Brief v1 | Done | Implemented in Task 004-G. |
| P2-C | Reports visual polish | Small–Medium | Spacing, label wrapping, and screenshot polish now that the Decision Brief layout is stable. |
| P2-D | Bilingual copy audit (all demo screens) | Medium | Broader bilingual audit beyond reports. Lower urgency if the presenter controls the locale. |

---

## 7. Suggested Next Coding Tasks (in order)

1. ~~**Fix asset list navigation** (P1-A)~~ — **DONE 2026-04-27.**
2. ~~**Fix completed work order notes rendering** (P1-D)~~ — **DONE 2026-04-27.** Verify seed data populates `technician_notes` for DEMO-WO-COMPLETE-001 in next browser rehearsal.
3. ~~**Add preventive/corrective badge and filter to work orders** (P1-C)~~ — **DONE 2026-04-28.**
4. ~~**Add PM context section to work order detail** (P1-E)~~ — **DONE 2026-04-28.**
5. ~~**Asset detail UX cleanup** (P1-B)~~ — **DONE 2026-04-27.** Verify PM schedules section shows linked schedule for DEMO-AHU-3A in next browser rehearsal.
6. ~~**Reports bilingual label consistency** (P1-F)~~ — **DONE 2026-04-28.**
7. ~~**Reports Decision Brief v1** (P2-B)~~ — **DONE 2026-04-28.**
8. **Inventory indicator polish** (P2-A) — show low-stock item detail where the current indicator is still weak.
9. **Reports visual polish** (P2-C) — spacing, label wrapping, and screenshot polish after P2-B.
10. **Full bilingual copy audit** (P2-D) — sweep after all structural changes are stable.

---

## 8. Final Recommendation

The Noura Gardens Compound Demo tenant is External Demo GO after Browser Rehearsal 2. The automated baseline is solid, the core workflow story is navigable, and Reports now end with a decision-oriented management brief.

Before the next external sales demo:

1. Re-run `verify:demo-tenant` only in the approved staging/demo context where `DEMO_SEED_ALLOWED=true` is intentionally set.
2. Complete a short browser pass on `/reports` in Arabic and English using the Decision Brief steps above.
3. Keep remaining P2 items limited to visual polish, inventory indicator polish, and broader bilingual audit.

Use the Decision Brief as the closing Reports moment: overdue work to escalate, AHU-3A or Cooling recurrence to investigate, PM compliance to monitor, low-stock AHU filter to restock, and workload/location pressure to rebalance.
