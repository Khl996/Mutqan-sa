-- =====================================================================
-- LOCAL VERIFICATION STUBS  —  THROWAWAY SCAFFOLDING, NOT FOR PRODUCTION
-- ---------------------------------------------------------------------
-- The baseline migration (supabase/migrations/00000000000000_baseline.sql)
-- is Supabase-native: it assumes Supabase-managed roles, schemas, the
-- auth.users table, and the auth.*() helper functions already exist.
--
-- This file recreates just enough of that environment on a PLAIN
-- PostgreSQL instance so the baseline can be applied and its resulting
-- public schema diffed against production. It is used ONLY by the local
-- verification harness and must never be shipped or applied to a real
-- Supabase project.
--
-- Apply order for local verification:
--   1) this file (local_stubs.sql)
--   2) the baseline (with platform-only CREATE EXTENSION lines neutralised
--      by the harness: pg_net, supabase_vault, pg_stat_statements — none of
--      which create objects in the public schema)
-- =====================================================================

-- ---- Supabase-managed roles (referenced by GRANT statements) ----
DO $$ BEGIN CREATE ROLE anon          NOLOGIN NOINHERIT;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role  NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- Supabase-managed schemas ----
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

-- ---- Extensions that ARE available on plain PostgreSQL (contrib) ----
-- Provide uuid_generate_v4() and gen_random_bytes() used by table defaults.
-- The baseline re-declares these with "IF NOT EXISTS", so it will skip them.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto   WITH SCHEMA extensions;

-- Resolve unqualified default expressions (uuid_generate_v4(), gen_random_bytes())
-- during baseline apply. Role-level so it is database-agnostic.
ALTER ROLE postgres SET search_path = public, extensions;

-- ---- Minimal auth.users (only id is needed by foreign keys) ----
CREATE TABLE IF NOT EXISTS auth.users (
    id    uuid PRIMARY KEY,
    email text
);

-- ---- Supabase auth helper functions used by policies/functions ----
-- Bodies are inert; we only need them to exist so policy/function DDL parses.
CREATE OR REPLACE FUNCTION auth.uid()   RETURNS uuid  LANGUAGE sql STABLE AS $$ SELECT NULL::uuid  $$;
CREATE OR REPLACE FUNCTION auth.role()  RETURNS text  LANGUAGE sql STABLE AS $$ SELECT NULL::text  $$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text  LANGUAGE sql STABLE AS $$ SELECT NULL::text  $$;
CREATE OR REPLACE FUNCTION auth.jwt()   RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
