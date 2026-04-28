# Mutqan RLS/RPC Authority Matrix

## 1. Executive Summary

This document is the first official RLS/RPC Authority Matrix for Mutqan. It maps sensitive product operations across frontend permissions, route access, client behavior, RPC/database authorization, RLS policies, audit logging, existing test coverage, risk level, and recommended action.

Mutqan is a multi-tenant SaaS platform for operations, maintenance, and asset management. Tenant isolation, role-based authority, workflow integrity, and auditability are product trust requirements, not optional hardening.

This matrix is based on repository evidence from:

- `src/config/roles.ts`
- `src/config/permissions.ts`
- `src/components/auth/ProtectedRoute.tsx`
- `src/contexts/AuthContext.tsx`
- `src/contexts/TenantContext.tsx`
- `src/hooks/useWorkOrders.ts`
- `src/hooks/useWorkOrderWorkflow.ts`
- `src/hooks/useAssets.ts`
- `src/hooks/useFacilities.ts`
- `src/hooks/useTenantModules.ts`
- `src/hooks/useTenantSettings.ts`
- `src/hooks/useReports.ts`
- `src/hooks/useInventory.ts`
- `src/hooks/useTeams.ts`
- `src/hooks/useWorkTeams.ts`
- `src/hooks/useBillingEngine.ts`
- `src/hooks/useTenants.ts`
- `api/admin-manage-user.ts`
- `api/payment-webhook.ts`
- `api/verify-payment.ts`
- `api/_lib/paymentActivation.ts`
- `supabase/migrations`
- `docs/security`

The current codebase shows a meaningful security foundation: centralized roles and permissions, route guards, hardened workflow RPCs, tenant-scoped RLS policies, inventory leakage remediation, billing engine authorization, and basic runtime verification scripts.

However, the repository evidence does not support a claim of full production security readiness. Several sensitive operations still depend heavily on direct client table writes protected by RLS, with limited operation-level mutation tests and uneven audit logging. These gaps should be closed before broader pilot and sales execution.

## 2. Definitions

**UI Guard**

A frontend visibility or action-control check, usually based on `usePermission`, role checks, feature flags, or component logic. UI guards improve user experience but are not security boundaries.

**Route Guard**

A client-side route wrapper or layout rule that redirects users away from pages they should not access. In Mutqan, the main route guard is `ProtectedRoute`, plus authentication checks inside layouts such as `DashboardLayout`.

**Hook/Client Guard**

Client-side filtering or mutation behavior inside React hooks. Examples include adding `tenant_id` filters to Supabase queries, hiding module toggles, or calling a secure RPC instead of direct table updates.

**RPC Authorization**

Authorization enforced inside database functions or server API routes. RPC authorization is a real security boundary when it validates the authenticated actor, tenant scope, role, status transition, and payload.

**RLS Policy**

Postgres row-level security policies and helper functions that restrict table access by tenant, role, or ownership. RLS is the primary tenant isolation layer for direct Supabase table access.

**Audit/Event Logging**

Database or application records that preserve who did what, when, and why. In Mutqan this includes `operation_logs`, `asset_activity_logs`, `platform_audit_logs`, billing invoices, and workflow timestamps.

**Test Coverage**

Automated or scripted proof that an operation is correctly isolated and authorized. Existing security-relevant scripts include `npm run verify:rls` and `npm run verify:payment`, but operation-level mutation coverage is incomplete.

## 3. Role Model Summary

Current active platform roles:

- `platform_owner`
- `platform_admin`
- `platform_support`
- `platform_finance`
- `platform_hr`

Current active tenant roles:

- `tenant_admin`
- `facility_manager`
- `maintenance_manager`
- `supervisor`
- `engineer`
- `technician`
- `reporter`

Legacy/transitional roles:

- `tenant_owner` is normalized to `tenant_admin` in frontend role helpers and migration `093_v1_roles_permissions_alignment.sql`.
- `user` is treated as no operational access in frontend role helpers, though tenant-bound legacy `user` rows may have been migrated to `reporter`.

Important governance note: some database helpers still reference `tenant_owner`, especially the latest inventory helper in `117_inventory_rls_tenant_isolation_fix.sql`. This should be cleaned up so the database and frontend role models fully match.

## 4. Permission Model Summary

Frontend permissions are centralized in `src/config/permissions.ts`.

Key tenant permissions include:

- `dashboard.view`
- `facilities.view`, `facilities.manage`
- `assets.view`, `assets.manage`
- `work_orders.view`, `work_orders.create`, `work_orders.update`, `work_orders.manage`, `work_orders.approve`
- `maintenance.view`, `maintenance.manage`
- `inventory.view`, `inventory.manage`
- `users.view`, `users.manage`
- `work_teams.view`, `work_teams.manage`
- `reports.view`, `reports.export`
- `settings.view`, `settings.manage`
- `subscription.manage`

Key platform permissions include:

- `platform.dashboard.view`
- `platform.tenants.view`, `platform.tenants.manage`, `platform.tenants.enter`
- `platform.subscriptions.manage`
- `platform.staff.view`, `platform.staff.manage`
- `platform.financials.view`, `platform.financials.manage`
- `platform.audit.view`
- `platform.reports.view`
- `platform.settings.manage`

Important distinction: frontend permissions are not sufficient by themselves. Every sensitive operation must also be enforceable by RLS, RPC logic, server API logic, or a database trigger.

## 5. Authority Matrix Table

| Operation | User roles expected | Frontend permission/role guard | Route/page guard | Hook/client guard | RPC/database guard | RLS/helper policy | Audit/event logging | Existing tests | Risk level | Gap | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Login and profile loading | Any authenticated active user with a valid profile | Login form; `AuthContext` profile state; role normalization | Auth layout; `DashboardLayout` redirects unauthenticated users | `AuthContext.fetchProfile` reads `profiles?id=eq.<auth user>` | Supabase Auth plus `profiles` SELECT | Confirmed policy includes `"Platform staff can view all profiles"` with self-view; complete final policy set needs runtime verification | No explicit login audit found | No dedicated auth/profile RLS test found | Medium | Profile loading relies on RLS; login audit not evident | Add profile SELECT tests for self, same-tenant, platform staff, and inactive/legacy users; decide whether login audit is required |
| 2. Tenant context selection / switching | Tenant users for own tenant; `platform_owner`/`platform_admin` for tenant entry | `TenantContext` allows platform entry only with `platform.tenants.enter`; tenant users use own `tenant_id` | Platform pages guarded by platform permissions; tenant pages require selected tenant | Tenant selection stored in localStorage; client fetches tenants from REST | None for switching itself; data access must be enforced by RLS | `tenants_select_secure`; `can_view_platform_tenants()`; `tenants_update_secure` for writes | No switch audit found | `verify:rls` checks tenant table reads; no tenant switching test | Medium | Local tenant switching is client state; platform support can view tenants but not enter by frontend | Add explicit tests for platform support/finance cannot enter tenant data; audit platform tenant-entry events |
| 3. Viewing dashboard | All active tenant roles; platform users only after tenant entry | All active roles have `dashboard.view` | `/dashboard` is inside `DashboardLayout`; no explicit `ProtectedRoute` permission wrapper | `useDashboardStats` filters by current tenant where present | Direct REST reads from `work_orders` and `assets` | `work_orders_select_scoped`; `assets_select_tenant`; related helpers | No dashboard audit expected | Covered indirectly by `verify:rls` read checks for work orders/assets | Low | Dashboard route does not explicitly use `dashboard.view`; relies on layout and data RLS | Consider adding explicit dashboard route guard for consistency |
| 4. Viewing facilities / locations | Tenant roles with `facilities.view`; platform owner/admin | `facilities.view` | `/facilities` guarded by `ProtectedRoute` | `useBuildings` filters tenant; single building/floor/room reads rely on RLS; departments query has no client tenant filter | Direct REST reads | `buildings_select_tenant`; `floors_select_tenant`; room/department policies; `get_user_tenant_id()`; `is_platform_admin()` | No read audit expected | `verify:rls` covers `buildings`; floors/rooms/departments need verification | Low | Some child/single-record hooks rely fully on RLS without tenant filter | Add RLS tests for floors, rooms, departments, and direct object-id access |
| 5. Creating, updating, deleting facilities | `tenant_admin`, `facility_manager`, platform owner/admin | Expected `facilities.manage` in UI | `/facilities` page guarded only by `facilities.view`; action buttons should enforce manage | `useCreateBuilding`, `useUpdateBuilding`, `useDeleteBuilding`, `useCreateFloor` perform direct REST writes | Direct table writes | `can_manage_facilities()`; `buildings_insert_admin`; `buildings_update_admin`; `buildings_delete_admin`; `floors_*_admin`; room/department manage policies | No facility CRUD audit found | No mutation tests found | Medium | CRUD audit missing; route is view-level and action authority depends on component plus RLS | Add mutation tests for facility CRUD by role; add event logging for create/update/delete if operationally required |
| 6. Viewing assets | Tenant roles with `assets.view`; platform owner/admin | `assets.view` | `/assets`, `/assets/:id`, `/asset-logs` guarded by `ProtectedRoute` | `useAssets` filters tenant; `useAsset(id)` relies on RLS for direct object id | Direct REST reads | `assets_select_tenant`; `asset_activity_logs_select_scoped`; `get_user_tenant_id()`; `is_platform_admin()` | No read audit expected | `verify:rls` covers `assets` | Low | Direct object-id reads rely fully on RLS | Add direct object-id RLS test for cross-tenant asset detail access |
| 7. Creating, updating, deleting assets | `tenant_admin`, `facility_manager`, platform owner/admin | `assets.manage` expected in UI | Asset pages guarded by `assets.view`; action buttons should enforce manage | `useCreateAsset`, `useUpdateAsset`, `useDeleteAsset` write directly | Direct table writes; `update_asset_status_with_log()` exists for status changes | `can_manage_assets_scope()`; `assets_insert_scoped`; `assets_update_scoped`; `assets_delete_scoped`; `facility_location_is_valid()` | `asset_activity_logs` only for `update_asset_status_with_log`; direct CRUD audit not evident | No mutation tests found | Medium | Direct asset updates may not create audit history unless status RPC is used | Prefer audited RPC for sensitive asset status changes; add CRUD mutation tests and audit policy |
| 8. Viewing work orders | Roles with `work_orders.view`; platform owner/admin | `work_orders.view` | `/work-orders`, `/work-orders/:id` guarded by `ProtectedRoute` | `useWorkOrders` filters tenant; `useWorkOrder(id)` relies on RLS | Direct table reads | `work_orders_select_scoped`; `get_user_tenant_id()`; `is_platform_admin()` | No read audit expected | `verify:rls` covers `work_orders` | Low | Direct object-id reads rely fully on RLS | Add direct cross-tenant work-order detail test |
| 9. Creating work orders | `tenant_admin`, `facility_manager`, `maintenance_manager`, `supervisor`, `engineer`, `reporter`, platform owner/admin | `work_orders.create` | Work order pages guarded by `work_orders.view`; create action should enforce create | `useCreateWorkOrder` inserts directly | Direct insert | `can_create_work_orders_scope()`; `work_orders_insert_scoped`; `work_order_asset_location_is_valid()` | Regular create audit not confirmed; public portal create logs via `create_operation_log` | No create mutation test found | Medium | Regular work-order creation may lack operation log/audit proof | Add create-work-order tests by role and tenant; add creation event logging or trigger |
| 10. Assigning work orders | `tenant_admin`, `maintenance_manager`, platform owner/admin | Expected `work_orders.manage`; frontend component behavior needs verification | Work order detail guarded by `work_orders.view` | Assignment appears to use direct `useUpdateWorkOrder` table update | Direct update | `work_orders_update_scoped`; `can_manage_work_orders_scope()` | Assignment audit not evident for direct updates | No assignment mutation test found | High | Direct manager updates can change assignment/status without workflow-specific transition checks or audit | Add RPC for assignment with role, tenant, assignee, status, and audit validation; restrict direct table status/assignment updates |
| 11. Starting work orders | `tenant_admin`, `maintenance_manager`, assigned `engineer`/`technician`, platform owner/admin | `WorkOrderActions` checks role and `work_orders.update` | Work order detail guarded by `work_orders.view` | `useWorkOrderWorkflow.startWork` calls RPC | `start_work_order(p_work_order_id)` checks auth, tenant, role, status, assignment | RPC uses `profiles`; work order table still protected by RLS for direct access | `create_operation_log` records work started | `verify:rls` optional mutation mode tests assigned/unassigned start and reporter denial | Low | Mutation tests are optional and require disposable fixtures | Make start-work RPC mutation tests mandatory in staging gate |
| 12. Completing work orders as technician | Assigned `technician`/`engineer`; `tenant_admin`, `maintenance_manager`, platform owner/admin override | `WorkOrderActions` checks role, assignment, `work_orders.update`, notes | Work order detail guarded by `work_orders.view` | `completeWorkTechnician` calls RPC with notes and optional parts | `complete_work_order_technician()` checks tenant, role, status, assignment, parts tenant, and stock | Work order, inventory, and parts tables protected by RLS; RPC uses definer authority | Logs completion and used parts through `create_operation_log`; timestamps and notes written | No complete-work mutation test found | Medium | Parts path and workflow transition need automated negative tests | Add tests for assigned technician, unassigned technician, reporter denial, cross-tenant part denial, insufficient stock |
| 13. Supervisor approval | `tenant_admin`, `maintenance_manager`, `supervisor`, platform owner/admin | `WorkOrderActions` checks role and `work_orders.approve` | Work order detail guarded by `work_orders.view` | `approveSupervisor` calls RPC | `approve_work_order_supervisor()` checks tenant, role, status, and tenant workflow setting | RPC authority; work order RLS for base access | Logs approval, approver id, timestamp, notes | No approval mutation test found | Medium | Approval authority only proven by code inspection | Add supervisor approval allow/deny tests, including engineer/technician denial |
| 14. Engineer review | `tenant_admin`, `maintenance_manager`, `engineer`, platform owner/admin | `WorkOrderActions` checks role and `work_orders.approve` | Work order detail guarded by `work_orders.view` | `approveEngineer` calls RPC | `approve_work_order_engineer()` checks tenant, role, and status | RPC authority; work order RLS for base access | Logs engineer approval, approver id, timestamp, notes | No engineer review mutation test found | Medium | Approval authority only proven by code inspection | Add engineer review allow/deny tests |
| 15. Closing work orders | Original reporter, `tenant_admin`, `maintenance_manager`, platform owner/admin | `WorkOrderActions` allows management, platform, or reporter | Work order detail guarded by `work_orders.view` | `closeWorkOrder` calls RPC | `close_work_order()` checks tenant, status, original reporter or management override | RPC authority; work order RLS for base access | Logs closure, customer/reporter review fields, timestamp | No close mutation test found | Medium | Closure path not covered by automated tests | Add close tests for original reporter, wrong reporter, manager override, and cross-tenant denial |
| 16. Rejecting / returning work orders | Depends on stage: assigned technician/engineer, supervisor, engineer, reporter, management override, platform owner/admin | `WorkOrderActions` checks role, status, reason, and settings | Work order detail guarded by `work_orders.view` | `rejectWork` calls RPC | `reject_work_order()` checks reason, tenant, role, status-specific authority, assignment/reporter where needed | RPC authority; work order RLS for base access | Logs rejection/return reason | No reject mutation test found | Medium | Complex stage-specific authorization has no automated coverage | Add stage-by-stage reject tests and require rejection reason test |
| 17. Using inventory parts in work orders | Assigned technician/engineer; `tenant_admin`, `maintenance_manager`, platform owner/admin override | Parts UI gated by `work_orders.parts_tracking` feature and completion action | Work order detail guarded by `work_orders.view`; inventory page separate | Parts included in `completeWorkTechnician` RPC payload | `complete_work_order_technician()` validates part tenant and stock before writing parts and decrementing inventory | Inventory RLS from `117_inventory_rls_tenant_isolation_fix.sql`; `can_view_inventory()`; `can_manage_inventory()` | Logs used parts; inventory transaction behavior needs verification for this path | Inventory tenant read covered by `verify:rls`; parts mutation not covered | Medium | Latest inventory helper still references legacy `tenant_owner`; part consumption tests missing | Remove `tenant_owner` from inventory helper; add work-order parts consumption tests |
| 18. Viewing operation logs | Same-tenant users with related work visibility; platform owner/admin | Work order detail visibility via `work_orders.view`; platform logs via `platform.audit.view` for platform audit logs | Work order detail and platform logs guarded separately | `useWorkOrderLogs` queries `operation_logs` by `work_order_id` without tenant filter | Direct table read | `operation_logs_select_scoped`; exact direct EXECUTE grants on `create_operation_log` need verification | `operation_logs` are the event log; `platform_audit_logs` for platform actions | No operation-log forgery/visibility test found | High | `create_operation_log` is `SECURITY DEFINER`; no explicit direct EXECUTE revoke found in inspected migrations | Verify function privileges in DB; revoke direct execute from public/authenticated if not required; add log read/write tests |
| 19. Viewing reports | Tenant roles with `reports.view`; platform owner/admin/support/finance for scoped reporting where allowed | `reports.view`; platform reports have `platform.reports.view` | `/reports` guarded by `reports.view`; platform `/platform/reports` guarded separately | `useReportingFoundation` calls RPC; other hooks direct table reads with tenant filters | `get_tenant_reporting_foundation(p_tenant_id)` checks auth role and tenant scope | Underlying table RLS; RPC allows platform owner/admin/support/finance to request tenant metrics | No view audit found | `verify:rls` covers underlying tables; no report RPC role matrix test | Medium | Platform support/finance report scope governance needs explicit policy decision and tests | Add report RPC tests by role and tenant; document support/finance access purpose |
| 20. Exporting reports | Roles with `reports.export`; mainly `tenant_admin`, `maintenance_manager`, platform finance/owner/admin | Export button checks `reports.export` and module feature `reports.export` | `/reports` guarded by `reports.view` | Export is client-side CSV/PDF-style behavior from already-loaded data | No dedicated export RPC | RLS applies to data reads only | No export audit found | No export tests found | Medium | Data export is sensitive and currently not server-audited | Add export audit event; consider server-side export endpoint for sensitive reports |
| 21. Managing users and roles | `tenant_admin` for own tenant roles; platform owner/admin/HR for platform staff according to API rules | `users.view`/`users.manage`; platform staff page guarded by platform staff permissions | `/teams` guarded by `users.view`; platform `/staff` guarded by `platform.staff.manage` | Create/revoke uses `api/admin-manage-user`; update uses direct `profiles` PATCH in some hooks | API validates caller and role assignment; DB trigger `enforce_profile_update_permissions()` protects direct profile updates | `profiles` RLS plus trigger; policy `"Platform staff can view all profiles"` | API create/revoke writes `platform_audit_logs`; direct profile PATCH audit not evident | No role-assignment matrix tests found | High | Direct profile updates rely on trigger, and direct updates may not be audited like API-managed changes | Route all role/status changes through server API or add audited profile update RPC; add role assignment negative tests |
| 22. Managing teams | `tenant_admin`, `maintenance_manager`, platform owner/admin | `work_teams.view`/`work_teams.manage` expected | `/work-teams` guarded by `work_teams.view` | `useWorkTeams` writes `teams` and `team_members` directly | Direct table writes | `can_manage_work_teams()`; `teams_*_policy`; `team_members_*_policy` | No team audit found | No team mutation tests found | Medium | Team membership changes are not visibly audited | Add team create/update/member tests; add event logging for team membership changes |
| 23. Managing tenant settings | `tenant_admin`, platform owner/admin | `settings.manage` for tenant settings page | `/settings/tenant` guarded by `settings.manage` | `useTenantSettings` writes `tenants.settings` directly | Direct tenant table update | `tenants_update_secure`; `enforce_tenant_subscription_guard()` protects subscription-controlled fields | No settings audit found | No settings mutation tests found | Medium | Workflow/portal settings can affect authority and public intake without audit | Add settings audit log and tests for tenant admin allowed settings but blocked subscription/module fields |
| 24. Managing module visibility / tenant configuration | Platform owner/admin through plan/billing workflows; tenant users should not self-edit module visibility | `useTenantModules` update/toggle hooks intentionally throw "Modules are managed by the active subscription plan" | `/settings/modules` guarded by `settings.view`; platform subscription routes guarded separately | Module reads from `tenants.enabled_modules`; client-side module updates disabled | Billing/provisioning workflows update plan/module fields; direct tenant update protected by trigger for non-platform users | `enforce_tenant_subscription_guard()` blocks non-platform protected field edits; plan module functions sync modules | Module changes audit needs verification | No module configuration tests found | Medium | Platform module changes and per-tenant overrides need governance and audit clarity | Add module-change audit and tests; require plan-led module changes, not ad hoc tenant customization |
| 25. Viewing subscription state | `tenant_admin`; platform finance/support/owner/admin where policies allow | `subscription.manage` for tenant page; platform finance/subscription permissions | `/subscription` guarded by `subscription.manage`; platform financial/subscription routes guarded separately | `useTenantSubscription`, `useTenantSubscriptionNew`, billing hooks read tables | Direct reads and billing RPCs | `tenant_subscriptions_read`; `billing_invoices_tenant_read`; `billing_invoices_platform_read` from billing migrations | Billing invoices/subscription rows are records; read audit not found | `verify:rls` covers `tenant_subscriptions` and `billing_invoices` reads | Low | Platform support/finance read scope needs governance documentation | Add support/finance access rules and periodic review |
| 26. Activating subscription after payment | Tenant admin self-service; platform owner/admin; service role for verified Tap charge | Payment callback uses authenticated user; billing UI uses engine hooks | Payment callback public route, but API requires bearer token for verify-payment | `verify-payment` validates bearer user, Tap charge, metadata, amount, currency, tenant access | `engine_activate()` authorizes self-service/admin/service paid Tap activation | Billing table RLS; function grants authenticated/service_role | `engine_activate` inserts `platform_audit_logs`; invoices record payment | `verify:payment` covers unauthorized callback and optional captured/idempotent paths | High | API fallback can bypass `engine_activate` if RPC fails | Remove or tightly gate table fallback in `paymentActivation.ts`; require `verify:payment` success before pilot payments |
| 27. Payment webhook processing | External Tap webhook, not a user role; service-role activation only after verification | None | `/api/payment-webhook` server endpoint only | Validates charge id, rate limits, optional shared secret, re-fetches Tap, validates metadata/amount/currency/idempotency | Calls `activatePaidSubscription`, normally `engine_activate()` with service role | Service role bypasses RLS by design; engine RPC narrows allowed service activation | `engine_activate` audit; webhook logs to server console | `verify:payment` covers malformed webhook and optional duplicate webhook | High | Shared webhook secret is optional; no official Tap signature verification found; fallback bypass remains | Make webhook secret/signature fail-closed before payment scale; remove fallback or require explicit break-glass env |
| 28. Platform admin viewing tenants | `platform_owner`, `platform_admin`; `platform_support` can view tenant list by policy | `platform.tenants.view` | `/platform/tenants` guarded by `platform.tenants.view` | `useTenants` reads tenant list directly | Direct REST reads | `tenants_select_secure`; `can_view_platform_tenants()` includes support | No tenant-list view audit found | `verify:rls` checks platform admin reads | Medium | Support tenant visibility is broad and not audited | Define support access purpose; audit tenant detail access if needed |
| 29. Platform support accessing tenant data | Intended read-only support scope; no tenant-entry by frontend unless permission added | `platform_support` has many tenant read permissions but lacks `platform.tenants.enter` | Support can access platform tenant/audit/report pages based on permissions; tenant entry blocked by `TenantContext` | Direct platform pages may query tenants/profiles/reports | Depends on table RLS and report RPC | `is_platform_staff()` allows all profile reads; `can_view_platform_tenants()` allows support tenant list; reporting RPC allows support metrics | Platform audit view exists; support data access audit not evident | No support-specific RLS test found | High | Support can see broad profile/tenant/report data in DB policies without support-ticket governance | Add support-mode governance: reason codes, time-bound access, audit, and tests that support cannot mutate tenant data |
| 30. Platform finance accessing invoices / subscriptions | `platform_finance`, platform owner/admin | `platform.financials.view/manage`; `reports.export` | `/platform/financials` guarded by `platform.financials.view` | Billing hooks read invoices/subscriptions directly | Billing engine RPCs for writes; direct reads | `billing_invoices_platform_read`; finance manage policies need verification by exact latest names | Billing invoices and audit logs for activations | `verify:rls` covers billing read isolation; `verify:payment` covers payment runtime | Medium | Finance read/export scope needs tests; exact latest invoice policy names should be verified | Add finance role tests for invoice read, tenant operational-data denial, and export audit |
| 31. Public request portal access | Anonymous reporter through active token; tenant admin/platform manage tokens | No authenticated UI guard for public route; token is the guard | `/portal/:token` public route | `PublicReportPage` calls `get_public_tenant_data` and `submit_public_work_order` RPCs | `get_public_tenant_data()` and `submit_public_work_order()` validate active token, entitlement, and building/floor/asset tenant | `tenant_access_tokens` policy requires public portal entitlement for token management | `submit_public_work_order` logs via `create_operation_log` | No portal abuse/rate-limit tests found | High | Public unauthenticated intake has no app-layer rate limit/captcha evident; token leakage can create spam | Add rate limiting, abuse controls, portal RPC tests, and token rotation guidance before enabling broadly |
| 32. Attachment or file access | Same-tenant authenticated users; assigned/uploading users for some PM/work-order files | Feature/component-level controls where implemented | Attachment screens tied to work order/PM pages | PM execution uploads use storage paths; work-order attachments table exists in PM foundation | Storage policies and table RLS, depending on attachment type | `pm_execution_photos_select_tenant`, `pm_execution_photos_insert_tenant`, `pm_execution_photos_delete_tenant`; `wo_attachments_select`; `wo_attachments_manage`; generic `work_orders.attachments` JSON needs verification | Upload audit depends on table fields; storage access audit not evident | No attachment/file RLS tests found | Medium | Attachment model is split across JSON fields, PM storage, and work-order attachment tables | Standardize attachment authority model; add storage path traversal and cross-tenant file access tests |

## 6. High-Risk Findings

1. Direct work-order table updates can bypass workflow-specific authority and audit.

`useUpdateWorkOrder` and `useUpdateWorkOrderStatus` can update `work_orders` directly. RLS limits these writes to management roles through `can_manage_work_orders_scope()`, but the database policy does not appear to enforce valid status transitions, assignment rules, or operation-specific logs. Workflow RPCs are stronger, but managers may still have direct mutation paths.

2. Payment activation has a service-role table fallback.

`api/_lib/paymentActivation.ts` falls back to direct service-role writes if `engine_activate` fails. The payment APIs validate Tap/user inputs before calling activation, but the fallback bypasses the authoritative billing RPC and may diverge from its authorization, calculation, and audit behavior.

3. `create_operation_log` direct execute privileges need verification.

`create_operation_log` is a `SECURITY DEFINER` function and is heavily used by workflow RPCs. No explicit final revoke/grant hardening was found for this helper in the inspected migrations. If authenticated users can call it directly, operation logs could be forged or polluted.

4. User and role management has mixed authority paths.

User creation/revocation uses `api/admin-manage-user.ts` with role rules and platform audit logging. Some profile updates still use direct `profiles` PATCH calls protected by `enforce_profile_update_permissions()`. The trigger is important, but direct updates do not appear to produce equivalent audit logs.

5. Platform support access governance is not fully defined.

Database helpers allow broad platform staff profile visibility, and support can view platform tenants. Frontend tenant entry is restricted, but support access to tenant/profile/report data needs explicit reason-based governance, audit expectations, and tests.

6. Public portal is an unauthenticated intake surface.

The public portal RPCs validate active tokens and entitlements, but no rate limit, captcha, or abuse-control layer was evident in the repo. This is acceptable only for tightly controlled pilot use until abuse controls are added.

## 7. Medium-Risk Findings

1. Inventory RLS was recently fixed after confirmed tenant leakage.

Migration `117_inventory_rls_tenant_isolation_fix.sql` documents previous inventory tenant leakage and recreates inventory policies. This is good hardening, but it makes inventory a required regression area.

2. Latest inventory helper still includes `tenant_owner`.

`can_manage_inventory()` in migration `117` includes `tenant_owner`, while the current role model removes or normalizes it. This should be cleaned up.

3. Report export is client-side and not audited.

The reports page can export data after client-side checks. RLS protects the data read, but export itself has no server-side audit trail.

4. Tenant settings changes are not visibly audited.

Tenant settings can alter workflow behavior, portal requirements, and operational configuration. RLS and triggers protect subscription-controlled fields, but settings changes need audit history.

5. Asset, facility, team, and assignment changes have uneven audit coverage.

Workflow actions are logged, and asset status RPC logs to `asset_activity_logs`, but ordinary CRUD changes do not consistently create audit events.

6. Attachment authority is fragmented.

PM photo storage, work-order attachment tables, and JSON attachment fields appear to coexist. The final authority model should be standardized and tested.

## 8. Low-Risk Findings

1. Centralized frontend roles and permissions are clear and maintainable.

`roles.ts` and `permissions.ts` create a useful first layer of product authorization.

2. Route guards are consistently applied to most sensitive tenant pages.

Most operational pages use `ProtectedRoute` with a relevant permission.

3. Workflow RPCs are significantly stronger than ordinary table updates.

The main workflow functions validate actor, role, tenant, current status, assignment/reporter ownership where needed, and write logs.

4. Billing engine functions are moving in the right direction.

`engine_activate` has narrowed service-role behavior and writes audit logs. The remaining concern is the API fallback path, not the RPC design itself.

## 9. Missing Tests

Current known coverage:

- `npm run verify:rls` performs tenant isolation read checks for core tenant-scoped tables and optional mutation tests for `start_work_order`.
- `npm run verify:payment` performs payment runtime checks for unauthorized callbacks, malformed webhooks, and optional Tap sandbox success/idempotency scenarios.
- `npm test` currently maps to `check:mojibake`, not security tests.

Missing or incomplete coverage:

- Profile SELECT and UPDATE role matrix tests.
- Tenant switching tests for platform owner/admin/support/finance.
- Direct object-id access tests for work orders, assets, facilities, operation logs, and attachments.
- Facility CRUD mutation tests by role.
- Asset CRUD and asset status mutation tests by role.
- Work-order create, assign, direct update, and delete mutation tests by role.
- Full workflow RPC tests for start, complete, supervisor approval, engineer review, close, reject, and cross-tenant denial.
- Parts consumption tests for cross-tenant part denial and insufficient stock.
- Operation-log direct execute and forgery tests.
- Report RPC role and tenant-scope tests.
- Report export audit tests.
- User/role management tests for tenant admin, platform admin, platform HR, and forbidden promotions.
- Team and team-member mutation tests.
- Tenant settings and module field protection tests.
- Payment activation tests proving fallback behavior is removed, gated, or audited.
- Public portal token, entitlement, invalid-location, spam, and rate-limit tests.
- Storage and attachment cross-tenant access tests.

## 10. Recommended Remediation Roadmap

### P0 Before Pilot

- Verify and revoke direct execute access to `create_operation_log` unless a deliberate public/authenticated call path is required.
- Remove or tightly gate the service-role activation fallback in `api/_lib/paymentActivation.ts`.
- Make webhook shared-secret or official Tap signature verification fail closed before real payment scale.
- Add operation-level RLS/RPC tests for work-order workflow actions, including negative role and cross-tenant cases.
- Add tests for direct `work_orders` updates to prove managers cannot silently bypass required workflow transitions, or replace direct status/assignment updates with audited RPCs.
- Add profile role-management tests for `api/admin-manage-user.ts` and `enforce_profile_update_permissions()`.
- Add support/finance platform role tests to prove they can only see intended data and cannot mutate tenant operations.
- Add public portal abuse controls or keep the public portal disabled for Pilot v1 unless manually controlled.

### P1 After Pilot Readiness

- Add audit logging for facility, asset, team, tenant settings, assignment, and report export actions.
- Standardize attachment storage and access rules across PM photos, work-order attachments, and JSON attachment fields.
- Remove remaining `tenant_owner` references from active authorization helpers.
- Add dashboard and report route permission consistency checks.
- Add explicit governance documentation for platform support access, finance access, and tenant-entry events.
- Add module-change audit trails and tests for protected tenant subscription/module fields.

### P2 Future Hardening

- Move sensitive exports to server-side audited export endpoints.
- Add support-ticket based tenant access with reason codes, time limits, and review logs.
- Add anomaly detection for public portal spam, repeated failed portal submissions, and unusual export volume.
- Add CI security gates for RLS policy drift, RPC grants, and migration policy name verification.
- Add periodic policy inventory generated from `pg_policies` and function grants in staging/production.

## 11. Frontend Guards vs Real Security Boundaries

Frontend guards are necessary for a clean product experience, but they are not a security boundary.

The following are not sufficient by themselves:

- Hiding buttons based on `usePermission`.
- Redirecting routes through `ProtectedRoute`.
- Filtering by `currentTenant.id` in hooks.
- Storing selected tenant in localStorage.
- Disabling module toggles in the UI.

The real security boundaries are:

- Supabase Auth identity.
- RLS policies on tenant-scoped tables.
- RPC functions that validate actor, tenant, role, status, and payload.
- Server API routes that validate bearer tokens or trusted webhooks before using the service role.
- Database triggers that block protected-field changes.

For any sensitive operation, the required security question is: "If the user bypasses the UI and calls Supabase directly, does the database or server endpoint still reject unauthorized access?"

## 12. Platform Roles and Tenant Access Governance

Platform roles need explicit governance because they can cross tenant boundaries.

Current evidence:

- `platform_owner` and `platform_admin` have broad platform and tenant permissions.
- `platform_support` has read-oriented product permissions and can view platform tenants and audit/report surfaces, but does not have `platform.tenants.enter` in frontend permissions.
- `platform_finance` has finance/report-oriented permissions and report export permission.
- Database helper `is_platform_staff()` allows platform staff to view all profiles.
- Database helper `can_view_platform_tenants()` allows `platform_owner`, `platform_admin`, and `platform_support` to view tenants.
- `get_tenant_reporting_foundation()` allows platform owner/admin/support/finance reporting access by role.

Required governance decisions:

- Which platform roles may view tenant operational data?
- Which platform roles may view customer user/profile data?
- Which platform roles may enter a tenant context?
- Should support access require a ticket, reason code, or time limit?
- Which support/finance reads should be audited?
- Who can grant, revoke, or modify platform staff roles?

Until these decisions are explicit and tested, platform staff access should be treated as a controlled operational risk.

## 13. Customization and Module Configuration Risks

Mutqan is configuration-led, but configuration can become an authorization risk if it changes feature access, workflow authority, or tenant entitlements without audit.

Current evidence:

- `useTenantModules` disables direct module toggling in the frontend and states that modules are managed by the active subscription plan.
- `enforce_tenant_subscription_guard()` blocks non-platform users from changing protected tenant fields such as `plan_id`, `enabled_modules`, `subscription_status`, trial dates, subscription end date, and active status.
- Module entitlements are used by public portal access helpers and feature flags.

Risks:

- Per-tenant module overrides can become hidden customization if not governed.
- Workflow settings can change approval behavior and should be audited.
- Public portal entitlement changes can expose an unauthenticated intake surface.
- Platform-level module changes need stronger audit and review discipline than ordinary settings changes.

Recommended principle:

Module visibility and subscription-controlled configuration should change through billing/platform workflows only, with audit logs and clear customer-facing scope. Pilot v1 customization should remain configuration-led and should not create tenant-specific code or policy exceptions.

## 14. Final Security Decision Statement

Mutqan has a credible security foundation for a controlled pilot, but this matrix does not approve broad production security readiness by itself.

Before wider pilot or sales execution, Mutqan should complete the P0 remediation items: verify function grants, remove or control payment activation fallback, harden webhook verification, add operation-level RLS/RPC tests, close direct work-order update bypasses, test user-role governance, and define platform support access rules.

The official security posture should be:

Mutqan may proceed toward controlled Pilot v1 only when tenant isolation and workflow authority are verified at the database/RPC layer, not merely hidden or guided by the frontend.
