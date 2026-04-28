# Supabase Migration Stage 2 Historical Audit

Audit date: 2026-04-25  
Repository: Mutqan SaaS CMMS  
Scope: local migrations `005` through `118` only  
Status: planning and evidence collection only

## Executive Summary

Stage 1 and Stage 1-B repaired the remote migration ledger only for migrations
`119` through `129`, after those migrations were already applied and verified.
The remote ledger now contains `001` through `004` and `119` through `129`.
Historical migrations `005` through `118` remain local-only and unresolved.

This document is the Stage 2 audit plan for those historical migrations. It does
not authorize migration repair, `supabase db push`, SQL replay, or any database
state change.

Hard rules for Stage 2A:

- Do not run `supabase migration repair`.
- Do not run `supabase db push`.
- Do not apply migration SQL.
- Do not run write/backfill SQL.
- Collect evidence only, preferably through read-only catalog queries, existing
  verification scripts, exported reports, and reviewed screenshots/output.

Current recommendation: do Stage 2A now. Defer Stage 2B through Stage 2E until
the historical evidence pack is complete, duplicate-prefix behavior is resolved,
and high-risk live objects have been proven against the intended final schema.

Final `db push` status: NO-GO.

## Historical Migration Risk Map

The groups below are domain-oriented, not mutually exclusive. Cross-cutting
migrations appear in more than one group when they affect several security or
product surfaces.

| Domain | Migrations | Main risk |
| --- | --- | --- |
| RLS/auth/profile fixes | `005`, `006`, `007`, `008`, `014`, `017`, `018`, `019`, `020`, `021`, `022`, `023`, `024`, `025`, `026`, `027`, `028`, `029`, `030`, `034`, `035`, `046`, `055`, `079`, `082`, `088`, `092`, `093` | RLS drift, recursive policies, auth triggers, role constraints, `SECURITY DEFINER` profile helpers, user provisioning behavior, password reset OTP access. |
| Tenants/platform management | `013`, `015`, `016`, `018`, `023`, `026`, `031`, `047`, `061`, `062`, `063`, `064`, `065`, `066`, `067`, `068`, `069`, `070`, `071`, `072`, `073`, `084`, `085`, `086`, `089`, `090_go_live_hardening`, `092`, `093` | Tenant provisioning, platform admin roles, tenant details, plan/module synchronization, platform audit logs, subscription-controlled tenant fields. |
| Assets/facilities | `009`, `032`, `033`, `080`, `093`, `094` | Facilities RLS, asset activity logs, location consistency checks, asset status update RPCs, legacy policy cleanup. |
| Work orders/workflow | `011`, `036`, `037`, `038`, `041`, `048`, `052`, `053`, `054`, `087`, `093`, `094` | Workflow RPC replacement, operation-log types, inventory part consumption, stale auto-close behavior, direct table write surface, role/assignment authorization. |
| Inventory | `010`, `041`, `044`, `045`, `050`, `090_go_live_hardening`, `093`, `117` | Inventory table shape, inventory stats RPC, transaction policies, part consumption writes, confirmed historical tenant leakage fixed later by `117`. |
| Maintenance/PM | `042`, `043`, `051`, `095_manual_pm_soft_launch`, `095_pm_task_wo_sync_trigger`, `096`, `097`, `098_enable_maintenance_plans_feature`, `103`, `104`, `105`, `106`, `107`, `108`, `109`, `110`, `111`, `112` | Old PM model, soft-launch disabled automation, PM rebuild, generation idempotency, storage policies, checklist execution, PM-to-WO synchronization. |
| Subscriptions/billing/payment | `012`, `031`, `058`, `061`, `063`, `064`, `065`, `066`, `067`, `068`, `069`, `070`, `071`, `072`, `073`, `074`, `075`, `076`, `078`, `081`, `083`, `085`, `089`, `090_subscription_plan_ui_alignment`, `099`, `100`, `101`, `102`, `113`, `116` | Fragmented billing functions, payment activation RPCs, service-role activation, plan features, tenant subscription rows, invoice tables, grants/revokes. |
| Notifications | `056`, `057`, `059`, `060_broadcast_notification_func`, `060_broadcast_notification_func_v2`, `091`, `115` | Notification creation privileges, email delivery helper, runtime secret access, broadcast functions, work-order notification trigger. |
| Public portal | `039`, `040`, `049`, `076`, `077`, `098_public_portal_entitlement_enforcement` | Anonymous/public RPC behavior, tenant access tokens, entitlement checks, public work-order creation, portal settings. |
| Reporting | `114`, `118` | `get_tenant_reporting_foundation` is a `SECURITY DEFINER` reporting RPC; `118` supersedes `114` for inventory compatibility. |
| Misc/hardening | `076`, `083`, `087`, `088`, `090_go_live_hardening`, `091`, `093`, `094`, `101`, `103`, `117` | Broad hardening migrations that replace policies, functions, triggers, privileges, or legacy object sets. These are not safe to mark by filename alone. |

## Duplicate Prefix Plan

Historical duplicates are a Stage 2 blocker because the local migration folder
contains multiple files with the same numeric prefix. Do not repair any duplicate
prefix until the installed Supabase CLI behavior and remote ledger representation
are understood.

| Prefix | Files | Observed intent | Stage 2 handling |
| --- | --- | --- | --- |
| `060` | `060_broadcast_notification_func.sql`, `060_broadcast_notification_func_v2.sql` | Both define `broadcast_notification`, but with different signatures. The second adds `p_specific_user_ids`. Both may coexist as overloaded functions if both were replayed. | Prove live signatures and privileges. Decide whether the old 5-argument function should exist. Do not repair `060` blindly because one ledger version may not represent both files safely. |
| `090` | `090_go_live_hardening.sql`, `090_subscription_plan_ui_alignment.sql` | First is broad entitlement/inventory/tenant hardening. Second is additive `subscription_plans` UI columns. | Treat as two separate logical migrations. Prove both effect sets independently. Do not let the low-risk UI column file justify repairing the high-risk hardening file. |
| `095` | `095_manual_pm_soft_launch.sql`, `095_pm_task_wo_sync_trigger.sql` | Both affect PM/WO sync and soft-launch behavior. Later PM rebuild migrations drop or replace earlier soft-launch functions/triggers. | Prove current trigger/function set before deciding. These are likely superseded by `103`, `107`, `108`, and later PM work; repair only after baseline/full-repair decision. |
| `098` | `098_enable_maintenance_plans_feature.sql`, `098_public_portal_entitlement_enforcement.sql` | First is a tenant `enabled_modules` data backfill. Second hardens public portal entitlement functions and token policy. | Separate data-backfill evidence from public RPC/policy evidence. Do not mark `098` based only on one side of the pair. |

Stage 2C decision options:

1. If pursuing full historical repair, first confirm whether the CLI/ledger can
   distinguish same-prefix files. If it cannot, full repair requires a deliberate
   migration-history cleanup strategy before any repair.
2. If pursuing a baseline, keep duplicate historical files documented as archived
   lineage and start future migrations after the baseline.
3. Do not rename, move, or consolidate migration files during Stage 2A. That is a
   later repository-history decision, not evidence collection.

## Likely Superseded Historical Work

These migrations should be treated as historical lineage, not automatic proof
that the current live database needs their exact bodies.

| Area | Likely superseded migrations | Later migration or hardening that may supersede them | Evidence required |
| --- | --- | --- | --- |
| Early profile/tenant RLS | `005`, `006`, `014`, `017`, `018`, `020`, `026`, `027`, `034`, `035` | Later tenant/profile policy hardening in `082`, broad role alignment in `093`, and later targeted RLS fixes. | Current `pg_policies` for `profiles`, `tenants`, `tenant_modules`, `teams`, `team_members`, buildings/floors/departments/rooms. |
| Role constraints and role data | `007`, `025`, `030`, `068` | `093_v1_roles_permissions_alignment.sql` normalizes legacy roles and recreates `profiles_role_check`. | Current `profiles_role_check` constraint and sampled role distribution. |
| Tenant registration/provisioning | `063`, `064`, `065`, `067`, `069`, `071`, `072`, `073`, `084`, `085` | `084`/`085` unify tenant provisioning; billing engine later depends on a stable tenant/subscription model. | `register_new_tenant` and `provision_tenant` signatures, definitions, grants, and runtime registration verification if available. |
| Fragmented billing/payment | `012`, `031`, `058`, `075`, `078`, `081`, `083`, `099`, `100` | `101_unified_billing_engine.sql`, then `113` and `116` for service-role payment activation hardening. | Billing tables/columns, `engine_*` function definitions, grants, and `npm run verify:payment`. |
| Work-order workflow body churn | `011`, `036`, `038`, `048`, `053`, `054`, `087`, `093` | Stage 1 migrations `119` through `125` and `129` harden operation logs, sensitive updates, create/assign/cancel RPCs, delete, and direct insert. | Current workflow function definitions, grants, trigger guard, policies, and all work-order verification scripts. |
| Auto-close/escalation | `052` | `126_disable_auto_close_stale_work_orders.sql` replaces `auto_close_stale_work_orders` with a no-op. | Function definition hash/body and `npm run verify:workorder-autoclose`. |
| Inventory RLS | `045`, `050`, `090_go_live_hardening`, inventory parts of `093` | `117_inventory_rls_tenant_isolation_fix.sql` drops old inventory policies and recreates tenant-scoped policies. | Current inventory policies, helper definitions, and `npm run verify:rls`. |
| Public portal RPCs | `039`, `040`, `049`, `076`, `077` | `098_public_portal_entitlement_enforcement.sql` replaces entitlement behavior; later work-order direct insert hardening affects normal creation path. | `submit_public_work_order`, `get_public_tenant_data`, `has_public_portal_access`, token policies, and public portal smoke tests. |
| Notifications | `056`, `057`, `059`, `060`, `091` | `115` hardens `create_notification`; `128` fixes `notify_team_on_new_work_order`. | Notification function definitions, grants, trigger definitions, and PM/work-order notification verifier coverage. |
| Old PM soft launch | `042`, `043`, `051`, both `095` files, `096`, `097`, `098_enable_maintenance_plans_feature`, `103` through `107` | `108` rebuilds PM foundation, `109` through `112` replace generator behavior, and `127` adds generation audit. | PM table/column existence, generator definition, triggers, storage policies, audit table, and `npm run verify:pm-generation`. |
| Reporting function | `114` | `118_reporting_foundation_inventory_compat.sql` replaces the same `get_tenant_reporting_foundation(uuid)` RPC for current inventory compatibility. | Function signature/body hash and report RPC role/tenant-scope tests. |

## Migrations That Must Be Proven Before Repair

Do not mark any migration from these groups as applied until the live schema has
been proven. Filename presence is not enough.

High-risk policy migrations:

- `005`, `006`, `014`, `017`, `018`, `020`, `026`, `027`, `032`, `034`, `035`
- `046`, `058`, `079`, `080`, `082`, `083`, `090_go_live_hardening`
- `093`, `094`, `098_public_portal_entitlement_enforcement`
- `101`, `103`, `104`, `105`, `106`, `107`, `108`, `111`, `117`

High-risk trigger migrations:

- `021`, `024`, `033`, `056`, `057`, `059`, `061`, `089`, `090_go_live_hardening`
- both `095` files
- `101`, `103`, `104`, `105`, `107`, `108`

High-risk `SECURITY DEFINER` function migrations:

- `008`, `014`, `017`, `018`, `021`, `023`, `024`, `027`, `028`, `029`, `034`, `035`
- `036`, `038`, `039`, `040`, `041`, `044`, `048`, `049`, `050`, `051`, `052`, `053`, `054`
- `055`, `056`, `057`, `059`, both `060` files
- `063`, `064`, `065`, `067`, `069`, `071`, `072`, `073`, `075`, `076`, `077`, `078`
- `081`, `082`, `084`, `085`, `087`, `088`, `089`, `090_go_live_hardening`, `091`, `092`, `093`, `094`
- both `095` files, `098_public_portal_entitlement_enforcement`, `099`, `100`, `101`, `102`
- `103`, `104`, `105`, `106`, `107`, `108`, `109`, `110`, `112`, `113`, `114`, `115`, `116`, `117`, `118`

High-risk billing/payment migrations:

- `012`, `031`, `058`, `061`, `063` through `075`, `076`, `078`, `081`, `083`,
  `085`, `089`, `090_subscription_plan_ui_alignment`, `099`, `100`, `101`,
  `102`, `113`, `116`

High-risk public portal migrations:

- `039`, `040`, `049`, `076`, `077`, `098_public_portal_entitlement_enforcement`

High-risk notification migrations:

- `056`, `057`, `059`, both `060` files, `091`, `115`

Data/backfill migrations that still need proof:

- `009`, `031`, `066`, `070`, `097`, `098_enable_maintenance_plans_feature`,
  plan/price seed sections in `100`, `101`, `102`

Potential low-risk candidates for later Stage 2B, only after evidence:

- Pure additive or compatibility table/column migrations such as `010`, `062`,
  `074`, `086`, and selected column-only parts of `090_subscription_plan_ui_alignment`
  or `096`.
- Even these require table, column, index/constraint evidence and duplicate-prefix
  handling before repair.

## Evidence Queries Needed

Run these only through an approved read-only path or SQL editor review process.
Do not wrap them in migration files. Do not run any DDL/DML from this document.

### Migration Ledger Evidence

```sql
select version, name, inserted_at
from supabase_migrations.schema_migrations
order by version;
```

Fallback if the ledger shape differs:

```sql
select *
from supabase_migrations.schema_migrations
order by 1;
```

### Policy Evidence

Use this for tables touched by historical RLS migrations.

```sql
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
  and tablename in (
    'profiles',
    'tenants',
    'tenant_modules',
    'buildings',
    'floors',
    'departments',
    'rooms',
    'teams',
    'team_members',
    'asset_categories',
    'assets',
    'asset_activity_logs',
    'work_orders',
    'work_order_parts',
    'operation_logs',
    'inventory_categories',
    'inventory_items',
    'inventory_transactions',
    'tenant_subscriptions',
    'payment_history',
    'billing_invoices',
    'billing_quotes',
    'tenant_access_tokens',
    'notifications',
    'maintenance_plans',
    'maintenance_tasks',
    'job_plans',
    'job_plan_items',
    'pm_schedules',
    'pm_schedule_assets',
    'work_order_assets',
    'work_order_checks',
    'work_order_attachments',
    'objects'
  )
order by schemaname, tablename, cmd, policyname;
```

### Function Existence, Signature, Security, Body Hash

Use this for `SECURITY DEFINER`, public RPC, billing, notification, PM, workflow,
and public portal functions.

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  pg_get_userbyid(p.proowner) as owner_name,
  p.proacl as acl,
  md5(pg_get_functiondef(p.oid)) as definition_md5
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'internal')
  and p.proname in (
    'get_my_profile',
    'get_user_tenant_id',
    'is_super_admin',
    'is_platform_admin',
    'is_platform_staff',
    'handle_new_user',
    'auto_confirm_user',
    'enforce_profile_update_permissions',
    'register_new_tenant',
    'provision_tenant',
    'complete_pending_registration',
    'check_subscription_limits',
    'enforce_subscription_limits',
    'sync_tenant_modules_from_plan',
    'activate_subscription_after_payment',
    'admin_update_subscription',
    'admin_manage_subscription',
    'engine_calculate',
    'engine_activate',
    'engine_create_quote',
    'engine_approve_quote',
    'engine_activate_from_quote',
    'engine_cancel',
    'engine_extend_trial',
    'start_work_order',
    'complete_work_order_technician',
    'approve_work_order_supervisor',
    'approve_work_order_engineer',
    'reject_work_order',
    'close_work_order',
    'create_operation_log',
    'create_work_order',
    'assign_work_order',
    'cancel_work_order',
    'auto_close_stale_work_orders',
    'get_inventory_stats',
    'can_view_inventory',
    'can_manage_inventory',
    'get_public_tenant_data',
    'submit_public_work_order',
    'has_public_portal_access',
    'is_tenant_feature_enabled',
    'create_notification',
    'broadcast_notification',
    'notify_team_on_new_work_order',
    'send_email_notification',
    'get_runtime_secret',
    'pm_start_task',
    'pm_complete_task',
    'pm_cancel_task',
    'pm_review_task',
    'pm_generate_due_work_orders',
    'wo_start',
    'wo_complete',
    'get_tenant_reporting_foundation'
  )
order by schema_name, function_name, identity_args;
```

When comparing live functions to local migration files, collect the full function
definition only into a private local audit artifact. Review before sharing.

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'engine_activate'
order by identity_args;
```

### Routine Privilege Evidence

```sql
select
  routine_schema,
  routine_name,
  specific_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema in ('public', 'internal')
  and routine_name in (
    'create_operation_log',
    'create_notification',
    'broadcast_notification',
    'notify_team_on_new_work_order',
    'send_email_notification',
    'submit_public_work_order',
    'engine_activate',
    'pm_generate_due_work_orders',
    'wo_start',
    'wo_complete',
    'create_work_order',
    'assign_work_order',
    'cancel_work_order'
  )
order by routine_schema, routine_name, specific_name, grantee;
```

### Table and Column Evidence

```sql
select
  table_schema,
  table_name,
  column_name,
  ordinal_position,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema in ('public', 'storage')
  and table_name in (
    'subscription_plans',
    'tenants',
    'tenant_modules',
    'profiles',
    'buildings',
    'floors',
    'rooms',
    'teams',
    'team_members',
    'asset_categories',
    'assets',
    'asset_activity_logs',
    'work_orders',
    'work_order_parts',
    'operation_logs',
    'inventory_categories',
    'inventory_items',
    'inventory_transactions',
    'tenant_subscriptions',
    'payment_history',
    'platform_audit_logs',
    'platform_invoices',
    'billing_add_ons',
    'billing_invoices',
    'billing_quotes',
    'discount_policies',
    'platform_settings',
    'tenant_access_tokens',
    'notifications',
    'password_reset_otps',
    'maintenance_plans',
    'maintenance_tasks',
    'maintenance_task_checks',
    'maintenance_task_attachments',
    'checklist_templates',
    'checklist_template_items',
    'checklist_template_sections',
    'job_plans',
    'job_plan_items',
    'pm_schedules',
    'pm_schedule_assets',
    'work_order_assets',
    'work_order_checks',
    'work_order_attachments',
    'pm_generation_runs',
    'objects'
  )
order by table_schema, table_name, ordinal_position;
```

### Constraint Evidence

```sql
select
  conrelid::regclass as table_name,
  conname,
  contype,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where connamespace in ('public'::regnamespace)
  and conrelid::regclass::text in (
    'profiles',
    'work_orders',
    'operation_logs',
    'inventory_transactions',
    'tenant_subscriptions',
    'subscription_plans',
    'maintenance_tasks',
    'pm_schedules'
  )
order by table_name, conname;
```

### Trigger Evidence

```sql
select
  n.nspname || '.' || c.relname as table_name,
  t.tgname as trigger_name,
  t.tgenabled,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and (
    (n.nspname = 'auth' and c.relname = 'users')
    or (
      n.nspname = 'public'
      and c.relname in (
        'profiles',
        'tenants',
        'teams',
        'team_members',
        'assets',
        'work_orders',
        'notifications',
        'maintenance_tasks',
        'maintenance_task_checks',
        'checklist_templates',
        'checklist_template_items',
        'checklist_template_sections',
        'job_plans',
        'job_plan_items',
        'pm_schedules',
        'work_order_checks',
        'tenant_subscriptions',
        'billing_invoices',
        'billing_quotes'
      )
    )
  )
order by table_name, trigger_name;
```

### Table Privilege Evidence

```sql
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_schema, table_name, grantee, privilege_type;
```

### Duplicate Prefix Evidence

These queries do not solve duplicate prefixes by themselves. They prove whether
the live effects exist.

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  p.prosecdef,
  p.proacl,
  md5(pg_get_functiondef(p.oid)) as definition_md5
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'broadcast_notification',
    'restricted_enabled_modules_json',
    'plan_feature_to_module_codes',
    'plan_enabled_modules_json',
    'sync_maintenance_task_from_work_order',
    'sync_pm_task_from_wo',
    'has_public_portal_access',
    'submit_public_work_order'
  )
order by p.proname, identity_args;
```

```sql
select
  table_name,
  column_name,
  data_type,
  column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'subscription_plans' and column_name in ('is_popular', 'max_storage_mb'))
    or (table_name = 'tenants' and column_name = 'enabled_modules')
  )
order by table_name, column_name;
```

### Existing Verification Scripts

These are evidence aids after fixture preparation, not ledger repair tools:

```powershell
npm run prepare:staging-fixtures
npm run verify:rls
npm run verify:payment
npm run verify:workflow-authority
npm run verify:workflow-full
npm run verify:workflow-reject-branches
npm run verify:workorder-create
npm run verify:workorder-assignment
npm run verify:workorder-cancel
npm run verify:workorder-autoclose
npm run verify:pm-generation
```

For Stage 2A, prefer capturing outputs as local audit artifacts. Review and
redact secrets before sharing or committing any output.

## Recommended Stage 2 Sequence

### Stage 2A: Inventory and Evidence Only

Goal: create a complete evidence pack for `005` through `118`.

Actions:

1. Export the remote migration ledger.
2. Capture Supabase CLI version and linked project ref.
3. Capture `pg_policies`, `pg_proc`, routine privilege, table/column, constraint,
   and trigger evidence for all affected domains.
4. Run existing verification scripts that are read/probe oriented or use known
   staging fixtures.
5. Build a per-migration evidence matrix:
   - filename
   - domain
   - objects touched
   - live evidence found
   - superseded by later migration
   - duplicate-prefix status
   - repair eligibility: `blocked`, `candidate`, or `baseline-only`

Exit criteria:

- No database state was changed.
- Every high-risk function, policy, trigger, grant, and table shape has evidence.
- Duplicate-prefix behavior is documented.
- `db push` remains NO-GO.

### Stage 2B: Mark Low-Risk Clearly Proven Migrations as Applied

Do not start Stage 2B during this documentation task.

Only consider a historical migration for repair when all are true:

- It is not part of a duplicate-prefix group, or Stage 2C has resolved the group.
- It is additive/table-column/index-only or otherwise low risk.
- Live schema evidence proves the intended effect exists.
- No later migration intentionally supersedes it in a way that makes exact repair
  misleading.
- A backup and ledger export exist.
- The operator records exact repair commands and post-repair migration list.

Stage 2B likely candidates, after proof, may include simple schema additions such
as `010`, `062`, `074`, `086`, or `096`. This is not approval to repair them.

### Stage 2C: Handle Duplicate Prefixes

Before any duplicate-prefix repair:

1. Confirm how the installed Supabase CLI parses duplicate local versions.
2. Confirm whether the remote ledger can represent both files.
3. Decide whether the project is pursuing full historical repair or a baseline.
4. Document a decision for each duplicate group:
   - repair as a single historical version
   - leave as archived lineage and baseline
   - rename/consolidate only in a deliberate migration-history cleanup branch

No duplicate prefix should be repaired as a side effect of repairing nearby files.

### Stage 2D: Decide Baseline vs Full Repair

Full repair is appropriate only if:

- The ledger can represent the local migration history cleanly.
- Duplicate prefixes are resolved.
- Every historical high-risk migration is proven or intentionally superseded.
- The team wants old migration lineage to remain executable for fresh environments.

Baseline is preferable if:

- The live schema is the intended source of truth.
- Historical duplicate prefixes make repair ambiguous.
- Many old migrations are superseded by later hardening.
- Fresh-environment rebuilds should start from a clean known-good schema snapshot
  instead of replaying years of corrective churn.

Either path needs a written decision before `db push` is reconsidered.

### Stage 2E: Only Then Reconsider `db push`

`supabase db push` may be reconsidered only when:

- Staging ledger and local migration strategy are reconciled through `129` or an
  approved baseline.
- Duplicate prefixes no longer create ambiguous pending versions.
- `supabase migration list --linked` has no unexpected local-only or remote-only
  entries.
- A diff or dry-run equivalent shows no unexpected destructive replay.
- All workflow, PM, work-order, RLS, payment, build, and lint gates pass.
- Production has not been touched until staging proves the process.

Until those are true, `supabase db push` remains NO-GO.

## Final Recommendation

Do Stage 2 now only as Stage 2A: inventory and evidence collection.

Defer Stage 2B, Stage 2C, Stage 2D, and Stage 2E until:

- A backup and current ledger export exist.
- Every high-risk migration has live object evidence.
- Duplicate prefixes `060`, `090`, `095`, and `098` have a written handling plan.
- Superseded migrations are documented as lineage rather than assumed current
  schema state.
- Existing verification scripts are green against prepared staging fixtures.
- The team has chosen full historical repair or a baseline strategy.

Repairing `005` through `118` before those conditions are true would risk
marking missing security changes as applied, hiding actual drift, or unblocking a
future `db push` that replays old policy/function/trigger SQL unexpectedly.

Final Go/No-Go for `supabase db push`: NO-GO.
