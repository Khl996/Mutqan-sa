# Demo Tenant Seed Plan

Status: implementation plan with guarded plan/verify/foundation write script  
Scope: staging/demo readiness only  
Hard rules: no production data changes, no destructive SQL, no production migrations, no `supabase db push`

## 1. Executive Summary

The existing staging fixtures are strong backend/security fixtures, but they should not be used as the primary sales demo tenant. They are intentionally named as fixtures, are reset and consumed by verification scripts, and contain just enough data to prove authority, RLS, work-order workflow, cancellation, PM generation, and notification behavior.

The recommended strategy is to create a separate fictional demo tenant with stable, presentation-ready records. Existing staging fixtures should remain the security gate. The demo tenant should be seeded separately, with strict staging-only guards, deterministic codes, idempotent upserts where possible, and no automatic destructive cleanup.

The guarded script at `scripts/prepare-demo-tenant.ts` refuses to run unless `DEMO_SEED_ALLOWED=true` and the Supabase URL points to the approved staging/demo project. `DEMO_SEED_MODE=plan` prints the planned record manifest, `DEMO_SEED_MODE=verify` performs read-only service-role verification, and `DEMO_SEED_MODE=write-foundation` performs the Phase 2 idempotent foundational seed only after the extra `DEMO_SEED_CONFIRM=NOURA_GARDENS_FOUNDATION` confirmation is set.

## 2. Inspection Summary

Inspected files:

- `scripts/prepare-staging-fixtures.ts`
- `scripts/verify-workflow-authority.ps1`
- `scripts/verify-workflow-full.ps1`
- `scripts/verify-workflow-reject-branches.ps1`
- `scripts/verify-workorder-create.ps1`
- `scripts/verify-workorder-assignment.ps1`
- `scripts/verify-workorder-cancel.ps1`
- `scripts/verify-workorder-autoclose.ps1`
- `scripts/verify-pm-generation.ps1`
- `docs/demo/demo-tenant-health-check.md`
- `docs/strategy/demo-story-script.md`
- `docs/strategy/pilot-v1-scope.md`
- Relevant migration/schema files for tenants, profiles, locations, assets, work orders, PM, inventory, operation logs, and reporting.

Relevant tables/functions confirmed from migrations:

- Tenant and users: `tenants`, `profiles`, `teams`, `team_members`
- Locations: `buildings`, `floors`, `departments`, `rooms`
- Assets: `asset_categories`, `assets`
- Work orders: `work_orders`, `work_order_parts`, `operation_logs`, `work_order_costs`
- PM: `job_plans`, `job_plan_items`, `pm_schedules`, `pm_schedule_assets`, `work_order_assets`, `work_order_checks`, `work_order_attachments`, `pm_generation_runs`
- Inventory: `inventory_items`, `inventory_transactions`
- Reporting: `get_tenant_reporting_foundation(uuid)`

## 3. Existing Fixtures Reuse Decision

Verdict: do not use the existing RLS/staging fixtures as the main sales demo tenant.

| Question | Answer |
| --- | --- |
| Can existing fixtures be reused directly? | No, not as the main sales demo tenant. They are verification fixtures, not presentation data. |
| Can existing fixtures support demo readiness? | Yes. They should remain the security and workflow regression gate before demos. |
| Should a separate demo tenant be created? | Yes. Use a stable fictional tenant so tests can continue consuming/resetting fixture data independently. |

Why the existing fixtures are not enough:

- Tenant names are explicitly `Mutqan Fixture Tenant A/B`.
- Records use `FX-*` codes and disposable names.
- Verification scripts consume or reset work orders.
- PM generation verifier removes generated PM work orders and `pm_generation_runs`.
- The location hierarchy has only a shallow building-level setup.
- The data set is too thin for sales reporting, repeated issue analysis, workload by location, and browser polish.
- Some seeded states are inserted directly for fixture reset, which is acceptable for test setup but should not be the normal demo story path.

What can be reused:

- The account/persona pattern.
- Deterministic IDs/codes.
- Missing-column tolerant upsert helper pattern.
- Explicit environment loading from `.env.local`.
- Guarded use of service-role access in staging scripts.
- Existing verification commands as pre-demo gates.

## 4. Data Already Available In Existing Fixtures

The current `prepare-staging-fixtures.ts` provides:

| Area | Existing Fixture Data |
| --- | --- |
| Tenants | Tenant A and Tenant B for tenant isolation. |
| Users/personas | Platform admin, tenant admin, maintenance manager, supervisor, engineer, technician, reporter, tenant B user, inactive technician. |
| Teams | Tenant A HVAC team and Tenant B mechanical team. |
| Locations | One building per tenant. |
| Assets | Tenant A AHU and Tenant B pump. |
| Inventory | Tenant A air filter low-stock item and Tenant B pump seal. |
| PM | Tenant A and B job plans, a PM generation test plan, job plan items, and due generation schedule. |
| Work orders | Assigned, unassigned, tenant B isolation, reactive lifecycle, rejectable, and approval/rejection branch work orders. |
| Verification env | `.env.staging-fixtures.local` with JWTs and deterministic IDs. |

These are excellent for proving backend authority. They are not presentation-ready.

## 5. Missing Demo Data

A credible sales demo still needs:

- A separate fictional tenant with a believable name, sector, contact profile, and enabled modules.
- Clean persona display names and stable demo credentials.
- A deeper location hierarchy: building, floor, department/zone, room/unit/mechanical space.
- Multiple related assets around the main story, not only one AHU.
- Work orders in every required state, with presentation-friendly titles and descriptions.
- Persistent completed and cancelled work orders that are not removed by verification scripts.
- Operation logs for every record shown in the demo path.
- A PM-generated work order that can remain available as a backup if live generation is skipped.
- PM job plan checks that look like realistic field work.
- Inventory items that support low-stock and parts-consumption reporting.
- Enough historical work order data for overdue work, repeated asset issue, workload by location, PM generated/completed, cancellation reason, and cost/SLA signals.
- Browser-reviewed Arabic/English labels where applicable.
- Optional attachments/photos only after the UI and storage path are verified.

## 6. Recommended Demo Tenant

Recommended fictional tenant:

| Field | Recommendation |
| --- | --- |
| Tenant name | Noura Gardens Compound Demo |
| Slug | `noura-gardens-demo` |
| Sector | Residential compound and facility management |
| Positioning | A controlled multi-building facility with recurring HVAC complaints and planned maintenance needs. |
| Primary audience fit | Facility management companies, compounds, multi-site maintenance operators. |
| Main operational problem | Repeated cooling issue in one residential building zone. |
| Demo decision | Investigate repeated AHU filter/coil issues, adjust PM frequency, and restock low inventory. |

Recommended location hierarchy:

| Level | Demo Record |
| --- | --- |
| Facility/site | Noura Gardens Compound |
| Building | Palm Tower |
| Floor | Floor 3 |
| Department/zone | Residential Zone A |
| Room/unit | Unit 305 |
| Mechanical area | Mechanical Room 3A |

Recommended main asset story:

- Asset: `DEMO-AHU-3A`
- Name: AHU-3A, Palm Tower Floor 3
- Category: HVAC
- Criticality: critical
- Location: Palm Tower -> Floor 3 -> Mechanical Room 3A
- Story: Repeated cooling complaints from Unit 305 are traced to AHU-3A filter and airflow issues.

Recommended main work-order story:

- A reporter logs a cooling complaint for Unit 305.
- The maintenance manager assigns the work to the HVAC technician/team.
- The technician starts work, replaces a clogged filter, records notes, uses one part, and submits completion.
- Supervisor and engineer review the evidence where enabled.
- Reporter closure confirms the issue is resolved.
- The work becomes asset memory for AHU-3A.

Recommended PM story:

- A monthly AHU inspection schedule is due for AHU-3A.
- PM generation creates a preventive work order with checklist rows.
- The technician completes checks for filter condition, coil cleanliness, belt condition, and temperature delta.
- The completed PM contributes to PM generated/completed signals and supports the decision to adjust PM frequency.

Recommended reporting decision story:

- Reports show overdue corrective work, repeated AHU-3A issues, workload concentrated in Palm Tower, PM generated/completed activity, a cancelled duplicate request, and low stock for AHU filters.
- The manager decides to increase AHU-3A PM frequency temporarily, restock filters, and monitor whether corrective complaints drop.

## 7. Exact Demo Records Needed

Use deterministic codes and idempotent upserts keyed by `tenant_id + code` or unique slugs where possible.

### 7.1 Users And Personas

| Persona | Suggested Email | Role |
| --- | --- | --- |
| Tenant admin | `demo.admin@noura-gardens.mutqan.test` | `tenant_admin` |
| Maintenance manager | `demo.manager@noura-gardens.mutqan.test` | `maintenance_manager` |
| Supervisor | `demo.supervisor@noura-gardens.mutqan.test` | `supervisor` |
| Engineer | `demo.engineer@noura-gardens.mutqan.test` | `engineer` |
| Technician | `demo.technician@noura-gardens.mutqan.test` | `technician` |
| Reporter | `demo.reporter@noura-gardens.mutqan.test` | `reporter` |

Recommended team:

| Code | Name | Members |
| --- | --- | --- |
| `DEMO-HVAC-TEAM` | HVAC Response Team | Technician, engineer, supervisor |

### 7.2 Locations

| Table | Code | Name |
| --- | --- | --- |
| `buildings` | `DEMO-PALM-TOWER` | Palm Tower |
| `floors` | `DEMO-FLOOR-03` | Floor 3 |
| `departments` | `DEMO-ZONE-A` | Residential Zone A |
| `rooms` | `DEMO-UNIT-305` | Unit 305 |
| `rooms` | `DEMO-MECH-3A` | Mechanical Room 3A |
| `buildings` | `DEMO-SERVICE-BLOCK` | Service Block |
| `floors` | `DEMO-SERVICE-G` | Ground Service Level |

### 7.3 Assets

| Code | Name | Purpose |
| --- | --- | --- |
| `DEMO-AHU-3A` | AHU-3A, Palm Tower Floor 3 | Main story asset. |
| `DEMO-FCU-305` | FCU, Unit 305 | Related unit asset. |
| `DEMO-PUMP-01` | Booster Pump 01 | Supporting mechanical asset. |
| `DEMO-GEN-01` | Standby Generator 01 | Supporting critical asset for reports. |
| `DEMO-LTG-LOBBY` | Lobby Lighting Circuit | Supporting work-order variety. |

### 7.4 Inventory Items

| Code | Name | Demo Signal |
| --- | --- | --- |
| `DEMO-FILTER-AHU-20X24` | AHU Filter 20x24 | Low stock and parts usage. |
| `DEMO-BELT-SPA-1250` | AHU Drive Belt SPA-1250 | PM spare part. |
| `DEMO-FLOAT-SWITCH` | Condensate Float Switch | Corrective spare. |
| `DEMO-LAMP-LED-18W` | LED Lamp 18W | Supporting work order. |

### 7.5 Work Orders

| Code | Status | Purpose |
| --- | --- | --- |
| `DEMO-WO-PENDING-001` | `pending` | New lobby lighting request awaiting triage. |
| `DEMO-WO-ASSIGNED-001` | `assigned` | Main cooling complaint ready for technician start. |
| `DEMO-WO-INPROG-001` | `in_progress` | Backup in-progress cooling work. |
| `DEMO-WO-SUP-001` | `pending_supervisor_approval` | Field completion awaiting supervisor approval. |
| `DEMO-WO-ENG-001` | `pending_engineer_review` | Technical review backup. |
| `DEMO-WO-REPORTER-001` | `pending_reporter_closure` | Reporter closure backup. |
| `DEMO-WO-COMPLETE-001` | `completed` | Completed AHU filter replacement and airflow restoration. |
| `DEMO-WO-CANCEL-001` | `cancelled` | Duplicate cooling request cancelled with reason. |
| `DEMO-WO-PM-001` | `pending` or `completed` | PM-generated AHU monthly inspection. |

Additional report-supporting history:

- 2 to 3 completed corrective work orders on `DEMO-AHU-3A` over the last 30 to 60 days.
- 1 overdue open work order in Palm Tower.
- 1 completed late work order with `sla_resolution_met = false`.
- 1 completed on-time work order with `sla_resolution_met = true`.
- 1 cancelled duplicate or out-of-scope request with `cancellation_reason`.

### 7.6 PM Schedule, Job Plan, And Checks

| Record | Code | Required Content |
| --- | --- | --- |
| Job plan | `DEMO-JP-AHU-MONTHLY` | Monthly AHU inspection. |
| Job plan item | `sort_order=10` | Safety isolation confirmed, yes/no, required. |
| Job plan item | `sort_order=20` | Filter condition, pass/fail, required. |
| Job plan item | `sort_order=30` | Coil cleanliness, pass/fail. |
| Job plan item | `sort_order=40` | Belt condition, pass/fail. |
| Job plan item | `sort_order=50` | Supply air temperature, numeric, unit C. |
| PM schedule | `DEMO-PM-AHU-3A-MONTHLY` | Active calendar schedule due today or within lead time. |
| PM schedule asset | linked | `DEMO-AHU-3A`. |
| Generated WO checks | generated | One `work_order_checks` row per non-header job plan item. |

### 7.7 Operation Logs

Every demo work order shown should have logs appropriate to its status:

- `create`
- `assignment`
- `status_change` for start/complete/approval/close where applicable
- `cancellation`
- `pm_generate` for PM-generated work

Do not make `create_operation_log` directly callable from demo scripts. Either use approved workflow RPCs for live transitions or seed operation logs only through service-role fixture logic in a staging-only script after the team accepts the seed design.

### 7.8 Report-Supporting Records

The reporting RPC currently derives core signals from:

- `work_orders.status`, `work_orders.due_date`, `work_orders.completed_at`
- `work_orders.work_type`, `work_orders.source_schedule_id`
- `work_orders.sla_resolution_met`
- `work_orders.estimated_cost`, `work_orders.actual_cost`
- `work_order_costs.total_cost`
- `assets.status`, `assets.criticality`
- `inventory_items.quantity`, `inventory_items.min_quantity`, `inventory_items.unit_cost`
- `inventory_transactions.transaction_type`, `quantity`, `created_at`
- `pm_schedules.status`, `next_due_date`

The seed should intentionally populate those fields so `/reports` has visible signals.

## 8. Script Strategy Decision

| Option | Description | Pros | Cons | Decision |
| --- | --- | --- | --- | --- |
| A | Extend `prepare-staging-fixtures.ts`. | Reuses existing helpers and env flow. | Mixes sales demo data with destructive/consuming security fixtures. Higher risk of accidental reset before a demo. | Not recommended. |
| B | Create `scripts/prepare-demo-tenant.ts`. | Separates demo tenant from RLS fixtures, can use stronger guards, can be idempotent and presentation-focused. | Requires a separate implementation and review pass. | Recommended. |
| C | Manual seed first, automated later. | Lowest immediate automation risk. | Manual drift, harder to repeat, easy to miss report-supporting records. | Acceptable only for the first browser rehearsal. |

Recommended path:

1. Keep `prepare-staging-fixtures.ts` unchanged as the verification fixture tool.
2. Use the new `scripts/prepare-demo-tenant.ts` skeleton as the safe starting point.
3. Do one manual or reviewed SQL/API seed for the first demo rehearsal only if needed.
4. Implement idempotent writes in the separate script only after the exact demo records are approved.
5. Use the separate read-only `verify:demo-tenant` script before and after any reviewed seed implementation.

## 9. Guard Requirements For Seed Writes

Any writing mode in `scripts/prepare-demo-tenant.ts` must:

- Refuse to run unless `DEMO_SEED_ALLOWED=true`.
- Refuse to run unless `VITE_SUPABASE_URL` or `SUPABASE_URL` resolves to the approved staging/demo project `mzpohntjotgeeaukwnbz`.
- Refuse to run if the host does not match `mzpohntjotgeeaukwnbz.supabase.co`.
- Require `SUPABASE_SERVICE_ROLE_KEY`, but never print it.
- Require an explicit write confirmation for write modes. Phase 2 uses `DEMO_SEED_CONFIRM=NOURA_GARDENS_FOUNDATION`.
- Use deterministic tenant slug and record codes.
- Prefer idempotent writes by natural unique keys such as slug and `tenant_id + code`; preserve existing primary keys when a natural-key row already exists.
- Avoid broad deletes.
- Avoid deleting any non-demo tenant data.
- Avoid `supabase db push`, migration repair, raw production migrations, or DDL.
- Write a local `.env.demo-tenant.local` only if needed, and never commit it.
- Include a read-only dry-run/verify mode before write mode is enabled.

The current script supports `DEMO_SEED_MODE=plan`, `DEMO_SEED_MODE=verify`, and `DEMO_SEED_MODE=write-foundation`. The only write mode currently enabled is Phase 2 foundation seeding.

### 9.1 Read-Only Verify Mode

Verify mode checks whether the planned `Noura Gardens Compound Demo` tenant and its required demo records already exist in the approved staging project. It only performs `SELECT` calls through the Supabase client. It does not insert, update, delete, upsert, run migrations, or call `supabase db push`.

PowerShell command:

```powershell
$env:DEMO_SEED_ALLOWED='true'; $env:DEMO_SEED_MODE='verify'; npm run verify:demo-tenant
```

Bash command:

```bash
DEMO_SEED_ALLOWED=true DEMO_SEED_MODE=verify npm run verify:demo-tenant
```

Required environment:

- `VITE_SUPABASE_URL` or `SUPABASE_URL` must resolve to `mzpohntjotgeeaukwnbz.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY` must be set for read-only verification and must never be printed.
- `DEMO_SEED_ALLOWED=true` must be set explicitly.

Expected output shape:

```text
Demo tenant verifier: READ-ONLY VERIFY MODE
Approved project ref: mzpohntjotgeeaukwnbz
Supabase host: mzpohntjotgeeaukwnbz.supabase.co
Writes: disabled

Overall: MISSING
Required records found: 0/44
Missing records: 44
Warnings: 8

Domain summary:
- MISSING Tenant: 0/1 found, 1 missing, 0 warnings
- MISSING Personas: 0/6 found, 6 missing, 1 warnings
- MISSING Team: 0/4 found, 4 missing, 1 warnings
...
```

Exit behavior:

- Exits `0` when verification completes, even if records are missing.
- Exits non-zero when environment guards fail, the staging host is not approved, the mode is unsupported, or the read-only verification cannot complete.

### 9.2 Write-Foundation Mode

`DEMO_SEED_MODE=write-foundation` performs the Phase 2 foundational seed in the approved staging project only. It is not a general seed, not a destructive reset, and not a work-order lifecycle seed.

PowerShell command:

```powershell
$env:DEMO_SEED_ALLOWED='true'
$env:DEMO_SEED_MODE='write-foundation'
$env:DEMO_SEED_CONFIRM='NOURA_GARDENS_FOUNDATION'
npm run seed:demo-foundation
```

Optional login password setup:

```powershell
$env:DEMO_SEED_USER_PASSWORD='<set outside git and do not print it>'
```

If `DEMO_SEED_USER_PASSWORD` is not provided, the script can create missing auth users with an unprinted generated password. Existing auth user passwords are left unchanged unless `DEMO_SEED_USER_PASSWORD` is set.

Write-foundation writes or updates only:

- Demo subscription support records needed to keep the tenant active where the staging schema supports them.
- Tenant `Noura Gardens Compound Demo` with slug `noura-gardens-demo`.
- Six demo auth users and `profiles`.
- `DEMO-HVAC-TEAM` and technician, engineer, supervisor membership.
- The seven location records listed in this plan.
- The five asset records listed in this plan.
- The four inventory item records listed in this plan.
- PM foundation: `DEMO-JP-AHU-MONTHLY`, five job-plan checks, `DEMO-PM-AHU-3A-MONTHLY`, and the schedule-to-asset link.

Write-foundation does not write:

- Work orders.
- Operation logs.
- Work order parts, costs, checks, attachments, or PM-generated work orders.
- Inventory transactions.
- Migrations, DDL, `supabase db push`, migration repair commands, broad deletes, or non-demo tenant data.

After writing, the script automatically runs the verifier. Expected Phase 2 result is still overall `MISSING` because work orders are Phase 3:

```text
Overall: MISSING
Required records found: 35/44
Missing records: 9

Domain summary:
- PASS    Tenant: 1/1 found, 0 missing, 0 warnings
- PASS    Personas: 6/6 found, 0 missing, 0 warnings
- PASS    Team: 4/4 found, 0 missing, 0 warnings
- PASS    Locations: 7/7 found, 0 missing, 0 warnings
- PASS    Assets: 5/5 found, 0 missing, 0 warnings
- PASS    Inventory: 4/4 found, 0 missing, 0 warnings
- MISSING Work orders: 0/9 found, 9 missing, 0 warnings
- PASS    PM: 8/8 found, 0 missing, 0 warnings
```

After Phase 3 seeding, the verifier should show 44/44 with zero missing records.

## 9.3 Write-Workorders Mode

`DEMO_SEED_MODE=write-workorders` performs the Phase 3 work-order seed in the approved staging project only. It requires the Phase 2 foundation to already exist.

PowerShell command:

```powershell
$env:DEMO_SEED_ALLOWED='true'
$env:DEMO_SEED_MODE='write-workorders'
$env:DEMO_SEED_CONFIRM='NOURA_GARDENS_WORKORDERS'
npm run seed:demo-workorders
```

Bash command:

```bash
DEMO_SEED_ALLOWED=true DEMO_SEED_MODE=write-workorders DEMO_SEED_CONFIRM=NOURA_GARDENS_WORKORDERS npm run seed:demo-workorders
```

Required environment: same as write-foundation. `DEMO_SEED_ALLOWED=true`, approved staging host, and `SUPABASE_SERVICE_ROLE_KEY`.

**Guard failure test (must show refusal):**

```powershell
$env:DEMO_SEED_ALLOWED='true'
$env:DEMO_SEED_MODE='write-workorders'
# DEMO_SEED_CONFIRM deliberately omitted
npm run seed:demo-workorders
# Expected: "Refusing to write. Set DEMO_SEED_CONFIRM=NOURA_GARDENS_WORKORDERS..."
```

### What write-workorders seeds

| Record | Method | Notes |
| --- | --- | --- |
| DEMO-WO-PENDING-001 (pending) | Service-role INSERT | Lobby lighting request, no team assigned yet. |
| DEMO-WO-ASSIGNED-001 (assigned) | Service-role INSERT | Main cooling complaint. Overdue (due_date in past) for overdue-signal report. |
| DEMO-WO-INPROG-001 (in_progress) | Service-role INSERT | Backup in-progress AHU investigation. |
| DEMO-WO-SUP-001 (pending_supervisor_approval) | Service-role INSERT | Belt replacement awaiting supervisor. |
| DEMO-WO-ENG-001 (pending_engineer_review) | Service-role INSERT | Coil cleaning awaiting engineer. |
| DEMO-WO-REPORTER-001 (pending_reporter_closure) | Service-role INSERT | FCU replacement awaiting resident closure. |
| DEMO-WO-COMPLETE-001 (completed) | Service-role INSERT | Main story conclusion: filter replaced, SLA met, actual_cost=150. |
| DEMO-WO-CANCEL-001 (cancelled) | Service-role INSERT | Duplicate request cancelled with reason. |
| DEMO-WO-PM-001 (pending) | Service-role INSERT | PM-generated-style AHU inspection. source_schedule_id set. |
| Operation logs | Service-role INSERT | create/assignment/maintenance/cancellation/pm_generate per WO. |
| work_order_checks | Service-role INSERT | 5 checklist rows for DEMO-WO-PM-001 from DEMO-JP-AHU-MONTHLY items. |
| work_order_parts | Service-role INSERT | 1× DEMO-FILTER-AHU-20X24 consumed on DEMO-WO-COMPLETE-001. |
| inventory_items.quantity | Service-role UPDATE | Decremented by 1 for filter (low-stock signal remains active). |
| pm_schedules.next_due_date | Service-role UPDATE | Advanced to next month so pm_generate won't re-generate for this cycle. |

### Why service-role INSERT instead of authenticated RPCs

All work order RPCs (`create_work_order`, `assign_work_order`, etc.) require `auth.uid()` (authenticated user JWT). The seed script runs with service_role, which returns `auth.uid() = NULL`. Calling these RPCs via service_role would fail the authentication check inside every RPC.

Service_role can INSERT directly into `work_orders` because:

1. The `work_orders_insert_disabled_direct` RLS policy applies only to the `authenticated` role — service_role bypasses all RLS.
2. The `trg_guard_work_order_sensitive_fields` BEFORE UPDATE trigger does not fire on INSERT.
3. The `trg_notify_team_on_new_wo` AFTER INSERT trigger is safe for demo records (it only sends in-app notifications to demo users; `assigned_team=NULL` is a no-op).

This is explicitly documented as **staging-only backup seeding**. For the live demo story, re-create the main work orders live using the authenticated RPCs to demonstrate the full RPC flow to the audience.

### How to rerun safely

The seed is idempotent for work orders (insert-only, skip if code+tenant already exists). Operation logs, work order checks, and parts are also skipped if already present. Inventory is only decremented once per part record.

If you need to reset demo work orders:

1. Manually delete the 9 demo WO codes from the Supabase dashboard (or staging SQL editor).
2. Rerun `seed:demo-workorders` with the confirmation env var.

Do not use broad deletes or `DELETE FROM work_orders` without a specific `WHERE tenant_id = <demo-tenant-id> AND code LIKE 'DEMO-WO-%'` filter.

### Expected verifier result after Phase 3

```text
Overall: PASS (or WARN if optional signals incomplete)
Required records found: 44/44
Missing records: 0

Domain summary:
- PASS    Tenant: 1/1 found, 0 missing, 0 warnings
- PASS    Personas: 6/6 found, 0 missing, 0 warnings
- PASS    Team: 4/4 found, 0 missing, 0 warnings
- PASS    Locations: 7/7 found, 0 missing, 0 warnings
- PASS    Assets: 5/5 found, 0 missing, 0 warnings
- PASS    Inventory: 4/4 found, 0 missing, 0 warnings
- PASS    Work orders: 9/9 found, 0 missing, 0 warnings
- PASS    PM: 8/8 found, 0 missing, 0 warnings
- PASS    Report signals: 0/0 found, 0 missing, 0 warnings
```

Report signals satisfied after Phase 3:

| Signal | Satisfied by |
| --- | --- |
| Completed work orders | DEMO-WO-COMPLETE-001 (status=completed) |
| Cancelled work orders | DEMO-WO-CANCEL-001 (status=cancelled, cancellation_reason set) |
| Overdue open work orders | DEMO-WO-ASSIGNED-001 (due_date 2 days in past, status=assigned) |
| PM/preventive work orders | DEMO-WO-PM-001 (work_type=preventive, source_schedule_id set) |
| SLA resolution flag | DEMO-WO-COMPLETE-001 (sla_resolution_met=true) |
| Estimated/actual cost | DEMO-WO-ASSIGNED-001 (estimated_cost=200), DEMO-WO-COMPLETE-001 (estimated_cost=150, actual_cost=150) |
| Low-stock inventory | DEMO-FILTER-AHU-20X24 (quantity ≤ min_quantity, seeded from Phase 2) |

### Known limitations

- Work orders are seeded at the final target status (not replayed through RPC transitions). Browser UI will show the state correctly, but the workflow log depth matches what was seeded (not what would accumulate from live transitions).
- If DEMO-WO-PM-001 is completed during a live demo, the pm_schedule's `next_due_date` (already advanced to next month) ensures the next cron run generates a fresh PM WO for the new cycle rather than immediately regenerating.
- Operation logs use `type='pm_generate'` for DEMO-WO-PM-001 (valid after migration 127). If migration 127 has not been applied to the staging project, this INSERT will fail. In that case, comment out the pm_generate log in the script and use `type='create'` instead.
- Inventory transactions are not seeded (only `inventory_items.quantity` is decremented and a `work_order_parts` record is inserted). The reporting foundation uses `inventory_items.quantity` and `min_quantity` directly, so the low-stock signal is satisfied without transactions.

## 10. Implementation Phases

| Phase | Action | Safety Posture |
| --- | --- | --- |
| Phase 0 | Add docs and guarded non-writing script skeleton. | Complete. |
| Phase 1 | Add read-only existence verifier for tenant, users, codes, and report signals. | Complete. |
| Phase 2 | Add guarded idempotent writes for tenant, users, team, locations, assets, inventory, and PM definitions. | Complete. |
| Phase 3 | Add guarded service-role seeded work orders, operation logs, parts, PM checks, and PM schedule advance. | Complete. Staging-only, confirmation-gated, insert-only/idempotent. |
| Phase 4 | Browser rehearsal: run verify, check UI, verify report signals are visible. | Next step after Phase 3. |
| Phase 5 | Go/No-Go gate: run verify:demo-tenant, verify:workflow-full, verify:pm-generation before any sales call. | Required before each demo. |

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Script accidentally points at production. | Hard-code approved staging project ref and require `DEMO_SEED_ALLOWED=true`. |
| Demo data pollutes RLS fixtures. | Separate tenant and separate demo codes (`DEMO-WO-*` vs `FX-*`). |
| Verification scripts consume demo records. | Demo codes are not in fixture scripts. Fixture scripts only reset `FX-*` codes. |
| Direct seeded lifecycle states bypass normal RPC story. | Seeded states are fallback only. Run live RPC transitions for main demo story. Document clearly. |
| Reports look empty despite seeding. | All 7 report signals satisfied by seeded WO fields (see signal table above). |
| PM schedule re-generates on next cron run. | `next_due_date` advanced to next month. pm_generate idempotency check also protects while DEMO-WO-PM-001 is non-terminal. |
| Browser UI not polished. | Use `docs/demo/demo-browser-checklist.md` before any sales call. |
| Attachments/photos not stable. | Do not show them until storage/UI path is verified. |
| Double-decrement of inventory on re-run. | work_order_parts idempotency check gates the inventory UPDATE. Safe on re-run. |

## 12. Final Recommendation

Phase 3 is complete. The Noura Gardens demo tenant now has all 44 required records, all 7 report signals, and deterministic demo work orders covering every workflow state.

Next recommended task:

1. Run `npm run verify:demo-tenant` to confirm 44/44 on the approved staging project.
2. Open the browser and navigate through the demo story path from the browser checklist.
3. If any report signals or work order states look incorrect in the UI, adjust seed values and re-run write-workorders (after manually deleting only the affected WO codes).
4. Run `npm run verify:workflow-full` and `npm run verify:pm-generation` as the pre-demo backend gate.
