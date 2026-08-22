-- THROWAWAY ISOLATED-REPLAY FIXTURE. Never apply this file to production.
--
-- Migrations 139, 148, and 149 target a tenant that was live business data,
-- not migration-owned seed data. A schema-only baseline therefore cannot
-- replay their data-scoped statements without first representing that external
-- prerequisite. Only the historically referenced UUID and name are retained;
-- the slug is deliberately labelled as a replay fixture and is not asserted as
-- recovered historical tenant data.

\set ON_ERROR_STOP on

INSERT INTO public.tenants (id, name, name_ar, slug)
VALUES (
    '3b0ed0d9-caeb-4bb9-8312-8ce9a92b120a',
    'Eradah Qurayaat replay fixture',
    'مستشفى الصحة النفسية بالقريات',
    'replay-eradah-qurayaat'
)
ON CONFLICT (id) DO NOTHING;
