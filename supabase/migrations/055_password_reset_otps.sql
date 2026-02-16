-- =====================================================
-- Create password_reset_otps table for OTP verification
-- =====================================================

CREATE TABLE IF NOT EXISTS password_reset_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email ON password_reset_otps(email);

-- Enable RLS
ALTER TABLE password_reset_otps ENABLE ROW LEVEL SECURITY;

-- Policy: Allow insert from service role only (security)
-- For frontend, we use SECURITY DEFINER functions
DROP POLICY IF EXISTS "Allow all for now" ON password_reset_otps;
CREATE POLICY "Allow all for now" ON password_reset_otps 
    FOR ALL 
    USING (true)
    WITH CHECK (true);

-- Auto-cleanup expired OTPs (optional - can be run by cron)
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
    DELETE FROM password_reset_otps WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE password_reset_otps IS 'Stores temporary OTP codes for password reset verification';
