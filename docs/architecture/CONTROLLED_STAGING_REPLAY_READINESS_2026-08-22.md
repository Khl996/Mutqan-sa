# Controlled staging replay readiness — 2026-08-22

## Verdict

**READY FOR CONTROLLED STAGING REPLAY**

This verdict authorizes only the next isolated staging replay. It is not a
production deployment authorization. No production schema, ledger, data, Auth
record, secret or configuration was changed during this mission.

## What is now proven

On 2026-08-22 the checksum-locked chain completed from a clean, marked,
temporary PostgreSQL 17.11 cluster:

1. recovered exact local Supabase stub;
2. replay-only Supabase runtime compatibility objects;
3. the separate `internal.runtime_secrets` prerequisite bootstrap;
4. the immutable baseline, with only three unavailable Supabase-managed
   extension creation lines omitted in the generated PostgreSQL-only copy;
5. all 24 expected June migrations in an exact manifest;
6. the recovered ledger history, executing the timestamped intake migration
   once and recording version `146` as its ledger-only repair alias;
7. Wave 0;
8. the three P0 migrations; and
9. the runtime, authority, PM and payment adversarial fixtures.

The harness reported 39 checksum-recorded artifacts. Two genuinely overlapping
payment activations returned the same persisted invoice
`ba20944c-d05e-40c7-9e24-33e1710fcca1` and subscription
`e866698a-9384-46fa-bd55-59f653c8e09c`; exactly one response was fresh and one
was idempotent. A conflicting replay failed with the expected billing-domain
error rather than a database uniqueness error.

## Recovered historical truth

No recovered SQL was fabricated from the resulting schema. Complete Git blob,
commit, live-ledger digest and negative-search evidence is retained in
`MIGRATION_RECOVERY_PROVENANCE_2026-08-21.md`.

| Version | Historical disposition | SHA-256 |
| --- | --- | --- |
| `146` | Exact canonical intake artifact; ledger repair alias, not a second execution | `47d035ae20445379ddfaf258ff6d75472fa397a6c150665f75a5c1094b947822` |
| `147` | Exact canonical and directly executed rounds artifact | `acc450cf9d6df5886419f68ec19f7e059a623313d3e2ea90f6395ba00b796f1d` |
| `148` | Exact final directly executed print/routing artifact | `f3a8ae95dc4816174b1c3d2e599cba62700955e0689dc69494ed30143a805871` |
| `20260706100734` | Exact executed intake SQL under the timestamped ledger version | `47d035ae20445379ddfaf258ff6d75472fa397a6c150665f75a5c1094b947822` |
| `20260707085234` | Exact facilities SQL; timestamped filename reconstructed from ledger evidence | `530ee417f06e0e7504bf95f95d0f36d909c93bbe3ae90d79f6f2315638386467` |

## Reconstructed compatibility, kept separate from history

The following are deliberately labelled replay/bootstrap inputs, not recovered
live-ledger migrations:

- `verify/local_stubs.sql` is an exact artifact from commit `43e3fcc`, Git blob
  `a46a90d82846f5d9136d41ff60819e5ba8bb4b0a`, SHA-256
  `37c6cd8c8ca1d4395b7e8d95dda78b89c92645e6f7559426d25dfd3174bc4c15`.
- `verify/local_supabase_runtime.sql` provides PostgreSQL-only substitutes for
  hosted Supabase runtime objects. It is never a deployment migration.
- `verify/replay_prerequisites.sql` creates the minimum
  `internal.runtime_secrets` shape required before the already-applied baseline.
  It does not alter that baseline.
- `20260821014202_p0_runtime_secret_reconciliation.sql` is the forward migration
  that validates/reconciles the table, primary key, RLS, ownership, fixed search
  path and negative grants. Its source evidence includes archived migration 057
  SHA-256 `c63413f6df6e2537ec1bfef25b6e2c2cee323e39b15dd2353f1aaa4d16e5d47c`
  and 091 SHA-256
  `0635dfca43d653d1a7d862741fabefc58c8024181898e5634b7602dc21a9215d`.
- `verify/replay_business_prerequisites.sql` is explicit fixture data needed by
  migration 139's assumption about an existing live tenant. It is compatibility
  data, not reconstructed historical tenant state.

## P0 authority result

- Active-account authority is centralized and strict: a profile is active only
  when `is_active IS TRUE`. A RESTRICTIVE active-actor policy is present on all
  74 of 74 public RLS tables.
- Signup ignores forged privileged metadata and creates an active, unbound
  ordinary profile.
- Tenant provisioning requires explicit platform/service authority and a
  one-time, plan-bound approval. Trial duration and plan are server-owned;
  caller-controlled trial/plan inputs fail closed.
- Protected profile fields cannot be changed through the Data API by setting a
  bypass configuration value. Managed role/status changes flow through the
  server-owned Auth Admin path, including Auth ban/unban synchronization.
- Work-order authority no longer trusts caller-controlled bypass configuration.
  Missing governance, canonical-scope replacement, risk-input tampering and
  emergency-close ambiguity fail closed.
- PM snapshot creation now uses a postgres-owned internal builder with no Data
  API grant and an authenticated checked wrapper. Direct and work-order-triggered
  paths use explicit authority; no trusted path depends on
  `pg_trigger_depth()`.

An independent residual review found no concrete remaining P0 authority blocker
in this scope. Catalog checks confirmed postgres ownership, fixed search paths,
intended ACLs and SECURITY INVOKER profile/work-order guards.

## Adversarial evidence

| Fixture | Proven result |
| --- | --- |
| Anonymous caller | Denied privileged helpers, secrets, PM and protected data |
| Normal active user | Allowed only intended same-tenant operations |
| Inactive user | Denied helper, intake, work-order and direct RLS paths even with privileged-looking profile fields |
| Tenant A against tenant B | Cross-tenant reads/actions denied |
| Tenant admin | Same-tenant administration retained; protected direct profile writes and unapproved provisioning denied |
| Platform admin | Explicit approval/provisioning path succeeds; caller plan/trial injection and direct protected profile mutation denied |
| Service role | Explicit server provisioning and runtime-secret paths succeed with restricted ACLs |
| Signup/provisioning | Forged metadata neutralized; approval is one-time and plan-bound |
| PM direct and WO-triggered | Start/complete paths pass and snapshots remain immutable |
| Concurrent payment replay | One durable invoice/subscription binding; identical identifiers; one fresh plus one idempotent response |
| Conflicting payment replay | Exact domain conflict returned; no unique-violation leakage |

## Artifact checksums

| Artifact | SHA-256 |
| --- | --- |
| Wave 0 migration | `25d519df50c81ba7331b9f823d0cbf535e3f1c3dbd22de236b2eb8129601a7d3` |
| P0 central authority/provisioning | `5ab552080198f073a5fc30b49cc05dcee9cfe350942a3b355daaae17dbbb86e9` |
| P0 runtime-secret reconciliation | `a7e556b225ae1dc6867b67f42d2c9a35008b929eda99ed5ed8ffdd55d23f6d1c` |
| P0 PM explicit authority | `9bde9a93cb2804a1500287b37207ae253c0394b3a612a6f73d838583db997dc2` |
| Controlled replay harness | `b1bacae671f563a2563e99d5ff4ed46f16ff713cae4610070ca5a584f5eb50ab` |
| P0 authority adversarial fixture | `1cab44153242c90fddad1f431c95a1a71ed2e65438ca84c6c1bbc321a6503d43` |
| P0 runtime-secret fixture | `6d362be8509e7881d8d34093cf464a55a3e7f7709e7f5685fc986847eba65209` |
| P0 PM fixture | `83cb654a072af7a1af608c53c2be13b84cd32dfee864dd3ef4ac51ff2cb63cff` |

## Non-database verification and bounded residuals

- The production application build completed successfully: 3,820 modules,
  PWA output generated.
- Targeted ESLint completed with zero errors. Remaining warnings are the
  pre-existing React Fast Refresh export warning and two non-blocking warnings
  in the server API file when linted outside its normal ignore rule.
- `git diff --check` completed successfully; line-ending notices are repository
  working-copy policy warnings, not whitespace errors.
- The isolated runner substitutes hosted Supabase extensions and runtime objects,
  so controlled staging must still prove the exact hosted extension placement,
  Auth behavior and final schema/ACL graph. That is the purpose of the next
  staging replay and is not evidence for production readiness.

## Staging gate

Use `scripts/verify-pg17-controlled-replay.ps1` as the local reproducibility
check, then deploy the checksum-locked manifest only to a controlled staging
project. Stop on any unexpected ledger entry, checksum drift, privilege
expansion, cross-tenant visibility, hosted Auth difference, PM mismatch or
payment-binding discrepancy. Production remains prohibited until staging
evidence is reviewed and a separate deployment authorization is issued.
