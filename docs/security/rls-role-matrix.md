# RLS / Role Matrix - Phase 2

This matrix captures the enforced security posture verified from the SQL policies and RPC guards in the current codebase. It is intentionally operational, not aspirational.

## Tenant Isolation

| Surface | Tenant users | Platform admin | Enforcement |
| --- | --- | --- | --- |
| Work orders | Same tenant only | Cross-tenant view/create | `work_orders` RLS in `093_v1_roles_permissions_alignment.sql`; workflow RPCs re-check actor role and tenant |
| Assets | Same tenant view; tenant admin/facility manager manage | Cross-tenant view/manage | `can_manage_assets_scope(tenant_id)` and asset RLS in migration `093` |
| Facilities/buildings | Same tenant view; tenant admin/facility manager manage | Cross-tenant view/manage | `can_manage_facilities(tenant_id)` and building/floor/room policies in migration `093` |
| PM job plans/schedules | Same tenant view; tenant admin/maintenance manager manage | Cross-tenant via platform PM helpers | `pm_can_view_tenant` / `pm_can_manage_tenant` in migration `108` |
| Inventory | Same tenant view; tenant admin/maintenance manager manage | Cross-tenant via platform/admin helpers | Secure inventory policies from migration `090`; helper alignment in migration `093` |
| Notifications | Own notifications only | No broad user-notification read policy found | `notifications` RLS in migration `056`; delivery functions write with `SECURITY DEFINER` |
| Tenant subscription | Same tenant read | owner/admin/finance/support read; owner/admin manage | `tenant_subscriptions_read/manage` in migration `101` |
| Billing invoices | Same tenant read | owner/admin/finance/support read; owner/admin/finance manage | `billing_invoices_*` policies in migration `101` |

## Role Capability Matrix

| Role | Work orders | Assets/facilities | PM | Inventory | Billing | Cross-tenant |
| --- | --- | --- | --- | --- | --- | --- |
| `platform_owner` | Manage | Manage | Manage | Manage | Manage | Yes |
| `platform_admin` | Manage | Manage | Manage | Manage | Manage | Yes |
| `platform_finance` | Read billing | No operational manage | No PM manage by default | No inventory manage by default | Read/manage invoices | Billing-focused |
| `platform_support` | Read platform tenants/billing where allowed | No operational manage by default | No PM manage by default | No inventory manage by default | Read only where policy allows | Limited support |
| `tenant_admin` | Manage same tenant | Manage same tenant | Manage same tenant | Manage same tenant | Read same tenant billing | No |
| `facility_manager` | View same tenant; no broad work-order manage by helper | Manage facilities/assets | View PM if tenant operational | View inventory if policies allow | Read same tenant billing | No |
| `maintenance_manager` | Manage same tenant | View/manage where specific policies allow | Manage same tenant | Manage same tenant | Read same tenant billing | No |
| `supervisor` | Workflow RPCs allow assigned/authorized operational actions | View same tenant | View PM; technician-style updates only when assigned | View same tenant | Read same tenant billing | No |
| `engineer` | Workflow RPCs allow assigned/authorized review actions | View same tenant | View PM; assigned execution where allowed | View same tenant | Read same tenant billing | No |
| `technician` | Assigned work-order execution/update paths only | View same tenant | Assigned work-order checks update | Inventory consumption through work-order flows | Read same tenant billing | No |
| `reporter` | Create/read own/tenant-scoped requests per work-order RLS | View same tenant where policy grants | No PM manage | No inventory manage | Read same tenant billing | No |

## Regression Script

Run the read-only tenant isolation smoke check with:

```powershell
npm run verify:rls
```

Required environment:

```text
SUPABASE_URL or VITE_SUPABASE_URL
SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY
RLS_TENANT_A_ID
RLS_TENANT_B_ID
RLS_TENANT_A_ADMIN_JWT
RLS_TENANT_A_MANAGER_JWT
RLS_TENANT_A_SUPERVISOR_JWT
RLS_TENANT_A_TECHNICIAN_JWT
RLS_TENANT_A_REPORTER_JWT
RLS_PLATFORM_ADMIN_JWT
```

The script expects seeded rows in tenant B for positive platform-admin visibility checks. Tenant-role checks fail if any tenant A role can read tenant B rows from core tables.
