# Work-Order Sensitive Updates Audit

Audit date: 2026-04-25

## 1. Executive Summary

This audit started as a review of direct `work_orders` mutation paths and now tracks the remediation state.

The highest-risk original finding was the generic direct table mutation surface in `src/hooks/useWorkOrders.ts`. Phase 1 now narrows `useUpdateWorkOrder` to metadata-only updates and disables direct status updates and hard delete in the exported hooks. Repository search did not find current UI imports of those three hooks beyond their definitions, but database policy still allows management roles to update or delete rows directly if they bypass the client, so database-level guards remain required.

Authenticated normal work-order creation is routed through `public.create_work_order(p_work_order jsonb, p_tenant_id uuid default null)` from migration `122_create_work_order_rpc.sql`. The RPC loads the active actor profile, derives tenant scope for tenant users, permits explicit tenant only for platform owner/admin or super admin, validates `can_create_work_orders_scope`, validates asset/location consistency, inserts status `pending`, and writes an operation log. Stage 1 ledger repair later exposed staging drift: the disabled INSERT policy existed, but the legacy `"Users can create work orders"` policy also still existed and allowed direct same-tenant inserts. Migration `129_disable_work_order_direct_insert.sql` now drops all `work_orders` INSERT policies and recreates only the disabled direct-authenticated policy, so regular API clients cannot bypass the audited path.

The main reactive workflow actions in `src/hooks/useWorkOrderWorkflow.ts` use audited workflow RPCs: start, technician completion with parts, supervisor approval, engineer review, close, and reject. That is the correct direction. PM foundation work orders use separate RPCs, `wo_start` and `wo_complete`, but those PM RPCs need additional verification because the inspected definition checks authentication and status, but does not visibly check tenant, role, assignment, or log operation events.

Database RLS plus migration 120 now protect broad access and direct sensitive-field updates. Assignment/reassignment now has its own audited authority path through `assign_work_order`, and user-visible cancellation now has an audited authority path through `cancel_work_order`. Migration 125 disables direct authenticated hard delete on `work_orders` so Pilot v1 preserves operational memory. Remaining authority gaps are separate archive policy, optional platform explicit-tenant creation, and any future audited metadata-correction path.

## 1M. Direct Work-Order Insert Drift Corrected

Implementation date: 2026-04-25

### Status

Stage 1 ledger repair for migrations `119` through `128` was followed by runtime verification. `npm run verify:workorder-create` failed because direct authenticated REST `INSERT` into `public.work_orders` created a row.

Live staging policy inspection found this INSERT state:

| Policy | Roles | `WITH CHECK` | Effect |
| --- | --- | --- | --- |
| `"Users can create work orders"` | `{public}` | `(tenant_id = get_user_tenant_id())` | Allowed same-tenant direct inserts. |
| `"work_orders_insert_disabled_direct"` | `{authenticated}` | `false` | Disabled policy existed but did not deny while a permissive policy also matched. |

Root cause: PostgreSQL RLS policies are permissive by default. The `WITH CHECK (false)` policy from migration 122 did not override the older true policy; both were evaluated as an OR.

`supabase/migrations/129_disable_work_order_direct_insert.sql` was added and applied to staging with targeted SQL:

```powershell
npx supabase db query --linked --file supabase/migrations/129_disable_work_order_direct_insert.sql --output json
```

No `supabase db push` or migration repair was run.

After correction, staging has exactly one INSERT policy on `public.work_orders`:

| Policy | Roles | `WITH CHECK` |
| --- | --- | --- |
| `"work_orders_insert_disabled_direct"` | `{authenticated}` | `false` |

### Verification

`scripts/verify-workorder-create.ps1` now confirms the actual database outcome of the direct INSERT probe using a trusted service-role read by attempted code and tenant, not only the HTTP status.

Post-correction result:

- `npm run verify:workorder-create`: **PASS**, 6/6.
- Direct authenticated insert probe: **PASS**. REST returned HTTP 403 and the trusted read found no row.
- Full requested regression suite passed after this correction: workflow authority, full workflow, assignment, cancellation/delete, auto-close, PM generation, reject branches, build, and lint.

Remaining migration-reconciliation risk:

- Migration `129` was applied to staging as targeted SQL and is not represented in the remote migration ledger in this pass.
- `supabase db push` remains NO-GO until the migration ledger is deliberately reconciled.

## 1L. auto_close_stale_work_orders â€” Disabled for Pilot v1

Implementation date: 2026-04-25

### Where it was defined

- **Migration 052** (`supabase/migrations/052_auto_close_escalation.sql`) â€” original definition.
- **Migration 120** (`supabase/migrations/120_guard_work_order_sensitive_fields.sql`) â€” re-defined with the transaction-local GUC authorization flag added, but the pre-existing schema bugs were left intact with a note.

### What was wrong

| Issue | Detail |
| --- | --- |
| `closed_at` column | Does not exist. The actual column defined in migration 002 is `auto_closed_at TIMESTAMPTZ`. Any UPDATE would fail with `column "closed_at" does not exist`. |
| `closed_notes` column | Does not exist. No equivalent column exists in `work_orders` through migration 125. There is no `closed_notes` field anywhere in the table. |
| `auto_closed` status | **Valid** â€” the value IS included in the `work_orders.status` CHECK constraint defined in migration 002. The comment in migration 120 that said it was "not in constraint" was inaccurate. |
| Aggressive second UPDATE | The function also auto-closes work orders with `status IN ('in_progress', 'on_hold')` after `2أ— auto_close_after_days` of inactivity. For Pilot v1 this is too aggressive: active execution-stage work orders should not be silently closed by a background batch without explicit operational review. |

### Chosen decision: **Disabled for Pilot v1**

`supabase/migrations/126_disable_auto_close_stale_work_orders.sql` replaces the function body with a safe no-op that immediately returns 0. Any existing cron invocation will execute without error and leave all work orders unchanged.

Reporter closure remains manual via the `close_work_order` RPC. A work order that reaches `pending_reporter_closure` stays there until the reporter (or a manager/admin override) explicitly closes it.

The `EXECUTE` grant on `auto_close_stale_work_orders()` is revoked from `PUBLIC` and `anon` in migration 126.

### Re-enable path (future migration, post-Pilot v1)

Before re-enabling, a future migration must:

1. Fix `closed_at` â†’ `auto_closed_at` (column exists since migration 002).
2. Remove `closed_notes` assignment (no column; use `reporter_notes` if a note is desired, or omit it â€” `auto_closed_at` is the audit signal).
3. Confirm product decision on eligible statuses: `pending_reporter_closure` only (conservative) or also `in_progress`/`on_hold` (requires SLA policy decision).
4. Add `create_operation_log()` call per auto-closed work order.
5. Verify against staging with a fixture work order in `pending_reporter_closure` state older than `auto_close_after_days`.
6. Only then re-schedule via pg_cron: `SELECT cron.schedule('auto-close-daily', '0 0 * * *', 'SELECT auto_close_stale_work_orders()')`.

### 1L Verification Script

`scripts/verify-workorder-autoclose.ps1` and npm script `verify:workorder-autoclose` were added.

Covered checks:

| Check | Description | Expected |
| --- | --- | --- |
| A1 | `auto_close_stale_work_orders` callable via service role | HTTP 200 |
| B1 | Function returns 0 | No work orders changed |
| C1 | No work orders in `auto_closed` status after call | count = 0 (or pre-existing rows flagged SKIP) |
| D1 | Anon cannot call the function | non-200 â€” EXECUTE revoked |

### 1L Verification Result (2026-04-25, staging)

Migration 126 applied manually to staging.

| Check | Result | Evidence |
| --- | --- | --- |
| Migration 126 applied manually | Yes | Function callable and returns 0 |
| `auto_close_stale_work_orders` callable (service role) | **PASS** | HTTP 200 |
| Function returns 0 | **PASS** | return=0 |
| No `auto_closed` work orders after call | **PASS** | count=0 |
| Anon denied EXECUTE | **PASS** | non-200 - EXECUTE revoked |
| `npm run verify:workorder-autoclose` | **PASS**, 4/4 | |
| `npm run verify:workorder-assignment` | **PASS**, 11/11 | No regressions |
| `npm run verify:workorder-cancel` | **PASS**, 16/16 | Includes hard-delete block â€” migration 125 confirmed effective |
| `npm run verify:workflow-authority` | 12 PASS, 1 FAIL, 1 SKIP | See note below |
| `npm run verify:workflow-full` | 0 PASS, 0 FAIL, 5 SKIP | Fixtures consumed â€” reset needed |
| `npm run build` | **PASS** | 0 errors, built in 27.49s |
| `npm run lint` | **PASS** | 0 errors, 223 pre-existing warnings |

**verify:workflow-authority note:** Section A `direct 'status' update blocked` FAIL is a pre-existing fixture-state artifact â€” the WO fixture is already in `completed` status, so a `SET status='completed'` update is a no-op that the trigger correctly does not intercept (no field actually changed). This is not a regression from migration 126. The trigger correctly blocks `assigned_to` and `work_type` (both PASS). Section D PM RPCs SKIPped because the fixture WO is consumed. Run `npm run prepare:staging-fixtures` before re-running `verify:workflow-authority` and `verify:workflow-full` to restore both to full-pass baseline.

**verify:workorder-cancel bonus:** Migration 125 hard-delete block is now confirmed effective in staging â€” `authenticated direct hard delete remains blocked by RLS` is PASS (previously FAIL when migration 125 had not yet been applied to this environment).

### 1L Remaining Risks

- Any environment where migration 126 has not yet been applied still runs the broken function body from migration 120. The first execution will fail at runtime with `column "closed_at" does not exist`, which is a non-silent error but does not corrupt data. Apply migration 126 to all environments before enabling any cron schedule.
- The `check_and_escalate_priority()` function defined in migration 052 (priority auto-escalation) was not reviewed in this pass. It updates only `priority` and `notes` fields, neither of which is in the migration 120 sensitive-field guard. It does not reference missing columns. It is not disabled by this migration but also has no active cron schedule in the current migrations.

---

## 1K. Direct Work-Order Hard Delete Disabled

Implementation date: 2026-04-25

### Status

`supabase/migrations/125_disable_work_order_direct_delete.sql` disables direct authenticated `DELETE` on `public.work_orders`.

Current DELETE policy lineage found in migrations:

- `003_rls_policies.sql` created legacy `"Admins can delete work orders"` for tenant admins/super admins.
- `094_soft_launch_assets_facilities_hardening.sql` dropped legacy delete policies and created `work_orders_delete_scoped` using `can_manage_work_orders_scope(tenant_id)`.
- `093_v1_roles_permissions_alignment.sql` created `"Managers can delete work orders"` using `can_manage_work_orders_scope(tenant_id)`.
- Migration 125 drops all three known direct-delete policy names and creates `work_orders_delete_disabled_direct` with `USING (FALSE)` for `authenticated`.

`cancel_work_order` is the supported Pilot v1 lifecycle path for user-visible cancellation. The app `useDeleteWorkOrder` hook remains disabled and throws before calling Supabase.

### Verification

`scripts/verify-workorder-cancel.ps1` includes an authenticated REST `DELETE` denial check for a same-tenant maintenance manager.
Because PostgREST may return a success HTTP status even when RLS filters out the target row (deleting 0 rows), the verifier confirms row existence **before and after** the DELETE attempt using a trusted service-role read path.

Expected after migration 125 is applied to staging:

- `npm run verify:workorder-cancel` should include `authenticated direct hard delete remains blocked by RLS` as **PASS**.
- Service-role/database maintenance may still bypass RLS according to PostgreSQL/Supabase service-role behavior; this is the intended maintenance exception, not a normal application path.

### Verification result (2026-04-25, staging)

- Migration 125 applied manually: **Yes (reported)**, but **not effective** in the verified staging target.
- Direct authenticated DELETE denied by RLS: **No** (same-tenant `maintenance_manager` hard `DELETE` succeeded via PostgREST).
- `npm run verify:workorder-cancel`: **FAIL** (only on `authenticated direct hard delete remains blocked by RLS`); cancellation RPC checks still **PASS**.
- `npm run verify:workflow-authority`: **PASS**, 19/19.
- `npm run verify:workflow-full`: **PASS**, 25/25.
- `npm run verify:workorder-assignment`: **PASS**, 11/11.
- `npm run build`: **PASS**.
- `npm run lint`: **PASS** (0 errors; warnings only).

### 1K Verification Result (2026-04-25, staging â€” updated)

`npm run verify:workorder-cancel` re-run on 2026-04-25 (after migration 126 session): **PASS 16/16**. `authenticated direct hard delete remains blocked by RLS`: **PASS** â€” row still exists after authenticated manager DELETE attempt (HTTP 204, row confirmed present). Migration 125 is confirmed effective on the staging database. The prior FAIL was because migration 125 had not yet been applied at first-run time.

### Remaining risks

- Later migrations that recreate `work_orders_delete_scoped`, `"Managers can delete work orders"`, or `"Admins can delete work orders"` would re-open this path; keep migration ordering and future policy changes aligned with Pilot v1 operational-memory rules.
- Service-role/database maintenance may still bypass RLS; this is the intended maintenance exception, not a normal application path.

## 1J. Audited Work-Order Cancellation RPC

Implementation date: 2026-04-25

### Status

`public.cancel_work_order(p_work_order_id uuid, p_reason text)` was added in `supabase/migrations/124_cancel_work_order_rpc.sql`.

Schema decision:

- The existing `work_orders.status` constraint already includes `cancelled`, so the RPC uses that status.
- `archived` exists as a status in the workflow constraint, but Pilot v1 does not yet define a separate archive policy or archive fields.
- Migration 124 adds minimal dedicated cancellation fields: `cancelled_at timestamptz` and `cancellation_reason text`.
- Migration 124 expands the sensitive-field guard to protect `cancelled_at` and `cancellation_reason` from direct updates.
- Migration 124 expands `operation_logs.type` to include `cancellation`.

The authenticated cancellation path now covers:

- Tenant-scoped cancellation by `tenant_admin` and `maintenance_manager`.
- Active actor validation.
- Required non-empty reason.
- Legal cancellation statuses: `pending`, `assigned`, and `on_hold`.
- Denial after `in_progress`, approval/review/closure statuses, `completed`, `cancelled`, `archived`, and other closed-equivalent statuses by default status allowlist.
- `status = 'cancelled'`, `cancelled_at`, `cancellation_reason`, and `updated_at` set inside the RPC.
- Operation log creation with `type = 'cancellation'` and `reason`.
- Migration 120 trigger bypass only through transaction-local `app.work_order_workflow_authorized=true`.

Hard delete remains disabled in `useDeleteWorkOrder`; no delete path was re-enabled.

### Frontend

`src/hooks/useWorkOrderWorkflow.ts` now exports `cancelWorkOrder(...)`, which calls `cancel_work_order`.

No visible UI was added in this pass.

### Verification

`scripts/verify-workorder-cancel.ps1` and npm script `verify:workorder-cancel` were added.

Covered checks:

- Maintenance manager can cancel pending and assigned work orders with a reason.
- Cancellation stores `status`, `cancelled_at`, and `cancellation_reason`.
- Cancellation writes an operation log with `type = 'cancellation'`.
- Empty reason is denied.
- Reporter and technician actors are denied cancellation authority.
- Wrong tenant is denied.
- In-progress and completed work orders cannot be cancelled.
- Direct hard delete remains unavailable from the app hook.
- Direct status update to `cancelled` remains blocked by the sensitive-field guard.

### Verification result (2026-04-25, staging)

- Migration 124 applied manually: **Yes**.
- `cancel_work_order` RPC exists and is visible through PostgREST: **Yes**. No schema-cache refresh was needed during this verification run.
- Schema verified: **Yes**. `work_orders.cancelled_at` and `work_orders.cancellation_reason` are exposed; `cancelled` status and `operation_logs.type = 'cancellation'` were exercised by the verifier.
- `npm run verify:workorder-cancel`: **PASS**, 13/13.
- Cancellation log verified: **Yes**, `operation_logs.type = 'cancellation'` was written.
- Direct `status = 'cancelled'` update still blocked: **Yes**, HTTP 403 from migration 120/124 guard.
- `npm run verify:workflow-authority`: **PASS**, 19/19.
- `npm run verify:workflow-full`: **PASS**, 25/25.
- `npm run verify:workorder-assignment`: **PASS**, 11/11.
- `npm run build`: **PASS**.
- `npm run lint`: **PASS** with existing warnings only.

### Remaining gaps

- Separate archive policy/RPC remains pending.
- Platform explicit-tenant create remains pending or needs a deliberate tenant-scoped-only decision.
- PM generation should create operation logs or a persistent generation audit record.
- Reject branch coverage is still partial.
- Auto-close behavior still needs correction/verification.
- Direct authenticated hard delete is addressed by migration 125; runtime verification is required wherever that migration has not yet been applied.

## 1I. Audited Work-Order Assignment RPC

Implementation date: 2026-04-25

### Status

`public.assign_work_order(p_work_order_id uuid, p_assigned_to uuid default null, p_assigned_team uuid default null, p_reason text default null)` was added in `supabase/migrations/123_assign_work_order_rpc.sql`.

The authenticated assignment path now covers:

- Tenant-scoped assignment by `tenant_admin` and `maintenance_manager`.
- Active same-tenant technician/engineer assignee validation.
- Active same-tenant team validation.
- Active team membership validation when both assignee and team are supplied.
- Legal assignment statuses: `pending`, `assigned`, and `on_hold`.
- `pending` to `assigned` transition inside the RPC.
- Operation log creation with `type = 'assignment'`, assignment target context, and reason where supplied.
- Migration 120 trigger bypass only through transaction-local `app.work_order_workflow_authorized=true`.

### Frontend

`src/hooks/useWorkOrderWorkflow.ts` now exports `assignWorkOrder(...)`, which calls `assign_work_order`.

`AddWorkOrderModal` still sends `assigned_team` as initial creation context when assignment is enabled and the actor has manage permission. This preserves current create behavior: the work order remains `pending`, and actual assignment/reassignment that changes lifecycle ownership should use `assign_work_order`.

### Verification

`scripts/verify-workorder-assignment.ps1` and npm script `verify:workorder-assignment` were added.

Covered checks:

- Maintenance manager can assign a pending same-tenant work order to an active same-tenant technician.
- Assignment changes `pending` to `assigned`.
- Assignment writes an operation log.
- Cross-tenant assignee is denied.
- Inactive assignee is denied.
- Reporter and technician actors are denied assignment authority.
- Assignment after `in_progress` is denied.
- Assignment after `completed` is denied.
- Reassignment from an existing assignee/team requires a reason.
- Direct update of `assigned_to` remains blocked by migration 120.

### Verification result (2026-04-25, staging)

- Migration 123 applied manually: **Yes**.
- `assign_work_order` RPC exists and is visible through PostgREST: **Yes**. The prior `PGRST202` schema-cache miss is resolved; no repo-side schema-cache refresh command was needed during this run.
- `npm run verify:workorder-assignment`: **PASS**, 11/11.
- Assignment log verified: **Yes**, `operation_logs.type = 'assignment'` was written.
- Direct `assigned_to` update still blocked: **Yes**, HTTP 403 from migration 120 guard.
- `npm run verify:workflow-authority`: **PASS**, 19/19.
- `npm run verify:workflow-full`: **PASS**, 25/25.
- `npm run build`: **PASS**.
- `npm run lint`: **PASS** with existing warnings.

Verification note: the assignment verifier was corrected so the reassignment-reason check performs a real post-assignment assignee change. No runtime code or migrations were changed for this verification pass.

### Remaining gaps

- `cancel_work_order` now exists for Pilot v1 cancellation; separate `archive_work_order` policy/RPC remains pending.
- Platform explicit-tenant create remains pending or needs a deliberate tenant-scoped-only decision.
- PM generation should create operation logs or a persistent generation audit record.
- Reject branch coverage is still partial.
- Auto-close behavior still needs correction/verification.

## 1H. Audited Normal Work-Order Creation RPC (Task 003-C7)

Implementation date: 2026-04-25

### Status

`public.create_work_order(p_work_order jsonb, p_tenant_id uuid default null)` was added in `supabase/migrations/122_create_work_order_rpc.sql`.

The authenticated creation path now covers:

- `AddWorkOrderModal` through `useCreateWorkOrder`.
- `TaskExecutionModal.handleCreateWorkOrder` through `useCreateWorkOrder`.
- Legacy `useMaintenanceTasks.createTaskMutation` related-WO creation through the same RPC.

The public portal remains on `submit_public_work_order(...)` and PM foundation generation remains on `pm_generate_due_work_orders()`.

### Behavior

- Requires `auth.uid()`.
- Loads the actor profile and rejects inactive users.
- Uses the actor tenant for tenant users.
- Allows `p_tenant_id` only for platform owner/admin or super admin.
- Checks `tenant_has_operational_access(...)`.
- Checks `can_create_work_orders_scope(...)`, currently allowing tenant admin, facility manager, maintenance manager, supervisor, engineer, reporter, and supported platform admin paths.
- Accepts only creation-safe JSON keys: title, description, issue type, priority, due date, location, asset, reporter contact/identity, `assigned_team`, code, and source metadata.
- Rejects `tenant_id`, `status`, `assigned_to`, approval fields, completion fields, closure fields, evidence, actual cost, SLA result fields, PM provenance, arbitrary timestamps, and any unknown key.
- Validates code format or generates a DB code when absent.
- Validates issue type, reporter, team, department, asset, and location tenant consistency.
- Inserts with `status = 'pending'`.
- Logs `type = 'create'` through internal `create_operation_log`.

`assigned_team` is retained as initial team context for compatibility, but it does not change status to `assigned`. Full assignment remains a separate required RPC.

### Verification

`scripts/verify-workorder-create.ps1` and npm script `verify:workorder-create` were added.

Covered checks:

- Allowed reporter can create a pending work order.
- Creation writes an operation log.
- Cross-tenant asset is denied.
- Dangerous creation fields are rejected.
- Unauthorized technician create is denied.
- Direct authenticated table INSERT is denied.

### Verification result (2026-04-25, staging)

- Migration 122 applied manually: **Yes**.
- `create_work_order` RPC exists and accepts tenant reporter creation: **Yes**. Probe returned a pending work order with generated code.
- `npm run verify:workorder-create`: **PASS**, 6/6.
- Operation log on create verified: **Yes**, `operation_logs.type = 'create'` was written.
- Direct authenticated `work_orders` INSERT denied: **Yes**, HTTP 403.
- Reporter create behavior: **Verified**, reporter fixture can create in own tenant.
- Cross-tenant asset/location denial: **Verified**, HTTP 403.
- Dangerous field injection denial: **Verified** for status, approval, completion, closure, evidence, and arbitrary timestamp fields; all returned HTTP 400.
- Platform owner/admin explicit tenant create: **Not verified as passing**. Fixture exists (`RLS_PLATFORM_ADMIN_JWT`), but `create_work_order` with `p_tenant_id = RLS_TENANT_A_ID` returned HTTP 403: `Reporter does not belong to this tenant`. The RPC currently defaults `reported_by` to the platform actor, then rejects that actor because platform profiles are not tenant members.

### Verification update after Stage 1 ledger repair

After repairing the staging ledger for migrations `119` through `128`, `npm run verify:workorder-create` was re-run and failed because direct authenticated `INSERT` into `public.work_orders` succeeded. The cause was not the RPC body; it was stale RLS state. The legacy `"Users can create work orders"` policy remained active beside `work_orders_insert_disabled_direct`.

Migration `129_disable_work_order_direct_insert.sql` corrected this by dropping every current `INSERT` policy on `public.work_orders` and recreating only `work_orders_insert_disabled_direct` with `WITH CHECK (FALSE)`. After targeted application to staging, the verifier passes again and proves no direct-insert row exists using a trusted service-role read.

Task 003-D tenant-scoped normal creation is verified. Full Task 003-D remains **pending** only for the optional platform explicit-tenant branch unless the product decision is to keep creation tenant-scoped only.

### Remaining gaps

- Separate `archive_work_order` policy/RPC remains pending.
- Platform owner/admin create needs either a deliberate tenant-scoped-only decision or an RPC adjustment so platform-created work orders do not fail reporter validation.
- A future audited metadata-correction path may still be needed if direct safe-field updates should also become fully logged.

## 1G. Full Workflow Lifecycle Verification (Task 003-C5-B follow-up)

Implementation date: 2026-04-25

### 1G: Script added

`scripts/verify-workflow-full.ps1` â€” extends workflow coverage to the complete reactive lifecycle, covering all six reactive RPCs, parts validation, inventory decrement, and `reject_work_order`.

**Run it:**

```sh
npm run verify:workflow-full
```

**Fixture requirement:** Run before each verification to reset WOs to `assigned` state and restore inventory to known quantity:

```sh
npm run prepare:staging-fixtures
```

**Required env vars** (generated by `prepare:staging-fixtures`):

```sh
VITE_SUPABASE_URL          # or SUPABASE_URL
VITE_SUPABASE_ANON_KEY     # or SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RLS_REACTIVE_WO_ID         # new â€” bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4
RLS_REJECTABLE_WO_ID       # new â€” bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5
RLS_TENANT_A_TECHNICIAN_JWT
RLS_TENANT_A_REPORTER_JWT
RLS_TENANT_A_SUPERVISOR_JWT
RLS_TENANT_A_ENGINEER_JWT
RLS_TENANT_A_MANAGER_JWT
RLS_TENANT_B_USER_JWT
```

The inventory fixture IDs (`inventoryA`, `inventoryB`) are deterministic constants hardcoded in the script.

### Checks covered (up to 25 checks; some conditional)

| Section | Check | Expected |
| --- | --- | --- |
| F1 | technician `start_work_order` on assigned WO | 204 â€” in_progress |
| F2 | `start_work_order` wrote operation log | count +1 |
| F3 | `start_work_order` rejected on in_progress WO (wrong status) | non-200 |
| F4 | reporter `complete_work_order_technician` denied (role check) | non-200 |
| F5 | tenant B actor `complete_work_order_technician` denied (tenant isolation) | non-200 |
| F6 | cross-tenant part (inventoryB) blocked in Tenant A WO | non-200 |
| F7 | insufficient stock (qty 99 > available 3) blocked | non-200 |
| F8 | technician `complete_work_order_technician` with valid part (qty 1) succeeds | 204 |
| F9 | `complete_work_order_technician` wrote operation log | count +1 |
| F10 | inventoryA quantity decremented by 1 | qty\_before âˆ’ 1 |
| F11 | technician denied by `approve_work_order_supervisor` (role check) | non-200 â€” if supervisor stage active |
| F12 | reporter denied by `approve_work_order_supervisor` (role check) | non-200 â€” if supervisor stage active |
| F13 | supervisor `approve_work_order_supervisor` succeeds | 204 â€” if supervisor stage active |
| F14 | `approve_work_order_supervisor` wrote operation log | count +1 â€” if supervisor stage active |
| F15 | technician denied by `approve_work_order_engineer` (role check) | non-200 â€” if engineer stage active |
| F16 | reporter denied by `approve_work_order_engineer` (role check) | non-200 â€” if engineer stage active |
| F17 | manager (maintenance\_manager) `approve_work_order_engineer` succeeds | 204 â€” if engineer stage active |
| F18 | `approve_work_order_engineer` wrote operation log | count +1 â€” if engineer stage active |
| F19 | technician denied by `close_work_order` (not reporter, not management) | non-200 |
| F20 | reporter `close_work_order` succeeds on pending\_reporter\_closure WO | 204 |
| F21 | `close_work_order` wrote operation log | count +1 |
| G1 | `reject_work_order` with empty reason denied | non-200 â€” validation required |
| G2 | tenant B actor denied by `reject_work_order` (tenant isolation) | non-200 |
| G3 | assigned technician `reject_work_order` on own WO succeeds | 204 â€” assigned â†’ pending |
| G4 | `reject_work_order` wrote operation log | count +1 |

F11â€“F18 are SKIPped when the staging tenant has `require_supervisor_approval=false` or `require_engineer_review=false`. With default settings (both `true`) all 25 checks run.

### 1G: State consumption

Section F runs `start_work_order` â†’ `complete_work_order_technician` â†’ `approve_work_order_supervisor` â†’ `approve_work_order_engineer` â†’ `close_work_order` on `reactiveWo` (`bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4`). The WO is left in `completed` state. Section G runs `reject_work_order` on `rejectableWo` (`bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5`), leaving it in `pending` state. Re-run `prepare:staging-fixtures` before the next test run to reset both WOs.

The script adapts gracefully if WOs are already mid-lifecycle (e.g. if the script was interrupted). Tests for stages already passed are SKIPped with clear messages.

### 1G: New fixture WOs added to prepare-staging-fixtures.ts

| WO ID | Code | Type | Assigned to | Reported by |
| --- | --- | --- | --- | --- |
| `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4` | FX-A-WO-REACTIVE | corrective | technician | reporter |
| `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5` | FX-A-WO-REJECTABLE | corrective | technician | reporter |
| `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6` | FX-A-WO-REJECT-SUP | corrective | technician | reporter |
| `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7` | FX-A-WO-REJECT-ENG | corrective | technician | reporter |
| `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb8` | FX-A-WO-REJECT-REP | corrective | technician | reporter |

### 1G.1: reject_work_order branch verification

Implementation date: 2026-04-25

`scripts/verify-workflow-reject-branches.ps1` covers the intermediate `reject_work_order` branches that the full workflow script intentionally leaves untouched:

```sh
npm run verify:workflow-reject-branches
```

Coverage added:

| Branch | Authorized actor tested | Expected return status | Operation log check |
| --- | --- | --- | --- |
| `pending_supervisor_approval` | `supervisor` | `in_progress` | `type=maintenance`, exact `Workflow rejected/returned. Reason: ...` description |
| `pending_engineer_review` | dedicated `engineer` fixture | `in_progress` | `type=maintenance`, exact `Workflow rejected/returned. Reason: ...` description |
| `pending_reporter_closure` | original `reporter` | `in_progress` | `type=maintenance`, exact `Workflow rejected/returned. Reason: ...` description |

Negative coverage added:

- Empty reason denied.
- Wrong tenant denied.
- Wrong role denied for supervisor, engineer, and reporter-closure branches.
- The dedicated `engineer` fixture is also used by `verify-workflow-full.ps1` for `approve_work_order_engineer`, replacing the earlier maintenance-manager override coverage.

### 1G: Known limitations

- Supervisor and engineer approval stages use tenant default settings (`require_supervisor_approval=true`, `require_engineer_review=true`). If the staging tenant has custom settings that skip one or both stages, those checks will be SKIPped automatically.
- A dedicated `engineer` role fixture now exists and is used for engineer review and engineer-stage rejection.
- Intermediate `reject_work_order` branches are covered by `verify:workflow-reject-branches`; `verify:workflow-full` still covers the early assigned rejection branch.
- Inventory quantity is verified against the qty present at the start of F8. If `prepare:staging-fixtures` was not run before this script, inventoryA may already have a depleted quantity (e.g. qty=2 from a previous run), but the delta check (`qty_after = qty_before - 1`) still passes correctly.

### 1G: Required before Pilot v1

**Yes.** This script must pass with zero FAILs before Pilot v1 user access is enabled. The happy path (F1â€“F21) directly mirrors the production workflow actors (technician, supervisor, manager, reporter) and operation log audit trail. The negative tests (F4-F7, F11-F12, F15-F16, F19, G1-G2) confirm that role and tenant isolation guards hold across every lifecycle stage.

---

## 1F. Workflow Authority Smoke Test (Task 003-C6)

Implementation date: 2026-04-25

### 1F: Script added

`scripts/verify-workflow-authority.ps1` â€” a focused smoke test that verifies the work-order security model end-to-end against the staging database.

**Run it:**

```sh
npm run verify:workflow-authority
```

**Required env vars** (from `.env.local` and/or `.env.staging-fixtures.local`):

```sh
VITE_SUPABASE_URL          # or SUPABASE_URL
VITE_SUPABASE_ANON_KEY     # or SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RLS_TECHNICIAN_ASSIGNED_WO_ID
RLS_TECHNICIAN_UNASSIGNED_WO_ID
RLS_TENANT_A_TECHNICIAN_JWT
RLS_TENANT_A_REPORTER_JWT
RLS_TENANT_B_USER_JWT
```

If JWTs are expired the script prints clear guidance and exits 1 before running any tests.

### Live run result (2026-04-25)

All 19 checks passed. PASS: 19 FAIL: 0 SKIP: 0.

Notable evidence from the run:

- Section A: HTTP 403 for direct `status` / `assigned_to` / `work_type` PATCH via service role â€” trigger confirmed firing.
- Section D: `wo_start` log count 0 â†’ 1; `wo_complete` log count 1 â†’ 2 â€” operation logs confirmed.
- Section E: anon returns HTTP 401; authenticated technician returns HTTP 403 â€” migration 119 revoke confirmed.

### Tests covered

| Section | Check | Expected |
| --- | --- | --- |
| A | Direct `status` update (service role PATCH) | 403 â€” migration 120 trigger blocks |
| A | Direct `assigned_to` update | 403 â€” trigger blocks |
| A | Direct `work_type` update | 403 â€” trigger blocks |
| B | Direct `title` update (safe metadata field) | 204 â€” not in sensitive list |
| B | Title restored after smoke update | 204 â€” confirms restore works |
| C | Reporter `start_work_order` denied | non-200 â€” role check |
| C | Tenant B actor `start_work_order` on Tenant A WO denied | non-200 â€” tenant isolation |
| C | Reporter `wo_start` denied | non-200 â€” role check |
| C | Tenant B actor `wo_start` on Tenant A WO denied | non-200 â€” tenant isolation |
| C | Technician `wo_start` on WO assigned to another actor denied | non-200 â€” assignment check |
| C | Reporter `wo_complete` denied | non-200 â€” role check |
| D | Technician `wo_start` succeeds on assigned WO | 200 success=true |
| D | `wo_start` wrote operation log | log count increases |
| D | `wo_start` rejected on in_progress WO (wrong status) | non-200 â€” status check |
| D | Technician `wo_complete` succeeds on in_progress WO | 200 success=true |
| D | `wo_complete` wrote operation log | log count increases |
| D | `wo_complete` rejected on completed WO (wrong status) | non-200 â€” status check |
| E | Anon cannot directly call `create_operation_log` | non-200 â€” migration 119 revoke |
| E | Authenticated user cannot directly call `create_operation_log` | non-200 â€” migration 119 revoke |

### 1F: State consumption

Section D runs `wo_start` then `wo_complete` on the assigned fixture WO (`RLS_TECHNICIAN_ASSIGNED_WO_ID`). The WO is left in `completed` state after the script finishes. Re-run the fixture script before the next test run:

```sh
npm run prepare:staging-fixtures
```

Section D adapts gracefully if the WO is already `in_progress` (skips `wo_start`, runs `wo_complete`). If the WO is in any other state, all Section D tests are skipped with a clear message.

### 1F: Known limitations

- No automated `start_work_order` positive test â€” that RPC is already covered by `verify:rls` when `RLS_ALLOW_MUTATION_TESTS=1`.
- `complete_work_order_technician` (reactive completion with parts) is not covered here.
- Supervisor/engineer approval RPCs are not covered here.
- The script cannot verify that trigger blocking works for non-service-role database connections (e.g., via psql or migration tooling); those are tested by the service-role PATCH in Section A.
- Section E result for `create_operation_log` may show HTTP 404 rather than 403 â€” PostgREST returns 404 when a role cannot see a function. Both outcomes confirm that direct execution is denied.

---

## 1E. Fixture Preparation Fix for Guarded Work Orders (Task 003-C5)

Implementation date: 2026-04-25

### What was broken

`scripts/prepare-staging-fixtures.ts` called `upsert('work_orders', [...], 'tenant_id,code')` which resolves ON CONFLICT with an UPDATE statement. Migration 120's `BEFORE UPDATE` trigger (`trg_guard_work_order_sensitive_fields`) rejected that UPDATE because the payload included `status`, `assigned_to`, `work_type`, `source_schedule_id`, `job_plan_id`, `scheduled_date`, and `compliance_deadline` â€” all in the protected field list.

### Chosen strategy: delete-then-insert

`DELETE` and `INSERT` are not `BEFORE UPDATE` events â€” the trigger never fires for them.

The fixture script now:

1. Deletes `operation_logs` rows where `work_order_id` matches a fixture ID.
   `operation_logs.work_order_id` has no `ON DELETE` clause (migration 002), so it defaults to `RESTRICT` and blocks work-order deletion unless cleared first.
2. Deletes the three deterministic fixture work-order IDs.
   Remaining dependents (`work_order_checks`, etc.) use `ON DELETE CASCADE` and are removed automatically.
3. Inserts fresh rows in the desired initial state using a new `insertMany` helper backed by the Supabase `.insert()` API (plain SQL INSERT).
4. Resets `pm_schedules.total_completed`, `total_generated`, and `compliance_rate` counters in the upsert payload so PM compliance stats are predictable across runs.

This does **not** bypass or weaken migration 120. The trigger is unchanged. The fixture script uses a fundamentally different SQL operation (DELETE + INSERT) rather than any authorized UPDATE path.

### Files changed

- `scripts/prepare-staging-fixtures.ts` â€” added `insertOne`/`insertMany` helpers; replaced `upsert('work_orders', ...)` with delete-then-insertMany; added counter reset to pm_schedules payload.

### Remaining manual steps

- **JWT refresh**: Fixture JWTs expire. Re-run `scripts/prepare-staging-fixtures.ts` (requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`) to get fresh tokens. The script writes them to `.env.staging-fixtures.local`.
- **Required env vars** for the fixture script:

  ```sh
  VITE_SUPABASE_URL=https://<project>.supabase.co
  VITE_SUPABASE_ANON_KEY=<anon key>
  SUPABASE_SERVICE_ROLE_KEY=<service role key>
  MUTQAN_FIXTURE_PASSWORD=<shared fixture password>  # optional; generated if absent
  ```

- **After wo_start/wo_complete tests**: Re-run the fixture script to reset `assignedWo` back to `assigned` status. The delete-then-insert ensures a clean slate on every run.

### How to refresh JWTs manually (without the script)

1. Reset fixture user password via Supabase admin API: `PUT /auth/v1/admin/users/{id}` with `{"password":"<new>","email_confirm":true}`.
2. Sign in via anon endpoint: `POST /auth/v1/token?grant_type=password` with `{"email":"...","password":"..."}`.
3. Use the returned `access_token` directly in test HTTP headers.

---

## 1D. Phase 2 / Migration 121 Verification Results (Task 003-C4)

Verification date: 2026-04-25

### Migration 121 applied

Applied manually to staging database before this verification session.

### Fixture note

Fixture JWTs in `.env.local` had expired (exp 2026-04-21). Fresh JWTs were obtained by resetting fixture user passwords via the Supabase admin auth API (`PUT /auth/v1/admin/users/{id}`) and signing in via the anon sign-in endpoint. `scripts/prepare-staging-fixtures.ts` itself failed because migration 120's trigger blocks the work_orders upsert (the fixture script tries to update `scheduled_date`, `status`, etc. which are now sensitive fields). This is a known side-effect documented under remaining gaps below.

### Live test results

| Check | Result | Evidence |
| --- | --- | --- |
| Migration 121 applied manually | âœ… Yes | Both functions exist and behave as expected |
| `wo_start` function exists | âœ… Yes | HTTP 400 (not 404) for non-existent UUID with tech JWT; HTTP 403 for service-role (no EXECUTE grant â€” expected) |
| `wo_complete` function exists | âœ… Yes | Same pattern |
| `wo_start` authorized â€” technician on assigned WO | âœ… Pass | HTTP 200, `{"success":true,"work_order_id":"bbbbâ€¦b1"}`, status `assignedâ†’in_progress`, `started_at` set |
| `wo_start` JSONB shape compatible with frontend | âœ… Pass | Response matches `usePMFoundation.startWorkOrder` expected shape |
| Operation log created by `wo_start` | âœ… Pass | Log count 3â†’4 (+1 "PM work order started") |
| `wo_complete` authorized â€” technician on in-progress WO | âœ… Pass | HTTP 200, `{"success":true,"work_order_id":"bbbbâ€¦b1"}`, status `in_progressâ†’completed` |
| `wo_complete` JSONB shape compatible with frontend | âœ… Pass | Response matches `usePMFoundation.completeWorkOrder` expected shape |
| `completed_at` set | âœ… Pass | `2026-04-25T00:36:25.956â€¦` |
| `completion_notes` stored | âœ… Pass | "PM 121 verification test" |
| `actual_duration_minutes` calculated | âœ… Pass | `1` (started ~1 min earlier) |
| PM schedule `total_completed` incremented | âœ… Pass | `0â†’1` |
| Operation log created by `wo_complete` | âœ… Pass | Log count 4â†’5 (+1 "PM work order completed") |
| Trigger regression â€” direct status update still blocked | âœ… Pass | Service-role PATCH `{"status":"completed"}` â†’ HTTP 403 `code: 42501`, migration-120-specific message |
| **Negative: wrong status** â€” `wo_start` on completed WO | âœ… Blocked | HTTP 400 `"Cannot start work order in status: completed"` |
| **Negative: unauthorized role** â€” reporter attempts `wo_start` | âœ… Blocked | HTTP 403 `"Unauthorized: your role is not permitted to start a work order"` |
| **Negative: wrong tenant** â€” Tenant B user attempts `wo_start` on Tenant A WO | âœ… Blocked | HTTP 403 `"Access denied: work order belongs to a different tenant"` |
| **Negative: unassigned actor** â€” technician attempts WO assigned to supervisor | âœ… Blocked | HTTP 403 `"Only the assigned technician can start this work order"` |
| **Negative: wrong status for complete** â€” `wo_complete` on non-in-progress WO | âœ… Blocked | HTTP 400 `"Only in-progress work orders can be completed; current status: assigned"` |
| App ExecutionDialog smoke | âڈ­ï¸ڈ Not run | Manual browser test deferred; all REST API checks pass |
| `npm run build` | âœ… 0 errors | Built in 33.34s |
| `npm run lint` | âœ… 0 errors | 223 pre-existing warnings, none introduced |

### Fixture reset limitation (side-effect of migration 120)

`scripts/prepare-staging-fixtures.ts` can no longer reset work-order state via its `upsert` call because:

- Migration 120's trigger blocks updates to `status`, `assigned_to`, `work_type`, `source_schedule_id`, `job_plan_id`, `scheduled_date`, and `compliance_deadline`.
- All of these appear in the fixture WO upsert payload; some use `new Date()` so they always change.

After this verification session, fixture WO1 (`bbbbâ€¦b1`) is in `completed` status. To reset for subsequent tests, either:

1. Run the fixture reset SQL manually in the Supabase SQL editor with `set_config` authorization:

   ```sql
   SET LOCAL app.work_order_workflow_authorized = 'true';
   UPDATE public.work_orders SET status = 'assigned', ... WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
   ```

2. Or update `scripts/prepare-staging-fixtures.ts` to use `INSERT â€¦ ON CONFLICT (tenant_id, code) DO NOTHING` for work_orders (skips updating existing rows, avoids trigger).

## 1C. Phase 2 Verification Results

Verification date: 2026-04-24 (same session as implementation)

| Check | Result | Evidence |
| --- | --- | --- |
| Migration 120 applied manually | âœ… Yes | Trigger fires and returns migration-120-specific error text |
| Trigger `trg_guard_work_order_sensitive_fields` exists and enabled | âœ… Yes | Service-role PATCH to `status` â†’ HTTP 403 with `code: 42501`, `message: "Direct update of workflow-sensitive field \"status\" is not permittedâ€¦ (migration 120)."` |
| Direct status update blocked | âœ… Yes | `PATCH /rest/v1/work_orders?id=eq.{WO1}` `{"status":"completed"}` â†’ 403 trigger error |
| Direct assigned_to update blocked | âœ… Yes | Same pattern â†’ 403 trigger error |
| Direct technician_notes update blocked | âœ… Yes | Same pattern â†’ 403, field name `technician_notes` returned in error |
| Metadata title update allowed | âœ… Yes | `{"title":"Fixture assigned work order"}` â†’ 204, fixture intact |
| Metadata priority update allowed | âœ… Yes | `{"priority":"high"}` â†’ 204; reset â†’ 204; not in sensitive list |
| Fixture work order state preserved after blocked updates | âœ… Yes | WO1 status remains `assigned`, assigned_to unchanged |
| `start_work_order` RPC still works and logs | âڈ­ï¸ڈ JWT expired | Fixture JWTs expired (exp 2026-04-21; previously miscalculated as 2026-04-18). Fresh JWTs required for live test. Code review confirms `set_config` present. |
| `wo_start` blocked pending PM hardening | âœ… Verified in 1D | Migration 121 hardened both RPCs; see Task 003-C4 verification in section 1D above. |
| `npm run build` | âœ… 0 errors | Built in 28.96s |
| `npm run lint` | âœ… 0 errors | 223 pre-existing warnings, none introduced |

## 1B. Phase 2 DB Sensitive-Field Guard Status

Implementation date: 2026-04-24

### What was implemented

Migration `supabase/migrations/120_guard_work_order_sensitive_fields.sql` adds a `BEFORE UPDATE` trigger on `public.work_orders` that rejects direct changes to workflow-sensitive fields unless the transaction is explicitly authorized by an approved workflow RPC.

**Trigger function:** `public.guard_work_order_sensitive_fields()`

- Checks the transaction-local GUC `app.work_order_workflow_authorized`. If `'true'`, the trigger allows the UPDATE through.
- If not set, converts `OLD` and `NEW` rows to JSONB via `to_jsonb()` and iterates a hardcoded list of sensitive field names.
- If any sensitive field changed, raises `insufficient_privilege` with the field name.
- Resilient to missing columns: `to_jsonb()` only emits keys for columns that actually exist in the schema; fields in the list that are absent from the table are simply skipped.

**Protected fields:**

`status`, `assigned_to`, `assigned_team`, `start_time`, `started_at`, `end_time`, `completed_at`, `technician_completed_at`, `technician_notes`, `supervisor_approved_by`, `supervisor_approved_at`, `supervisor_notes`, `engineer_approved_by`, `engineer_approved_at`, `engineer_notes`, `maintenance_manager_approved_by`, `maintenance_manager_approved_at`, `maintenance_manager_notes`, `customer_reviewed_by`, `customer_reviewed_at`, `reporter_notes`, `pending_closure_since`, `auto_closed_at`, `actual_cost`, `sla_response_met`, `sla_resolution_met`, `completion_notes`, `work_type`, `source_schedule_id`, `source_schedule_asset_id`, `job_plan_id`, `job_plan_snapshot`, `scheduled_date`, `compliance_deadline`, `actual_duration_minutes`.

### RPCs updated

The following approved workflow RPCs were updated to call `set_config('app.work_order_workflow_authorized', 'true', TRUE)` immediately before their `UPDATE public.work_orders` statement. The `TRUE` argument makes the GUC transaction-local: it is automatically cleared at transaction end.

- `start_work_order(UUID)` â€” updated
- `complete_work_order_technician(UUID, TEXT, JSONB)` â€” updated
- `approve_work_order_supervisor(UUID, TEXT)` â€” updated
- `approve_work_order_engineer(UUID, TEXT)` â€” updated
- `close_work_order(UUID, TEXT)` â€” updated
- `reject_work_order(UUID, TEXT)` â€” updated (authorization set before the CASE branch so all status-transition UPDATEs in the function body are covered)
- `auto_close_stale_work_orders()` â€” updated (server-side batch; pre-existing schema issues with `auto_closed` status and `closed_at`/`closed_notes` columns remain unresolved from migration 052)

### PM foundation RPCs: hardened in migration 121

`wo_start(UUID)` and `wo_complete(UUID, TEXT)` were intentionally left unauthorized in migration 120 because they had no tenant isolation, role check, or assignment check. They were blocked by the trigger.

Migration `supabase/migrations/121_harden_pm_wo_start_wo_complete.sql` replaces both RPCs with hardened versions that match the reactive workflow RPC standard:

- **Tenant isolation:** Actor must belong to the same tenant as the work order (platform owner/admin override allowed).
- **Role check:** `technician`, `engineer`, `maintenance_manager`, `tenant_admin`, `platform_owner`, `platform_admin`, `is_super_admin`.
- **Assignment check:** Management roles may bypass; otherwise only the assigned actor can start/complete.
- **Status check:** `wo_start` accepts `pending` or `assigned`; `wo_complete` requires `in_progress`.
- **Trigger authorization:** `set_config('app.work_order_workflow_authorized', 'true', TRUE)` called before UPDATE.
- **Operation log:** `create_operation_log()` called after UPDATE.

PM-specific behaviors preserved:

- `wo_start` sets both `start_time` (existing column) and `started_at` (PM column); self-assigns if `assigned_to` is NULL.
- `wo_complete` validates required checks, updates `pm_schedules.compliance_rate`, and transitions directly to `completed` (PM work orders bypass approval stages).
- `wo_complete` calculates `actual_duration_minutes` from `started_at` or `start_time`.

**Status:** Migration file written. Pending manual application to staging/linked database. PM execution flow (`ExecutionDialog` â†’ `wo_start` / `wo_complete`) will be restored once migration 121 is applied.

### Remaining gaps after Phase 2

- **Database-level guard is in place** for direct UPDATE paths. Client-side allowlist remains as defense-in-depth.
- **`create_work_order` RPC** is implemented in migration 122 for audited authenticated creation; direct authenticated INSERT is disabled.
- **`assign_work_order` RPC** is implemented in migration 123 for audited assignment and reassignment. Creation can carry `assigned_team` context but does not set status `assigned`.
- **Cancel/archive RPCs** are still needed before the disabled hard-delete hook can be formally retired.
- **PM foundation `wo_start` and `wo_complete`** hardened in migration 121 (pending manual application to staging). PM execution flows will be restored once applied.
- **PM check and evidence updates** (`work_order_checks` table) are not guarded by this trigger. A field allowlist and status restriction for PM check updates remain a future task.
- **Workflow RPC mutation tests** are still required. No automated tests verify the trigger blocks direct updates or that RPCs succeed and log correctly.
- **`auto_close_stale_work_orders`** has pre-existing schema issues (wrong status value, missing columns) that are unrelated to this guard but should be fixed before auto-close is enabled in production.

## 1A. Phase 1 Client-Side Safety Pass Status

Implemented in this Phase 1 client-side pass:

- `src/hooks/useWorkOrders.ts` no longer allows `useUpdateWorkOrder` to accept `Partial<WorkOrder>`. It now accepts a narrow metadata-only update input.
- `useUpdateWorkOrder` now sanitizes updates through an explicit runtime allowlist before sending any payload to Supabase.
- Safe direct metadata update fields are limited to currently recognized metadata fields: `title`, `description`, `issue_type_id`, `issue_type`, `priority`, `due_date`, location/asset references, `estimated_cost`, `tags`, and `custom_fields`.
- `useUpdateWorkOrderStatus` is disabled and throws: "Direct work order status updates are disabled. Use workflow RPC actions instead."
- `useDeleteWorkOrder` is disabled and throws: "Direct work order deletion is disabled for operational memory protection. Use the audited cancel workflow."
- `CreateWorkOrderInput` is narrowed to the current creation-safe shape and no longer accepts `tenant_id`, `status`, `assigned_to`, or `created_by`.

Remaining risks after this Phase 1 pass:

- Database-level sensitive-field guard is implemented by migration 120.
- `create_work_order` RPC is implemented by migration 122 for audited authenticated creation.
- `assign_work_order` RPC is implemented for audited assignment and reassignment.
- Cancel/archive RPCs are still needed before operational hard delete can be fully retired.
- Creation-time `assigned_team` remains accepted as context because current UI and PM flows depend on it; creation-time `status` and `assigned_to` are no longer accepted.
- Legacy PM task-to-work-order creation is routed through `create_work_order`; source metadata and future assignment still need follow-up.
- PM foundation `wo_start`, `wo_complete`, and check/evidence paths still need hardening and tests.

## 2. Work-Order Lifecycle Authority Principle

Mutqan should treat work-order lifecycle state as operational memory. A user who bypasses the frontend should not be able to silently rewrite workflow history, assignment, completion, approvals, closure, evidence, parts usage, or deletion state.

The following operations should be RPC-only or database-audited:

- Create: validate tenant, creator, reporter, asset/location ownership, source module, subscription/feature eligibility, duplicate code behavior, and create an operation log.
- Assign and reassign: validate actor role, tenant, assignee tenant, assignee role/team membership, current status, unassign rules, notification behavior, and operation log.
- Start: validate actor role, tenant, current status, assignment or self-assignment rule, timestamps, and operation log.
- Complete: validate assigned actor or management override, current status, completion notes/evidence requirements, parts usage, stock, timestamps, next workflow status, and operation log.
- Approve: validate supervisor or engineer authority, workflow settings, current status, approver fields, notes, and operation log.
- Reject or return: validate current stage, actor role, assignment or reporter ownership where required, non-empty reason, status rollback/cleanup, and operation log.
- Close: validate original reporter or management override, current status, reporter notes, closure fields, and operation log.
- Cancel/archive/delete: avoid hard delete for normal operations; require reason, role, current status rules, and audit history.
- Parts usage: validate same-tenant inventory, positive quantity, available stock, inventory transaction behavior, and operation log.
- Completion evidence: treat before/after images, attachments, PM check results, signatures, and uploaded photos as sensitive evidence tied to the work-order lifecycle.

Direct table writes should be limited to safe metadata fields and should still be covered by RLS, tenant/location validation, and preferably an update log.

## 3. Inventory of Direct Mutation Paths

| File | Function/component | Mutation type | Fields exposed or accepted | Sensitive fields possible? | Current guard | Current audit/logging | Risk level | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src/hooks/useWorkOrders.ts` | `useCreateWorkOrder` | RPC call | `CreateWorkOrderInput`: code, title, description, issue type, priority, reported_by, optional `assigned_team`, location fields, asset, due date, reporter contact fields | No status/assignee/provenance fields through hook; `assigned_team` is creation context only | Calls `create_work_order`; direct authenticated INSERT disabled by `work_orders_insert_disabled_direct` | RPC writes `operation_logs.type = create` | Low | Keep on RPC; use `assign_work_order` for status-changing assignment |
| `src/hooks/useWorkOrders.ts` | `useUpdateWorkOrder` | update | Phase 1 now accepts only `UpdateWorkOrderMetadataInput` and sanitizes to an allowlist: title, description, issue type, priority, due date, location/asset refs, estimated cost, tags, custom fields | Client-side sensitive fields are blocked, but DB bypass remains possible | Client runtime allowlist plus RLS `work_orders_update_scoped`; DB still allows broad manager update | No operation log in hook or RLS policy | High | Add DB guard blocking sensitive fields outside approved RPCs; later move metadata corrections to audited RPC if needed |
| `src/hooks/useWorkOrders.ts` | `useUpdateWorkOrderStatus` | update | Disabled in Phase 1; throws before Supabase call | No through this hook; DB bypass remains possible | Hook throws clear workflow-RPC error | No operation log because no mutation occurs | Medium | Keep disabled; use workflow RPCs and add DB guard for direct status changes |
| `src/hooks/useWorkOrders.ts` | `useDeleteWorkOrder` | delete | Disabled in Phase 1; throws before Supabase call | No through this hook; DB bypass remains possible | Hook throws operational-memory protection error | No operation log because no mutation occurs | Medium | Keep disabled for Pilot v1; replace with audited cancel/archive RPC |
| `src/components/work-orders/AddWorkOrderModal.tsx` | `handleSubmit` | RPC through `useCreateWorkOrder` | Sends generated `code`, title, description, issue type, priority, location/asset, due date, reported_by, optional `assigned_team` | No status or individual assignee; `assigned_team` is context only | RPC checks actor, role, tenant, operational access, and location/asset scope | RPC writes create log | Low | Keep; use `assign_work_order` for real assignment |
| `src/hooks/useMaintenanceTasks.ts` | `createTaskMutation` when `input.shouldCreateWorkOrder` | RPC | Creates related work order through `create_work_order` with safe creation fields; no status, assignee, or maintenance provenance | No status/assignee through creation | RPC guard plus PM UI permissions | RPC writes create log; maintenance task relation update remains separate | Medium | Add source metadata and route any status-changing assignment through `assign_work_order` |
| `src/components/maintenance/TaskExecutionModal.tsx` | `handleCreateWorkOrder` | RPC through `useCreateWorkOrder`, then updates maintenance task relation | Creates related work order from PM task with title, priority, reporter, team context, location/asset, due date | No status/assignee through creation | UI checks current tenant/user and create permission; RPC enforces DB authority | RPC writes create log | Medium | Add source task metadata and use `assign_work_order` for assignment |
| `src/hooks/usePMFoundation.ts` | `generateDueWorkOrders` | RPC call, not direct client table insert | Calls `pm_generate_due_work_orders()` | Yes, but mutation occurs inside DB RPC | RPC checks auth role/profile and scopes tenant users to their tenant; platform/service contexts can run all tenants | No operation log per generated work order found in inspected function; function returns generation trace | Medium | Keep as RPC-backed PM generation, but add generation audit/operation logs and tests for tenant scoping |
| `api/pm-generate-wos.ts` | cron handler | RPC call with service role | Calls `pm_generate_due_work_orders()` across tenants after `CRON_SECRET` check | Yes, but intended trusted cron path | Server requires `CRON_SECRET`; RPC service/admin path can generate all tenants | Console logs generation run; no per-WO operation log found | Medium | Keep cron-only; add persistent audit for PM generation runs and per-WO create logs if operationally required |
| `src/hooks/usePMFoundation.ts` | `usePMExecutionMutations.startWorkOrder` | RPC call | Calls `wo_start(p_wo_id)` | Yes. Starts PM work orders | Inspected RPC checks auth and `status = 'pending'`; tenant/role/assignment checks were not visible | No operation log found in `wo_start` | High, needs verification | Harden or replace with workflow-equivalent RPC that validates tenant, role, assignment/team membership, PM status, and logs |
| `src/hooks/usePMFoundation.ts` | `usePMExecutionMutations.completeWorkOrder` | RPC call | Calls `wo_complete(p_wo_id, p_completion_notes)` | Yes. Completes PM work orders | Inspected RPC checks auth, current status, and required checks; tenant/role/assignment checks were not visible | No operation log found in `wo_complete` | High, needs verification | Harden or wrap with the same actor/tenant/assignment rules and operation logging as reactive completion |
| `src/hooks/usePMFoundation.ts` | `usePMExecutionMutations.updateCheck` | update to `work_order_checks`, related evidence | Accepts `Partial<PMWorkOrderCheck>` and updates check values/status plus `checked_at` | Yes. Completion evidence can be altered | RLS on `work_order_checks` includes management and technician update policies, but exact status/assignment behavior needs runtime tests | No operation log found per check update | Medium | Treat PM check updates as lifecycle evidence; add field allowlist, status restrictions, and tests |
| `src/components/maintenance/ExecutionDialog.tsx` | `CheckEditor` / `PhotoUploader` | related evidence update plus storage upload/delete | Sends check result values, status, and photo URL through `updateCheck`; uploads/removes storage objects | Yes. Evidence and photo references | UI disables after completion; storage policies not fully audited in this pass | No operation log found per evidence change | Medium, needs verification | Include PM evidence in lifecycle tests and consider audited attachment/check RPCs if evidence integrity is required |
| `supabase/migrations/098_public_portal_entitlement_enforcement.sql` | `submit_public_work_order` | insert inside RPC | Inserts public work order with token-derived tenant, public reporter fields, status `pending`, priority `medium`, building/floor/asset | Yes, but scoped public intake | RPC validates active token, entitlement, and same-tenant building/floor/asset | Calls `create_operation_log` with type `create` | Medium | Keep disabled by default for Pilot v1 unless portal is in scope; add abuse controls/rate limiting before broad use |
| `supabase/migrations/112_pm_generation_trace_and_idempotency.sql` | `pm_generate_due_work_orders` | insert inside RPC | Inserts preventive WOs with status `pending`, default assignee/team, PM source schedule/job-plan fields, schedule/compliance dates, asset links, checks | Yes, but RPC-controlled | RPC limits authenticated tenant callers to their tenant and platform/service to broader scope | No per-work-order operation log found | Medium | Keep RPC path but add tests and persistent audit; verify role list includes only intended roles |

Not currently found as active UI callers:

- No current imports of `useUpdateWorkOrder`, `useUpdateWorkOrderStatus`, or `useDeleteWorkOrder` were found under `src` beyond their definitions.
- Direct authenticated INSERT is now disabled; direct update/delete risks remain governed by the update guard and existing delete policy until cancel/archive is implemented.

## 4. Safe vs Unsafe Mutations

Safe metadata candidate fields, subject to business rules:

- `title`
- `description`
- `issue_type_id` and `issue_type`
- `priority`
- `due_date`
- `building_id`, `floor_id`, `department_id`, `room_id`, `asset_id` before execution starts
- `tags`
- `custom_fields`
- possibly `estimated_cost` before approval/completion

These fields should still be constrained by tenant/location validation and should generally be blocked once the work order has entered execution or completion stages unless an audited correction path exists.

Unsafe workflow-sensitive fields:

- `tenant_id`
- `code` after creation
- `status`
- `assigned_to`
- `assigned_team`
- `reported_by`
- `created_by`
- `reported_at`
- `start_time`
- `started_at`
- `end_time`
- `completed_at`
- `technician_completed_at`
- `technician_notes`
- `supervisor_approved_by`
- `supervisor_approved_at`
- `supervisor_notes`
- `engineer_approved_by`
- `engineer_approved_at`
- `engineer_notes`
- `maintenance_manager_approved_by`
- `maintenance_manager_approved_at`
- `maintenance_manager_notes`
- `customer_reviewed_by`
- `customer_reviewed_at`
- `reporter_notes`
- `pending_closure_since`
- `auto_closed_at`
- `attachments`
- `before_images`
- `after_images`
- `actual_cost`
- `sla_response_deadline`
- `sla_resolution_deadline`
- `sla_response_met`
- `sla_resolution_met`
- PM provenance and execution fields: `work_type`, `source_schedule_id`, `source_schedule_asset_id`, `job_plan_id`, `job_plan_snapshot`, `scheduled_date`, `compliance_deadline`, `completion_notes`, `actual_duration_minutes`

Needs verification:

- Whether every column listed above exists in the linked runtime database after all migrations.
- Whether hidden/generated Supabase types expose additional fields not represented in `WorkOrder`.

## 5. Existing RPC Coverage

Reactive workflow RPCs already used by the frontend:

- `start_work_order(p_work_order_id)`: used by `useWorkOrderWorkflow.startWork`; covers pending/assigned to in-progress, self-assignment when unassigned, role/tenant/status checks, and operation log.
- `complete_work_order_technician(p_work_order_id, p_technician_notes, p_parts)`: used by `useWorkOrderWorkflow.completeWorkTechnician`; covers technician completion, required current status, assignment/management override, tenant workflow settings, parts tenant/stock checks, inventory decrement, and operation logs.
- `approve_work_order_supervisor(p_work_order_id, p_notes)`: used by `useWorkOrderWorkflow.approveSupervisor`; covers supervisor-stage approval, role/tenant/status checks, next status based on settings, approver fields, and operation log.
- `approve_work_order_engineer(p_work_order_id, p_notes)`: used by `useWorkOrderWorkflow.approveEngineer`; covers engineer-stage review, role/tenant/status checks, approver fields, and operation log.
- `close_work_order(p_work_order_id, p_notes)`: used by `useWorkOrderWorkflow.closeWorkOrder`; covers reporter or management closure, tenant/status checks, closure fields, and operation log.
- `reject_work_order(p_work_order_id, p_reason)`: used by `useWorkOrderWorkflow.rejectWork`; covers non-empty reason, stage-specific actor rules, status rollback, and operation log.

Public/PM RPCs that create or mutate work orders:

- `submit_public_work_order(...)`: public intake RPC; validates active token, entitlement, and same-tenant location/asset, then logs creation.
- `create_work_order(p_work_order jsonb, p_tenant_id uuid default null)`: authenticated normal creation RPC; validates active actor, tenant/role/location scope, safe payload keys, inserts pending work order, and logs creation.
- `pm_generate_due_work_orders()`: PM generation RPC; creates preventive work orders and checks. Authenticated tenant callers are scoped to their tenant; service/platform can run broader generation.
- `wo_start(p_wo_id)`: PM foundation start RPC. Needs hardening/verification because inspected code checks auth and status but not tenant, role, assignment, or operation logging.
- `wo_complete(p_wo_id, p_completion_notes)`: PM foundation completion RPC. Needs hardening/verification because inspected code checks auth, status, and required checks but not tenant, role, assignment, or operation logging.

Missing RPC coverage:

- `assign_work_order` now exists for audited assignment/reassignment.
- `create_work_order` now exists for authenticated normal creation.
- `cancel_work_order` now exists for audited Pilot v1 cancellation.
- No separate `archive_work_order` RPC found.
- No audited metadata update RPC found.
- No unified RPC for PM task-to-work-order conversion found.

## 6. Assignment Handling

Assignment currently happens in several ways:

- Normal create modal can send `assigned_team` during creation when assignment feature is enabled and the user has `work_orders.manage`; the RPC keeps status `pending`.
- `useMaintenanceTasks.createTaskMutation` can send `assigned_team` context when creating a related work order; it no longer sends `assigned_to` or initial `assigned` status.
- `TaskExecutionModal.handleCreateWorkOrder` can send `assigned_team` context from a maintenance task snapshot; it no longer sends `assigned_to` or initial `assigned` status.
- `start_work_order` can set `assigned_to = auth.uid()` when the work order is unassigned and the actor is allowed to start it.
- `pm_generate_due_work_orders` sets default PM assignee/team from schedules while keeping status `pending`.
- Before Phase 1, the generic `useUpdateWorkOrder` could update `assigned_to` and `assigned_team` directly if called by a role allowed by RLS. The client hook now sanitizes those fields out, but database-level protection is still required.

Assignment now has a dedicated `assign_work_order` RPC. Creation keeps `assigned_team` as pending context for compatibility; assignment that changes operational ownership/status should go through the RPC.

Required validation rules for assignment:

- Actor must be authenticated, active, and same tenant unless platform owner/admin override is explicitly allowed.
- Actor role must be limited to `tenant_admin` and `maintenance_manager` for tenant operations, plus explicitly approved platform roles.
- Assignee must be an active same-tenant user with a role allowed to perform the target work type, such as `technician` or `engineer`.
- Team must be same tenant and active; if both assignee and team are supplied, either require membership or document why not.
- Work order must be in a status where assignment/reassignment is legal, typically `pending`, `assigned`, or possibly `on_hold`; avoid changing assignment after completion/approval/closure except through audited correction.
- Assignment should not cross tenant boundaries through `assigned_to`, `assigned_team`, `asset_id`, or location fields.
- Status transition from `pending` to `assigned` should be performed inside the RPC when assignment is made.
- Unassign/reassign must require a reason once work is in progress or after rejection.
- Every assignment or reassignment should create an operation log.

## 7. Creation Handling

Direct authenticated creation is now disabled by RLS and replaced by the audited RPC:

- `work_orders_insert_disabled_direct` rejects normal authenticated INSERT.
- `create_work_order(...)` uses `can_create_work_orders_scope(tenant_id)`.
- `can_create_work_orders_scope` allows platform owner/admin/super admins and same-tenant `tenant_admin`, `facility_manager`, `maintenance_manager`, `supervisor`, `engineer`, and `reporter` when the tenant has operational access.
- `work_order_asset_location_is_valid(...)` verifies location/asset tenant consistency inside the RPC.

The direct insert model was not enough for Pilot v1 because creation needs operational memory guarantees. Migration 122 moves normal authenticated creation to a single payload shape with operation logging.

Recommendation:

- Continue using `create_work_order` RPC for authenticated creation.
- Add `assign_work_order` for any status-changing assignment flow instead of expanding creation.
- Keep direct authenticated insert disabled.

Needs verification:

- Whether subscription monthly work-order limits are still enforced in the database. `AddWorkOrderModal` checks usage client-side; old migration text shows subscription limit trigger commented out.

## 8. Delete, Cancel, and Archive Handling

`useDeleteWorkOrder` is disabled in the Phase 1 client hook and now throws before calling Supabase. Migration 125 disables direct authenticated database/RLS hard delete by dropping the known work-order DELETE policies and replacing them with `work_orders_delete_disabled_direct` (`USING (FALSE)`). Before migration 125 is applied to an environment, managers may still be able to delete rows through `work_orders_delete_scoped` / `"Managers can delete work orders"` if they bypass the client.

Hard delete should be disabled for Pilot v1. Work orders are operational memory and may link to operation logs, parts, PM checks, attachments, schedule compliance, reports, and customer-visible history.

Recommended replacement:

- Use `cancel_work_order` RPC for user-visible cancellation.
- Add `archive_work_order` RPC for lifecycle cleanup without removing history.
- Require a non-empty reason for cancellation/archive.
- Restrict cancellation by current status; the Pilot v1 RPC allows `pending`, `assigned`, and `on_hold`, and denies `in_progress`, approval/review/closure, completed, cancelled, archived, and other closed-equivalent states.
- Preserve operation logs, parts, checks, attachments, and PM relationships.
- Consider leaving hard delete available only to service-role maintenance scripts with documented break-glass approval.

## 9. PM-Generated Work-Order Paths

Identified PM paths:

- Legacy maintenance tasks: `useMaintenanceTasks.createTaskMutation` now creates a related work order through `create_work_order` when `shouldCreateWorkOrder` is true.
- Legacy task execution: `TaskExecutionModal.handleCreateWorkOrder` creates a related work order through `useCreateWorkOrder` / `create_work_order`, then updates the maintenance task with `related_work_order_id`.
- PM foundation generation: `pm_generate_due_work_orders()` inserts preventive work orders and check rows inside a database RPC, called from `usePMFoundation.generateDueWorkOrders` and from `api/pm-generate-wos.ts`.
- PM foundation execution: `ExecutionDialog` starts/completes PM work orders through `wo_start` and `wo_complete`; evidence/check results are updated directly through `work_order_checks`.

Recommended alignment:

- All PM-generated work orders should use the same authority model as reactive work orders.
- Legacy PM-to-WO creation has been routed through `create_work_order` for creation; any future status-changing assignment should use `assign_work_order`.
- `pm_generate_due_work_orders()` should remain RPC-based, but should create operation logs or a persistent generation audit event for each generated work order or generation batch.
- `wo_start` and `wo_complete` should be brought up to the same tenant/role/assignment/logging standard as `start_work_order` and `complete_work_order_technician`.
- PM check and photo updates should be treated as completion evidence and covered by mutation tests.

## 10. Proposed Remediation Design

Phase 1: Restrict generic update path with allowlist. Client-side portion implemented; DB guard remains.

- Replace `useUpdateWorkOrder` payload with a narrow metadata update input.
- Block `status`, assignment, approval, completion, closure, cost actuals, SLA result fields, evidence fields, and PM provenance/execution fields.
- Remove or deprecate `useUpdateWorkOrderStatus`.
- Add a database trigger guard for sensitive fields outside approved RPCs if feasible; client-only allowlists are not enough.

Phase 2: Assignment RPC. Implemented.

- `assign_work_order` now validates role, tenant, assignee/team, status, reason, and audit logging.
- Creation keeps initial `assigned_team` as pending context for compatibility.
- `useWorkOrderWorkflow` exposes `assignWorkOrder`.

Phase 3: Audited create path. Implemented for normal authenticated creation.

- `create_work_order` RPC exists for authenticated creation.
- `AddWorkOrderModal`, PM task creation, and task execution related-WO creation use the same create path.
- Source metadata is accepted by the RPC but not yet surfaced consistently by callers.

Phase 4: Disable delete or replace with cancel/archive.

- Direct hard delete UI/hook behavior is disabled.
- `cancel_work_order` exists with reason and operation log.
- Add `archive_work_order` only after a separate archive policy is defined.
- Preserve row history and related records.

Phase 5: Tests.

- Add mutation tests before enabling real pilot workflow usage.
- Cover direct table write denial, RPC allowed/denied cases, cross-tenant denial, and operation logs.
- Include PM foundation and legacy PM-to-WO paths.

## 11. Required Tests

Direct update denial or allowlist tests:

- Manager cannot directly update `status`.
- Manager cannot directly update `assigned_to` or `assigned_team`.
- Manager cannot directly update approval fields.
- Manager cannot directly update completion and closure fields.
- Manager cannot directly update evidence fields after execution starts.
- Safe metadata update succeeds only for the allowed fields and allowed statuses.
- Reporter/technician cannot update metadata outside allowed business rules.
- Cross-tenant direct update is denied.

Assignment tests:

- Maintenance manager can assign a pending same-tenant work order to an active same-tenant technician.
- Assignment logs an operation event.
- Assignment changes status from `pending` to `assigned` where intended.
- Assignment to cross-tenant user is denied.
- Assignment to inactive user is denied.
- Assignment to unauthorized role is denied.
- Assignment to cross-tenant team is denied.
- Reassignment after in-progress requires elevated role and reason, or is denied.
- Assignment after completed/archived/cancelled is denied.

Create tests:

- Allowed roles can create same-tenant work orders with safe fields.
- Reporter cannot create for another tenant.
- Cross-tenant asset/building/floor/room values are denied.
- Creation cannot set approval/completion/closure fields.
- Creation cannot set arbitrary `tenant_id` inconsistent with actor.
- Creation logs an operation event.
- Initial assignment follows create/assign rules.
- Subscription or operational access disabled tenant is denied.

Workflow RPC tests:

- Start, complete, supervisor approval, engineer approval, close, and reject allowed cases.
- Wrong role denied for every stage.
- Wrong tenant denied for every stage.
- Wrong current status denied for every stage.
- Unassigned/assigned technician behavior matches documented rule.
- Parts usage validates same tenant, positive quantity, and sufficient stock.
- Each authorized RPC writes expected operation logs.

PM tests:

- PM generation by tenant manager only creates work orders for the caller tenant.
- Platform/service generation scope is intentional and audited.
- `wo_start` denies wrong tenant, unauthorized role, and unassigned actor after hardening.
- `wo_complete` denies wrong tenant, unauthorized role, unassigned actor, wrong status, and incomplete required checks.
- PM check/evidence updates deny cross-tenant writes and deny edits after completion unless explicitly allowed.

Cross-tenant denial tests:

- Direct update/delete/create with another tenant id is denied; direct authenticated INSERT is disabled.
- Assignment to another tenant's assignee/team is denied.
- PM generation and PM execution cannot touch another tenant's work orders.
- Public portal token cannot submit work orders against another tenant's building/floor/asset.

## 12. Pilot v1 Recommendation

Must be fixed before real pilot:

- Direct `work_orders` updates must not be able to mutate `status`, assignment, approval, completion, closure, rejection, evidence, or PM provenance fields outside approved RPCs.
- Direct hard delete must be disabled or replaced with audited cancel/archive.
- Assignment must be routed through audited `assign_work_order`.
- User-visible cancellation must be routed through audited `cancel_work_order`.
- PM task-to-work-order creation now aligns with the audited create path; source metadata remains follow-up.
- PM `wo_start` and `wo_complete` have been hardened; keep them in recurring verification.
- Workflow RPC mutation tests and direct table mutation tests must pass.

Can be manually controlled temporarily:

- Manual creation of work orders without initial assignment through `create_work_order`.
- PM generation through cron or admin-only flow, if generation runs are monitored and not exposed broadly.
- Metadata corrections by trusted admins, if limited to safe fields and tracked operationally until audit logging exists.

Should be hidden if not fixed:

- Generic work-order edit surfaces that call `useUpdateWorkOrder`.
- Any status dropdown or action that calls `useUpdateWorkOrderStatus`.
- Delete buttons or bulk delete actions.
- Direct assignment controls that do not call `assign_work_order`.
- PM task "create related work order" actions that attempt assignment/status changes outside `assign_work_order`.
- PM foundation execution controls if `wo_start`/`wo_complete` remain insufficiently authorized.

## 13. Final Recommendation

The exact next implementation task should be:

Define and implement the separate archive policy/RPC, or move to PM generation audit if archive is not needed for Pilot v1.

The first pass should:

- Keep hard delete disabled for normal users.
- Require role, tenant, current-status, and non-empty reason validation for archive if it becomes user-visible.
- Preserve row history and linked operation logs/checks/parts.
- Log archive through `operation_logs`.
- Add verification for allowed manager/admin archive, wrong role denial, cross-tenant denial, post-completion rules, and direct delete behavior.

Likely files for the next implementation task:

- `supabase/migrations/<next>_archive_work_order_rpc.sql`
- `src/hooks/useWorkOrderWorkflow.ts`
- `src/hooks/useWorkOrders.ts`
- `docs/security/work-order-sensitive-updates-audit.md`
- `scripts/verify-workorder-archive.ps1` or an equivalent test script

