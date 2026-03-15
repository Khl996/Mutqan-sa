import { createClient } from 'jsr:@supabase/supabase-js@2'
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Hash OTP using SHA-256 (must match send-otp function)
async function hashOTP(otp: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(otp)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

const MAX_ATTEMPTS = 5

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { email, otp, newPassword } = await req.json()

        if (!email || !otp || !newPassword) {
            throw new Error('Missing required fields')
        }

        if (newPassword.length < 6) {
            throw new Error('Password must be at least 6 characters')
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        // 1. Find OTP record
        const { data: otpData, error: otpError } = await supabaseAdmin
            .from('password_reset_otps')
            .select('id, otp_hash, expires_at, attempts')
            .eq('email', email)
            .single()

        if (otpError || !otpData) {
            throw new Error('No OTP found. Please request a new one.')
        }

        // 2. Check expiry
        if (new Date(otpData.expires_at) < new Date()) {
            await supabaseAdmin.from('password_reset_otps').delete().eq('id', otpData.id)
            throw new Error('OTP expired. Please request a new one.')
        }

        // 3. Check max attempts
        if (otpData.attempts >= MAX_ATTEMPTS) {
            await supabaseAdmin.from('password_reset_otps').delete().eq('id', otpData.id)
            throw new Error('Too many attempts. Please request a new OTP.')
        }

        // 4. Verify OTP by comparing HASH (never compare raw)
        const inputHash = await hashOTP(otp)

        if (otpData.otp_hash !== inputHash) {
            // Increment attempts
            await supabaseAdmin
                .from('password_reset_otps')
                .update({ attempts: (otpData.attempts || 0) + 1 })
                .eq('id', otpData.id)

            const remaining = MAX_ATTEMPTS - (otpData.attempts + 1)
            throw new Error(`Invalid OTP. ${remaining} attempts remaining.`)
        }

        // 5. Get User ID from profiles
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single()

        if (profileError || !profile) {
            throw new Error('User not found')
        }

        // 6. Update Password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            profile.id,
            { password: newPassword }
        )

        if (updateError) {
            console.error('Update Error:', updateError)
            throw new Error('Failed to update password')
        }

        // 7. Delete OTP after successful reset
        await supabaseAdmin.from('password_reset_otps').delete().eq('id', otpData.id)

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        console.error('Reset Password Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
