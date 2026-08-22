-- THROWAWAY LOCAL HARNESS ONLY. Never apply this file to Supabase.
--
-- verify/local_stubs.sql is an exact recovered historical artifact and is kept
-- byte-for-byte unchanged. This companion adds only the Supabase-managed
-- objects and request-context behavior needed for PG17 migration replay and
-- adversarial fixtures.

\set ON_ERROR_STOP on

ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
    SELECT NULLIF(
        pg_catalog.current_setting('request.jwt.claim.sub', true),
        ''
    )::uuid;
$function$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
    SELECT NULLIF(
        pg_catalog.current_setting('request.jwt.claim.role', true),
        ''
    );
$function$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
    SELECT NULLIF(
        pg_catalog.current_setting('request.jwt.claim.email', true),
        ''
    );
$function$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
    SELECT COALESCE(
        NULLIF(
            pg_catalog.current_setting('request.jwt.claims', true),
            ''
        )::jsonb,
        pg_catalog.jsonb_strip_nulls(
            pg_catalog.jsonb_build_object(
                'sub', NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
                'role', NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
                'email', NULLIF(pg_catalog.current_setting('request.jwt.claim.email', true), '')
            )
        )
    );
$function$;

CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION postgres;

CREATE TABLE IF NOT EXISTS storage.buckets (
    id text PRIMARY KEY,
    name text NOT NULL UNIQUE,
    public boolean NOT NULL DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
    id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    bucket_id text NOT NULL REFERENCES storage.buckets(id),
    name text NOT NULL,
    owner uuid,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
    SELECT pg_catalog.string_to_array(name, '/');
$function$;

GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.email(), auth.jwt()
    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text)
    TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects
    TO anon, authenticated, service_role;
