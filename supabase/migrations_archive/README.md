# Archived migrations (historical)

These are the original incremental migrations `001` … `130` (plus a few
`smoke_test_*` helper scripts) that built the production database over time.

They have been **superseded** by a single authoritative baseline:

    supabase/migrations/00000000000000_baseline.sql

The baseline was extracted faithfully from the production database and
verified to reproduce it exactly (tables, columns, constraints, indexes,
functions, triggers, views, RLS policies, grants, comments).

## Why these were archived (not deleted)

- The historical ledger had diverged from production: many files (005–118)
  were applied but missing from `supabase_migrations.schema_migrations`,
  some objects existed in production with no source file, and there were
  duplicate version numbers.
- A clean single-file baseline is required to build the database from
  scratch with one command and to ship/sell the schema as a clean asset.

These files are retained **for historical reference only**. Do not apply
them on top of the baseline. New changes should be added as new, properly
versioned migrations after the baseline.
