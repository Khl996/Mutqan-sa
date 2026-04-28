# Supabase Migration Reconciliation Plan

Audit date: 2026-04-25  
Repository: Mutqan SaaS CMMS  
Linked local Supabase project ref found in `supabase/.temp/linked-project.json`: `mzpohntjotgeeaukwnbz`

## A. Executive Summary

Mutqan's local migration directory currently reaches migration `129_disable_work_order_direct_insert.sql`, but recent high-risk security and workflow migrations were applied to staging through targeted manual SQL rather than `supabase db push`. The remote Supabase migration ledger was inspected on 2026-04-25 and initially showed only migrations `001` through `004` as applied.

Stage 1 ledger repair marked only verified migrations `119` through `128` as applied in the linked staging Supabase project. Stage 1-B then marked only migration `129` as applied after it had already been applied through targeted SQL and runtime verification. No SQL migrations were pushed or replayed during either repair. The post-Stage 1-B migration list now shows `119` through `129` present remotely, while `005` through `118` remain unresolved and remote-missing.

Stage 1 ledger repair exposed actual runtime drift: direct authenticated `INSERT` into `work_orders` still succeeded unexpectedly in `npm run verify:workorder-create`. Live policy inspection found the legacy `"Users can create work orders"` INSERT policy still present beside the disabled policy from migration 122. Migration `129_disable_work_order_direct_insert.sql` was added and applied to staging through targeted `supabase db query --linked --file`, not through `supabase db push`, and runtime verifiers are now green.

Full migration reconciliation is still not complete because migrations `005` through `118` remain unresolved in the remote ledger. `supabase db push` remains unsafe and is still NO-GO.

This document is a planning and audit artifact only. It does not prove reconciliation is complete.

## A1. Stage 1 Repair Status - 2026-04-25

Scope:

- Repaired only migrations `119` through `128`.
- Did not repair migrations `005` through `118`.
- Did not repair duplicate-prefix historical migrations `060`, `090`, `095`, or `098`.
- Did not repair non-product files `smoke_test_108.sql` or `smoke_test_109_phase1_1.sql`.
- Did not run `supabase db push`.
- Did not run migration SQL.

Pre-repair `npx supabase migration list --linked` result:

- Remote ledger had `001`, `002`, `003`, and `004`.
- Remote ledger lacked every version from `119` through `128`.

Repair commands executed:

```powershell
npx supabase migration repair 119 --status applied --linked
npx supabase migration repair 120 --status applied --linked
npx supabase migration repair 121 --status applied --linked
npx supabase migration repair 122 --status applied --linked
npx supabase migration repair 123 --status applied --linked
npx supabase migration repair 124 --status applied --linked
npx supabase migration repair 125 --status applied --linked
npx supabase migration repair 126 --status applied --linked
npx supabase migration repair 127 --status applied --linked
npx supabase migration repair 128 --status applied --linked
```

Versions marked applied:

| Version | Status |
| --- | --- |
| `119` | Repaired as applied |
| `120` | Repaired as applied |
| `121` | Repaired as applied |
| `122` | Repaired as applied |
| `123` | Repaired as applied |
| `124` | Repaired as applied |
| `125` | Repaired as applied |
| `126` | Repaired as applied |
| `127` | Repaired as applied |
| `128` | Repaired as applied |

Versions skipped because already present:

- None. All `119` through `128` were missing before repair.

Post-repair migration list:

- Captured in `remote-migration-list-after-stage1-repair.txt`.
- `119` through `128` now appear in both Local and Remote columns.
- `005` through `118` remain present locally and absent remotely.

Verification results after repair:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run prepare:staging-fixtures` | PASS | Exit `0`. |
| `npm run verify:workflow-authority` | PASS | `PASS: 19 FAIL: 0 SKIP: 0`. |
| `npm run verify:workflow-full` | PASS | `PASS: 25 FAIL: 0 SKIP: 0`. |
| `npm run verify:workorder-create` | FAIL | Direct authenticated `INSERT` into `work_orders` unexpectedly succeeded. |
| `npm run verify:workorder-assignment` | PASS | 11 assignment checks passed. |
| `npm run verify:workorder-cancel` | PASS | 16 cancellation/delete checks passed. |
| `npm run verify:workorder-autoclose` | PASS | `PASS: 4 FAIL: 0 SKIP: 0`. |
| `npm run verify:pm-generation` | PASS | 27 PM generation and notification checks passed. |
| `npm run verify:workflow-reject-branches` | PASS | `PASS: 17 FAIL: 0`. |
| `npm run build` | PASS | Build completed; chunk-size warning remains. |
| `npm run lint` | PASS | Exit `0`; 223 warnings, 0 errors. |

Stage 1 status:

- Ledger repair for `119` through `128`: complete.
- Initial runtime safety gate: failed because `verify:workorder-create` failed.
- Runtime drift correction: completed by migration `129_disable_work_order_direct_insert.sql` applied through targeted SQL.
- Overall migration reconciliation: not complete.

Explicit warnings:

- Migrations `005` through `118` remain unresolved in the remote ledger.
- Migration `129` was applied to staging through targeted SQL and was not ledger-repaired in the Stage 1 pass. It was subsequently repaired in Stage 1-B.
- `supabase db push` is still NO-GO.
- Do not claim full migration reconciliation is complete.

## A2. Runtime Drift Correction - 2026-04-25

Live staging policy inspection after Stage 1 ledger repair:

```sql
select
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'work_orders'
  and cmd = 'INSERT'
order by policyname;
```

Policies found before correction:

| Policy | Roles | `WITH CHECK` | Effect |
| --- | --- | --- | --- |
| `"Users can create work orders"` | `{public}` | `(tenant_id = get_user_tenant_id())` | Allowed same-tenant direct inserts. |
| `"work_orders_insert_disabled_direct"` | `{authenticated}` | `false` | Disabled policy existed but could not deny because PostgreSQL permissive RLS policies are ORed. |

Root cause:

- Migration 122 expected the legacy `"Users can create work orders"` policy to be absent after its policy block.
- In staging, the disabled policy existed, but the legacy permissive policy still existed too.
- Because RLS INSERT policies are permissive by default, any true `WITH CHECK` policy allowed the insert.

Corrective action:

- Added `supabase/migrations/129_disable_work_order_direct_insert.sql`.
- Applied it to the linked staging database with:

```powershell
npx supabase db query --linked --file supabase/migrations/129_disable_work_order_direct_insert.sql --output json
```

- Did not run `supabase db push`.
- Did not run migration repair.

Policies found after correction:

| Policy | Roles | `WITH CHECK` |
| --- | --- | --- |
| `"work_orders_insert_disabled_direct"` | `{authenticated}` | `false` |

Post-correction migration list before Stage 1-B ledger repair:

- `129` is present locally and absent remotely because the corrective SQL was applied manually with `db query`.
- `005` through `118` remain present locally and absent remotely.

Post-correction verification:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run prepare:staging-fixtures` | PASS | Run before verification; repeated before fixture-consuming workflow run. |
| `npm run verify:workorder-create` | PASS | Direct authenticated INSERT returned HTTP 403 and trusted service-role read found no row. |
| `npm run verify:workflow-authority` | PASS | `PASS: 19 FAIL: 0 SKIP: 0`. |
| `npm run verify:workflow-full` | PASS | `PASS: 25 FAIL: 0 SKIP: 0`. |
| `npm run verify:workorder-assignment` | PASS | 11 assignment checks passed. |
| `npm run verify:workorder-cancel` | PASS | 16 cancellation/delete checks passed. |
| `npm run verify:workorder-autoclose` | PASS | `PASS: 4 FAIL: 0 SKIP: 0`. |
| `npm run verify:pm-generation` | PASS | 27 PM generation and notification checks passed. |
| `npm run verify:workflow-reject-branches` | PASS | `PASS: 17 FAIL: 0`. |
| `npm run build` | PASS | Build completed; chunk-size warning remains. |
| `npm run lint` | PASS | Exit `0`; 223 warnings, 0 errors. |

## A3. Stage 1-B Migration 129 Ledger Repair - 2026-04-25

Scope:

- Repaired only migration `129`.
- Did not repair migrations `005` through `118`.
- Did not repair duplicate-prefix historical migrations `060`, `090`, `095`, or `098`.
- Did not repair non-product files `smoke_test_108.sql` or `smoke_test_109_phase1_1.sql`.
- Did not run `supabase db push`.
- Did not apply migration SQL again.

Pre-repair `npx supabase migration list --linked` result:

- `129` was local-only: Local `129`, Remote empty.
- `119` through `128` were already present in both Local and Remote columns.
- `005` through `118` remained present locally and absent remotely.

Repair command executed:

```powershell
npx supabase migration repair 129 --status applied --linked
```

Repair result:

- `Repaired migration history: [129] => applied`.

Post-repair migration list:

- Captured in `remote-migration-list-after-129-repair.txt`.
- `129` now appears in both Local and Remote columns.
- `119` through `128` remain present in both Local and Remote columns.
- `005` through `118` remain present locally and absent remotely.
- Supabase CLI continued to skip `smoke_test_108.sql` and `smoke_test_109_phase1_1.sql` because their filenames do not match the migration pattern.

Verification results after Stage 1-B:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run prepare:staging-fixtures` | PASS | Wrote `.env.staging-fixtures.local`; noted missing staging `inventory_items.created_by` column while preparing inventory fixtures. |
| `npm run verify:workorder-create` | PASS | Direct authenticated `INSERT` returned HTTP 403 and trusted service-role read found no row. |
| `npm run verify:workflow-authority` | PASS | `PASS: 19 FAIL: 0 SKIP: 0`. |
| `npm run verify:workflow-full` | PASS | `PASS: 25 FAIL: 0 SKIP: 0`. |
| `npm run verify:workorder-assignment` | PASS | 11 assignment checks passed. |
| `npm run verify:workorder-cancel` | PASS | 16 cancellation/delete checks passed. |
| `npm run verify:workorder-autoclose` | PASS | `PASS: 4 FAIL: 0 SKIP: 0`. |
| `npm run verify:pm-generation` | PASS | 27 PM generation, audit, idempotency, isolation, and notification checks passed. |
| `npm run verify:workflow-reject-branches` | PASS | `PASS: 17 FAIL: 0`. |
| `npm run build` | PASS | Build completed; chunk-size warning remains. |
| `npm run lint` | PASS | Exit `0`; 223 warnings, 0 errors. |

Stage 1-B status:

- Ledger repair for migration `129`: complete.
- SQL replay: none.
- Runtime verifier suite: green.
- Overall migration reconciliation: not complete.

Explicit warnings:

- Migrations `005` through `118` remain unresolved in the remote ledger.
- `supabase db push` is still NO-GO.
- Do not claim full migration reconciliation is complete.

## B. Problem Statement

Local repository state and remote database state are no longer guaranteed to agree:

- Local migrations are ordered by numeric filename prefixes, but the migration folder contains duplicate numeric prefixes earlier in history.
- Migrations `119` through `128` exist locally as a contiguous security/workflow block, and migration `129` is a targeted corrective policy migration created after Stage 1 runtime verification found INSERT drift.
- Repository docs report that migrations `119` through `128` were applied manually to staging, with varying degrees of verification.
- Manual SQL application changes schema state but may not update `supabase_migrations.schema_migrations`.
- If Supabase CLI sees ledger entries missing, it may try to apply old migrations again.

`supabase db push` is unsafe right now because the CLI generally compares local migration files against the remote migration ledger, not against a full semantic proof of the live schema. If the ledger says a migration is pending while the SQL has already been manually applied, `db push` can replay operations such as function replacement, policy drops/recreates, constraint changes, grants/revokes, and table/column additions. Some are idempotent, but not all should be trusted as safe when replayed.

## C. Local Migration Inventory

### Sequence Anomalies

Observed local anomalies:

| Type | Detail | Risk |
| --- | --- | --- |
| Duplicate prefix | `060_broadcast_notification_func.sql`, `060_broadcast_notification_func_v2.sql` | Supabase CLI versions may handle version naming differently than human numeric ordering; remote ledger must be checked by full version string. |
| Duplicate prefix | `090_go_live_hardening.sql`, `090_subscription_plan_ui_alignment.sql` | Same risk as above. |
| Duplicate prefix | `095_manual_pm_soft_launch.sql`, `095_pm_task_wo_sync_trigger.sql` | Same risk as above. |
| Duplicate prefix | `098_enable_maintenance_plans_feature.sql`, `098_public_portal_entitlement_enforcement.sql` | Same risk as above. |
| Non-migration SQL files in migration folder | `smoke_test_108.sql`, `smoke_test_109_phase1_1.sql` | These do not start with a numeric prefix, but they live beside migrations and should not be applied as product migrations. Confirm CLI behavior before push. |
| No missing numeric sequence after accounting for duplicate prefixes | `001` through `129` are represented | Good, but full Supabase migration version strings still matter. |

### Full Local File Inventory

The local `supabase/migrations` folder contains:

```text
001_core_tables.sql
002_assets_work_orders.sql
003_rls_policies.sql
004_seed_data.sql
005_fix_rls.sql
006_fix_rls_simple.sql
007_fix_user_role.sql
008_get_profile_function.sql
009_seed_maintenance.sql
010_inventory_module.sql
011_work_order_workflow.sql
012_subscription_system.sql
013_update_platform_admin.sql
014_fix_platform_admin_rls.sql
015_platform_management.sql
016_quick_fix.sql
017_fix_tenants_rls.sql
018_complete_tenants_rls_fix.sql
019_diagnose_rls_issue.sql
020_quick_fix_allow_all.sql
021_auto_confirm_users.sql
022_check_latest_users.sql
023_fix_platform_roles_permissions.sql
024_fix_missing_profiles_trigger.sql
025_fix_role_constraint.sql
026_allow_platform_view_all.sql
027_fix_infinite_recursion.sql
028_update_trigger_tenant_id.sql
029_fix_trigger_tenant_path.sql
030_expand_allowed_roles.sql
031_create_platform_invoices_and_logs.sql
032_fix_facilities_rls.sql
033_create_asset_activity_logs.sql
034_fix_visibility_policies.sql
035_final_fix_rls.sql
036_fix_workflow_logs.sql
037_update_log_types.sql
038_reject_workflow.sql
039_public_portal.sql
040_fix_public_submit.sql
041_inventory_consumption.sql
042_maintenance_plans.sql
043_maintenance_tasks.sql
044_inventory_stats_rpc.sql
045_fix_inventory_transactions.sql
046_teams_rls_policies.sql
047_tenant_settings.sql
048_workflow_settings_integration.sql
049_public_portal_settings.sql
050_inventory_settings.sql
051_maintenance_settings.sql
052_auto_close_escalation.sql
053_fix_start_work_assignment.sql
054_fix_parts_column_name.sql
055_password_reset_otps.sql
056_notifications_system.sql
057_email_notifications.sql
058_fix_subscription_plans_rls.sql
059_notify_team_on_new_work_order.sql
060_broadcast_notification_func.sql
060_broadcast_notification_func_v2.sql
061_add_features_to_plans.sql
062_add_tenant_details.sql
063_register_tenant_rpc.sql
064_fix_register_tenant_rpc.sql
065_fix_plan_syntax.sql
066_set_default_trial_plan.sql
067_fix_profile_status_error.sql
068_add_tenant_owner_role.sql
069_fix_subscription_record.sql
070_manual_subscribe_tenant.sql
071_add_tenant_details_rpc.sql
072_fix_registration_role.sql
073_fix_subscription_creation.sql
074_add_cancel_at_period_end.sql
075_activate_subscription_rpc.sql
076_security_fixes.sql
077_portal_settings_fix.sql
078_final_payment_security.sql
079_otp_security.sql
080_buildings_floors_rls.sql
081_admin_update_subscription.sql
082_secure_tenants_rls.sql
083_secure_rpc_payment.sql
084_provision_tenant_unified.sql
085_subscription_phase2_sync.sql
086_ensure_tenant_columns.sql
087_gate1_secure_workflow.sql
088_auth_hardening.sql
089_subscription_enforcement.sql
090_go_live_hardening.sql
090_subscription_plan_ui_alignment.sql
091_secure_notification_delivery_and_audit_logs.sql
092_complete_pending_registration.sql
093_v1_roles_permissions_alignment.sql
094_soft_launch_assets_facilities_hardening.sql
095_manual_pm_soft_launch.sql
095_pm_task_wo_sync_trigger.sql
096_maintenance_task_recurrence_checklist.sql
097_fix_maintenance_features_in_enabled_modules.sql
098_enable_maintenance_plans_feature.sql
098_public_portal_entitlement_enforcement.sql
099_admin_subscription_override.sql
100_pricing_engine.sql
101_unified_billing_engine.sql
102_billing_tax_optional.sql
103_pm_core_rebuild.sql
104_pm_program_phase1.sql
105_pm_sheet_templates_phase2.sql
106_pm_execution_sheet_phase3.sql
107_pm_critical_fixes.sql
108_pm_rebuild_foundation.sql
109_pm_foundation_phase1_1.sql
110_pm_frontend_direct_generation.sql
111_pm_execution_photo_storage.sql
112_pm_generation_trace_and_idempotency.sql
113_phase2_payment_service_role_hardening.sql
114_phase2_reporting_foundation_metrics.sql
115_phase2_notification_function_hardening.sql
116_payment_activation_runtime_fix.sql
117_inventory_rls_tenant_isolation_fix.sql
118_reporting_foundation_inventory_compat.sql
119_harden_create_operation_log_grants.sql
120_guard_work_order_sensitive_fields.sql
121_harden_pm_wo_start_wo_complete.sql
122_create_work_order_rpc.sql
123_assign_work_order_rpc.sql
124_cancel_work_order_rpc.sql
125_disable_work_order_direct_delete.sql
126_disable_auto_close_stale_work_orders.sql
127_pm_generation_audit.sql
128_fix_notify_team_on_new_work_order.sql
129_disable_work_order_direct_insert.sql
smoke_test_108.sql
smoke_test_109_phase1_1.sql
```

### Migrations 119 Through 129

| Migration | Filename | Purpose | Likely applied manually to staging | Verification exists |
| --- | --- | --- | --- | --- |
| 119 | `119_harden_create_operation_log_grants.sql` | Revoke direct execute on `create_operation_log` from `PUBLIC`, `anon`, and `authenticated`. | Yes. `docs/security/security-p0-remediation-plan.md` says applied manually and grants verified. | `npm run verify:workflow-authority` includes direct execute denial and operation-log smoke coverage. |
| 120 | `120_guard_work_order_sensitive_fields.sql` | Add trigger guard for workflow-sensitive `work_orders` updates and authorize approved RPC updates through a transaction-local GUC. | Yes. `docs/security/work-order-sensitive-updates-audit.md` says applied manually. | `verify:workflow-authority`, `verify:workflow-full`, assignment/cancel checks, and manual evidence in audit doc. |
| 121 | `121_harden_pm_wo_start_wo_complete.sql` | Harden PM `wo_start` and `wo_complete` with tenant, role, assignment checks, GUC authorization, and operation logs. | Yes. Audit doc says applied manually. | `verify:workflow-authority`, `verify:workflow-full`, and migration section smoke notes. |
| 122 | `122_create_work_order_rpc.sql` | Add audited `create_work_order` RPC for normal authenticated work-order creation. | Yes. Audit doc says applied manually. | `verify:workorder-create` exists; broader workflow verifiers reference the path. |
| 123 | `123_assign_work_order_rpc.sql` | Add audited `assign_work_order` RPC for assignment/reassignment. | Yes. Audit doc says applied manually. | `npm run verify:workorder-assignment`. |
| 124 | `124_cancel_work_order_rpc.sql` | Add audited cancellation RPC, cancellation fields, and operation log type. | Yes. Audit doc says applied manually. | `npm run verify:workorder-cancel`. |
| 125 | `125_disable_work_order_direct_delete.sql` | Disable direct authenticated hard delete of work orders. | Yes. Initial report said not effective, later updated as effective on staging. | `npm run verify:workorder-cancel` includes hard-delete block. |
| 126 | `126_disable_auto_close_stale_work_orders.sql` | Replace broken/aggressive auto-close batch with Pilot v1 no-op returning `0`. | Yes. Audit doc says applied manually. | `npm run verify:workorder-autoclose`. |
| 127 | `127_pm_generation_audit.sql` | Add persistent PM generation audit table, per-WO operation logs, access checks, safer counters, and `run_id` return. | Yes. `docs/security/pm-generation-audit.md` says applied manually to staging on 2026-04-25. | `npm run verify:pm-generation` plus workflow and work-order verifiers. |
| 128 | `128_fix_notify_team_on_new_work_order.sql` | Make new-work-order notification trigger no-op for `assigned_team IS NULL` and notify only active same-tenant team members. | Yes. PM audit doc says applied manually to staging on 2026-04-25. | `npm run verify:pm-generation`, especially null-team and active-team notification checks. |
| 129 | `129_disable_work_order_direct_insert.sql` | Drop all current INSERT policies on `work_orders` and recreate only `work_orders_insert_disabled_direct` with `WITH CHECK (FALSE)`. | Yes. Applied to staging through targeted `supabase db query --linked --file` on 2026-04-25. | `npm run verify:workorder-create`; direct authenticated INSERT returned HTTP 403 and trusted service-role read found no row. |

Uncertainty: these "likely applied" values are based on repository documentation, not direct inspection of the remote migration ledger in this task.

## D. Remote Ledger Inspection Plan

Run these commands manually from the repository root. Do not paste service role keys, database passwords, or JWTs into chat, tickets, or committed files.

### 1. Confirm CLI and Link Target

```powershell
supabase --version
supabase projects list
supabase status
```

Expected output:

- CLI version is printed.
- The linked project should match project ref `mzpohntjotgeeaukwnbz` for the current staging target.
- `supabase status` may require local stack context; if it fails because no local stack is running, that is not itself a remote ledger finding.

Safe capture:

```powershell
New-Item -ItemType Directory -Force -Path .audit/supabase-ledger | Out-Null
supabase --version *> .audit/supabase-ledger/cli-version.txt
supabase projects list *> .audit/supabase-ledger/projects-list.txt
```

Review files before sharing. Redact organization details if needed.

### 2. List Remote and Local Migration Ledger

```powershell
supabase migration list --linked
```

If `--linked` is unsupported by the installed CLI, try:

```powershell
supabase migration list
```

Expected output:

- A table showing local and remote migration versions.
- Migrations shown as remote-missing/local-only are the danger zone.
- Migrations shown as remote-only need explanation before repair.

Safe capture:

```powershell
supabase migration list --linked *> .audit/supabase-ledger/migration-list-linked.txt
```

### 3. Query the Migration Ledger Directly

If you have a safe SQL path to staging, run:

```sql
select version, name, inserted_at
from supabase_migrations.schema_migrations
order by version;
```

If the table shape differs, fall back to:

```sql
select *
from supabase_migrations.schema_migrations
order by 1;
```

If using `psql`, prefer a connection string from a secure password manager or Supabase dashboard and avoid saving it in shell history:

```powershell
$env:PGPASSWORD = '<database-password-from-password-manager>'
psql "host=db.<project-ref>.supabase.co port=5432 dbname=postgres user=postgres sslmode=require" `
  -c "select version, name, inserted_at from supabase_migrations.schema_migrations order by version;" `
  *> .audit/supabase-ledger/schema-migrations.txt
Remove-Item Env:PGPASSWORD
```

Do not commit `.audit/`. If this directory is retained, keep it local only.

### 4. Compare Schema State Before Repair

Use `db diff` only as an inspection tool first:

```powershell
supabase db diff --linked --schema public
```

If the installed CLI does not support that shape, use the CLI help:

```powershell
supabase db diff --help
```

Expected output:

- Ideally no unexpected destructive diff for objects touched by 119-128.
- If the diff wants to drop or recreate major workflow, billing, notification, PM, or RLS objects, stop and investigate.

Capture:

```powershell
supabase db diff --linked --schema public *> .audit/supabase-ledger/db-diff-public.txt
```

## E. Reconciliation Strategy Options

### Option 1: Repair the Supabase Ledger for Manually Applied Migrations

Use Supabase CLI migration repair if supported by the installed CLI, after proving the live schema contains the intended effects.

Candidate command shape:

```powershell
supabase migration repair --status applied <version>
```

Run `supabase migration repair --help` first because exact flags vary by CLI version.

Pros:

- Preserves the existing staging database and data.
- Aligns the ledger with manually applied migrations without replaying SQL.
- Fastest path if only the ledger is wrong.

Cons and risks:

- Dangerous if used before proving schema state. It can mark missing changes as applied.
- Requires exact version identifiers as Supabase CLI sees them, which may be full filename-derived versions rather than only numeric prefixes.
- Does not fix actual schema drift.

### Option 2: Create a New Baseline Migration After Confirming Schema State

Generate or author a baseline after confirming staging schema is the desired source of truth.

Pros:

- Can simplify future migration history if the existing chain is too drifted.
- Gives a clean forward point for future work.

Cons and risks:

- Complex in an existing project with data and many historical migrations.
- May hide important security lineage unless old migrations and docs are archived carefully.
- Needs a clear decision about local development resets and new environments.

### Option 3: Continue Controlled Targeted SQL Temporarily with Explicit Ledger Notes

Keep applying only reviewed SQL manually while recording exact file, environment, operator, timestamp, and verification.

Pros:

- Avoids immediate `db push` risk.
- Useful while ledger inspection and backup planning are underway.

Cons and risks:

- Extends the period of ledger drift.
- Increases human error risk.
- Every manual application must include verification and an explicit plan for later ledger repair.

### Option 4: Rebuild Staging from Local Migrations

Create a fresh staging database/project and apply local migrations in order, then seed fixtures and run all verification.

Pros:

- Strongest proof that local migrations can build a clean environment.
- Avoids uncertain manual drift in the existing staging database.

Cons and risks:

- Potentially time-consuming.
- Existing staging data must be disposable or migrated.
- Duplicate-prefix and non-migration SQL files must be handled intentionally before trusting full replay.

## F. Recommended Strategy for Mutqan

Recommended path:

1. Freeze database-heavy work until staging ledger inspection is complete.
2. Treat staging as the first reconciliation target. Do not touch production until staging is clean and repeatable.
3. Export backup and ledger evidence before any repair.
4. Use `supabase migration list` and direct `supabase_migrations.schema_migrations` queries to identify missing ledger entries.
5. For migrations `119` through `129`, preserve the verified SQL and behavior. Do not replay destructive or non-idempotent migrations just to satisfy the ledger.
6. If live schema verification confirms that a manually applied migration is present, prefer CLI ledger repair over SQL replay.
7. If schema state and ledger state cannot be reconciled confidently, rebuild staging from local migrations or create a deliberate baseline. Do not guess.

Production recommendation:

- No production ledger repair or `db push` until staging has a documented green run.
- Production work should follow the same inspection and backup checklist, with exact project ref and environment URL recorded.

## G. Verification Checklist

Before declaring staging reconciled:

- [ ] Database backup captured.
- [ ] Current `supabase_migrations.schema_migrations` exported.
- [x] `supabase migration list --linked` captured after Stage 1 repair in `remote-migration-list-after-stage1-repair.txt`.
- [x] `supabase migration list --linked` captured after Stage 1-B migration `129` repair in `remote-migration-list-after-129-repair.txt`.
- [ ] Duplicate-prefix behavior understood for this CLI version.
- [ ] Non-migration smoke files confirmed not to be applied by CLI.
- [x] Migrations `119` through `128` repaired as applied in the linked staging ledger.
- [x] Runtime work-order INSERT policy drift inspected with `pg_policies`.
- [x] Migration `129_disable_work_order_direct_insert.sql` created and applied to staging through targeted SQL.
- [x] Migration `129` represented in the remote migration ledger after Stage 1-B repair.
- [ ] `supabase db diff` inspected and no unexpected destructive drift remains.
- [ ] Dry run or equivalent confirms `supabase db push` has nothing dangerous to replay.
- [x] `npm run verify:workflow-authority` passes.
- [x] `npm run verify:workflow-full` passes.
- [x] `npm run verify:workorder-create` passes after migration `129`. Direct authenticated `INSERT` returned HTTP 403 and trusted read found no row.
- [x] `npm run verify:pm-generation` passes.
- [x] `npm run verify:workorder-assignment` passes.
- [x] `npm run verify:workorder-cancel` passes.
- [x] `npm run verify:workorder-autoclose` passes.
- [x] `npm run verify:workflow-reject-branches` passes.
- [x] `npm run build` passes.
- [x] `npm run lint` passes or only known pre-existing warnings remain.

## H. Rollback and Backup Requirements

Before any ledger repair, baseline, or migration push:

1. Record environment:
   - Supabase project ref.
   - Supabase project name.
   - App/staging URL.
   - Operator.
   - Timestamp.
   - CLI version.
2. Capture a database backup from Supabase dashboard or approved backup workflow.
3. Export the migration ledger:

   ```sql
   select *
   from supabase_migrations.schema_migrations
   order by 1;
   ```

4. Export schema-only state if possible:

   ```powershell
   supabase db dump --linked --schema public --schema-only *> .audit/supabase-ledger/schema-public-before-repair.sql
   ```

5. Capture object spot checks for high-risk migrations:
   - `create_operation_log` privileges.
   - `trg_guard_work_order_sensitive_fields`.
   - `wo_start`, `wo_complete`.
   - `create_work_order`, `assign_work_order`, `cancel_work_order`.
   - Work-order delete policies.
   - `auto_close_stale_work_orders`.
   - `pm_generation_runs`.
   - `pm_generate_due_work_orders`.
   - `notify_team_on_new_work_order`.

Rollback principle:

- Ledger repair itself should be reversible only with an equally deliberate repair operation. Do not rely on ad hoc deletion from `supabase_migrations.schema_migrations` unless Supabase support or CLI docs explicitly direct that path.
- If SQL changes are accidentally applied, rollback from backup or use a reviewed corrective migration. Avoid manual partial reversions in production.

## I. Final Go/No-Go Recommendation

Stage 1-B update on 2026-04-25: `supabase db push` remains NO-GO after the migration `129` ledger repair because `005` through `118` are still unresolved in the remote ledger. Migrations `119` through `129` are now represented remotely and the verifier suite is green, but full migration reconciliation is still incomplete.

`supabase db push` is safe to use again only when all of these are true:

- Staging remote ledger matches the local expected migration state through `129`.
- Schema inspection proves that manually applied migrations are represented correctly.
- `supabase db diff` and migration list show no unexpected replay candidates.
- All required workflow, PM generation, work-order lifecycle, build, and lint checks pass.
- The reconciliation steps are documented with project ref, date, operator, and captured outputs.

Continue targeted SQL only when:

- The remote ledger remains out of sync.
- `db push` wants to replay already-applied migrations.
- There is unresolved drift in high-risk objects.
- Production has not yet gone through the staging-proven reconciliation path.

No-Go until proven otherwise: do not run `supabase db push` against production, and do not repair production ledger entries based only on local repository assumptions.

## High-Risk Migrations to Watch

| Migration | Why high risk |
| --- | --- |
| 119 | Changes direct execute privileges for an internal audit helper. Incorrect state can allow forged logs or break logging. |
| 120 | Adds the core workflow-sensitive update guard. Replay or absence changes the security boundary for work orders. |
| 121 | Replaces PM execution RPCs and controls tenant/assignment authority. |
| 122 | Defines the audited normal work-order creation path. |
| 123 | Defines assignment authority and logs assignment. |
| 124 | Adds cancellation fields, status behavior, and operation log constraint changes. |
| 125 | Drops/replaces delete policies. Replay should be inspected carefully. |
| 126 | Replaces auto-close with a no-op. Absence leaves a broken/aggressive function body. |
| 127 | Creates audit table, changes operation log constraints, and replaces PM generation. |
| 128 | Replaces notification trigger behavior; absence can cause work-order insert failures when assigned team is null or inactive users exist. |
| 129 | Drops all direct INSERT policies on `work_orders` and recreates only the disabled authenticated policy. Absence can allow direct REST work-order creation if a legacy permissive INSERT policy remains. |
