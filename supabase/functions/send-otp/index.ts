import { createClient } from 'jsr:@supabase/supabase-js@2'
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Generate a 6-digit OTP
function generateOTP(): string {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    return (100000 + (array[0] % 900000)).toString()
}

// Hash OTP using SHA-256
async function hashOTP(otp: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(otp)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { email, isRTL = false } = await req.json()

        if (!email) {
            return new Response(JSON.stringify({ error: 'Email is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        if (!RESEND_API_KEY) {
            throw new Error('Missing RESEND_API_KEY')
        }

        // Create admin client (service_role bypasses RLS)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        // =====================================================
        // RATE LIMITING: Max 3 OTP requests per hour per email
        // =====================================================
        const { data: existingOTP } = await supabaseAdmin
            .from('password_reset_otps')
            .select('id, last_sent_at, created_at')
            .eq('email', email)
            .single()

        if (existingOTP && existingOTP.last_sent_at) {
            const lastSent = new Date(existingOTP.last_sent_at)
            const minutesSinceLastSent = (Date.now() - lastSent.getTime()) / (1000 * 60)

            // Don't allow more than 1 OTP per 2 minutes
            if (minutesSinceLastSent < 2) {
                return new Response(JSON.stringify({
                    error: isRTL
                        ? 'يرجى الانتظار دقيقتين قبل طلب رمز جديد'
                        : 'Please wait 2 minutes before requesting a new code'
                }), {
                    status: 429,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }
        }

        // =====================================================
        // GENERATE & HASH OTP
        // =====================================================
        const otp = generateOTP()
        const otpHash = await hashOTP(otp)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

        // Delete any existing OTPs for this email
        await supabaseAdmin
            .from('password_reset_otps')
            .delete()
            .eq('email', email)

        // Insert new OTP with HASH only (never store raw OTP)
        const { error: insertError } = await supabaseAdmin
            .from('password_reset_otps')
            .insert({
                email,
                otp_hash: otpHash,
                expires_at: expiresAt.toISOString(),
                attempts: 0,
                last_sent_at: new Date().toISOString(),
            })

        if (insertError) {
            console.error('Insert OTP error:', insertError)
            throw new Error('Failed to store OTP')
        }

        // =====================================================
        // SEND EMAIL via Resend
        // =====================================================
        const emailHtml = `
            <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; direction: ${isRTL ? 'rtl' : 'ltr'};">
                <div style="background: linear-gradient(135deg, #0d466c 0%, #1e7a3e 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 28px;">
                        ${isRTL ? 'متقن' : 'Mutqan'}
                    </h1>
                </div>
                <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 12px 12px;">
                    <h2 style="color: #0d466c; margin-top: 0;">
                        ${isRTL ? 'رمز التحقق لتغيير كلمة المرور' : 'Password Reset Verification Code'}
                    </h2>
                    <p style="color: #666; font-size: 16px;">
                        ${isRTL
                ? 'استخدم الرمز التالي لتغيير كلمة المرور الخاصة بك. هذا الرمز صالح لمدة 10 دقائق.'
                : 'Use the following code to reset your password. This code is valid for 10 minutes.'}
                    </p>
                    <div style="background: white; border: 2px dashed #1e7a3e; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0d466c;">
                            ${otp}
                        </span>
                    </div>
                    <p style="color: #999; font-size: 14px;">
                        ${isRTL
                ? 'إذا لم تطلب تغيير كلمة المرور، يرجى تجاهل هذا البريد.'
                : 'If you did not request a password reset, please ignore this email.'}
                    </p>
                </div>
                <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
                    © ${new Date().getFullYear()} Mutqan. ${isRTL ? 'جميع الحقوق محفوظة' : 'All rights reserved.'}
                </p>
            </div>
        `

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: 'Mutqan <noreply@facility-management.space>',
                to: email,
                subject: isRTL ? 'رمز التحقق لتغيير كلمة المرور - متقن' : 'Password Reset OTP - Mutqan',
                html: emailHtml,
            }),
        })

        if (!emailRes.ok) {
            const emailError = await emailRes.json()
            console.error('Resend error:', emailError)
            throw new Error('Failed to send email')
        }

        return new Response(JSON.stringify({
            success: true,
            message: isRTL
                ? 'تم إرسال رمز التحقق إلى بريدك الإلكتروني'
                : 'OTP sent to your email'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        console.error('Send OTP Error:', error)
        return new Response(JSON.stringify({
            error: error.message || 'Failed to send OTP'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
