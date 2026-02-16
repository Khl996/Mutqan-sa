import { supabase } from './supabase'



interface OTPResponse {
    success: boolean
    message: string
    error?: string
}

// Generate a 6-digit OTP
function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

// Store OTP in database (with expiry)
async function storeOTP(email: string, otp: string): Promise<boolean> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry

    // Delete any existing OTPs for this email
    await supabase
        .from('password_reset_otps')
        .delete()
        .eq('email', email)

    // Insert new OTP
    const { error } = await supabase
        .from('password_reset_otps')
        .insert({
            email,
            otp_hash: otp, // In production, hash this!
            expires_at: expiresAt.toISOString(),
            attempts: 0
        })

    return !error
}

// Verify OTP from database
export async function verifyOTP(email: string, otp: string): Promise<OTPResponse> {
    const { data, error } = await supabase
        .from('password_reset_otps')
        .select('*')
        .eq('email', email)
        .single()

    if (error || !data) {
        return { success: false, message: 'No OTP found. Please request a new one.', error: 'NOT_FOUND' }
    }

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
        await supabase.from('password_reset_otps').delete().eq('email', email)
        return { success: false, message: 'OTP expired. Please request a new one.', error: 'EXPIRED' }
    }

    // Check attempts (max 5)
    if (data.attempts >= 5) {
        await supabase.from('password_reset_otps').delete().eq('email', email)
        return { success: false, message: 'Too many attempts. Please request a new OTP.', error: 'MAX_ATTEMPTS' }
    }

    // Verify OTP
    if (data.otp_hash !== otp) {
        await supabase
            .from('password_reset_otps')
            .update({ attempts: data.attempts + 1 })
            .eq('email', email)
        return { success: false, message: 'Invalid OTP. Please try again.', error: 'INVALID' }
    }

    // Success - delete OTP
    await supabase.from('password_reset_otps').delete().eq('email', email)
    return { success: true, message: 'OTP verified successfully' }
}

// Send OTP via Supabase Edge Function (Resend)
export async function sendPasswordResetOTP(email: string, isRTL: boolean = false): Promise<OTPResponse> {
    const otp = generateOTP()

    // Store OTP first
    const stored = await storeOTP(email, otp)
    if (!stored) {
        return {
            success: false,
            message: isRTL ? 'فشل في حفظ رمز التحقق' : 'Failed to store OTP',
            error: 'STORE_FAILED'
        }
    }

    // Send email via Edge Function
    try {
        const { error } = await supabase.functions.invoke('resend-email', {
            body: {
                to: email,
                subject: isRTL ? 'رمز التحقق لتغيير كلمة المرور - متقن' : 'Password Reset OTP - Mutqan',
                html: `
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
                            © 2024 Mutqan. ${isRTL ? 'جميع الحقوق محفوظة' : 'All rights reserved.'}
                        </p>
                    </div>
                `
            }
        })

        if (error) {
            console.error('Edge Function error:', error)
            return {
                success: false,
                message: isRTL ? 'فشل في إرسال البريد الإلكتروني' : 'Failed to send email',
                error: error.message || 'SEND_FAILED'
            }
        }

        return {
            success: true,
            message: isRTL ? 'تم إرسال رمز التحقق إلى بريدك الإلكتروني' : 'OTP sent to your email'
        }
    } catch (error: any) {
        console.error('Email send error:', error)
        return {
            success: false,
            message: isRTL ? 'حدث خطأ أثناء الإرسال' : 'An error occurred while sending',
            error: error.message || 'NETWORK_ERROR'
        }
    }
}
