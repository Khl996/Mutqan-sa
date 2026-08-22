-- =====================================================
-- Migration: 079_otp_security.sql
-- Purpose: Lock down password_reset_otps table
--          Remove public access, restrict to service_role only
-- =====================================================

-- 1. Drop the permissive policy that lets anyone read/write OTPs
DROP POLICY IF EXISTS "Allow all for now" ON password_reset_otps;

-- 2. Create strict policies: NO access for authenticated or anon
-- Only service_role (Edge Functions using SUPABASE_SERVICE_ROLE_KEY) can access
-- service_role bypasses RLS by default, so we just need to block everyone else

-- No SELECT for anyone
CREATE POLICY "Deny all select" ON password_reset_otps
    FOR SELECT TO authenticated, anon
    USING (false);

-- No INSERT for anyone
CREATE POLICY "Deny all insert" ON password_reset_otps
    FOR INSERT TO authenticated, anon
    WITH CHECK (false);

-- No UPDATE for anyone
CREATE POLICY "Deny all update" ON password_reset_otps
    FOR UPDATE TO authenticated, anon
    USING (false)
    WITH CHECK (false);

-- No DELETE for anyone  
CREATE POLICY "Deny all delete" ON password_reset_otps
    FOR DELETE TO authenticated, anon
    USING (false);

-- 3. Update the otp_hash column to support real hashes (SHA-256 = 64 chars hex)
ALTER TABLE password_reset_otps ALTER COLUMN otp_hash TYPE VARCHAR(128);

-- 4. Add rate limiting column
ALTER TABLE password_reset_otps ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON TABLE password_reset_otps IS 
'OTP codes for password reset. ACCESS RESTRICTED TO service_role ONLY.
Frontend must use Edge Functions (send-otp, update-password) — never direct access.';
