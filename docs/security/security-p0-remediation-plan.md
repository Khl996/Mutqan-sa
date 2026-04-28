# Mutqan P0 Security Remediation Plan

## 1. Executive Summary

This document defines the concrete remediation plan for P0 security issues identified in the Mutqan RLS/RPC Authority Matrix.

This document began as a planning document. Implementation notes are now recorded below as focused P0 remediation work lands.

The P0 theme is clear: Mutqan already has a meaningful security foundation, but Pilot v1 should not rely on frontend guards or informal operating discipline for sensitive authority. Workflow transitions, tenant isolation, payment activation, role changes, platform access, operation logs, and public intake must be enforced at the database, RPC, or server API boundary.

For Pilot v1, the safest posture is:

- Workflow-sensitive work-order changes must go through audited RPCs or database-enforced guards.
- Payment activation must fail closed if the authoritative billing RPC fails.
- `create_operation_log` direct execution must be verified and revoked if exposed.
- Role and status changes for users must use one audited authority path.
- Platform support and finance access must be tested and governed before real customer data exposure.
- The public portal should stay disabled by default unless it is explicitly scoped and controlled.

## 1A. Current Implementation Status

Implemented in this remediation pass:

- Payment activation fallback is removed from `api/_lib/paymentActivation.ts`. `engine_activate` remains the only subscription/invoice writer for paid activation; failures now fail closed through a clear activation error handled by `api/verify-payment.ts` and `api/payment-webhook.ts`.
- Direct `create_operation_log` execution is migration-hardened by `supabase/migrations/119_harden_create_operation_log_grants.sql`, which revokes execute on `public.create_operation_log(uuid, uuid, varchar, varchar, uuid, varchar)` from `PUBLIC`, `anon`, and `authenticated`.

Original remaining verification items:

- Apply the new migration to the linked staging database and re-run the function privilege queries in Section 5.
- Confirm authorized workflow/public RPCs still create operation logs after the revoke.
- Run `npm run verify:payment` against an environment with payment runtime variables, and add or run a fail-closed test that simulates `engine_activate` failure and confirms no direct `tenant_subscriptions` or `billing_invoices` fallback rows are written.

Verification update on 2026-04-25:

- Payment fallback removed: implemented. `engine_activate` remains the only normal paid-activation writer.
- `create_operation_log` grant hardening: migration `119_harden_create_operation_log_grants.sql` was applied manually.
- Runtime grants: verified against the linked database. `PUBLIC`, `anon`, and `authenticated` all report `false` for execute on `public.create_operation_log(uuid, uuid, varchar, varchar, uuid, varchar)`.
- Workflow RPC logging: verified with a rollback-only staging smoke check. A disposable assigned work order called through `start_work_order` created an operation log inside the subtransaction, increasing log count from 3 to 4 and moving status to `in_progress`; the subtransaction then rolled back and the fixture remained `assigned` with 3 logs.
- Payment verification: partial. Unauthorized callback, malformed webhook, and duplicate webhook idempotency checks passed. Captured payment activation and duplicate callback checks failed because `PAYMENT_TEST_USER_JWT` is expired; failed-payment and mismatched-amount checks were skipped because `PAYMENT_FAILED_TAP_ID` and `PAYMENT_MISMATCHED_AMOUNT_TAP_ID` are not configured.

Remaining after this update:

- Refresh `PAYMENT_TEST_USER_JWT` and rerun `npm run verify:payment`.
- Configure `PAYMENT_FAILED_TAP_ID` and `PAYMENT_MISMATCHED_AMOUNT_TAP_ID` if full payment negative-path proof is required.
- Add or run a focused fail-closed test that simulates `engine_activate` failure and confirms no direct fallback rows are written.

## 2. P0 Remediation Table

| Finding | Risk | Evidence/files | Recommended fix | Implementation complexity | Test requirement | Pilot blocker? |
| --- | --- | --- | --- | --- | --- | --- |
| Direct work-order update bypasses | Managers or privileged users may directly change workflow-sensitive fields without status-transition checks or operation logs | `src/hooks/useWorkOrders.ts`, `src/components/work-orders/AddWorkOrderModal.tsx`, `src/hooks/useMaintenanceTasks.ts`, `src/components/maintenance/TaskExecutionModal.tsx`, `src/hooks/useWorkOrderWorkflow.ts` | Replace status, assignment, approval, closure, technician completion, and rejection updates with RPCs. Restrict generic update hooks to safe metadata fields only. Add audit for creation and assignment. | High | Direct update negative tests; assignment RPC tests; workflow RPC allow/deny tests by role, tenant, status, and assignment | Yes for real workflow pilot |
| Payment activation fallback | Service-role fallback can bypass `engine_activate` authorization, calculation, and audit guarantees | `api/_lib/paymentActivation.ts`, `api/verify-payment.ts`, `api/payment-webhook.ts` | Remove fallback for Pilot v1 and fail closed when `engine_activate` fails. A break-glass path should not be enabled by default. | Low to medium | Simulate RPC failure and assert no subscription/invoice rows are directly written; verify happy path still activates through `engine_activate` | Yes if paid activation is enabled |
| Payment webhook verification | Webhook processing is high trust and should fail closed before payment scale | `api/payment-webhook.ts`, `api/_lib/paymentActivation.ts` | Require shared secret or official Tap signature verification before processing production webhooks. Keep payment webhooks disabled or controlled until verified. | Medium | Malformed, unsigned, duplicate, wrong-amount, wrong-currency, wrong-tenant, and replay tests | Yes if real webhook activation is enabled |
| `create_operation_log` direct execute grants | If callable directly by authenticated users, operation logs can be forged or polluted | `supabase/migrations/036_fix_workflow_logs.sql`; no explicit final grant/revoke found in inspected migrations | Verify function privileges in the live database. Revoke direct execute from `PUBLIC`, `anon`, and `authenticated` if exposed. Confirm workflow RPCs can still write logs. | Medium | Direct RPC call to `create_operation_log` must be denied; workflow RPCs must still create logs | Yes if direct execute is available |
| Workflow RPC mutation coverage | Sensitive workflow RPCs are stronger than table writes, but not sufficiently proven by automated tests | `src/hooks/useWorkOrderWorkflow.ts`, workflow RPC migrations, `scripts/verify-rls-isolation.ps1` or equivalent verification scripts | Add required mutation tests for start, complete, supervisor approval, engineer review, close, reject, parts usage, and cross-tenant denial. | Medium to high | See Section 7 for full test list | Yes |
| User and role governance | Role/status changes have mixed paths, with some direct profile PATCH behavior outside the audited admin API | `api/admin-manage-user.ts`, `src/hooks/useTeams.ts`, `src/pages/teams/TeamsPage.tsx`, `src/hooks/usePlatformManagement.ts` | Make one audited server API or RPC the only path for role/status changes. Keep DB trigger protections as defense-in-depth. | Medium | API role matrix tests; direct PATCH denial tests; audit log tests | Yes if user management is enabled for pilot customers |
| Platform support and finance access | Platform staff can cross tenant boundaries in selected reads; governance and tests are incomplete | `src/config/permissions.ts`, `src/contexts/TenantContext.tsx`, `src/hooks/useReports.ts`, billing/reporting policies and RPCs | Define allowed support and finance access. Test that support cannot enter tenant context or mutate tenant operations, and finance sees invoices/subscriptions only unless explicitly intended. | Medium | Support/finance role tests for tenant entry, operational reads, mutations, invoices, subscriptions, reports, and exports | Yes if platform support/finance accounts are active |
| Public request portal | Anonymous intake can create spam or unwanted operational records if tokens leak or are broadly enabled | `src/pages/public/PublicReportPage.tsx`, `supabase/migrations/098_public_portal_entitlement_enforcement.sql` | Pilot policy: disabled by default. Enable only with explicit customer scope, controlled token, and monitoring. Add rate limiting/captcha before broad use. | Low to disable; medium to high to harden | Disabled portal tests; invalid token tests; token tenant validation; future abuse/rate-limit tests | No if disabled; yes if included in Pilot v1 |

## 3. Direct Work-Order Update Path Inventory

Workflow-sensitive fields include:

- `status`
- `assigned_to`
- `assigned_team`
- `start_time`
- `end_time`
- `completed_at`
- `technician_notes`
- `supervisor_notes`
- `engineer_notes`
- `reporter_notes`
- `technician_completed_at`
- `supervisor_approved_by`
- `supervisor_approved_at`
- `engineer_approved_by`
- `engineer_approved_at`
- `maintenance_manager_approved_by`
- `maintenance_manager_approved_at`
- `customer_reviewed_by`
- `customer_reviewed_at`
- rejection, return, closure, evidence, cost, attachment, and SLA fields where present

| Path | Current behavior | Sensitive field exposure | Recommendation |
| --- | --- | --- | --- |
| `useUpdateWorkOrder` in `src/hooks/useWorkOrders.ts` | Performs direct `work_orders.update(updates).eq('id', id)` using `Partial<WorkOrder>` | Broad. Can update workflow, assignment, approval, closure, and evidence fields if caller passes them | Replace with a safe metadata-only update path or audited RPC. Add an allowlist for non-workflow fields if direct updates remain |
| `useUpdateWorkOrderStatus` in `src/hooks/useWorkOrders.ts` | Performs direct status update | High. Status changes are workflow authority | Remove or replace with workflow RPCs. Status should move through `start_work_order`, `complete_work_order_technician`, approval, close, reject, or a new audited transition RPC |
| `useDeleteWorkOrder` in `src/hooks/useWorkOrders.ts` | Direct delete | High for auditability and operational memory | Disable for Pilot v1 or replace with audited cancel/void/archive RPC. Deleting operational memory should be exceptional |
| `useCreateWorkOrder` in `src/hooks/useWorkOrders.ts` | Direct insert | Medium. Creation may set initial assignment fields and operational context | Acceptable only if RLS validates tenant/location/asset and creation is audited. Prefer `create_work_order` RPC for consistent validation and logging |
| `AddWorkOrderModal` in `src/components/work-orders/AddWorkOrderModal.tsx` | Uses `useCreateWorkOrder`, sets initial status and assignment-related fields | Medium. Mostly creation-time fields | Keep as creation UI, but route through audited create RPC or trigger. Do not allow approval/closure fields at creation |
| `useMaintenanceTasks` in `src/hooks/useMaintenanceTasks.ts` | Creates work orders from maintenance task flow, including assigned status where applicable | Medium to high. PM-generated work can start already assigned | Route through the same create/assign RPC sequence or a dedicated PM generation RPC that logs source task and assignment |
| `TaskExecutionModal` in `src/components/maintenance/TaskExecutionModal.tsx` | Creates related work orders from maintenance execution context | Medium | Route through audited create path and avoid direct workflow-sensitive updates after creation |
| Workflow actions in `src/hooks/useWorkOrderWorkflow.ts` | Calls RPCs for start, complete, approvals, close, and reject | Low relative risk | Keep this pattern. Expand tests and remove competing direct table mutation paths |

Recommended field policy:

- Safe metadata updates may include title, description, priority, due date, category, non-sensitive notes before execution, and corrected asset/location context before work begins, if allowed by business rules.
- Sensitive workflow updates must use RPCs or database triggers that validate role, tenant, current status, assignment, reporter ownership, required reason, and audit logging.
- Assignment should have its own RPC, such as `assign_work_order`, with role checks, tenant checks, assignee/team validation, status validation, and operation logging.

## 4. Payment Activation Fallback Plan

Before remediation, `api/_lib/paymentActivation.ts` tried to activate through `engine_activate`. If that RPC failed, it logged a warning and fell back to direct service-role table writes.

The removed fallback path:

- Reads the target plan directly.
- Attempts `engine_calculate`; if that fails, it uses the submitted amount with zero tax and discount.
- Upserts `tenant_subscriptions` directly.
- Inserts a paid `billing_invoices` row directly.
- Attempts a best-effort `platform_audit_logs` insert with action `engine_activate_fallback`.
- Continues even if fallback audit logging fails.

This is not acceptable as the default path for Pilot v1 payment activation. The authoritative activation path should be `engine_activate`, because it is where billing authority, plan rules, idempotency expectations, and audit behavior should converge.

Recommended Pilot v1 approach:

1. Remove the fallback and fail closed if `engine_activate` returns an error.
2. Return a clear server error that allows manual investigation without creating subscription or invoice rows.
3. Keep manual subscription correction as an internal admin procedure, not an automatic API fallback.

Alternative only if operationally required:

- Add an explicit break-glass environment variable disabled by default.
- Require the break-glass path to call a separate audited RPC, not direct table writes.
- Log actor, tenant, charge id, plan id, reason, error from `engine_activate`, and before/after subscription state.

Safest recommendation for Pilot v1: remove fallback and fail closed.

Implementation note: the API fallback has been removed. `activatePaidSubscription` now throws a `PaymentActivationError` when `engine_activate` fails, and the payment API/webhook handlers return fail-closed activation errors instead of writing subscription or invoice rows directly.

## 5. `create_operation_log` Grant Verification Plan

Repository evidence:

- `create_operation_log` is defined in `supabase/migrations/036_fix_workflow_logs.sql`.
- It is a `SECURITY DEFINER` function.
- Multiple workflow RPCs call it.
- No explicit final `REVOKE EXECUTE` or narrowed `GRANT EXECUTE` for this function was found in the inspected migrations.

Uncertainty:

- Exact runtime grants must be verified against the linked database. Migration text alone is not enough to prove final privileges.

Required SQL verification:

```sql
select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  has_function_privilege('public', p.oid, 'execute') as public_can_execute,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_operation_log';
```

```sql
select
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'create_operation_log'
order by grantee, privilege_type;
```

Proposed migration-level remediation if unsafe execute access exists:

```sql
revoke execute on function public.create_operation_log(uuid, uuid, varchar, varchar, uuid, varchar) from public;
revoke execute on function public.create_operation_log(uuid, uuid, varchar, varchar, uuid, varchar) from anon;
revoke execute on function public.create_operation_log(uuid, uuid, varchar, varchar, uuid, varchar) from authenticated;
```

After revocation, run workflow RPC tests in staging. If revocation breaks internal workflow RPC logging, move the helper to a private schema or replace helper calls with direct inserts inside each authorized workflow RPC.

Implementation note: migration `supabase/migrations/119_harden_create_operation_log_grants.sql` revokes direct execute on the known helper signature from `PUBLIC`, `anon`, and `authenticated`. Runtime grant verification and workflow log smoke testing remain required after applying the migration.

## 6. User and Role Governance Plan

Current evidence:

- `api/admin-manage-user.ts` is the strongest current authority path. It validates caller role, tenant scope, allowed role assignment, revocation rules, and writes platform audit logs.
- `src/hooks/useTeams.ts` has direct profile PATCH behavior through `useUpdateTeamMember`, including `role` and `is_active`.
- `src/pages/teams/TeamsPage.tsx` calls role/status update behavior for tenant team members.
- `src/hooks/usePlatformManagement.ts` has direct platform staff profile update behavior for role/status changes.
- Database trigger protections are important, but direct profile writes do not appear to produce the same audit trail as the admin API.

Recommended target model:

- One audited server API or audited RPC should own all `role` and `is_active` changes.
- Direct client profile PATCH should not be able to change `role`, `is_active`, `tenant_id`, or platform role fields.
- Non-security profile metadata may use a separate restricted update path if needed.
- `enforce_profile_update_permissions()` should remain as defense-in-depth, not the primary business authority.

Pilot v1 recommendation:

- Route tenant role changes, account activation/deactivation, and platform staff role/status changes through the audited admin API.
- Hide or disable UI actions that still call direct role/status PATCH until they use the audited path.

## 7. Proposed Workflow RPC Mutation Tests

The workflow test suite should run against disposable fixtures in a staging or local Supabase environment.

Required tests:

| Area | Test cases |
| --- | --- |
| Start work | Assigned technician can start; assigned engineer can start where allowed; unassigned technician denied; reporter denied; cross-tenant user denied; invalid current status denied |
| Complete work | Assigned technician can complete; assigned engineer can complete where allowed; unassigned technician denied; reporter denied; wrong status denied; cross-tenant user denied |
| Parts usage | Same-tenant part can be consumed; cross-tenant part denied; insufficient stock denied; zero or invalid quantity denied; inventory transaction behavior verified where expected |
| Supervisor approval | Supervisor can approve when status is correct; technician denied; reporter denied; wrong tenant denied; wrong status denied |
| Engineer review | Engineer can approve/review when status is correct; technician denied; reporter denied; wrong tenant denied; wrong status denied |
| Close work | Original reporter can close when status is ready; wrong reporter denied; maintenance manager override allowed; cross-tenant reporter denied; wrong status denied |
| Reject or return | Empty reason denied; assigned technician/engineer can reject only where appropriate; supervisor can return at supervisor stage; engineer can return at engineer stage; reporter can reject/return only where workflow allows; cross-tenant user denied |
| Direct table update bypass | Direct update of `status`, assignment, approval, closure, and completion fields denied or ignored outside RPC path |
| Operation logs | Authorized workflow RPC creates expected log; direct call to `create_operation_log` denied |

Suggested implementation:

- Extend `scripts/verify-rls-isolation.ps1`, or add a dedicated `scripts/verify-workflow-rpc-authority.ps1`.
- Make workflow mutation tests a required pilot readiness gate, not an optional mode.

## 8. Platform Support and Finance Test Requirements

Platform staff access must be tested before Pilot v1 uses real customer data.

Required support tests:

- `platform_support` cannot enter tenant context unless an explicit permission and governance process are added.
- `platform_support` cannot create, update, delete, assign, start, complete, approve, close, or reject tenant work orders.
- `platform_support` cannot mutate tenant assets, facilities, inventory, teams, users, tenant settings, or subscriptions.
- `platform_support` can only view tenant lists, audit surfaces, or reports that are explicitly approved.
- Any approved support data access should be auditable or tied to a support reason in future hardening.

Required finance tests:

- `platform_finance` can view invoices and subscriptions according to policy.
- `platform_finance` cannot mutate tenant operational records.
- `platform_finance` cannot enter tenant context unless explicitly approved.
- `platform_finance` cannot view operational work-order, asset, facility, inventory, or profile data unless this is an intentional reporting policy.
- If finance report access includes operational metrics, document exactly which metrics are allowed and why.

Pilot v1 default:

- Do not provision broad support or finance accounts against live pilot tenants until these tests pass.

## 9. Public Portal Pilot Policy

Current evidence:

- `src/pages/public/PublicReportPage.tsx` exposes `/portal/:token`.
- `get_public_tenant_data` and `submit_public_work_order` validate active tokens and public portal entitlement.
- Public submissions validate tenant ownership of selected building, floor, and asset.
- No app-layer rate limit, captcha, throttling, or abuse monitoring was evident from the inspected source.

Pilot v1 policy:

- Public portal is disabled by default.
- Enable only when explicitly included in a customer pilot scope.
- Use a controlled token, limited distribution, and clear customer ownership.
- Rotate or revoke tokens after demo/pilot use where exposure is uncertain.
- Do not use the public portal as the default intake channel until abuse controls exist.

Before broad use:

- Add rate limiting.
- Add captcha or equivalent abuse friction.
- Add submission monitoring.
- Add token rotation guidance.
- Add tests for invalid tokens, disabled entitlement, cross-tenant building/floor/asset selection, and repeated submissions.

## 10. Recommended Implementation Order

1. Freeze or hide high-risk optional surfaces for Pilot v1: public portal, self-service payment activation, and any generic work-order status/assignment edit UI not backed by RPC.
2. Verify `create_operation_log` runtime grants and add a migration to revoke direct execution if exposed.
3. Remove payment activation fallback and make payment activation fail closed on `engine_activate` failure.
4. Restrict direct work-order updates and add/route assignment and metadata changes through audited RPCs.
5. Route all user role/status changes through one audited server API or audited RPC.
6. Add mandatory workflow RPC mutation tests and direct update bypass tests.
7. Add platform support and finance role tests.
8. Decide whether the public portal is included in Pilot v1. If yes, add minimum abuse controls first; if no, keep it disabled and documented.

## 11. Proposed Migration Tasks

Proposed migrations are listed as tasks only. They are not implemented by this document.

1. `revoke_create_operation_log_direct_execute`
   - Verify current function grants.
   - Revoke execute from `PUBLIC`, `anon`, and `authenticated` if exposed.
   - Confirm workflow RPCs still log correctly.

2. `guard_work_order_sensitive_fields`
   - Add a database trigger or policy-backed guard that blocks direct updates to workflow-sensitive fields outside approved RPC paths.
   - Consider a transaction-local setting used only inside approved RPCs if a trigger-based approach is selected.
   - Ensure ordinary safe metadata updates still work where intended.

3. `audit_work_order_create_assign_delete`
   - Add logging for work-order creation, assignment, cancellation/archive/delete, and sensitive metadata changes.
   - Prefer archival or cancellation over hard delete for operational memory.

4. `profile_role_status_authority_hardening`
   - Ensure direct client writes cannot change `role`, `is_active`, `tenant_id`, or platform authority fields.
   - Add audit logging if any database-level profile role/status update path remains.

5. `public_portal_abuse_controls`
   - Add minimum server-side throttling storage if the portal is enabled before broader use.
   - Add token rotation metadata if needed.

## 12. Proposed Code Tasks

1. `api/_lib/paymentActivation.ts`
   - Remove direct table fallback.
   - Return a clear failure when `engine_activate` fails.
   - Keep any future break-glass path disabled by default and audited through RPC.

2. `api/payment-webhook.ts`
   - Require production webhook verification to fail closed.
   - Keep optional local/dev behavior separate from production behavior.

3. `src/hooks/useWorkOrders.ts`
   - Remove or restrict `useUpdateWorkOrder`.
   - Remove or replace `useUpdateWorkOrderStatus`.
   - Replace direct delete with audited cancel/archive behavior.
   - Keep create only if backed by audit and RLS validation, or replace with `create_work_order` RPC.

4. `src/hooks/useWorkOrderWorkflow.ts`
   - Add assignment RPC hook if assignment remains a separate action.
   - Keep start, complete, approve, close, and reject actions RPC-based.

5. `src/components/work-orders/AddWorkOrderModal.tsx`
   - Route creation and initial assignment through approved create/assign path.

6. `src/hooks/useMaintenanceTasks.ts` and `src/components/maintenance/TaskExecutionModal.tsx`
   - Route PM-generated or related work-order creation through the same audited path.

7. `src/hooks/useTeams.ts` and `src/pages/teams/TeamsPage.tsx`
   - Replace direct role/status updates with the audited admin API.

8. `src/hooks/usePlatformManagement.ts`
   - Replace direct platform staff role/status updates with the audited admin API.

9. Public portal code paths
   - Keep `/portal/:token` disabled by default unless tenant entitlement and pilot scope explicitly allow it.
   - Add client messaging that does not expose sensitive tenant details when token validation fails.

## 13. Proposed Test Tasks

1. Add mandatory workflow RPC authority tests.
2. Add direct `work_orders` sensitive-field update denial tests.
3. Add `create_operation_log` direct execute denial tests.
4. Add payment activation fail-closed tests.
5. Add payment webhook verification tests.
6. Add role/status management tests for tenant admin, platform owner, platform admin, platform HR, support, finance, and unauthorized tenant users.
7. Add direct profile PATCH denial tests for `role`, `is_active`, and `tenant_id`.
8. Add platform support mutation denial tests across work orders, assets, facilities, teams, users, inventory, settings, and subscriptions.
9. Add platform finance invoice/subscription allow tests and operational-data denial tests.
10. Add public portal disabled, invalid token, disabled entitlement, cross-tenant selection, and future rate-limit tests.

## 14. Disable or Hide for Pilot v1 if Not Fixed

If the P0 items are not completed before Pilot v1, the following should be disabled, hidden, or manually controlled:

- Public request portal for real customer use.
- Self-service payment activation and payment webhook activation.
- Generic work-order status update actions not backed by workflow RPCs.
- Generic work-order assignment changes not backed by an assignment RPC.
- Work-order delete actions.
- Tenant user role/status edits that still use direct profile PATCH.
- Platform staff role/status edits that still use direct profile PATCH.
- Platform support access to live tenant data, unless governed and tested.
- Platform finance access to operational reports, unless explicitly intended and tested.

Manual subscription activation may be used temporarily only as an internal controlled procedure with documented approval and audit trail.

## 15. Final Go/No-Go Security Recommendation

Controlled Pilot v1 should be a security Go only when the following are true:

- Direct execution of `create_operation_log` is verified safe or revoked.
- Payment activation fails closed when `engine_activate` fails.
- Webhook activation is disabled, controlled, or verified fail-closed.
- Direct work-order updates cannot bypass workflow authority for status, assignment, approval, completion, closure, or rejection.
- Workflow RPC mutation tests pass for allowed and denied cases.
- User role/status changes use one audited authority path.
- Platform support and finance access is explicitly tested and governed.
- Public portal is disabled by default or hardened for the specific pilot scope.

If any of those conditions are not met, Mutqan can still run internal demos or tightly controlled non-production validation, but should not treat the affected surface as ready for real customer Pilot v1 operations.
