# Mutqan 2.0 controlled Supabase staging acceptance — 2026-08-22

## A. Verdict

**STAGING NO-GO**

The mandatory environment-identity gate failed before the first remote SQL
statement. No Supabase database, Auth user, migration ledger, secret, function,
Storage object or application deployment was changed.

## B. Staging identity

No controlled staging project could be proven.

| Evidence | Result |
| --- | --- |
| Current local Supabase link | `mzpohntjotgeeaukwnbz` (`Mutqan A`, `ap-southeast-1`, `ACTIVE_HEALTHY`) |
| Local application environment | Same ref; `VERCEL_ENV=production`, `VERCEL_TARGET_ENV=production`, `VITE_APP_URL=https://mutqan-sa.com` |
| Vercel production environment file | Same Supabase ref |
| Preview branches for `mzpohntjotgeeaukwnbz` | Only `main`, same project ref; no isolated preview branch |
| Other accessible Supabase project | `siyirdaucrdjqqdeglpf` (`Mutqan ai office`, `ap-northeast-1`, `INACTIVE`) |
| Evidence that the other project is staging | None in the repository, local environments, Git history or project name/status |
| Evidence that either candidate contains no customer production data | Not established |
| Hosted PostgreSQL/runtime inventory | Not queried because no staging target passed identity classification |
| Starting migration ledger | Not queried because no staging target passed identity classification |
| CLI | Supabase CLI `2.95.3`; it reported `2.115.0` available. No upgrade was performed. |
| Git HEAD | `0b9c7ff1c46fe4829ea5d4319d0a0c7d54cbcbf6` on `codex/pilot-sales-ops-snapshot` |
| Reviewed artifact state in Git | Not frozen: the accepted migration, test, verification and architecture paths are untracked at this HEAD |

Older repository documents call `mzpohntjotgeeaukwnbz` an approved
staging/demo target. Current environment evidence conflicts with that label: the
same project is now bound to the production application environment and
`mutqan-sa.com`. The older label is therefore insufficient authority for a
schema replay.

No attempt was made to relink the checkout, unpause the second project, create
a paid project, or create a Supabase Preview Branch. Any of those actions needs
an explicit staging designation and, where applicable, cost/resource approval.

## C. Applied manifest

Nothing was applied to hosted Supabase. The isolated replay audit was reopened
read-only and every one of its 39 source files was rehashed: `39 checked`,
`0 missing`, `0 mismatched`. The temporary PostgreSQL 17 evidence server was
then stopped.

| Version | Name | SHA-256 | Accepted disposition | Hosted result |
| --- | --- | --- | --- | --- |
| `fixture-local-stubs` | recovered Supabase schema stub | `37c6cd8c8ca1d4395b7e8d95dda78b89c92645e6f7559426d25dfd3174bc4c15` | local compatibility fixture only | not run |
| `fixture-local-runtime` | Supabase runtime compatibility | `a71f4f6f01f295db2334322ec09ab72910db4340ec759b01017d10d6d42e8be3` | local compatibility fixture only | not run |
| `bootstrap-runtime-secrets` | baseline prerequisite | `23370da8d777d680889617cf0339e034b0bbb52a7942284ce4bd8a7896511676` | non-ledger bootstrap | not run |
| `00000000000000-source` | baseline | `18e862e39faaef5ca0cc88124b324a923c71b2f23e89a846c9765561fed5f541` | historical source | not applied |
| `00000000000000-executed` | generated PostgreSQL-only baseline | `a1356a93d9ca48a64bdfba07e76ff991dd59b2a34b4d83303d16d7e048962eef` | local proof only; never a hosted migration | not run |
| `20260602213839` | hospital lite report foundation | `87f9bb0e54b12776c062d4f298f53688963294d873627111c284cbc605bfb5c2` | migration | not applied |
| `20260602220332` | 132 hospital lite set modules | `0eefe4d4f092c69c4ee6c06f0f4792191cec30b9c3b5f7bfb5b2b63c674b0bd7` | migration | not applied |
| `20260603052554` | 133 hospital lite public portal phase 3 | `48fc35e58c65397500fd78cc8868e7bb2cbfd03c04862c51db595125326a828b` | migration | not applied |
| `20260603072505` | 134 hospital lite technician RLS | `1ab707e2f0f8acc7c45f1f890077490dea92bb33fa89ade9dc724e50657cf792` | migration | not applied |
| `20260603101927` | 135 hospital lite PDF phase 6 | `8e9e5a691625a5436f7592cb42fde6d7e68c05290a1cd91e648b2a9da92f3682` | migration | not applied |
| `20260603105715` | 136 RLS fix A1 work-order costs | `236f930aadf9ababd5fce9eea02bf6d73a468d1c49fa68309873c20c98b995f1` | migration | not applied |
| `20260603105732` | 136 RLS fix A2 custom roles | `97a966bf451b5735c897f4d7866cea19e3a650aa0688c340c626626314bb32bb` | migration | not applied |
| `20260603105742` | 136 RLS fix A3 work-order parts | `bd294e93102712af670210a50984bfdb8eb901b4e7b754fb944d9112a2b48b16` | migration | not applied |
| `20260603111244` | 137 RLS fix A4 work orders | `8d1369b8f8671cb50f39d202208b8aa85fb263c5aaa3b3d53b6bc8340d845140` | migration | not applied |
| `20260603111253` | 138 demo cleanup | `63718e909cae045c597372d9b1c10fa73632efd11f41280347355cef0ef8bb60` | migration | not applied |
| `fixture-20260603203027` | external hospital tenant prerequisite | `a9d66d4493e9eb8c03c47720d4fb662aca89793a1b3ad404e94bd8f4b8081af3` | staging fixture, not history | not run |
| `20260603203027` | 139 hospital lite mode | `dfb1563114ece0b6a92006ecb11e491586677ca7e13e1f2f3b2c492f5d82d8a5` | migration | not applied |
| `20260620193211` | public report photo RLS fix | `e91d97b85cad5575a9e49bf7c0a92e57303ce4f4ba2c0e246e1eace332223593` | migration | not applied |
| `20260620200930` | definer view/dead function fix | `778443fdd82ba4cffefcf724da0f33cb5b981de54a230087d4a49c70f8f40362` | migration | not applied |
| `20260621094216` | 142 PM engine foundation | `c6e04f9fe844444158d0aa49f53b45abdcc1f958d5309f3578a49c515ab09cfa` | migration | not applied |
| `20260621094238` | 143 blackout seed | `8e2336721f109584c9af3cf76c2636a4644b2826b7e5aa7d942e17e5addc614c` | migration | not applied |
| `20260622064857` | 144 PM generator rewrite | `9d23c8c1e889d8bfeab42ae6a7c914cc4789fc54baa4f2df164d308b77375310` | migration | not applied |
| `20260622072258` | 145 blackout label fix | `f6f83eb48c9f68a61822e29197c4bc940c37554763740c62b1f45720e657fef8` | migration | not applied |
| `20260627113236` | field governance wave 1 | `0540859f6fa3f4137137a79178c2a9c19bf9df9be0c8471c7e8e4072e24d68ea` | migration | not applied |
| `20260627142423` | field governance approval matrix | `94b40a695ca606a79e3829cffc2951cd16eb9623108f27be4973313cc42d7675` | migration | not applied |
| `20260627144744` | field governance SLA pause | `eaf072cd42695d6f57b9738d2ca726cf8124cabcb1b31e68186faa187fb83710` | migration | not applied |
| `20260627194156` | field governance decision queue | `93281d5b8f6e467c6910bf946742ebce14bf24a34859d1594186f6762df7f31c` | migration | not applied |
| `20260627202142` | field governance delegation | `46ef2158dd38dfc2550374366f19529a39c6d467fed63ad44790e1ad69551412` | migration | not applied |
| `20260628181326` | field governance WhatsApp approvals | `08f20163c572196ec6995d2a2e340ac2dc59ca17d918cc574dc7f2cae06d98d5` | migration | not applied |
| `20260628182408` | governance token pgcrypto fix | `0cbd5344c50f6f70c2de9c7c11369ed75044294a83c9a5ca4635a0472cbdcff7` | migration | not applied |
| `20260706100734` | intake foundation | `47d035ae20445379ddfaf258ff6d75472fa397a6c150665f75a5c1094b947822` | actual historical execution | not applied |
| `146` | intake foundation | `47d035ae20445379ddfaf258ff6d75472fa397a6c150665f75a5c1094b947822` | ledger alias only; never execute twice | not recorded |
| `147` | rounds v0 | `acc450cf9d6df5886419f68ec19f7e059a623313d3e2ea90f6395ba00b796f1d` | recovered migration | not applied |
| `148` | post-demo print and round routing | `f3a8ae95dc4816174b1c3d2e599cba62700955e0689dc69494ed30143a805871` | recovered migration | not applied |
| `20260707085234` | 149 facilities/locations | `530ee417f06e0e7504bf95f95d0f36d909c93bbe3ae90d79f6f2315638386467` | recovered migration | not applied |
| `20260820234813` | Wave 0 RPC/PM hardening | `25d519df50c81ba7331b9f823d0cbf535e3f1c3dbd22de236b2eb8129601a7d3` | new forward migration | not applied |
| `20260821013641` | P0 central authority/provisioning | `5ab552080198f073a5fc30b49cc05dcee9cfe350942a3b355daaae17dbbb86e9` | new forward migration | not applied |
| `20260821014202` | P0 runtime-secret reconciliation | `a7e556b225ae1dc6867b67f42d2c9a35008b929eda99ed5ed8ffdd55d23f6d1c` | new forward migration | not applied |
| `20260821014205` | P0 PM explicit authority | `9bde9a93cb2804a1500287b37207ae253c0394b3a612a6f73d838583db997dc2` | new forward migration | not applied |

Accepted test artifacts, all not run against hosted Supabase:

| Test | SHA-256 |
| --- | --- |
| `wave0_rpc_surface.sql` | `8e5d8a94a8b7c3fc64bb230346ed05e304f5cfa33b07a9084fc3891565800317` |
| `p0_authority_adversarial.sql` | `1cab44153242c90fddad1f431c95a1a71ed2e65438ca84c6c1bbc321a6503d43` |
| `p0_runtime_secret_reconciliation.sql` | `6d362be8509e7881d8d34093cf464a55a3e7f7709e7f5685fc986847eba65209` |
| `p0_pm_snapshot_authority.sql` | `83cb654a072af7a1af608c53c2be13b84cd32dfee864dd3ef4ac51ff2cb63cff` |
| `p0_payment_concurrency_setup.sql` | `c8f00c605de579963c548cb7c808ad6f9475d7de08338548a15ed5e858bbc441` |
| `p0_payment_activation_call.sql` | `2ea2a6606e2845dd83f032952e7c0a26fab02c1680fc6ed0c71cb4e7ee9295ef` |
| `p0_payment_concurrency_assert.sql` | `66edfa98df38daa719c7d30a28b19097560f68614194df75004e0640c9d15702` |

## D. Hosted compatibility findings

No hosted authority graph was inspected or changed because the target failed
classification. Therefore the following required differences remain unproven:

- real `auth`, `storage`, `vault`, `extensions`, `realtime` and managed runtime
  ownership/placement versus the local compatibility fixtures;
- Data API grants as a separate layer from RLS;
- permissive/restrictive policy interaction under PostgREST sessions;
- hosted `anon`, authenticated and service-role JWT behavior;
- Auth signup trigger execution and ban/session behavior;
- runtime-secret access through the hosted Vault/runtime boundary.

The current Supabase changelog adds two relevant guardrails: extension version
pinning is no longer authoritative, and the hosted `realtime` schema is locked
against modification. The accepted manifest contains no explicit extension
version pin and no `realtime.*` mutation, but hosted verification is still
required.

## E. Security acceptance

| Actor | Hosted result |
| --- | --- |
| anon | not run |
| active authenticated | not run |
| inactive authenticated | not run |
| tenant A / tenant B | not run |
| tenant admin | not run |
| platform admin | not run |
| service role | not run |

No positive or negative hosted security claim is made.

## F. Public-by-design acceptance

The source review identified these current token/public surfaces. Their intended
contracts are preserved; no global active-user policy was weakened.

| Surface | Intended authority | Valid token | Invalid/expired | Wrong tenant/object | No token/reuse |
| --- | --- | --- | --- | --- | --- |
| `get_public_tenant_data` | anon portal token; tenant derived server-side | not run | not run | not run | not run |
| `submit_public_work_order` | anon portal token; scoped submission | not run | not run | not run | not run |
| `get_public_work_order_status` | anon high-entropy tracking token; minimal response | not run | not run | not run | not run |
| `create_intake_report_from_public_token` | anon intake/portal token | not run | not run | not run | not run |
| `submit_intake_report` | report ID plus report-specific public access token | not run | not run | not run | not run |
| `public-report-photos` | no anon Storage read; upload is intended through a service-owned function; authenticated tenant read only | not run | not run | not run | not run |
| `consume_governance_decision_action_token` | authenticated intended actor plus single-use token | not run | not run | not run | not run |

The source tree references an `upload-report-photo` Edge Function, but no such
function source exists under the current repository's `supabase/functions` or
`api` paths. This must be reconciled as a P1 hosted-surface gap before claiming
photo-upload acceptance; it was not patched during this blocked run.

## G. Auth lifecycle

Signup, approved provisioning, suspension, existing-session denial,
reactivation, Auth ban/unban and JWT refresh behavior were not run. No hosted
Auth users were created or changed.

## H. Work-order acceptance

Create, assign, start, technician complete, supervisor/engineer approvals,
reporter closure, rejection, cancellation, governance, emergency, SLA and
legacy-compatible paths were not run against hosted staging.

## I. PM acceptance

Direct and work-order-triggered PM routes were not run against hosted staging.
The local proof remains intact, including the postgres-only internal builder,
checked wrapper, absence of `pg_trigger_depth()` authority and no retired
`asset_groups` dependency.

## J. Payment acceptance

No payment handler or database authority was deployed. Hosted normal,
idempotent, overlapping and conflict cases were not run. Historical duplicate
production references were not touched.

## K. Application smoke results

The application was not repointed. No hosted browser smoke, Arabic/English,
RTL/LTR, suspension/reactivation or public-token flow was run. The production
domain and environment files were left unchanged.

## L. Final hosted authority graph

Unavailable because no staging target passed the pre-deployment gate. No hosted
ledger, table, RLS, policy, function, owner, ACL, search-path, extension or
public-RPC count is reported as staging evidence.

## M. Changes made during the staging mission

- No migration, application code, dependency or test was changed.
- No remote resource was created, resumed, linked, mutated or deployed.
- This evidence report was added locally.
- Previous evidence was not invalidated; all 39 accepted source hashes still
  match the isolated replay audit.

## N. Residual risks

### P0 blockers

1. No Supabase project/ref is explicitly designated and provable as staging
   with no customer production data.
2. The production-bound ref is the current link; there is no isolated Preview
   Branch. Using it would violate the mission boundary.
3. The reviewed chain is checksum-stable but not frozen in Git: the accepted
   migration/test/verification paths are untracked at the reported HEAD.
4. Consequently, none of the mandatory hosted Auth, RLS, public-token,
   tenant-isolation, workflow, PM, payment or application acceptance evidence
   exists yet.

### P1

- The repository references a service-owned `upload-report-photo` function but
  does not contain its deployable source.
- Hosted Auth/session and runtime-secret behavior remains unknown until a real
  staging project is available.

### P2

- CLI `2.95.3` is behind the available `2.115.0`; no upgrade was made because
  the mission forbids unrelated dependency/tool upgrades. The exact accepted
  CLI version should be selected deliberately for the later controlled run.
- Existing application bundle-size and Browserslist-age warnings remain
  non-blocking engineering debt.

### Production-data debt

- The previously observed duplicate payment-reference groups remain a separate
  production reconciliation decision. This mission did not query, clean or
  mutate them.

## O. Proposed production rollout plan — draft only

This plan must not begin until a complete hosted staging run is accepted.

1. Freeze the accepted files in a reviewed immutable Git commit/tag and recheck
   all manifest hashes.
2. Record the production project ref, current ledger, PostgreSQL/runtime graph,
   named operators, maintenance window and stop authority.
3. Create and verify a current backup/recovery point before any schema action.
4. Confirm all recovered historical ledger versions already exist with the
   expected semantics. Do not execute intake twice and do not repair history
   blindly.
5. Apply database changes first and only in order:
   `20260820234813` → `20260821013641` → `20260821014202` →
   `20260821014205`.
6. Stop immediately on checksum drift, unexpected ledger entries, lock/timeout,
   extension-placement difference, privilege expansion, signup-trigger failure,
   cross-tenant access, public-token scope escape, PM mismatch or payment-binding
   discrepancy.
7. Run the post-P0 catalog/ACL/RLS graph comparison and the complete actor,
   public-token, Auth, work-order, PM and payment fixtures.
8. Only after database verification, deploy the dependent payment/admin server
   handlers; then deploy the application bundle. Never deploy API first.
9. Run Arabic/English application smokes, suspension/reactivation, PM and public
   token flows against production-safe fixtures.
10. If availability or correctness fails, restore through the approved recovery
    point where necessary and use a reviewed compensating forward migration.
    Never edit or delete applied historical migration content as rollback.

## Smallest action needed to resume

Provide one of the following with explicit confirmation that it contains no
customer production data:

1. an existing Supabase staging project ref and its intended staging app URL;
   or
2. authorization to create a dedicated Supabase Preview Branch/project,
   including acceptance of any resource cost.

Then approve freezing the accepted artifact set into a dedicated reviewed Git
commit/ref before the first hosted migration.
