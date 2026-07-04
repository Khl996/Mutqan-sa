# Mutqan — Market & Adoption Readiness Audit

Audit date: 2026-07-04
Scope: repository state only (branch base: `main` @ 5af4587). No code, migrations, or data were changed.
Method: static audit of `src/`, `supabase/`, `api/`, `scripts/`, `docs/` — no runtime testing was performed in this session; runtime claims below rely on the repo's own verification evidence (README, QA checklists, verify scripts).

---

## 1. Current Product State

### Modules that exist

| Module | Where | State |
| --- | --- | --- |
| Dashboard | `src/pages/dashboard/DashboardPage.tsx`, `useDashboardStats.ts` | Working, but stats logic has drift risk (see §6) |
| Facilities (buildings/floors/departments/rooms) | `src/pages/facilities/` | Working |
| Assets (tree view, QR, activity logs, warranty) | `src/pages/assets/` (3 pages, 808-line list page) | Working |
| Work Orders (12-status lifecycle, approvals, parts, PDF) | `src/pages/work-orders/`, `src/config/workOrderStatus.ts`, RPCs 122–125 | Working — strongest module |
| Preventive Maintenance (job plans, schedules, generation engine, blackout windows, forecast) | `src/pages/maintenance/`, migrations 103–112 + 142–145 | Working but freshly rewritten (engine v2, migration 145 is source of truth) |
| Inventory (stock, low-stock alerts, consumption) | `src/pages/inventory/` | Working |
| Employees / Teams / Work Teams | `src/pages/teams/`, `work-teams/` | Working |
| Reports & KPIs | `src/pages/reports/ReportsPage.tsx`, `useReports.ts`, reporting foundation RPC (migrations 114/118/131) | Working — surprisingly strong |
| Public Portal (QR intake + tracking + reporter photo) | `src/pages/public/`, `supabase/functions/upload-report-photo` | Working, deployed to a real hospital tenant |
| Subscriptions / Billing (Tap payments, pricing engine) | `src/pages/subscriptions/`, `api/`, migrations 100–102, 113, 116 | Working on staging (runtime-verified per README) |
| Platform admin suite (10 pages) | `src/pages/platform/` | Working, internal-facing |
| Notifications (in-app + email edge functions) | migrations 056–060, 091, 115, 128, 130 | Working |
| WhatsApp copy-message (manual, no API) | `src/lib/whatsapp.ts` + `WorkOrderActions` | Working by design (deliberate no-API scope) |
| Per-WO PDF report with tenant branding | `src/utils/workOrderPdf.ts`, migration 135 | Working, one external dependency risk (font from GitHub CDN) |

### Flows that work end-to-end
- **Public intake → work order → assignment → technician execution → approval chain → closure → PDF** — this is Hospital Lite phases 1–7, QA'd 34/34 (`docs/hospital-lite-qa-checklist.md`) and live for a real tenant (migration 139).
- **PM schedule → generated work order → execution → completion** — verified by `verify:pm-generation` and smoke tests; the generation engine was rewritten in 142–145 and the UI MVP merged recently, so it is the *least aged* flow.
- **Registration → trial plan → Tap payment → subscription activation** — runtime-verified on staging including idempotency and webhook secret enforcement.

### Partial / demo-only / risky flows
- **PM engine v2 (anchor modes, blackout, forecast)**: applied to production, but migration 144 shipped with a generator bug fixed only by 145 — recent and thinly battle-tested.
- **Dashboard statistics**: `useDashboardStats.ts` hand-rolls REST calls and its own status buckets that disagree with the canonical model in `workOrderStatus.ts` (only `pending/assigned/in_progress` count as open; approval statuses are invisible; only `completed` counts as closed, not `auto_closed`). Dashboard numbers can visibly disagree with the work-orders list during a demo.
- **Legacy maintenance plans**: deprecated (see `docs/maintenance/pm-legacy-deprecation.md`); `/maintenance/plans/:id` now redirects, but legacy dialogs still ship in `src/components/maintenance/`.
- **Negative payment scenarios**: failed / mismatched Tap charges never proven (missing sandbox IDs — known item in README).
- **Announcements, Quotes, Platform Reports**: exist but are internal, low-polish surfaces.

### Strongest current demo path
The **Hospital Lite chain** is the strongest, most rehearsed, and most *real* demo:
QR portal intake (`/portal/:token`, with photo + location) → work order auto-created via SECURITY DEFINER RPC → assignment UI → technician mobile execution (RLS-scoped to assigned orders) → configurable supervisor/engineer/reporter approval → closure with frozen PDF snapshot → branded PDF + `/reports` KPI screen.
It is backed by a real deployed tenant, seeded fixtures, an RLS hardening pass, and a written demo playbook (`docs/demo/`). The advanced demo path (Site → Asset → PM Schedule → generated WO → parts → `/reports`) is documented in `docs/demo/sales-demo-flow.md` and is feasible with the Noura Gardens demo seed (`scripts/prepare-demo-tenant.ts`).

---

## 2. Mutqan Lite Readiness (5-minute demo)

| Step | Exists? | Working? | Needs improvement | Embarrassing risk | Key files |
| --- | --- | --- | --- | --- | --- |
| **Request / intake** | ✅ QR public portal, photo, location note, tracking token | ✅ live with a real hospital | Portal page is hard-coded Arabic/RTL only (`dir="rtl"`), unlike the bilingual rest of the app — fine for KSA, but inconsistent | Photo upload depends on `upload-report-photo` edge function being deployed; unknown token handled gracefully | `src/pages/public/PublicReportPage.tsx`, migrations 039/040/049/133 |
| **Work order creation** | ✅ RPC-only (`create_work_order`), direct INSERT disabled | ✅ verified (`verify:workorder-create`) | — | None found | migrations 122, 129; `useWorkOrders.ts` |
| **Assignment** | ✅ RPC (`assign_work_order`) + assignment panel for pending WOs | ✅ verified (`verify:workorder-assignment`) | Assignment UI is recent (commit 11bf3aa); rehearse it | Low | migration 123; `WorkOrderActions.tsx` |
| **Execution** | ✅ start/complete guarded by role + assignment RLS, parts consumption, notes, photos | ✅ verified incl. technician-only-assigned RLS | Mobile layout of `WorkOrderDetailsPage` should be rehearsed on an actual phone | iOS photo upload was recently fixed — re-verify before demo | migrations 121, 134; `WorkOrderActions.tsx`, `useWorkOrderWorkflow.ts` |
| **Approval / closure** | ✅ configurable supervisor approval → engineer review → reporter closure; technician reject | ✅ verified (`verify:workflow-full`, reject branches) | For a *Lite* demo, disable extra approval steps via tenant settings so the flow feels light | Showing all 12 statuses to a small customer feels heavy — filter chips mitigate this | `workOrderStatus.ts`, tenant settings `work_orders.*`, migration 087 |
| **Simple report** | ✅ per-WO branded PDF + `/reports` KPI page + CSV export | ✅ | PDF loads the Amiri Arabic font **from a GitHub CDN at render time** — a firewall or CDN hiccup breaks Arabic PDF generation mid-demo | **Yes — the font CDN is the single most likely live-demo failure**; also dashboard-vs-list count mismatch (above) | `src/utils/workOrderPdf.ts`, `WorkOrderPdfButton.tsx`, `ReportsPage.tsx` |

**Verdict:** the Lite 5-minute demo is real and supportable today. The two genuine embarrassment risks are (1) the remote font dependency in PDF generation and (2) dashboard stat drift. Both are small, non-migration fixes.

---

## 3. Advanced / Enterprise Readiness

| Area | Exists | Usable | Notes | Demo advice |
| --- | --- | --- | --- | --- |
| Assets | ✅ | ✅ | Tree + list, QR codes, details, activity logs, warranty fields | **Show** — open exactly one critical asset |
| Preventive maintenance | ✅ | ✅ (new engine) | Job plans + checklists + schedules + anchor modes + blackout windows + forecast; engine rewritten 142–145, UI MVP just merged | **Show carefully** — the forecast/blackout story is a differentiator, but rehearse; avoid legacy plan dialogs |
| Maintenance history | ✅ | ✅ | `operation_logs`, asset activity logs (033), PM generation audit (127), frozen PDF snapshots at closure | **Show** — this is national-guide gold |
| Approvals | ✅ | ✅ | Multi-step, per-tenant configurable, enforced in SQL (087, 120, 121) not just UI | **Show** in enterprise demo; simplify for Lite |
| Reports | ✅ | ✅ | Executive overview: open/overdue, PM compliance, SLA, preventive ratio, cost variance, stock risk, 30-day consumption | **Show — close every demo here** (matches `sales-demo-flow.md`) |
| KPIs | ✅ | ✅ | Reporting foundation RPC computes them server-side per tenant | Show |
| Tenant settings | ✅ | ✅ | Workflow toggles, portal settings, PDF identity/branding, module visibility page | Show briefly (branding upload is a nice trust moment) |
| Roles / permissions | ✅ | ✅ | 5 platform + 7 tenant roles, centralized matrix with unit tests; `custom_roles` tables locked deny-all pending RPC design | Show the role matrix conceptually, not the code |
| Exports | ✅ partial | ✅ | CSV summary (BOM-safe for Arabic Excel), per-WO PDF | Adequate; XLSX/scheduled reports missing — do not promise them |
| Inventory | ✅ | ✅ | Stock, consumption tied to WO closure, low-stock alerts | Show one part consumption only |
| Hide from demo | — | — | Platform admin suite (unless sponsor asks about multi-tenancy), subscription/billing pages, announcements/quotes, asset-logs page for small customers | — |

---

## 4. Modular Packaging Readiness

**Is there a feature-flag / tenant-module system?** Yes, and it is genuinely good:
- `tenants.enabled_modules` JSONB with per-module `enabled` + per-feature booleans.
- Frontend catalogue: `src/config/modules.ts` (`SYSTEM_MODULES`, `isModuleEnabled`, `isFeatureEnabled`, legacy plan-feature mapping).
- Plan → modules sync trigger `sync_tenant_modules_from_plan` (migrations 061, 089), deliberately bypassable by updating `enabled_modules` without touching `plan_id` (documented pattern, used by 132/139).

**Can modules be hidden from navigation?** Yes — `Sidebar.tsx` filters items by `isModuleEnabled` + `isFeatureEnabled` + permission.

**Are routes protected by module access?** Yes — `ModuleProtectedRoute` wraps every module route in `App.tsx`, fail-closed by default (waits for the modules query before deciding, so no false redirects).

**Gap:** packages are *not first-class*. "Lite" today is a hand-written JSONB blob in a per-tenant migration with a hard-coded UUID (132, 139). There is no named preset for Lite / Operations / Assets & PM / Compliance / Enterprise, so onboarding a new Lite customer requires writing SQL.

**Smallest safe model** (no schema change): define the five packages as rows in the existing `subscription_plans` with the right `features` arrays, and let the *existing* sync trigger materialize `enabled_modules` on plan assignment. A small shared constant (e.g. `PACKAGE_PRESETS` in `src/config/modules.ts` mirrored in a seed migration) keeps frontend labels and DB plans aligned. Per-tenant overrides remain possible via the documented bypass.

**Roles vs entitlements — current split is correct and should be kept:**
- *Tenant entitlements* (what the tenant bought/enabled): module + feature visibility — `enabled_modules`, plan features.
- *User roles* (what a person may do inside enabled modules): the permission matrix in `permissions.ts` + SQL-enforced authority (RPCs, RLS).
- Do **not** encode packaging in roles; do not let entitlements grant per-user authority. The codebase already respects this boundary.

---

## 5. National Guide Alignment Readiness

Existing building blocks that map to national-guide operational patterns (no schema expansion needed):

- **Maintenance records:** work orders with full status history in `operation_logs`, actor attribution, timestamps, and a frozen `pdf_snapshot` at closure (135) — a defensible "سجل صيانة".
- **PM plans:** job plans with checklist items, schedules with frequency/anchor mode, master templates with lock trigger, blackout windows (142) — maps directly to preventive-maintenance program requirements.
- **KPI reporting:** server-side reporting foundation RPC (114/118/131).
- **Work order history:** per-asset activity logs + PM work-order history table (RLS-scoped in 9e55fe3).
- **Evidence / photos / attachments:** reporter photo at intake, execution photos (111), tenant-scoped storage buckets with folder-level RLS.
- **Approvals:** configurable multi-step approval chain enforced in SQL.
- **Audit trail:** `operation_logs`, `pm_generation_audit` (127), platform audit logs (031, 091).
- **Reporting / export:** branded WO PDF + CSV executive summary.

**Recommended 6 KPIs computable from current or near-current data** (all already computed or one derivation away in `useReports.ts` / the foundation RPC):

1. **Work order backlog** — open work orders (already computed).
2. **Overdue rate** — overdue open ÷ open (both fields exist).
3. **Mean time to completion** — `avg_completion_hours` (exists).
4. **PM compliance %** — (active − overdue schedules) ÷ active (already on `/reports`).
5. **Preventive-to-corrective ratio** — `preventive_ratio` (exists) — the single most national-guide-resonant number.
6. **SLA met rate** — met ÷ (met + breached) (exists).
7. *(optional 7th)* **First-time completion rate** — completed without `rejected_by_technician`/rework transitions, derivable from `operation_logs` with a query, no schema change.

Alignment work this month should be **language, not schema**: rename/echo the guide's terminology in `/reports` labels, the PDF header, and the demo script — with no claims of official approval or certification.

---

## 6. UI/UX Demo Audit (demo-visible screens only, from code review)

| Screen | Classification | Notes |
| --- | --- | --- |
| Public portal `/portal/:token` | **Ready for serious demo** | Mobile-first, Arabic, photo + location; hard-coded AR-only is acceptable for the current market |
| Tracking `/track/:token` | Ready | Simple status timeline for reporters |
| Work orders list | Ready | Canonical filter chips (open/in-progress/approval/overdue/closed), bilingual labels |
| Work order details + actions | Ready / needs mobile rehearsal | Role-aware actions, parts selector, WhatsApp copy, PDF button; rehearse technician flow on a real phone |
| Reports `/reports` | **Ready — best closing screen** | Executive framing, decision briefs, entitlement-aware empty state, CSV export |
| Dashboard | **Needs polish** | Stats hook diverges from canonical status model (approval statuses uncounted; `auto_closed` not "closed"; raw `fetch` + localStorage token parsing). Numbers may contradict the WO list in front of a customer |
| Maintenance/PM | Needs polish | New engine UI just merged; legacy plan components still reachable in code; rehearse and keep to the job-plan → schedule → generated-WO path |
| Assets | Ready | Tree + details is a strong enterprise visual |
| Inventory | Ready (show briefly) | |
| Teams / Work teams | Ready (show briefly) | |
| Settings → Modules | Show only to enterprise/sponsor | Proves modularity; too "admin" for small customers |
| Tenant settings (PDF identity) | Ready | Logo upload + branded PDF is a trust builder |
| Platform suite (`/platform/*`) | **Hide from customer demos** | Internal ops; only show to a sponsor asking about multi-tenant governance |
| Landing / About / Contact | Needs polish (per existing `docs/marketing/landing-page-refresh-plan.md`) | Not part of the product demo path |
| Embarrassing if shown | — | Legacy maintenance-plan dialogs; a dashboard whose counts disagree with the list; a PDF failing because the font CDN is blocked |

Cross-cutting: RTL is set globally (`document.documentElement.dir`), Cairo/Inter fonts, `sonner` toasts RTL-aware, progressive disclosure exists via module/feature flags. i18n is a **hybrid** — `react-i18next` keys plus many inline `isRTL ? 'عربي' : 'English'` ternaries; workable, but a consistency sweep is a later item, not this month.

---

## 7. Database / Migration / Portability Audit

**Structure:** 153 files in `supabase/migrations/`, sequential numeric prefixes, well-commented headers (recent ones exemplary — 144's header documents its own bug and supersession).

**Findings, in order of what would worry a serious technical partner:**

1. **The remote migration ledger does not match the files — and this is documented as unresolved.** `docs/ops/supabase-migration-reconciliation-plan.md`: migrations 005–118 are unresolved in the remote ledger; several security migrations were applied via targeted SQL, not `supabase db push`; push is declared **NO-GO**. Root-level artifacts (`remote-migration-list*.txt`, `remote-ledger-sql.txt`, `local-migrations.txt`) confirm the drift history. A partner's due-diligence question — "can you rebuild the database from your migrations?" — currently gets an honest **no**.
2. **Duplicate numeric prefixes:** `060`, `090`, `095`, `098` each appear twice, `136` three times (a1/a2/a3). Deterministic ordering on a fresh apply is not guaranteed.
3. **Non-migration files inside the migrations directory:** `smoke_test_108.sql`, `smoke_test_109_phase1_1.sql`.
4. **Tenant-specific data migrations** (132, 138, 139 hard-code customer UUIDs) live in the same stream as schema migrations — harmless but noisy for portability.
5. **Repo-root debris committed:** `build_error.log`, `changes.txt/2/3`, migration-list dumps. Cosmetic, but it is the first thing a reviewer sees.
6. **Verification tooling is Windows-only:** all `verify:*` gates are PowerShell, tied to the founder's machine.

**What is genuinely strong (say this to partners):**
- RLS posture is well above typical seed-stage: dedicated hardening waves (076–091, 113–130, 136–137, 140–141), deny-all on custom-role tables, RESTRICTIVE technician policy, direct INSERT/DELETE on work orders disabled in favor of SECURITY DEFINER RPCs, and a **runtime** isolation verifier with 118 passing checks across 7 role personas.
- Seed/demo data is idempotent, fixed-UUID, service-role-guarded with explicit confirmation strings (`prepare-demo-tenant.ts`), and documented (`docs/demo/demo-tenant-seed-plan.md`).
- Security decision records exist (`docs/security/rls-role-matrix.md`, `rls-rpc-authority-matrix.md`).

**Must fix before external *technical* demos** (product demos are fine today): a written, honest migration-baseline story — either finish ledger repair or declare an explicit baseline ("schema as of migration 145 = baseline; file history is archival"), plus removing smoke tests/debris from the migration path. **Can wait:** full 005–118 reconciliation, cross-platform verify scripts, renaming duplicate prefixes (renaming applied migrations has its own risks — a baseline statement is safer than renames).

---

## 8. Key-Man / Continuity Risk

"What happens if the founder disappears?" — current answer is **better than most solo-founder projects but not yet professional-grade**.

Present and good: append-only work journal, session handoff doc (`ai-handoff.md`), CONSTITUTION (locked decisions), roadmaps with completed-phase logs, security matrices, demo playbooks, QA checklists, seed scripts, 28 unit tests, README with verification procedure.

Missing (the gaps a due-diligence reviewer hits in the first hour):
- **No `.env.example`** — the full set of required environment variables (Supabase, Tap, webhook secrets, cron secret, staging fixtures) exists only in Vercel/Supabase dashboards and the founder's head.
- **No local setup guide** — README explains how to *verify* a running system, not how to stand one up from zero (install → env → migrations state caveat → seed → run).
- **No single ARCHITECTURE.md** — the frontend/api/Supabase/edge-function/Vercel topology must be reverse-engineered from `vite.config.ts`, `vercel.json`, and `api/`.
- **No edge-function & cron deployment notes** (which functions, which secrets, which schedule hits `api/check-subscriptions` / `pm-generate-wos`).
- The honest migration-state statement (§7) is itself a continuity document.

**Smallest professional documentation set (5 files, ~1–2 days):**
1. `.env.example` with every variable named and one-line purpose (no values).
2. `docs/SETUP.md` — zero-to-running-locally + zero-to-new-staging, including the migration-state caveat.
3. `docs/ARCHITECTURE.md` — one page + one diagram: React SPA → Supabase (Postgres/RLS/RPCs/storage/edge functions) + Vercel serverless payment/cron API.
4. `docs/ops/database-state.md` — the baseline declaration: which migrations are authoritative, how drift happened, how to rebuild.
5. Keep the work journal + handoff discipline (already the decision log the AI-Office plan asks for — formalize it as such rather than adding a new system).

---

## 9. Gap Matrix

| Area | Current status | Gap | Importance | Effort | Risk | Recommended action | This month? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lite demo flow | Complete, live with real tenant | Rehearsal + small polish only | High | Low | Low | Rehearse scripted 5-min demo on seeded tenant, phone in hand | **Yes** |
| WO PDF font | Works | Amiri loaded from GitHub CDN at runtime | High (demo-failure mode) | Low | Low | Bundle font locally in `src/assets` | **Yes** |
| Dashboard stats | Works but drifts | Hand-rolled counts disagree with canonical status model | High (credibility) | Low–Med | Low | Rewrite `useDashboardStats` on `STATUS_GROUPS` via supabase client | **Yes** |
| Package presets | Per-tenant SQL blobs | No named Lite/Ops/Assets&PM/Compliance/Enterprise presets | High (sellability) | Med | Low | Seed 5 plans with feature arrays; reuse existing sync trigger | **Yes** |
| Migration ledger | Drifted, documented, push NO-GO | Cannot rebuild DB from files | High (defensibility) | Med (doc) / High (full repair) | Med | Write baseline declaration doc now; defer full repair | **Yes (doc only)** |
| Migrations dir hygiene | Duplicates + smoke tests + root debris | Messy first impression | Med | Low | Low | Move smoke tests to `supabase/tests/`, delete root debris, freeze numbering policy | **Yes** |
| Continuity docs | Partial | No .env.example / SETUP / ARCHITECTURE | High (sponsor question) | Low | Low | 5-file pack (§8) | **Yes** |
| National-guide language | KPIs exist | Labels/PDF not aligned to guide terminology | Med–High | Low | Low | Terminology pass on `/reports`, PDF header, demo script (no approval claims) | **Yes** |
| Public portal bilingual | AR-only hardcoded | EN missing on portal | Low (KSA market) | Med | Low | Accept AR-only for now; note as roadmap | No |
| PM engine v2 confidence | Applied, bug fixed in 145 | Thin production mileage | Med | Low | Med | Run `verify:pm-generation` + forecast rehearsal before any PM demo | **Yes (verify only)** |
| Negative payment proofs | Skipped | Missing sandbox charge IDs | Med | Low (needs founder) | Low | Generate failed + mismatched Tap charges, re-run verifier | Yes (founder task) |
| Verify scripts portability | PowerShell-only | Machine lock-in | Med | Med | Low | Port to Node/TS later | No |
| i18n consistency | Hybrid keys + ternaries | Inconsistent mechanism | Low | High | Low | Defer | No |
| Custom roles | Tables locked deny-all | No custom-role feature | Low | High | Med | Defer; sell the 7 fixed roles | No |
| XLSX / scheduled reports | Missing | CSV+PDF only | Low | Med | Low | Defer; don't promise | No |
| Base UI migration | Explicitly out of scope | — | — | — | — | Do not touch (per constraint) | No |

---

## 10. Recommended 2-Week Execution Plan (ranked)

**1. Demo hardening sprint — Lite path rehearsal + fixtures**
- *Objective:* the 5-minute Lite demo runs flawlessly twice in a row on the seeded demo tenant, including phone-based technician step.
- *Why:* the demo is the product to every buyer segment this month.
- *Files:* none (uses `scripts/prepare-demo-tenant.ts`, `supabase/fixtures/`, `docs/demo/*`). Migration: **no**. UI: **no**. Risk: **low**.
- *Acceptance:* checklist run recorded in `docs/demo/demo-browser-rehearsal-report.md`; zero mid-demo surprises.

**2. Bundle the Arabic PDF font locally**
- *Objective:* WO PDF generation has zero runtime network dependencies.
- *Why:* removes the most likely live-demo failure.
- *Files:* `src/utils/workOrderPdf.ts`, new font asset under `src/assets/`. Migration: **no**. UI: **no**. Risk: **low**.
- *Acceptance:* PDF generates with DevTools offline/network-blocked except Supabase.

**3. Align dashboard stats with the canonical status model**
- *Objective:* dashboard counts always equal the work-orders list counts.
- *Why:* a customer noticing contradictory numbers destroys trust in every other KPI.
- *Files:* `src/hooks/useDashboardStats.ts` (use `STATUS_GROUPS` + supabase client instead of raw fetch). Migration: **no**. UI: **minor**. Risk: **low**.
- *Acceptance:* for the demo tenant, dashboard open/overdue/closed = list filter counts for every group.

**4. Package presets: Lite / Operations / Assets & PM / Compliance / Enterprise**
- *Objective:* onboarding a customer at any tier = assigning a plan, not writing SQL.
- *Why:* this is the "one modular product, multiple entry points" claim made real and demoable to sponsors.
- *Files:* one seed migration for `subscription_plans.features`; optional `PACKAGE_PRESETS` constant in `src/config/modules.ts`; touchpoint in platform tenant management. Migration: **yes (small, data-only)**. UI: **minor**. Risk: **low–med** (test that the sync trigger output matches the hand-written 132/139 blobs).
- *Acceptance:* assigning the "Lite" plan to a fresh tenant reproduces exactly the module set of migration 139; switching plans switches sidebar/routes with no code change.

**5. Database state & continuity documentation pack**
- *Objective:* answer "rebuild from zero" and "founder disappears" questions in writing.
- *Why:* first due-diligence questions from any enterprise/government party.
- *Files:* `.env.example`, `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `docs/ops/database-state.md` (baseline declaration). Migration: **no**. UI: **no**. Risk: **low**.
- *Acceptance:* a developer who has never seen the repo can describe the architecture and start the frontend against staging using only the docs.

**6. Migrations directory hygiene**
- *Objective:* clean, deterministic migrations directory and repo root.
- *Why:* it is the first folder a technical partner opens.
- *Files:* move `smoke_test_*.sql` out of `supabase/migrations/`; delete `build_error.log`, `changes*.txt`, stale root dumps (or move to `docs/ops/archive/`); add numbering policy note. Migration: **no (file moves only — do not rename applied migrations)**. UI: **no**. Risk: **low**.
- *Acceptance:* `supabase/migrations/` contains only ordered product migrations; repo root contains only project files.

**7. National-guide terminology pass on reporting surfaces**
- *Objective:* `/reports` labels, PDF header sections, and the demo script use national-guide-aligned Arabic operational vocabulary (سجل الصيانة، الصيانة الوقائية، أوامر العمل، مؤشرات الأداء).
- *Why:* alignment credibility with government/semi-government audiences at near-zero engineering cost — with **no** approval/certification claims.
- *Files:* `src/pages/reports/ReportsPage.tsx`, report components, `src/utils/workOrderPdf.ts`, `src/i18n/locales/*`, `docs/demo/sales-demo-scenario-ar.md`. Migration: **no**. UI: **strings only**. Risk: **low**.
- *Acceptance:* a reviewer familiar with the guide recognizes the vocabulary in the KPI screen and the closed-WO PDF; wording reviewed to contain no official-status claims.

**8. PM engine confidence check (verify-only, no changes)**
- *Objective:* documented green run of `verify:pm-generation` + a forecast/blackout rehearsal against staging on current code (post-145).
- *Why:* the engine is the newest code on the enterprise demo path.
- *Files:* none. Migration: **no**. UI: **no**. Risk: **low**.
- *Acceptance:* verification output stored in `stage1-verification-logs/` or `docs/ops/`; PM segment added to the demo script only after green.

Explicitly **not** this month (per constraints and this audit): Base UI migration, full i18n refactor, full migration-ledger replay, WhatsApp API, custom roles, XLSX/scheduled exports, AI agents/automation, digitizing national-guide documents.

---

### Bottom line

Mutqan is closer to "credible and sellable" than the repo's own modest README suggests. The Lite flow is real, deployed, RLS-hardened, and demoable today; the module/entitlement system needed for packaging already exists and only lacks named presets; the KPI layer already computes the numbers a national-guide-aligned pitch needs. The two things that would actually hurt in front of a serious external party are both fixable without building features: **demo-path fragility** (font CDN, dashboard drift, rehearsal) and **the migration/continuity story** (baseline declaration + a 5-file docs pack). The 2-week plan above addresses exactly those, with one small data-only migration (package presets) as the only schema-adjacent work.
