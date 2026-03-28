-- ==============================================================================
-- Migration: 091_secure_notification_delivery_and_audit_logs.sql
-- Purpose:
--   1) Remove hardcoded notification delivery credentials from DB code
--   2) Tighten platform_audit_logs insert policy
--   3) Auto-populate actor fields on platform audit log inserts
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS internal;

REVOKE ALL ON SCHEMA internal FROM PUBLIC;
REVOKE ALL ON SCHEMA internal FROM anon;
REVOKE ALL ON SCHEMA internal FROM authenticated;

CREATE TABLE IF NOT EXISTS internal.runtime_secrets (
    name TEXT PRIMARY KEY,
    secret_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE internal.runtime_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE internal.runtime_secrets FROM PUBLIC;
REVOKE ALL ON TABLE internal.runtime_secrets FROM anon;
REVOKE ALL ON TABLE internal.runtime_secrets FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_runtime_secret(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal
AS $$
DECLARE
    v_value TEXT;
BEGIN
    SELECT rs.secret_value
      INTO v_value
      FROM internal.runtime_secrets rs
     WHERE rs.name = p_name
     LIMIT 1;

    IF v_value IS NOT NULL THEN
        RETURN v_value;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vault') THEN
        EXECUTE format(
            'SELECT decrypted_secret
               FROM vault.decrypted_secrets
              WHERE name = %L
              ORDER BY created_at DESC
              LIMIT 1',
            p_name
        )
        INTO v_value;
    END IF;

    RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_email_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_email TEXT;
    v_resend_body JSONB;
    v_function_url TEXT := public.get_runtime_secret('app.resend_email_url');
    v_shared_secret TEXT := public.get_runtime_secret('app.resend_email_secret');
    v_headers JSONB := jsonb_build_object(
        'Content-Type', 'application/json'
    );
BEGIN
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = NEW.user_id;

    IF v_user_email IS NULL THEN
        RETURN NEW;
    END IF;

    v_resend_body := jsonb_build_object(
        'to', v_user_email,
        'type', 'notification',
        'title', NEW.title,
        'message', NEW.message,
        'link', NEW.link
    );

    IF v_function_url IS NULL THEN
        RAISE NOTICE 'Runtime secret app.resend_email_url is not configured; skipping notification email for notification %', NEW.id;
        RETURN NEW;
    END IF;

    IF v_shared_secret IS NOT NULL THEN
        v_headers := v_headers || jsonb_build_object(
            'x-internal-email-secret', v_shared_secret
        );
    END IF;

    PERFORM net.http_post(
        url := v_function_url,
        headers := v_headers,
        body := v_resend_body
    );

    RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.platform_audit_logs;
DROP POLICY IF EXISTS "Platform admins can insert audit logs" ON public.platform_audit_logs;

CREATE POLICY "Platform admins can insert audit logs"
ON public.platform_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (p.is_super_admin = TRUE OR p.role LIKE 'platform_%')
    )
);

CREATE OR REPLACE FUNCTION public.populate_platform_audit_log_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
BEGIN
    SELECT *
      INTO v_actor
      FROM public.profiles
     WHERE id = auth.uid();

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    NEW.user_id := COALESCE(NEW.user_id, v_actor.id);
    NEW.user_email := COALESCE(NULLIF(NEW.user_email, ''), v_actor.email);
    NEW.user_name := COALESCE(NULLIF(NEW.user_name, ''), v_actor.full_name, v_actor.email);
    NEW.user_role := COALESCE(NULLIF(NEW.user_role, ''), v_actor.role);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_populate_platform_audit_log_actor ON public.platform_audit_logs;

CREATE TRIGGER trg_populate_platform_audit_log_actor
BEFORE INSERT ON public.platform_audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.populate_platform_audit_log_actor();
