# Migration Recovery Provenance — 2026-08-21

## Outcome

All five live-ledger gaps have evidence-backed SQL content. No SQL was inferred from the resulting production schema.

Three versions (`146`, `147`, and `148`) were recovered directly from canonical Git blobs. The two timestamped versions were never committed under their timestamped filenames; their filenames are reconciliation aliases backed by exact committed SQL and live-ledger statement digests. This distinction matters for replay because `146` was a ledger repair for SQL already executed as `20260706100734`, not a second production execution.

No production mutation was performed during recovery. Production access was limited to read-only inspection of `supabase_migrations.schema_migrations`.

## Recovered files

All checksums are SHA-256 over the active file's exact UTF-8/LF bytes, including its terminal LF.

| Live version | Live name | Active recovered file | Canonical Git source | Git blob | Bytes | SHA-256 | Confidence |
|---|---|---|---|---|---:|---|---|
| `146` | `intake_foundation` | `supabase/migrations/146_intake_foundation.sql` | commit `7975df34c7040d1e5dc5bdf45e07ced22c59fc62`, same path | `5b01a542fbe38aa3200745f8ef39547d57fa1375` | 36,438 | `47d035ae20445379ddfaf258ff6d75472fa397a6c150665f75a5c1094b947822` | Exact canonical artifact; ledger-only repair event |
| `147` | `rounds_v0` | `supabase/migrations/147_rounds_v0.sql` | commit `90c1a1658b10308cf1c8d7e090f163af96599b6f`, same path | `22c897d07435ea59de70d28453fe50541a84f089` | 16,170 | `acc450cf9d6df5886419f68ec19f7e059a623313d3e2ea90f6395ba00b796f1d` | Exact canonical artifact and direct-execution evidence |
| `148` | `post_demo_print_and_round_routing` | `supabase/migrations/148_post_demo_print_and_round_routing.sql` | commit `4deba63a0a8b8c4a563c40c6b4ac11da4ff9e2e3`, same path | `d5eece3b90b6fd21ef45c3614da5f1a493777855` | 10,185 | `f3a8ae95dc4816174b1c3d2e599cba62700955e0689dc69494ed30143a805871` | Exact final artifact; final form was directly rerun after repair |
| `20260706100734` | `intake_foundation` | `supabase/migrations/20260706100734_intake_foundation.sql` | exact copy of commit `7975df34c7040d1e5dc5bdf45e07ced22c59fc62` / `146_intake_foundation.sql` | `5b01a542fbe38aa3200745f8ef39547d57fa1375` | 36,438 | `47d035ae20445379ddfaf258ff6d75472fa397a6c150665f75a5c1094b947822` | Exact SQL; timestamped filename reconstructed from the live ledger |
| `20260707085234` | `149_hospital_enable_facilities_locations` | `supabase/migrations/20260707085234_149_hospital_enable_facilities_locations.sql` | commit `ed232e7ef9978ad3b6dbdd0270db4ac9fc525936` / `149_hospital_enable_facilities_locations.sql` | `b363d351a20e48bfb3d4872996c09679a522700f` | 1,325 | `530ee417f06e0e7504bf95f95d0f36d909c93bbe3ae90d79f6f2315638386467` | Exact SQL; timestamped filename reconstructed from the live ledger |

`git hash-object` over every active file equals the canonical source blob shown above. The timestamped copies intentionally hash to their corresponding canonical blob.

## Historical execution evidence

### Intake: `20260706100734` and `146`

- Commit `7975df34...` created `146_intake_foundation.sql` at 2026-07-06 10:04:53 UTC.
- The live ledger version `20260706100734` records one 36,437-byte statement. Its SHA-256 is `6832f4136f9896eee8dbf1c9a733d45764b44996f59db642e3867d9fbc18b21d`.
- Removing only the canonical Git blob's terminal LF produces exactly 36,437 bytes and the same SHA-256. Therefore the timestamped migration body is byte-identical to the committed `146` artifact apart from normal statement-storage trimming of the final newline.
- The July 6 Codex session shows production already had `20260706100734 intake_foundation` before version `146` appeared.
- At 2026-07-06 16:29:05 UTC the session ran `supabase migration repair 146 --status applied --linked`; its successful output says `Repaired migration history: [146] => applied`. There was no second execution of the intake file in that sequence.

Conclusion: `20260706100734` is the executed migration. Version `146` is a historical ledger alias/reconciliation marker for the same SQL.

### Rounds: `147`

- The source file was added before execution and was not edited between execution and commit.
- At 2026-07-06 17:04:08 UTC the session executed `supabase db query --linked --file supabase/migrations/147_rounds_v0.sql`; the command completed with exit code 0.
- At 2026-07-06 17:04:30 UTC it ran `supabase migration repair 147 --status applied --linked`; the command completed with exit code 0.
- Commit `90c1a165...` recorded the exact file at 2026-07-06 17:13:59 UTC.

Conclusion: the canonical `147` blob is both source-controlled history and the directly executed artifact.

### Print and round routing: `148`

- At 2026-07-06 22:41:12 UTC the session directly executed the file; exit code 0.
- At 22:41:38 UTC it repaired ledger version `148`; exit code 0.
- At 22:43:02 UTC it replaced the tenant settings update with its final idempotent JSON merge form, then directly reran the complete file at 22:43:07 UTC; exit code 0.
- Commit `4deba63a...` recorded that final form at 2026-07-06 22:52:14 UTC.

Conclusion: the recovered blob is the final, directly executed form. The ledger statement array reflects the earlier repair event and is not, by itself, a complete execution transcript.

### Facilities configuration: `20260707085234`

- The live ledger stores one 523-byte statement whose SHA-256 is `000262d09b6dd2c897bf5611fed93bfce42ab3894a1b2cbe402598d4ec5d6c0e`.
- In Git blob `b363d351...`, the SQL suffix beginning `UPDATE public.tenants` is exactly 523 bytes after terminal-newline trimming and has that same SHA-256. The additional bytes in the committed file are comments only.
- The ledger timestamp is 2026-07-07 08:52:34 UTC. Commit `ed232e7e...` recorded the source at 09:14:08 UTC, about 22 minutes later.

Conclusion: the committed `149` artifact exactly contains the executed statement. Only the filename was timestamp-normalized for active-ledger compatibility.

## Replay rule for the intake alias

Two replay modes must not be conflated:

1. **Historical execution replay:** execute the intake SQL once under version `20260706100734`, then record `146` as a ledger-only alias without executing its SQL. This most closely reproduces production history.
2. **Schema compatibility replay:** both exact files may be executed because the intake migration is structurally idempotent (`CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, and drop/recreate policies). This can prove repeatability, but it is not the literal production execution sequence and must be labelled as such.

The controlled staging replay should prefer historical execution replay and assert that the final schema and privilege graph match a separate schema-compatibility replay.

## Search coverage and negative evidence

The recovery search covered:

- all local heads, remote-tracking refs, tags, reflogs, reachable objects, unreachable commits, and unreachable objects;
- all current remote heads and tags after a non-destructive `git fetch --all --tags`;
- the separate `Mutqan A-demo-readiness-tonight` worktree;
- repository files, migration archive, Downloads, PowerShell history, Codex July session artifacts, and available Claude/Cursor history;
- the live migration ledger's version, name, statement count, statement length, and statement digest, read-only.

No separately committed files named `20260706100734_intake_foundation.sql` or `20260707085234_149_hospital_enable_facilities_locations.sql` were found. No alternative SQL blob for versions 146–149 was found after fetching all remote refs. The second worktree contains CRLF-expanded copies of versions 146–148; after LF normalization they hash exactly to the canonical Git blobs above.

The previously unfetched remote branch `origin/claude/locations-rounds-dropdown-odjo8v` was the decisive source for version 149. After fetching, `origin/main` also contains all four canonical commits.

## Reproducible evidence commands

```powershell
git ls-remote --heads --tags origin
git fetch --all --tags
git rev-list --objects --all | Select-String -Pattern 'supabase/migrations/(146_intake_foundation|147_rounds_v0|148_post_demo_print_and_round_routing|149_hospital_enable_facilities_locations)\.sql'
git log --all --date=iso --pretty=format:'%H %cd %d %s' --name-status -- supabase/migrations
git reflog --all --date=iso
git fsck --full --unreachable --no-reflogs
git hash-object -- supabase/migrations/146_intake_foundation.sql
git hash-object -- supabase/migrations/147_rounds_v0.sql
git hash-object -- supabase/migrations/148_post_demo_print_and_round_routing.sql
git hash-object -- supabase/migrations/20260706100734_intake_foundation.sql
git hash-object -- supabase/migrations/20260707085234_149_hospital_enable_facilities_locations.sql
Get-FileHash -Algorithm SHA256 -LiteralPath <recovered-file>
```

The read-only live queries used were limited to `information_schema.columns` for the migration table and rows from `supabase_migrations.schema_migrations` for the five named versions, including server-side SHA-256 digests of stored statements.
