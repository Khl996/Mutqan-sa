import { createClient } from 'jsr:@supabase/supabase-js@2'
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { email, otp, newPassword } = await req.json()

        if (!email || !otp || !newPassword) {
            throw new Error('Missing required fields')
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        // 1. Verify OTP
        const { data: otpData, error: otpError } = await supabaseAdmin
            .from('password_reset_otps')
            .select('*')
            .eq('email', email)
            .single()

        if (otpError || !otpData) {
            throw new Error('Invalid OTP or Token not found')
        }

        if (new Date(otpData.expires_at) < new Date()) {
            await supabaseAdmin.from('password_reset_otps').delete().eq('id', otpData.id)
            throw new Error('OTP Expired')
        }

        // Hash check if needed, but here assuming plain comparison for simplicity as per otpService logic
        // In otpService we stored it directly. In prod use hashing.
        if (otpData.otp_hash !== otp) {
            await supabaseAdmin.from('password_reset_otps').update({ attempts: (otpData.attempts || 0) + 1 }).eq('id', otpData.id)
            throw new Error('Invalid OTP')
        }

        // 2. Get User ID
        // We trust that profiles table has the correct email-id mapping
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single()

        if (profileError || !profile) {
            // Fallback: try to list users? Or just fail. 
            // If no profile, they shouldn't be resetting password usually? 
            // Or they might have deleted profile but kept auth? Unlikely in this app.
            throw new Error('User not found')
        }

        // 3. Update Password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            profile.id,
            { password: newPassword }
        )

        if (updateError) {
            console.error('Update Error:', updateError)
            throw new Error('Failed to update password')
        }

        // 4. Delete OTP
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
