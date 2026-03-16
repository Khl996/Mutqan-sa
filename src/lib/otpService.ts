import { supabase } from './supabase'

/**
 * OTP Service — SECURE VERSION
 * 
 * All OTP operations are handled server-side via Edge Functions.
 * The frontend NEVER touches the password_reset_otps table directly.
 * 
 * Flow:
 *   1. sendPasswordResetOTP() → calls 'send-otp' Edge Function
 *   2. ForgotPasswordPage submits → calls 'update-password' Edge Function
 */

interface OTPResponse {
    success: boolean
    message: string
    error?: string
}

/**
 * Send OTP via Edge Function (server-side generation + hashing + email)
 * The OTP is generated, hashed, and stored entirely on the server.
 * Only the raw OTP is sent via email — never exposed to the frontend.
 */
export async function sendPasswordResetOTP(email: string, isRTL: boolean = false): Promise<OTPResponse> {
    try {
        const { data, error } = await supabase.functions.invoke('send-otp', {
            body: { email, isRTL }
        })

        if (error) {
            console.error('Send OTP Edge Function error:', error)

            // Supabase functions may put the custom JSON body in error.context or error.message
            let errorMsg = error.message;
            if (error.context && typeof error.context.json === 'function') {
                try {
                    const errBody = await error.context.json();
                    if (errBody && errBody.error) errorMsg = errBody.error;
                } catch (e) {
                    // ignore
                }
            } else if (error.message && error.message.includes('{')) {
                try {
                    const parsed = JSON.parse(error.message.substring(error.message.indexOf('{')));
                    if (parsed.error) errorMsg = parsed.error;
                } catch (e) { }
            }

            // Check for rate limiting
            if (errorMsg?.includes('429') || errorMsg?.includes('wait') || error.message?.includes('429')) {
                return {
                    success: false,
                    message: isRTL
                        ? 'يرجى الانتظار 3 دقائق قبل طلب رمز جديد'
                        : 'Please wait 3 minutes before requesting a new code',
                    error: 'RATE_LIMITED'
                }
            }

            return {
                success: false,
                message: errorMsg || (isRTL ? 'فشل في إرسال رمز التحقق' : 'Failed to send OTP'),
                error: 'SEND_FAILED'
            }
        }

        // Edge function returns { success, message } or { error }
        if (data?.error) {
            if (data.error.includes('wait') || data.error.includes('تجاوزت') || data.error.includes('الانتظار')) {
                return {
                    success: false,
                    message: data.error,
                    error: 'RATE_LIMITED'
                }
            }
            return {
                success: false,
                message: data.error,
                error: 'SERVER_ERROR'
            }
        }

        return {
            success: true,
            message: data?.message || (isRTL
                ? 'تم إرسال رمز التحقق إلى بريدك الإلكتروني'
                : 'OTP sent to your email')
        }

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('OTP send error:', errorMessage)
        return {
            success: false,
            message: isRTL ? 'حدث خطأ أثناء الإرسال' : 'An error occurred while sending',
            error: errorMessage
        }
    }
}

// Note: verifyOTP is no longer needed in the frontend.
// The 'update-password' Edge Function handles OTP verification + password update
// in a single server-side call. See ForgotPasswordPage.tsx for usage.
