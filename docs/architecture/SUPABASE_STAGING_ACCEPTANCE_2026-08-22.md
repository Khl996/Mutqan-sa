# Mutqan 2.0 controlled Supabase staging acceptance — 2026-08-22

## A. Verdict

**STAGING NO-GO**

The frozen 39-artifact candidate replayed successfully on the isolated
`Mutqan Staging` project and passed the mandatory tenant, suspension,
provisioning, work-order, PM, payment, public-token and application fixtures.
It is not ready for production deployment review because the hosted acceptance
found two remaining blockers:

1. an anonymous `SECURITY DEFINER` surface is broader than the intended public
   capability-token allowlist; a real anonymous request successfully read
   tenant PM compliance metrics and could probe tenant feature and
   asset/location facts by caller-supplied `tenant_id`/object IDs;
2. the real public signup endpoint is blocked by the staging Auth email-send
   limit (`429`, `over_email_send_rate_limit`), so the email/OTP signup path
   cannot yet be accepted end to end.

Production project `mzpohntjotgeeaukwnbz` was never linked, queried, changed,
merged into or deployed.

## B. Immutable candidate and staging identity

| Evidence | Accepted result |
| --- | --- |
| Frozen commit | `10451638642fe4c17c2bf5cb7ea3c7f39823de0b` |
| Frozen tag | `mutqan-2.0-controlled-staging-acceptance-20260822` |
| Freeze branch | `codex/controlled-staging-acceptance-20260822` |
| Source checkout used for replay | exact detached clone with `core.autocrlf=false`; `HEAD` remained the frozen commit |
| Artifact audit | `39` checked, `0` missing, `0` checksum mismatches |
| Staging ref | `eaawunoqdxguzlpvlxrv` |
| Staging name | `Mutqan Staging` |
| Region | `ap-southeast-1` |
| Project status | `ACTIVE_HEALTHY` |
| Created at | `2026-08-22T10:57:17.283684Z` |
| Database host | `db.eaawunoqdxguzlpvlxrv.supabase.co` |
| PostgreSQL | hosted `17.6.1.155`; SQL `server_version=17.6` |
| Credentials | project-specific staging keys; never copied to source or committed |
| Production deny target | `mzpohntjotgeeaukwnbz`; not used for SQL, Auth, Storage, Functions or application smoke |

Before the first SQL statement, the management plane and an independent
project lookup agreed on the staging ref, name, region, database host, version,
creation time and healthy status. Project-specific API checks then reported:

- `0` Auth users;
- `0` Storage buckets;
- `0` exposed Data API paths;
- `0` Edge Functions;
- no Supabase migration ledger;
- no public relations.

The first SQL statement was catalog-only and independently confirmed `0` Auth
users, `0` buckets, `0` public relations and no migration ledger. The target was
therefore a newly created, non-production project containing no customer data.

## C. Hosted replay result

Replay order:

1. non-ledger bootstrap for `internal.runtime_secrets`;
2. historical baseline `00000000000000`;
3. the 24 June migrations;
4. the evidence-backed business prerequisite fixture for migration 139;
5. actual intake migration `20260706100734` exactly once;
6. ledger-only historical alias `146`, pointing to the same recovered bytes;
7. recovered `147`, `148`, and timestamped `149`;
8. Wave 0;
9. the three P0 migrations.

All executed source files matched their frozen SHA-256 values. Client-only
`\set ON_ERROR_STOP` lines were removed only by an in-memory execution adapter;
the accepted files were not edited. The five recovered ledger artifacts retained
their recorded provenance and checksums from the frozen recovery manifest.

Final migration ledger: `34` rows.

| Version class | Result |
| --- | --- |
| Baseline | applied and ledgered |
| June history | all applied and ledgered in timestamp order |
| Intake actual `20260706100734` | executed once and ledgered |
| Intake alias `146` | ledger-only reconciliation; not executed twice |
| Recovered `147`, `148`, timestamped `149` | applied and ledgered |
| Wave 0 | applied and ledgered |
| P0 central authority/provisioning | applied and ledgered |
| P0 runtime-secret reconciliation | applied and ledgered |
| P0 PM explicit authority | applied and ledgered |

The hosted exact-file assertions all passed:

- `wave0_rpc_surface.sql`;
- `p0_runtime_secret_reconciliation.sql`;
- `p0_pm_snapshot_authority.sql`;
- `p0_authority_adversarial.sql`;
- payment concurrency setup/call/assert fixtures.

## D. Runtime-secret and PM trust boundaries

`internal.runtime_secrets` was bootstrapped before the historical baseline,
then reconciled by the forward P0 migration. Final state:

- owner `postgres`;
- RLS enabled;
- zero rows;
- zero permissive policies;
- no table `SELECT` for `anon`, `authenticated` or `service_role`;
- no need to edit an already-applied baseline.

The Supabase linter reports the table as “RLS enabled, no policy” at `INFO`.
That is intentional fail-closed behavior, not a missing-access defect.

The PM snapshot authority change also passed on hosted PostgreSQL:

- the implementation is `internal.pm_build_task_execution_snapshot(uuid)`;
- only `postgres` can execute the implementation;
- the public wrapper has explicit authenticated/service routing;
- neither implementation nor wrapper trusts `pg_trigger_depth()`;
- trigger synchronization calls the internal builder explicitly;
- the retired `asset_groups` dependency was not revived.

## E. Real adversarial actor fixtures

All fixtures were synthetic and staging-only.

| Actor/path | Hosted result |
| --- | --- |
| Anonymous table access | denied/empty as designed |
| Normal tenant A user | saw only tenant A rows |
| Tenant A user targeting tenant B | denied or empty; no cross-tenant state change |
| Tenant B user | saw only tenant B rows |
| Tenant admin | tenant-scoped management and governed approvals passed |
| Platform admin | explicit cross-tenant platform access passed |
| Service role | explicit service routes passed |
| Inactive user with an existing JWT | central active check became false; assets/work orders became empty; protected RPC denied |
| Inactive user password login | Auth returned `user_banned` |
| Tenant-admin profile reactivation attempt | rejected; protected fields require the managed-user service |
| Authorized reactivation/unban | new session restored only after both profile and Auth state were reconciled |

### Provisioning

- anonymous provisioning: denied;
- normal unapproved user: denied; one-time approval required;
- caller-controlled `p_trial_days=99`: denied for normal and service callers;
- caller-controlled `p_assign_caller_as_admin=true`: denied for service caller;
- approved signup-style caller: provisioned Tenant A, consumed the approval,
  received `tenant_admin`, and used the plan-derived seven-day trial;
- service provisioning: provisioned Tenant B with plan-derived seven-day trial;
- the approval was single-use.

### Work orders and governance

- anonymous start: denied at runtime;
- tenant A user against tenant B work order: denied;
- standard start without governance: failed closed;
- caller-set workflow GUC/direct sensitive-field patch: denied;
- explicit tenant-admin governance authority limit: required before approval;
- approved direct lifecycle: start → technician complete → supervisor →
  engineer → reporter closure → completed;
- rejection, cancellation and governance-rejection branches: passed and were
  state preserving;
- emergency override: start → post-action completion → approval passed;
- governance action tokens: no token, wrong token, wrong actor, expired token
  and replay were denied; the intended actor succeeded once.

### PM direct and work-order-triggered paths

Using real hosted JWTs:

- anonymous wrapper/start: denied;
- tenant B against tenant A task: denied;
- tenant A assignee built the snapshot, started and completed the direct task;
- service role reached only the checked public wrapper;
- `wo_start` and `wo_complete` on a preventive work order moved its related PM
  task to `completed`;
- both direct and work-order-triggered tasks retained a persisted
  `snapshot_type=pm_execution` snapshot.

### Payment activation

Two overlapping activation calls with the same payment reference both
succeeded idempotently and persisted exactly one invoice and one subscription.
Two subsequent service-role replays returned the same IDs with
`idempotent_replay=true`. A conflicting amount for the same reference was
rejected and did not create competing state.

## F. Public capability-token acceptance

| Surface | Valid case | Invalid/revoked/no token | Cross-tenant/object | Reuse |
| --- | --- | --- | --- | --- |
| `get_public_tenant_data` | returned Tenant A context | returned no row | tenant derived from token | reusable portal token by design |
| `submit_public_work_order` | created scoped public work order | rejected | Tenant B asset rejected | reusable portal token created a second distinct report by design |
| `get_public_work_order_status` | returned minimal status | returned `null` | bound to high-entropy tracking token | read-only |
| `create_intake_report_from_public_token` | created collecting report | rejected | tenant derived from token | creates a new report by design |
| `submit_intake_report` | created one review draft | wrong report token rejected | Tenant B asset rejected | replay returned the same draft with `already_exists=true` |
| governance decision action token | intended actor succeeded | blank, wrong, expired and wrong-actor rejected | bound to governance/work order/actor | second use rejected |

The public portal UI also loaded Tenant A through the token and created a real
synthetic report in a browser.

## G. Application smoke

The frozen source was built locally with staging-only public environment values;
no `.env` file was written and no application was deployed.

- production build: passed (`3812` modules; PWA service worker generated);
- Arabic landing and login pages: rendered;
- real password login for tenant A technician: passed;
- dashboard: loaded Tenant A and staging fixture counts;
- work-order list: loaded Tenant A work orders only;
- public portal: loaded token-scoped tenant context and submitted a report;
- browser console: no application error in the accepted flows;
- existing chunk-size and Browserslist-age warnings remain non-blocking debt.

## H. Signup acceptance

The application calls `supabase.auth.signUp`, then email/OTP verification, then
`complete_pending_registration`. The database half is fail-closed and requires
a bound one-time provisioning approval. Direct approval/provisioning tests
passed.

The hosted public `/auth/v1/signup` request did not pass acceptance. A fresh
synthetic address returned:

- HTTP `429`;
- `over_email_send_rate_limit`;
- Auth log action `user_confirmation_requested`;
- no accepted signup session and no new persistent Auth user.

Admin-created confirmed users prove login and database authority, but they do
not substitute for the mandatory public email/OTP signup path.

## I. Final hosted authority graph

| Item | Final staging state |
| --- | ---: |
| Public tables | `74` |
| Public tables with RLS | `74` |
| Public tables without RLS | `0` |
| Public views | `3` |
| Public policies | `269` |
| Public functions | `193` |
| Public `SECURITY DEFINER` functions | `169` |
| Anonymous-executable `SECURITY DEFINER` functions | `49` |
| `CREATE` on public schema for PUBLIC/anon/authenticated/service | all `false` |
| Migration rows | `34` |
| Runtime-secret rows | `0` |

Installed extensions: `pg_net 0.20.4` in `public`, `pg_stat_statements 1.11`
and `pgcrypto 1.3` in `extensions`, `supabase_vault 0.3.1` in `vault`, and
`uuid-ossp 1.1` in `extensions`. The historical baseline installed `pg_net` in
`public`; the linter warns about that placement. It was not moved during
acceptance because historical extension relocation is outside this immutable
candidate and is not the demonstrated P0 failure.

Supabase advisor summary:

- security: `202` notices (`201 WARN`, `1 INFO`), including `49` anonymous
  definer grants, `129` authenticated definer grants, `21` mutable search paths,
  the historical `pg_net` placement and disabled leaked-password protection;
- performance: `471` notices, dominated by unused indexes, unindexed foreign
  keys, multiple permissive policies and RLS init-plan optimization.

Authenticated execution of a deliberately designed checked RPC is not itself
a defect. The anonymous findings required runtime classification rather than
blanket acceptance.

## J. Demonstrated anonymous authority escape

The anonymous advisor surface is not only metadata noise. Real unauthenticated
Data API requests returned `200` for:

- `pm_calculate_compliance_stats(p_tenant_id)` — tenant PM totals, overdue,
  due-soon and compliance-rate metrics;
- `check_subscription_limits(p_tenant_id, resource_type)`;
- `is_tenant_feature_enabled(p_tenant_id, module, feature)`;
- `facility_location_is_valid(...)` for a known tenant/building;
- `work_order_asset_location_is_valid(...)` for a known tenant/asset.

These helper functions accept caller-controlled tenant/object IDs and execute as
their owner. They do not belong in the direct anonymous API. Runtime checks in
other workflow RPCs do not repair this read/probe authority leak.

The smallest safe correction is one new forward migration that:

1. revokes `EXECUTE` from `PUBLIC` and `anon` on every exposed
   `SECURITY DEFINER` function by default;
2. explicitly re-grants only the reviewed public capability endpoints
   (`get_public_tenant_data`, `submit_public_work_order`,
   `get_public_work_order_status`, `create_intake_report_from_public_token`,
   `submit_intake_report`) plus any separately justified public pricing surface;
3. revokes direct execution of trigger/internal/derived-stat helper functions;
4. pins safe search paths for the remaining 21 mutable-path functions;
5. reruns the anonymous negative matrix and the valid public-token flows.

This must be reviewed and frozen as a new candidate. The accepted 39-artifact
tag was not silently changed during staging acceptance.

## K. P1/P2 findings

### P1

- `upload-report-photo` remains referenced by the database/storage design but
  its deployable function source is absent. It did not block the mandatory P0
  paths and was not expanded during this mission.
- Enable leaked-password protection and deliberately configure staging SMTP/
  email rate limits before the next signup run.
- Classify the `pg_net` public-schema placement and the remaining definer grants
  as an explicit allowlist, not by inherited defaults.

### P2

- Resolve performance-advisor findings in measured batches; they are not the
  cause of this verdict.
- Deliberately select/upgrade the Supabase CLI after candidate acceptance; the
  replay used `2.95.3` and did not perform an unrelated tool upgrade.
- Address bundle splitting and refresh Browserslist data separately.

## L. Production boundary and next acceptance

No production SQL, Auth, Storage, Edge Function, migration repair, merge,
deployment or data cleanup was performed. The staging fixtures remain synthetic
and contain no customer data.

The next controlled staging candidate needs only:

1. the reviewed anonymous-definer allowlist/search-path forward migration;
2. branch-specific Auth email capacity or SMTP configuration;
3. a fresh replay/forward-apply of that new candidate;
4. rerun of the anonymous public surface, valid public-token paths, and full
   signup → OTP → approved provisioning flow;
5. a clean advisor diff proving that any remaining grants are intentional.

Production deployment remains a separate reviewed decision. Nothing in this
report authorizes a production migration or merge.
