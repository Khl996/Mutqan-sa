-- =============================================================================
-- Migration: 143_seed_blackout_windows
-- Purpose:
--   Seed platform-wide (tenant_id IS NULL) pm_blackout_windows rows for Eid
--   al-Fitr and Eid al-Adha. Table/constraint/RLS created in migration 142;
--   this is pure reference data.
--
-- *** YEARLY-MAINTAINED FILE — READ BEFORE EDITING ***
--   1. This file seeds Eid windows ONLY. Ramadan is deliberately NOT seeded
--      as a 'skip' blackout window: 'skip' defers every due_date inside the
--      window to the first day after end_date, and a full month of deferred
--      PM is an operational/SLA risk. Ramadan needs 'reduce_frequency'
--      behavior, which the v1 CHECK constraint on pm_blackout_windows does
--      not yet allow (see migration 142, decision 4) — it will be seeded in
--      a future migration once that behavior is actually built, not before.
--   2. Dates below are sourced from the official Umm Al-Qura calendar
--      projection, not arithmetic extrapolation. When this file is extended
--      for a new Hijri year (e.g. 1450 AH / 2029), the new rows MUST be
--      pulled from the same authoritative source — do NOT estimate them by
--      adding ~354/355 days to the prior year's dates. Gregorian dates for
--      Hijri months drift independently of any fixed-offset formula.
--   3. Moon-sighting can still shift the actual start/end of Eid by a day in
--      either direction even against the Umm Al-Qura projection. The "span"
--      below intentionally pads a day on each side of the announced holiday
--      so a one-day sighting variance does not silently un-block PM
--      generation on the true holiday.
--   4. ON CONFLICT DO NOTHING makes this file safe to re-run; it does not
--      make it safe to skip review when adding new years — review new rows
--      against the source before applying.
-- =============================================================================

INSERT INTO public.pm_blackout_windows (tenant_id, label, start_date, end_date, behavior)
VALUES
    (NULL, 'Eid al-Fitr 1448', '2027-03-08', '2027-03-12', 'skip'),
    (NULL, 'Eid al-Adha 1448', '2027-05-15', '2027-05-19', 'skip'),
    (NULL, 'Eid al-Fitr 1449', '2028-02-25', '2028-03-01', 'skip'),
    (NULL, 'Eid al-Adha 1449', '2028-05-04', '2028-05-08', 'skip')
ON CONFLICT DO NOTHING;
