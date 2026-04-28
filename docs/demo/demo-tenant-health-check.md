# Demo Tenant Health Check

Status: planning and verification design  
Scope: staging/demo tenant readiness only  
Database posture: no production data changes, no destructive operations, no `supabase db push`

## 1. Executive Summary

The demo tenant is the controlled sales environment used to prove Mutqan's Pilot v1 story:

`Problem -> Location -> Asset -> Work Request -> Work Order -> Technician -> Evidence -> Approval -> Asset Memory -> Report -> Decision`

The tenant must be realistic enough for a buyer to understand the operational value, but isolated enough that no real customer-confidential data appears during a demo. The health check confirms that the tenant contains the right personas, data, workflow states, PM records, proof-of-work evidence, operation logs, and report signals before it is used in a sales or pilot conversation.

This document is a readiness checklist. It does not authorize production data edits, broad product changes, destructive database operations, or `supabase db push`.

## 2. Purpose of the Demo Tenant

The demo tenant exists to show Mutqan as an operational memory system, not a page tour.

It should prove that Mutqan can:

- Capture a reported maintenance problem as a controlled record.
- Connect that problem to the correct tenant, location, asset, team, and responsible user.
- Move a work order through the supported workflow without bypassing audited RPC paths.
- Preserve notes, timestamps, assignments, approvals, PM provenance, cancellation reasons, and operation logs.
- Show asset memory through completed and repeated work.
- Show management signals in reports that support a clear operational decision.

The demo tenant should be fictional or explicitly approved demo data. It must not contain sensitive personal, regulated, financial, patient, or real customer-confidential data unless approved for that exact demo.

## 3. Demo Story Alignment

The primary demo must follow one connected story:

| Story Beat | Demo Proof |
| --- | --- |
| Problem | A realistic issue is visible, such as a repeated HVAC fault, pump alarm, lighting issue, or unit maintenance request. |
| Location | The issue is tied to a clear hierarchy such as compound -> building -> floor -> unit, project -> site -> zone, or facility -> department -> room. |
| Asset | The affected asset exists, has useful metadata, and has active/completed work history. |
| Work Request | The issue is either represented by a seeded request/intake record or starts as a controlled work order. |
| Work Order | The work order has status, priority, due date, location, asset, reporter/creator context, and assignment context. |
| Technician | A technician persona can start or execute assigned work through the supported workflow. |
| Evidence | Notes, timestamps, checks, parts usage where available, and completion evidence where available are present. |
| Approval | At least one work order demonstrates supervisor approval, engineer review, reporter closure, or a rejection branch where supported. |
| Asset Memory | The asset detail or asset history view shows prior completed work and repeated demand. |
| Report | Reports load with operational signals, not empty dashboards. |
| Decision | The presenter can end with a management action: escalate overdue work, investigate repeated asset failure, adjust PM, rebalance workload, or review stock risk. |

## 4. Required Demo Tenant Data

| Data Area | Required State | Health Check |
| --- | --- | --- |
| Tenant profile | One realistic fictional facility, compound, hospital, school, warehouse, or multi-site maintenance tenant. | Tenant name, logo/branding where available, subscription/operational access, and tenant context are correct. |
| Users/personas | Active accounts for every required persona. | Each persona can log in or be represented by a stable demo account. |
| Roles | `tenant_admin`, `maintenance_manager`, `supervisor`, `engineer`, `technician`, and `reporter`. | Role permissions match the workflow actions used in the demo. |
| Locations | A small but believable hierarchy with at least one primary demo location. | Work orders and assets resolve to the same tenant and location path. |
| Assets | At least one critical/familiar asset for the main story, plus enough surrounding assets to make lists and reports credible. | The main asset has active work, completed work, and PM context. |
| Work orders | Seeded work orders across required statuses and the main story work order. | Status filters, detail pages, workflow actions, and logs are not empty. |
| PM schedules | At least one due schedule tied to the main asset and job plan/checklist. | Generation can produce a PM work order or a generated PM work order already exists for demo safety. |
| Inventory items | A small set of parts, including one low-stock item and one part suitable for work-order usage where enabled. | Inventory can support a parts-usage signal without overloading the demo. |
| Operation logs | Logs exist for create, assign, start, complete, approve/review/close, cancel, reject where demonstrated, and `pm_generate` for PM-generated work. | Work-order detail activity proves who did what and when. |
| Reports data | Enough open, overdue, completed, PM, repeated issue, workload, cancellation, and inventory data to avoid empty report screens. | `/reports` supports at least one credible management decision. |

## 5. Required Demo Personas

| Persona | Demo Role | Required Capability |
| --- | --- | --- |
| `tenant_admin` | Owns tenant setup and full administrative visibility. | Can validate tenant context and high-level access. |
| `maintenance_manager` | Main presenter account for most demos. | Can create, assign, cancel eligible work, review workload, generate/inspect PM where allowed, and open reports. |
| `supervisor` | Reviews field completion where supervisor approval is enabled. | Can approve or reject the supervisor-stage work order. |
| `engineer` | Performs technical review where engineer review is enabled. | Can review/approve or reject technical completion. |
| `technician` | Executes assigned work. | Can start work, enter notes/checks, use parts where available, and submit completion. |
| `reporter` | Represents requester/resident/customer contact. | Can create or be associated with requests and close/review reporter-closure work where configured. |

If live account switching is too slow, the demo can use one manager/admin account and explain which persona is being represented. Persona-specific login still needs to be verified before the demo.

## 6. Required Work-Order Scenarios

The demo tenant should contain at least one work order in each state below:

| Scenario | Purpose | Minimum Proof |
| --- | --- | --- |
| `pending` | New issue awaiting triage. | Can be assigned through `assign_work_order`. |
| `assigned` | Ownership established. | Assigned user/team visible and activity log records assignment. |
| `in_progress` | Technician has started work. | Start timestamp or operation log is visible. |
| `pending_supervisor_approval` | Field completion awaiting supervisor quality check. | Supervisor action is available to the right role. |
| `pending_engineer_review` | Technical review state. | Engineer action is available to the right role. |
| `pending_reporter_closure` | Reporter/customer closure state. | Closure action or final review path is visible where configured. |
| `completed` | Finished operational memory. | Completion notes, timestamps, approval history, and asset history are visible. |
| `cancelled` | User-visible cancellation path. | Cancellation reason, `cancelled_at`, and cancellation operation log exist. |
| PM-generated work order | Preventive maintenance story. | Work order has PM source fields and `pm_generate` operation log. |

At least one work order should be safe to use live during a demo. At least one backup work order should already be positioned at each approval/review state in case live actions are skipped.

## 7. Required PM Scenarios

| Scenario | Required State | Health Check |
| --- | --- | --- |
| Due PM schedule | A calendar PM schedule is due or within lead time. | Schedule is active, linked to the main asset, and references a job plan. |
| Generated PM work order | A PM work order exists or can be generated from the schedule. | Generated WO has `work_type = preventive`, source schedule/job plan context, pending status, and operation log. |
| PM execution with checks | PM work order has checklist rows from job plan items. | Technician can complete required checks through the PM execution dialog. |
| Completed PM work order | At least one PM work order is completed. | Reports and asset history can show PM generated/completed activity. |

PM generation should be verified through the existing `npm run verify:pm-generation` gate before being shown live. If live generation is not stable for the sales flow, use a prepared generated PM work order and explain the generation behavior conservatively.

## 8. Required Proof-of-Work Scenario

One main work order should demonstrate proof of work end to end.

Required evidence:

- Notes: technician notes and review/closure notes where applicable.
- Timestamps: created, assigned, started, technician-completed, approved/reviewed, closed/completed, or cancelled timestamps as relevant.
- Operation logs: lifecycle logs for create, assign, start, completion, approval/review, closure, cancellation, rejection where shown, and PM generation for preventive work.
- Parts usage if available: at least one consumed part tied to the work order and reflected in inventory or work-order parts data.
- Completion evidence if available: attachment/photo/check evidence where the current UI and tenant setup support it.

If attachments/photos are not demo-ready, do not overpromise them. Use notes, timestamps, checks, and operation logs as the proof-of-work baseline.

## 9. Required Reporting Signals

The demo should never end on an empty report page. The tenant should contain enough data for these signals:

| Signal | Demo Use |
| --- | --- |
| Overdue work | Manager can identify work that needs escalation. |
| Repeated asset issue | Manager can identify an asset or location generating recurring demand. |
| Workload by location | Manager can see where operational pressure is concentrated. |
| PM generated/completed | Manager can see preventive work is being created and completed. |
| Cancellation reason | Manager can see why work was cancelled and distinguish cancellation from deletion. |

Optional but useful signals if the data exists:

- Low-stock or consumed inventory.
- SLA response/resolution outcome.
- Workload by technician or team.
- Corrective versus preventive mix.
- Cost or actual duration where fields are populated accurately.

## 10. Demo Health Checklist

Run this checklist before using the tenant in a sales demo.

| Check | Required Result |
| --- | --- |
| Login works | Required demo accounts can sign in, or the presenter has a safe account-switching fallback. |
| Tenant context works | The tenant name, data, users, and records belong to the intended demo tenant. |
| Create work order works | Normal creation uses the audited `create_work_order` path and creates an operation log. |
| Assign work order works | Assignment uses the audited `assign_work_order` path and creates an assignment log. |
| Full workflow works | Start, complete, approve/review/close, and rejection branches work for the configured flow. |
| PM generation works | PM generation creates or confirms generated WOs, writes `pm_generate` logs, and is idempotent. |
| PM execution works | PM start/complete/check execution works for the intended technician persona. |
| Cancel works | Eligible work can be cancelled with a reason; direct hard delete remains unavailable to normal users. |
| Reports load | `/reports` opens and shows non-empty operational signals. |
| No sensitive real customer data | Names, phone numbers, emails, photos, attachments, locations, and notes are fictional or approved. |

## 11. Pre-Demo Verification Commands

Run these only against the approved staging/demo environment. `prepare:staging-fixtures` may write fixture data and must never be pointed at production.

Recommended order:

```powershell
npm run prepare:staging-fixtures
npm run verify:workflow-authority
npm run verify:workflow-full
npm run verify:workorder-create
npm run verify:workorder-assignment
npm run verify:workorder-cancel
npm run verify:workorder-autoclose
npm run verify:pm-generation
npm run verify:workflow-reject-branches
npm run build
npm run lint
```

Expected gate:

- All verification scripts pass.
- `npm run build` passes.
- `npm run lint` exits successfully. Existing warnings may be accepted only if they are already known and unchanged.
- Any fixture-consuming workflow script should be re-run only after `npm run prepare:staging-fixtures` if prior runs consumed staged work orders.

Do not run:

```powershell
supabase db push
```

`supabase db push` remains NO-GO until migration reconciliation is complete.

## 12. Gaps To Check Manually In Browser

Automated verification confirms backend authority and core workflow behavior. It does not prove the sales experience is polished. Before a demo, manually inspect:

| Browser Area | Manual Check |
| --- | --- |
| Dashboards | Cards, counts, filters, and empty states look credible for the demo tenant. |
| Reports page | Required reporting signals load and can support a final decision. |
| Asset detail page | Main asset shows identity, location, status/criticality where available, work history, and PM context. |
| Work order detail page | Status, assignment, notes, activity log, parts/evidence/checks, and action buttons are readable and role-appropriate. |
| PM execution dialog | Checklist items render, required checks behave correctly, notes/evidence controls are usable, and completion is clear. |
| Arabic/English rendering if applicable | Layout, labels, dates, directionality, and mixed-language data do not overlap or look broken. |

Also check that:

- No real customer names, contacts, attachments, addresses, or internal notes are visible.
- The main story can be completed without navigating into unstable settings/admin pages.
- The presenter has backup records ready for any step that should not be performed live.

## 13. Go/No-Go Criteria

Use the demo tenant only when all Go conditions are met.

Go:

- Required verification commands pass against the approved staging/demo target.
- The tenant contains all required personas, locations, assets, work-order states, PM scenarios, operation logs, and report signals.
- The main demo story can be completed in one connected path without relying on production data.
- Reports show at least one clear management decision.
- Manual browser inspection confirms key pages are readable and stable enough for sales use.
- No sensitive real customer data is visible.
- The presenter has a fallback for live generation, account switching, attachments/photos, and approval steps.

No-Go:

- Any required workflow, assignment, creation, cancellation, PM generation, build, or lint gate fails without an accepted explanation.
- The reports page is empty or cannot support a decision.
- PM generation or PM execution is unstable and no prepared generated PM work order exists.
- The demo requires `supabase db push`, destructive SQL, production data changes, or broad product changes.
- Sensitive or real customer-confidential data appears anywhere in the demo path.
- The tenant context is ambiguous or cross-tenant data appears.

## 14. Known Limitations

- Historical migrations `005` through `118` remain unresolved in the remote migration ledger and require Stage 2 evidence work.
- `supabase db push` remains NO-GO until migration reconciliation is complete and documented.
- Visual polish may still be incomplete, especially on dashboards, reports, detail pages, dialogs, and bilingual rendering.
- Browser checks are still required because backend verification does not prove demo pacing, visual clarity, or sales readiness.
- Auto-close is intentionally disabled for Pilot v1; reporter closure remains a manual workflow.
- Public portal, attachments/photos, inventory consumption, and role switching should be shown only if they are stable for the specific demo tenant.

## 15. Automated Demo Seed Script Recommendation

An automated demo seed script should be created later, after the manual health checklist stabilizes.

Recommended future task:

- Create an idempotent staging-only demo seed script that provisions one fictional tenant, required personas, locations, assets, PM schedules, job plans/checks, inventory items, work orders in every required status, operation logs, and report-supporting history.
- Add a read-only/demo-health verifier that checks the seed result without relying on broad destructive cleanup.
- Add environment guards so the script refuses to run unless the target is explicitly approved staging/demo.
- Keep fixture data fictional and reusable for sales demos.

Do not create this seed script until the team agrees on the final demo story records and browser gaps are known.

## 16. Final Recommendation

The demo tenant is recommended for sales use only after the automated verification suite is green and the browser health check confirms the complete story:

`Problem -> Location -> Asset -> Work Request -> Work Order -> Technician -> Evidence -> Approval -> Asset Memory -> Report -> Decision`

The immediate priority is not broad product expansion. The next step is to make one tenant reliably demoable: complete the data set, verify every role and workflow state, inspect the browser experience, and finish with a report-backed decision the buyer can understand.
