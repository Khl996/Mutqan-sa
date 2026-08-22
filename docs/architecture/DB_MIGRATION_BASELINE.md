# Mutqan database migration baseline

**Audit date:** 2026-08-22 (Asia/Riyadh)  
**Live project:** `mzpohntjotgeeaukwnbz` / PostgreSQL 17.6.1.063 (read-only evidence captured 2026-08-21)  
**Rollout state:** **READY FOR CONTROLLED STAGING REPLAY**. This does not
authorize a production schema application. No remote change was made during
this mission.

## Executive truth

The live schema and live migration ledger remain the current runtime authority.
The repository baseline is historical evidence rather than a complete replay
source by itself. The checksum-locked controlled-replay manifest now closes the
previous ledger gap without editing the applied baseline:

- Live: 73 public tables, all with RLS enabled; 179 public functions.
- Repository baseline header: 57 tables and 106 functions.
- Live ledger: 30 entries.
- Active repository chain before this mission: baseline plus 24 later files.
- Controlled replay chain now adds four recovered historical executions, one
  ledger-only alias, Wave 0, and three new P0 migrations.
- All five formerly missing ledger versions now have checksum-verified active
  files and recorded provenance.

RLS enabled is not proof that policies are correct. Function count differences
are expected after later migrations. The complete chain and adversarial
authority fixtures have now passed in an isolated PostgreSQL 17.11 environment.

## Baseline artifact

| Field | Value |
| --- | --- |
| File | `supabase/migrations/00000000000000_baseline.sql` |
| SHA-256 | `18E862E39FAAEF5CA0CC88124B324A923C71B2F23E89A846C9765561FED5F541` |
| Size | 484,330 bytes |
| Ledger version | `00000000000000` / `baseline` |
| Header claim | 57 tables, 342 constraints, 138 indexes, 106 functions, 42 triggers |

Historical baseline defects and their forward resolution:

1. It references `internal.runtime_secrets` but does not create the `internal`
   schema/table.
2. It defines `public.get_runtime_secret(text)` without reproducing the explicit
   PUBLIC/anon/authenticated revokes that exist in production.
3. It similarly omits negative PUBLIC grants for privileged helpers including
   `create_notification`, `create_operation_log`, `pm_write_audit_log` and
   `pm_populate_task_checks_internal`.
4. It resurrects the permissive `Users can manage own profile` FOR ALL policy
   and Data API INSERT/DELETE authority that an archived hardening migration
   had removed.
5. Its billing and notification writers retain PUBLIC/anon authority and
   NULL-fail-open role checks.
6. It recreates `asset_maintenance_history` without `security_invoker=true` and
   grants it to anon, unlike the hardened historical definition.
7. It defines `handle_new_user()` but does not recreate the required
   `on_auth_user_created` AFTER INSERT FOR EACH ROW trigger.
8. It contains the stale `pm_build_task_execution_snapshot` reference to the
   absent `public.asset_groups` relation.
9. The live schema has evolved beyond the extraction represented by its header.

The applied baseline was not edited to hide these differences. A separate
pre-baseline bootstrap creates only the missing `internal.runtime_secrets`
prerequisite for replay; `20260821014202_p0_runtime_secret_reconciliation.sql`
then reconciles its production-safe shape, ownership, RLS and ACLs forward.
Wave 0 and the three P0 migrations converge the remaining security and PM
definitions.

## Live ledger reconciliation

The following formerly absent live versions have been recovered:

| Version | Ledger name | Resolution | SHA-256 |
| --- | --- | --- | --- |
| `146` | `intake_foundation` | Exact canonical artifact; ledger-only repair alias, recorded but not re-executed | `47d035ae20445379ddfaf258ff6d75472fa397a6c150665f75a5c1094b947822` |
| `147` | `rounds_v0` | Exact canonical and directly executed artifact | `acc450cf9d6df5886419f68ec19f7e059a623313d3e2ea90f6395ba00b796f1d` |
| `148` | `post_demo_print_and_round_routing` | Exact final directly executed artifact | `f3a8ae95dc4816174b1c3d2e599cba62700955e0689dc69494ed30143a805871` |
| `20260706100734` | `intake_foundation` | Exact executed SQL; timestamped filename reconstructed from ledger evidence | `47d035ae20445379ddfaf258ff6d75472fa397a6c150665f75a5c1094b947822` |
| `20260707085234` | `149_hospital_enable_facilities_locations` | Exact executed SQL; timestamped filename reconstructed from ledger evidence | `530ee417f06e0e7504bf95f95d0f36d909c93bbe3ae90d79f6f2315638386467` |

These remain historical exceptions. Their original versions are preserved and
their contents were recovered from Git/deployment evidence, not invented from
the resulting schema. Full commit, blob, ledger-digest and search provenance is
in `MIGRATION_RECOVERY_PROVENANCE_2026-08-21.md`.

The active timestamp chain from `20260602213839` through `20260628182408`
matches the corresponding live ledger entries. Wave 0 and all three P0 files
remain unapplied remotely and stay strictly after the recovered history.

## Legacy and archive state

The worktree currently removes the former active numbered history and contains
143 SQL files under `supabase/migration_archive`. This is an uncommitted
reconciliation state, not proof that the archive/baseline transition has been
approved. Historical migrations 001–129 and smoke-test SQL are superseded as an
active future chain only after an isolated replay proves the baseline and later
ledger sequence.

## Naming convention

- New work: create a unique 14-digit UTC timestamp using
  `supabase migration new <snake_case_name>`.
- Never reuse a version, add a numeric prefix, or edit a version recorded in any
  environment.
- Recovered historical ledger files retain their exact recorded version.
- Verification/smoke SQL belongs in `supabase/tests`, not the migration folder.

## Completed isolation proof and remaining application procedure

1. Completed: recovered all five historical artifacts and pinned their hashes.
2. Completed: replayed the exact manifest in PostgreSQL 17.11 using a marked,
   temporary cluster with no production endpoint.
3. Completed: tested anonymous, active, inactive, cross-tenant, tenant-admin,
   platform-admin and service-role authority, plus signup and provisioning.
4. Completed: tested direct and work-order-triggered PM start/complete paths and
   immutable snapshots.
5. Completed: ran two overlapping trusted payment activations for the same
   reference, confirmed one durable binding and identical identifiers, and
   proved conflicting replay fails with the domain error rather than a unique
   violation.
6. Before staging, freeze concurrent schema work and nominate one migration
   owner.
7. Review a staging-only dry-run/plan containing exactly the checksum-locked
   manifest. Define named operators, stop criteria and evidence retention.
8. Replay into controlled staging and compare schema, functions, grants,
   policies and extension placement against the intended graph.
9. Only after staging acceptance, take a current
   production backup/recovery point and define named operators and stop criteria.
10. Production remains a separately authorized deployment decision. If later
    authorized, apply only through the controlled path and re-run ACL/runtime
    checks and Supabase security/performance advisors.

The database migration must be validated and deployed before the updated
`api/verify-payment.ts` and `api/payment-webhook.ts` handlers. Those handlers now
delegate replay binding and atomic idempotency to the hardened database wrapper;
an API-first release is forbidden.

For any newly created public table, explicitly decide both Data API grants and
RLS policies; current Supabase behavior no longer treats table creation as an
implicit Data API grant. See the official
[Supabase Data API grants change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## Forward verification

- Ledger contains the expected version once and the file checksum is recorded.
- All public tables' RLS state and policy intent are reviewed.
- SECURITY DEFINER grants, fixed search paths and caller authorization match the
  RPC classification.
- Anon, tenant A, tenant B, platform and service-role paths are exercised where
  relevant.
- PM start/complete and trigger synchronization produce immutable snapshots
  without referring to `asset_groups`.
- Auth signup creates exactly one safe profile through an enabled AFTER INSERT
  FOR EACH ROW trigger; Data API actors cannot INSERT, DELETE or TRUNCATE
  profiles.
- Trusted payment retries return the existing paid activation, while a
  conflicting, unpaid or cross-tenant reference fails closed.
- Build, type, lint and application tests show no mission-introduced regression.

## Recovery expectations

- Stop immediately on unexpected ledger entries, object diffs, privilege
  expansion, cross-tenant visibility or PM workflow failure.
- Restore availability using the pre-deployment recovery point if required.
- Correct schema/function/ACL behavior only with a new compensating migration.
- Never edit, delete, reorder or mark-repaired an applied migration as rollback.
- The Wave 0 migration changes functions, function/table ACLs, profile policies,
  one view option and the Auth signup trigger. Its compensating plan is a
  reviewed new migration restoring the prior definitions/ACLs if runtime
  verification fails.

## Existing payment-reference debt

The read-only live audit found 10 invoices with a non-null payment reference,
including two duplicated reference groups and a maximum group size of three.
Values are intentionally omitted. There is no database uniqueness constraint on
`billing_invoices.payment_reference`.

Wave 0 uses a transaction-scoped advisory lock and strict replay invariants to
prevent new duplicate activation through the trusted payment path. It does not
add a unique index because existing duplicates would make that deployment fail.
Cleaning historical duplicates and then adding a partial unique constraint is a
separate production-data decision with backup, reconciliation and rollback
criteria.

## Forbidden operations

- Blind `db push`, production DDL or migration repair.
- Editing, renaming or deleting applied history.
- Recreating `asset_groups` merely to satisfy stale function code.
- Mass RLS rewrite, mass grant revocation or advisor-driven index deletion.
- Applying any Wave 0/P0 file outside the checksum-locked, staging-proven order.
