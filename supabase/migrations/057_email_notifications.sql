-- =============================================
-- Email Notification System via Edge Function
-- =============================================

-- 1. Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;
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

-- 2. Create function to call send-email Edge Function
--    Secrets are read from internal.runtime_secrets using these names:
--      app.resend_email_url
--      app.resend_email_secret
CREATE OR REPLACE FUNCTION public.get_runtime_secret(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, internal
AS $$
    SELECT rs.secret_value
    FROM internal.runtime_secrets rs
    WHERE rs.name = p_name
    LIMIT 1;
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
    -- Get user email
    SELECT email INTO v_user_email FROM auth.users WHERE id = NEW.user_id;

    -- Basic validation
    IF v_user_email IS NULL THEN
        RETURN NEW; -- No email found, skip
    END IF;

    -- Prepare request body for Edge Function
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

    -- Call Edge Function using pg_net
    PERFORM net.http_post(
        url := v_function_url,
        headers := v_headers,
        body := v_resend_body
    );

    RETURN NEW;
END;
$$;

-- 3. Create Trigger
DROP TRIGGER IF EXISTS trg_send_email_on_notification ON public.notifications;

CREATE TRIGGER trg_send_email_on_notification
    AFTER INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.send_email_notification();
