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

            // Check for rate limiting
            if (error.message?.includes('429') || error.message?.includes('wait')) {
                return {
                    success: false,
                    message: isRTL
                        ? 'يرجى الانتظار قبل طلب رمز جديد'
                        : 'Please wait before requesting a new code',
                    error: 'RATE_LIMITED'
                }
            }

            return {
                success: false,
                message: isRTL ? 'فشل في إرسال رمز التحقق' : 'Failed to send OTP',
                error: error.message || 'SEND_FAILED'
            }
        }

        // Edge function returns { success, message } or { error }
        if (data?.error) {
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
