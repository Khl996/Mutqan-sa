-- =============================================
-- Email Notification System via Edge Function
-- =============================================

-- 1. Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create function to call send-email Edge Function
CREATE OR REPLACE FUNCTION send_email_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_email TEXT;
    v_resend_body JSONB;
    v_html_content TEXT;
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

    -- Call Edge Function using pg_net
    PERFORM net.http_post(
        url := 'https://mzpohntjotgeeaukwnbz.supabase.co/functions/v1/resend-email',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16cG9obnRqb3RnZWVhdWt3bmJ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk3NDIzOCwiZXhwIjoyMDgzNTUwMjM4fQ.Cujn087lgKCXXVimY2B5gcr8hhS50ArzX3ij2utLrFA'
        ),
        body := v_resend_body
    );

    RETURN NEW;
END;
$$;

-- 3. Create Trigger
DROP TRIGGER IF EXISTS trg_send_email_on_notification ON notifications;

CREATE TRIGGER trg_send_email_on_notification
    AFTER INSERT ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION send_email_notification();
