# PM Generation Audit

Audit date: 2026-04-25
Implementation date: 2026-04-25

## Implementation Status

Migration `127_pm_generation_audit.sql` applied manually to staging 2026-04-25. Notification trigger fix migration `128_fix_notify_team_on_new_work_order.sql` applied to staging 2026-04-25. All verification commands pass.

Verification date: 2026-04-25
`npm run verify:pm-generation`: **27/27 PASS**
`npm run verify:workflow-authority`: **19/19 PASS**
`npm run verify:workflow-full`: **25/25 PASS**
`npm run verify:workorder-assignment`: **11/11 PASS**
`npm run verify:workorder-cancel`: **16/16 PASS**
`npm run verify:workorder-autoclose`: **4/4 PASS**
`npm run build`: **clean (0 errors)**
`npm run lint`: **0 errors** (223 pre-existing warnings, unchanged)

| Item | Status | Deliverable |
| --- | --- | --- |
| `pm_generation_runs` persistent batch audit table | Verified | `supabase/migrations/127_pm_generation_audit.sql` آ§1 |
| `operation_log` per generated WO (`type = 'pm_generate'`) | Verified | Migration 127 آ§4 â€” Section A check passes |
| `tenant_has_operational_access` check per schedule | Verified | Migration 127 آ§4 â€” inactive tenant skip tested implicitly |
| `default_assignee_id` validation (active, same-tenant, allowed role) | Verified | Section A: "generated WO assigned to validated default assignee" PASS |
| `COALESCE(total_generated, 0)` arithmetic guard | Verified | Migration 127 آ§4 â€” no counter error in test run |
| `run_id` in return shape (additive) | Verified | Section A: "response includes run_id" PASS, value logged |
| `operation_logs.type` constraint expanded | Verified | Section A: `type=pm_generate` log found |
| Idempotency (no duplicate WOs) | Verified | Section B: WO count before=1 after=1 |
| Cross-tenant isolation | Verified | Section C: Tenant B generates 0 Tenant A WOs |
| pm_generation_runs RLS (Tenant B cannot see Tenant A runs) | Verified | Section C: 0 rows returned |
| Role denial (reporter, technician) | Verified | Section D: both denied HTTP 400 |
| API: DB `run_id` logged alongside app-level `runId` | Implemented | `api/pm-generate-wos.ts` â€” `dbRunId` in Complete log entry |
| Notification trigger null-team safety | Verified | Migration 128; Section A/E verify PM generation and `create_work_order` with null team do not crash |
| Active same-tenant team notifications | Verified | Section E verifies assigned-team creation notifies active team members only |
| Staging fixtures | Updated | `scheduleGen.default_team_id = null`; inactive technician fixture is also a team member to verify notification filtering |

## Remaining Risks

| Risk | Status | Note |
| --- | --- | --- |
| Platform admin "all-tenant" generation from frontend | Open | No UI warning; deferred to UI sprint |
| `notify_team_on_new_work_order()` no-team branch crashed when inactive technicians existed | Fixed | Migration 128 makes `assigned_team IS NULL` a conservative no-op and filters assigned-team recipients to active same-tenant team members. Verified by `verify:pm-generation`. |
| Concurrent duplicate WOs | Open | Low probability for once-daily cron; advisory lock not implemented |

---

## 1. Executive Summary

`pm_generate_due_work_orders()` is the primary path by which preventive maintenance work orders are created in Mutqan. It is called from two directions: a CRON_SECRETâ€“protected API endpoint (`api/pm-generate-wos.ts`) that uses the service role and runs all active tenants, and a frontend hook (`usePMFoundation.usePMGenerateWorkOrders`) that passes the caller's JWT and is automatically scoped to the caller's tenant.

Tenant isolation at the DB function level is present and appears structurally sound. The function correctly reads the caller profile and restricts authenticated tenant users to their own tenant. The CRON_SECRETâ€“protected API path enforces service-roleâ€“only generation and is not reachable without the secret.

The principal security gaps are not isolation failures but **auditability and operational memory failures**:

- No operation log is written per generated work order (unlike `create_work_order`, which always writes `type = 'create'`).
- No persistent generation batch audit record exists. All cron run metadata (run_id, generated count, scope, duration) is console-only and is lost after the log stream ends.
- The schedule compliance counter `total_generated` can drift if a partial failure occurs or if fixtures reset it to an arbitrary value.
- The frontend `generateDueWorkOrders` call does not gate on role before calling the RPC â€” the role check lives entirely in the DB function, which is the correct place but is not tested end-to-end.
- Idempotency guards are present but rely on non-locking `EXISTS` checks that could allow duplicate WO creation under concurrent execution.

None of these gaps cause immediate data corruption. For Pilot v1 with a single cron schedule and a small number of trusted tenant managers, the risk is manageable but must be tracked. Before broader customer access, operation logs per generated WO and a persistent generation audit record are required to meet the operational memory standard established for all other lifecycle events.

---

## 2. PM Generation Authority Principle

A PM-generated work order must satisfy the same authority principles as a manually created work order, with the following PM-specific extensions.

### 2.1 Tenant Isolation

The generating function must not create work orders in a tenant that the caller does not own. For service-role/cron callers, generation across all tenants is intentional and acceptable, but must be logged persistently so a tenant-level operator can verify that only their tenant's schedules were processed.

Generated WOs must carry `tenant_id` from the schedule, not from the caller's profile. This is the correct pattern â€” the function already does this.

### 2.2 Idempotency

Calling the generation function twice for the same due cycle must not create duplicate work orders. The function implements per-cycle, per-asset idempotency checks using `EXISTS` queries against `work_orders` filtered by `source_schedule_id + scheduled_date + status <> 'cancelled'`. This is logically correct but not concurrency-safe (no FOR UPDATE or advisory lock).

### 2.3 Source Traceability

Generated WOs must preserve a traceable link back to the PM schedule, job plan, and specific asset that triggered them. The function sets:

- `source_schedule_id` â€” the pm_schedule that triggered generation.
- `source_schedule_asset_id` â€” the pm_schedule_assets row (per_asset mode), or NULL (batch_route mode).
- `job_plan_id` â€” the job plan referenced by the schedule.
- `job_plan_snapshot` â€” frozen copy of the job plan at generation time.

These are all present. Source traceability is the strongest part of the current implementation.

### 2.4 Auditability

Every generated WO must produce a durable audit record. Currently no `operation_log` is written per generated WO. The gap is significant: the `operation_logs` table exists and is used by every other lifecycle event (create, assign, start, complete, approve, close, cancel, reject). PM generation is the only WO-creation path without an audit record.

A generation batch audit (who ran, when, how many WOs per tenant, run_id) is also missing from persistent storage.

### 2.5 Compatibility with Work-Order Lifecycle Guard

The guard trigger (`trg_guard_work_order_sensitive_fields`) fires only on `BEFORE UPDATE`, not on `INSERT`. PM generation uses plain `INSERT INTO work_orders`. The sensitive fields set during generation (`work_type`, `source_schedule_id`, `job_plan_id`, `scheduled_date`, `compliance_deadline`, etc.) are written at INSERT time and are therefore not blocked by migration 120.

After generation, the generated WOs are in `pending` status. Any subsequent lifecycle mutation (assign, start, complete) must use the authorized workflow RPCs. This is compatible with the guard.

### 2.6 Operational Memory

The PM schedule tracks `total_generated`, `last_generated_date`, and `next_due_date`. These counters are written by the generation function and represent operational memory for compliance reporting. If they are wrong (fixture overwrite, partial failure, concurrent run), compliance statistics will be incorrect.

---

## 3. Inventory of Generation Paths

| Path / File / Function | Caller Type | Mutation Performed | Tenant Scoping Behavior | Idempotency Behavior | Audit / Logging Behavior | Risk Level | Recommended Action |
|---|---|---|---|---|---|---|---|
| `api/pm-generate-wos.ts` â†’ `pm_generate_due_work_orders()` | Service cron (CRON_SECRET) | INSERT into `work_orders`, `work_order_assets`, `work_order_checks`; UPDATE `pm_schedules` counters | Generates for **all active tenants** (auth.uid() = NULL in service role â†’ v_run_all_tenants = TRUE) | EXISTS check per schedule+date+asset; advance-only if cycle fully covered | Console-only (run_id, generated count, duration); no DB audit | **High** â€” broad scope, no persistent audit | Add persistent `pm_generation_runs` table or operation_log batch entry; add per-WO create log |
| `src/hooks/usePMFoundation.ts` â†’ `usePMGenerateWorkOrders` â†’ `pm_generate_due_work_orders()` | Tenant user (authenticated JWT) | Same INSERT pattern | Scoped to caller's tenant if role is `tenant_admin`, `tenant_owner`, `facility_manager`, `maintenance_manager`; platform roles generate all tenants | Same EXISTS check | Same console-only logging inside RPC (RPC doesn't know it's frontend-triggered) | **Medium** â€” tenant-scoped for normal users; no per-WO log | Add per-WO operation_log; test all allowed roles; hide button from non-generation roles |
| `pm_generate_due_work_orders()` itself (DB function, mig. 112) | Authenticated or service | INSERT work_orders + work_order_checks; UPDATE pm_schedules | Role-based: anon blocked; NULL uid â†’ all tenants; platform â†’ all tenants; manager â†’ own tenant | EXISTS checks per (schedule, date, asset); bulk-advance if fully covered | **None** â€” no operation_log, no audit table | **High** | Add `create_operation_log(type='pm_generate')` per WO; add generation batch trace |
| `scripts/prepare-staging-fixtures.ts` | Platform/service (manual script) | `upsert` pm_schedules, job_plans; `insertMany` work_orders | Service role; hardcoded tenant IDs | Delete-then-insert for WOs (avoids trigger); upsert for schedules | Console output only | **Low** (dev/staging only) | Add PM fixture WOs (with source_schedule_id) to test PM guard compatibility |

---

## 4. pm_generate_due_work_orders â€” Current Behavior

### 4.1 Who Can Call It?

**Blocked:** `anon` role (REVOKE confirmed in migration 112).

**Authenticated users (v_caller_id IS NOT NULL):**
- Reads the caller's `profiles` row.
- If the profile is not found: raises exception.
- If `is_active = FALSE`: raises exception.
- If `is_super_admin = TRUE` or role is `platform_owner` / `platform_admin`: runs all tenants.
- If role is `tenant_admin`, `tenant_owner`, `facility_manager`, `maintenance_manager`: runs that caller's tenant only.
- All other roles: raises `Insufficient permission`.

**Note:** `tenant_owner` and `facility_manager` are in the allowed generation roles inside the DB function, but `pm_can_manage_tenant` (the RLS helper for pm_schedules and job_plans) only allows `tenant_admin`, `maintenance_manager`, `facility_manager`. The RPC role list is slightly broader than the RLS manage role list. `tenant_owner` can trigger generation but cannot manage schedules directly through the REST table API.

**Service/SQL admin (v_caller_id IS NULL):** Sets `v_run_all_tenants = TRUE`. This is the path used by `api/pm-generate-wos.ts`.

### 4.2 How It Determines Tenant Scope

- `v_run_all_tenants = FALSE` (tenant user): query adds `ps.tenant_id = v_profile_tenant_id` filter on `pm_schedules`.
- `v_run_all_tenants = TRUE` (service/platform): no tenant filter â€” all active, calendar-type, due pm_schedules are selected.

The tenant scope is correctly derived inside the SECURITY DEFINER function and is not injectable from the caller.

### 4.3 How It Selects Due Schedules

Selects from `pm_schedules` where:
- `status = 'active'`
- `trigger_type = 'calendar'` â€” **meter and condition schedules are not processed**.
- `next_due_date IS NOT NULL`
- `(next_due_date - COALESCE(lead_time_days, 0)) <= CURRENT_DATE` â€” due with lead time
- `(end_date IS NULL OR next_due_date <= end_date)` â€” not past end date
- tenant filter (as above)

Ordered by `next_due_date, created_at`.

### 4.4 How It Prevents Duplicates

**Per-asset mode:** Before generating a WO for a specific asset, checks:

```sql
EXISTS (
  SELECT 1 FROM work_orders wo
  JOIN work_order_assets woa ON woa.work_order_id = wo.id
  WHERE wo.source_schedule_id = v_schedule.id
    AND wo.scheduled_date = v_schedule.next_due_date
    AND woa.asset_id = v_asset.asset_id
    AND wo.status <> 'cancelled'
)
```

If that asset already has a non-cancelled WO for this cycle, the per-asset loop `CONTINUE`s.

**Batch-route mode:** Checks:

```sql
EXISTS (
  SELECT 1 FROM work_orders
  WHERE source_schedule_id = v_schedule.id
    AND source_schedule_asset_id IS NULL
    AND scheduled_date = v_schedule.next_due_date
    AND status <> 'cancelled'
)
```

**Cycle-advance deduplication:** Before the per-asset generation loop, the function also checks if all expected assets are already covered. If fully covered, it advances `next_due_date` and `last_generated_date` on the schedule and skips WO creation.

**Risk â€” no lock:** Both checks are SELECT-then-INSERT with no `FOR UPDATE` or advisory lock. Two concurrent cron runs for the same schedule could both pass the `NOT EXISTS` check before either commits, resulting in duplicate WOs. This is a low-probability race for a once-daily cron, but real if the API is called manually or if the cron runs overlap.

### 4.5 Fields Written to work_orders

| Field | Value |
|---|---|
| `tenant_id` | `v_schedule.tenant_id` |
| `code` | Generated: `WO-{YEAR}-{seq padded 6}` |
| `title` | `{schedule.name or plan.name} - {asset.name}` (per_asset) or `{schedule.name or plan.name}` (batch) |
| `description` | `v_schedule.description` |
| `work_type` | `'preventive'` |
| `source_schedule_id` | `v_schedule.id` |
| `source_schedule_asset_id` | `psa.id` (per_asset) or `NULL` (batch) |
| `job_plan_id` | `v_schedule.job_plan_id` |
| `job_plan_snapshot` | Frozen JSONB snapshot of job plan at generation time |
| `status` | `'pending'` |
| `priority` | `v_schedule.default_priority` mapped: `critical â†’ urgent`, others unchanged |
| `scheduled_date` | `v_schedule.next_due_date` |
| `compliance_deadline` | `next_due_date + compliance_window_days` or calculated via `pm_calculate_compliance_window` |
| `assigned_to` | `v_schedule.default_assignee_id` (may be NULL) |
| `assigned_team` | `v_schedule.default_team_id` (may be NULL) |
| `asset_id` | `v_asset.asset_id` |
| `created_at`, `updated_at` | `NOW()` |

Fields **not written** (differ from `create_work_order`): `code` (actually written), `created_by`, `reported_by`, `issue_type`, `building_id`, `floor_id`, `room_id`, all approval/closure/completion/SLA fields.

**Note on `assigned_to`:** The function sets `assigned_to` from `v_schedule.default_assignee_id` without validating that the assignee is active, same-tenant, or holds an appropriate role. This is less strict than `assign_work_order`.

### 4.6 Whether It Writes work_order_checks

Yes. For every generated WO, the function inserts one `work_order_checks` row per `job_plan_items` row where `item_type <> 'header'`. Each row captures:

- `work_order_id`, `asset_id`, `job_plan_item_id`
- `item_snapshot` â€” frozen JSONB copy of the item
- `sort_order`, `status = 'pending'`

If the job plan has no items, no checks are created (zero rows). This is valid but may produce a WO without checklist rows.

### 4.7 Whether It Writes operation_logs

**No.** `pm_generate_due_work_orders()` does not call `create_operation_log()` for any generated work order or for the generation batch. This is the most significant auditability gap.

For comparison: `create_work_order`, `assign_work_order`, `cancel_work_order`, `wo_start`, `wo_complete`, and all reactive lifecycle RPCs write operation logs. PM generation is the only WO-creation path without one.

### 4.8 Whether It Writes a Generation Trace or Batch Log

**No.** The function returns a JSONB summary object containing `generated`, `schedules_scanned`, `schedules_advanced`, `existing_cycles_advanced`, `skipped_no_assets`, `scope`, and `run_at`. This is returned to the caller but never stored in any database table.

Migration 112's title ("pm_generation_trace_and_idempotency") refers to the JSONB response payload and to the schedule-advance logic, not to a separate audit table.

### 4.9 Whether It Sets Guarded Fields Under Migration 120

The function uses `INSERT INTO work_orders`, not `UPDATE`. The `trg_guard_work_order_sensitive_fields` trigger fires only on `BEFORE UPDATE`. Fields in the sensitive list that are written at INSERT time (`work_type`, `source_schedule_id`, `job_plan_id`, `scheduled_date`, `compliance_deadline`, `status`) are written at INSERT and therefore never blocked by the trigger.

**Compatibility verdict:** PM generation is compatible with migration 120 as currently designed. No trigger bypass or `set_config` authorization is needed for INSERT.

### 4.10 Whether It Uses or Bypasses create_work_order RPC

**Bypasses.** The function performs direct `INSERT INTO public.work_orders` rather than calling `create_work_order`. This is intentional â€” the PM generation context differs from normal creation:

- There is no human actor to attribute `reported_by` or `created_by`.
- The WO source is a schedule, not a user request.
- The function must process potentially many schedules in a single transaction.

However, the bypass means the creation-time validation in `create_work_order` (actor profile, tenant operational access check, asset/location consistency validation, allowed JSON key allowlist) is also bypassed. The generation function does its own (lighter) validation.

**Needs runtime verification:** Whether `tenant_has_operational_access(v_schedule.tenant_id)` is checked before generating WOs for a tenant. The current function selects all `active` pm_schedules regardless of whether the tenant's subscription is still operationally active.

---

## 5. API Cron Behavior (api/pm-generate-wos.ts)

### 5.1 CRON_SECRET Enforcement

```typescript
const isCronRequest = authHeader === `Bearer ${CRON_SECRET}`
if (!isCronRequest) {
    return res.status(403).json({ error: 'PM generation endpoint is cron-only' })
}
```

If `CRON_SECRET` is set and non-empty, unauthenticated callers receive 403. If `CRON_SECRET` is not set (empty string or undefined), the check `authHeader === 'Bearer '` would fail for most callers, but a caller sending `Authorization: Bearer ` could match. The startup guard checks `!CRON_SECRET` and returns 500 before reaching the CRON_SECRET comparison, which correctly blocks execution when the secret is absent. The secret must be a non-empty string in production.

The check compares the raw header value â€” no timing-safe comparison (constant-time string comparison). For an internal cron endpoint this is low risk but noted.

### 5.2 Service Role Usage

The handler creates a Supabase client with `SUPABASE_SERVICE_ROLE_KEY`. When this client calls `adminSupabase.rpc('pm_generate_due_work_orders')`, the request arrives at the DB function with no `auth.uid()` (service-role JWT has no sub claim resolved by auth.uid()). The function therefore sets `v_run_all_tenants = TRUE`.

This is the intended behavior and is documented in the comment. However, it means the cron always generates for all tenants, including any tenant that may be on a suspended or expired subscription. **Needs runtime verification:** whether the function should check `tenant_has_operational_access` before generating for each tenant.

### 5.3 Whether It Can Generate Across Tenants

Yes, by design. The service-role cron generates for all active pm_schedules across all tenants. This is intentional and required â€” a per-tenant cron is not currently implemented.

### 5.4 Logging Behavior

**Console-only:**

```typescript
console.log('[pm-generate-wos] Start', { runId, triggeredBy, method, startedAt })
console.log('[pm-generate-wos] Complete', { runId, triggeredBy, durationMs, generated, result })
console.error('[pm-generate-wos] RPC error', { runId, triggeredBy, durationMs, error })
```

The `runId` (`pm-{timestamp}-{random}`) is generated per request and included in the response body, but is **not stored in any database table**. If the log stream is not captured or rotated, the generation history is lost.

### 5.5 Failure Behavior

On RPC error, the handler returns HTTP 500 with the error message and run_id. The cron caller (e.g., Vercel Cron or an external scheduler) would see the 5xx and could retry. The DB function runs in a single transaction â€” on any exception inside the loop, the entire transaction rolls back and no WOs, no schedule updates, and no checks are committed.

This means failure is atomic but silent from a persistent audit perspective. There is no "partial run" state, but there is also no persistent record that the run failed and which schedules were not processed.

---

## 6. Frontend Behavior (usePMGenerateWorkOrders)

### 6.1 How the Mutation Works

```typescript
const generateDueWorkOrders = useMutation({
    mutationFn: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) throw new Error('Not authenticated')
        const { data, error } = await supabase.rpc('pm_generate_due_work_orders')
        if (error) throw error
        return data as PMGenerateResult
    },
    onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: pmFoundationKeys.all })
    },
})
```

The mutation verifies session existence before calling the RPC, then calls `pm_generate_due_work_orders` with the user's JWT. The DB function handles all role and tenant checks.

### 6.2 Which Roles Can Trigger from Frontend

Any authenticated user whose profile role is in: `tenant_admin`, `tenant_owner`, `facility_manager`, `maintenance_manager`, `platform_owner`, `platform_admin`, or `is_super_admin = TRUE`.

The frontend does not gate the button by role before calling â€” the role check is entirely inside the DB function. There is no UI-level role guard on the generate action.

### 6.3 Tenant-Scoped User Behavior

For a `maintenance_manager` or `tenant_admin` user, the DB function correctly restricts generation to that user's tenant (checked against `v_profile_tenant_id`). If the profile's `tenant_id` is NULL for a tenant-scoped role, the function raises an exception.

### 6.4 Platform/Service Behavior from Frontend

A `platform_admin` who logs in through the frontend and calls `generateDueWorkOrders` will trigger generation for **all tenants** (because the DB function sees a non-NULL `auth.uid()` whose profile role is `platform_admin` â†’ sets `v_run_all_tenants = TRUE`). This is the same behavior as the cron, but triggered by a human UI action.

This is not a security flaw given the role requirement, but it means a platform admin clicking "Generate" could affect every tenant at once. The UI should make this scope clear.

---

## 7. Risks

| Risk | Description | Severity | Status |
|---|---|---|---|
| **Missing operation logs per WO** | Generated WOs have no `operation_log` entry. Impossible to tell from the audit trail when or why a PM WO was created. | High | Unmitigated |
| **Missing persistent generation batch log** | Cron run metadata (run_id, scope, count, tenant breakdown, duration) exists only in console logs. Lost on log rotation. | High | Unmitigated |
| **Broad service-role generation** | Cron generates for all tenants including potentially suspended ones. No `tenant_has_operational_access` check in generation path. | Medium | Needs verification |
| **Cross-tenant generation by platform admin via frontend** | A `platform_admin` calling `generateDueWorkOrders` from the frontend generates all tenants. Scope is not visible in UI. | Medium | No UI mitigation |
| **Concurrent duplicate WOs** | Idempotency check uses `EXISTS` without lock. Two concurrent cron runs could produce duplicate WOs for the same cycle. | Medium | Low probability for once-daily cron; no lock implemented |
| **Schedule compliance counter drift** | `total_generated` written as `total_generated + v_schedule_generated`. If `total_generated` is NULL or if fixtures overwrite it, compliance stats drift. | Medium | `COALESCE` not applied â€” NULL drift risk confirmed. Also: fixture script sets `total_generated: 1` unconditionally, overwriting real values. |
| **Unvalidated default_assignee_id** | `assigned_to` is set from `v_schedule.default_assignee_id` without checking that the assignee is active and same-tenant. | Medium | No validation |
| **Generated WOs bypass create_work_order audit model** | Direct INSERT bypasses the key allowlist, operational access check, and asset/location consistency validation in `create_work_order`. | Medium | By design for PM path; but audit gaps remain |
| **Fixture/test counter reset** | `prepare-staging-fixtures.ts` sets `total_generated: 1` on fixture schedules, which may mask real-counter correctness in tests. | Low | Known; fixture-only |
| **Meter/condition schedules silently skipped** | `trigger_type = 'calendar'` filter means meter-based and condition-based schedules are never generated. This may not be documented in the UI. | Low | By design but not surfaced |
| **job_plans with no items** | If a schedule references a job plan with no items, WOs are generated without any checklist rows. The WO appears empty to the technician. | Low | Silent; no validation |
| **work_order_checks not field-guarded** | `work_order_checks` is writable by any user passing `pm_can_manage_tenant` or the assigned technician, with no field-level guard analogous to migration 120. Evidence integrity is not protected. | Medium | Separate gap; not addressed by this audit |

---

## 8. Recommended Remediation Design

### Option A â€” Add operation logs and batch audit without structural changes (recommended for Pilot v1)

Keep `pm_generate_due_work_orders` as the trusted PM-specific generation RPC. Add:

1. `create_operation_log(tenant_id, wo_id, 'maintenance', 'PM work order generated from schedule {code}', NULL)` inside the per-WO INSERT block. The `actor_id` parameter can be `v_caller_id` (which is NULL for service-role; pass NULL and log the scope).
2. A new `pm_generation_runs` table with columns: `id UUID PK`, `run_id TEXT`, `triggered_by TEXT`, `scope TEXT`, `total_generated INT`, `schedules_scanned INT`, `schedules_advanced INT`, `tenant_id UUID` (nullable â€” NULL for all-tenant), `run_at TIMESTAMPTZ`. Insert one row per call at function return. This is a lightweight append-only audit table.
3. Add a `v_schedule.tenant_id` operational access pre-check inside the schedule loop (call `tenant_has_operational_access(v_schedule.tenant_id)` before processing each tenant; `CONTINUE` on inactive tenants).
4. Protect `total_generated` increment: change `total_generated + v_schedule_generated` to `COALESCE(total_generated, 0) + v_schedule_generated`.

### Option B â€” Route through a shared helper (not recommended for Pilot v1)

Refactor to call a shared `pm_insert_work_order(...)` internal helper that both `create_work_order` and `pm_generate_due_work_orders` use. This would unify audit logging but requires careful handling of PM-specific fields that the public `create_work_order` rejects. High engineering risk; not worth it for Pilot v1.

### Option C â€” Block frontend trigger pending full verification

Remove the "Generate" button from the tenant UI for Pilot v1. Keep generation as cron-only. Add the persistent audit table before re-enabling the button.

---

## 9. Required Tests

The following tests must pass before Pilot v1 or before the frontend Generate button is exposed to customers.

| Test ID | Description | Expected |
|---|---|---|
| P1 | Tenant manager generates only own tenant's due WOs | WOs created only for caller's tenant_id; no other tenant affected |
| P2 | Tenant A manager cannot generate Tenant B WOs | RPC returns success but 0 WOs for Tenant B; or explicit scope check |
| P3 | Platform admin generates all tenants (service cron behavior) | WOs created for all active due schedules across tenants |
| P4 | Service-role cron generates all tenants | Same as P3; confirm via CRON_SECRET endpoint |
| P5 | Duplicate generation does not create duplicate WOs | Calling generate twice for same cycle produces identical count on second call: 0 new WOs |
| P6 | Generated WOs have source_schedule_id, source_schedule_asset_id, job_plan_id where expected | Assert per_asset WOs have source_schedule_asset_id; batch_route WOs have NULL |
| P7 | Generated WOs have status = 'pending' | Assert all generated WOs start in pending |
| P8 | Generated WOs pass migration 120 guard on first lifecycle mutation | Call assign_work_order or wo_start on a generated WO; expect success |
| P9 | work_order_checks are created with correct snapshot and sort_order | Assert check rows exist per job_plan_items; item_snapshot matches plan |
| P10 | operation_log entry exists per generated WO (post-remediation) | Assert operation_logs.type = 'pm_generate' for each generated WO id |
| P11 | Generation batch audit row exists (post-remediation) | Assert pm_generation_runs row with correct scope, count, run_at |
| P12 | Schedule next_due_date advances after generation | Assert pm_schedules.next_due_date > original after generation run |
| P13 | total_generated counter increments correctly | Assert counter = pre + WOs_created |
| P14 | Covered cycle advances schedule without creating WOs | Manually create non-cancelled WO for schedule+date; call generate; assert 0 new WOs, schedule advanced |
| P15 | No due schedules returns safe result | Empty tenant or all future schedules; expect { generated: 0, success: true } |
| P16 | Inactive user cannot call generate from frontend | Assert RPC raises exception for is_active = false profile |
| P17 | Reporter/technician cannot trigger generation | Assert RPC raises 'Insufficient permission' for those roles |
| P18 | Schedule with no assets is skipped | Assert skipped_no_assets increments; no WO created |
| P19 | job_plan without items produces WO but no checks | Assert work_order_checks count = 0 for that WO |
| P20 | Concurrent generation does not produce duplicate WOs | **Needs runtime verification** â€” cannot be confirmed by migration inspection alone |

---

## 10. Pilot v1 Recommendation

### Must fix before exposing frontend generation to customers

1. **Add operation_log per generated WO.** Without this, it is impossible to trace when or how a WO was created from the audit trail.
2. **Add persistent generation batch log.** Console-only logging is insufficient for compliance visibility.
3. **Add COALESCE guard on total_generated increment** to prevent NULL-arithmetic drift.
4. **Test P1â€“P8 and P12â€“P15 must pass.**

### Can remain admin/cron-only for Pilot v1

- Frontend "Generate" button can be restricted to platform admin only (or hidden entirely) while the above fixes are pending.
- The cron path (`api/pm-generate-wos.ts`) is acceptable for Pilot v1 if run metadata is captured externally (Vercel log drain, external monitoring).

### Should be hidden if not verified

- The Generate button on the tenant UI should be hidden or disabled for tenant managers until:
  - P1 and P2 are verified in staging.
  - Operation logs per WO are implemented (P10).
  - The platform admin "all tenant" scope is documented and the UI makes it explicit.

---

## 11. Final Recommendation

**Exact next implementation task:**

Write `supabase/migrations/127_pm_generation_audit.sql` containing:

1. Create `public.pm_generation_runs` table: `id uuid DEFAULT gen_random_uuid() PK, run_id text NOT NULL, triggered_by text NOT NULL, scope text NOT NULL, total_generated int NOT NULL DEFAULT 0, schedules_scanned int NOT NULL DEFAULT 0, schedules_advanced int NOT NULL DEFAULT 0, tenant_id uuid REFERENCES tenants(id), run_at timestamptz NOT NULL DEFAULT NOW()`. Enable RLS; allow platform admin and service role to SELECT; no authenticated INSERT (function inserts internally as SECURITY DEFINER).
2. Replace `pm_generate_due_work_orders()` body to:
   a. Add `create_operation_log(v_schedule.tenant_id, v_wo_id, 'pm_generation', 'PM work order generated from schedule ' || v_schedule.code, v_caller_id)` after each WO INSERT.
   b. Add `INSERT INTO pm_generation_runs (run_id, triggered_by, scope, total_generated, ...) VALUES (...)` at the RETURN statement.
   c. Add `COALESCE(total_generated, 0) + v_schedule_generated` to the pm_schedules UPDATE.
   d. Optionally add per-schedule `tenant_has_operational_access` check.
3. Add a staging verification script `scripts/verify-pm-generation.ps1` covering tests P1, P4, P5, P7, P8, P10, P11, P12, P15.

**Files likely to change:**

- `supabase/migrations/127_pm_generation_audit.sql` (new)
- `scripts/verify-pm-generation.ps1` (new)
- `scripts/prepare-staging-fixtures.ts` â€” add job_plan_items rows to existing fixture job plans so P9 can be verified
- `docs/security/pm-generation-audit.md` â€” update with verification results after migration 127 is applied
- `api/pm-generate-wos.ts` â€” optionally write the run_id to a DB column after RPC call, if the generation run table is not populated inside the function

