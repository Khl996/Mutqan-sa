import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Mail, Lock, Loader2, ArrowLeft, ArrowRight, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendPasswordResetOTP } from '@/lib/otpService'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const isRTL = i18n.language === 'ar'

    const [step, setStep] = useState<1 | 2>(1)
    const [email, setEmail] = useState('')
    const [otp, setOtp] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    // Step 1: Send OTP
    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email) {
            toast.error(t('validation.required'))
            return
        }

        setIsLoading(true)
        try {
            const response = await sendPasswordResetOTP(email, isRTL)
            if (response.success) {
                toast.success(response.message)
                setStep(2)
            } else {
                toast.error(response.message || response.error)
            }
        } catch (error) {
            toast.error(isRTL ? 'حدث خطأ غير متوقع' : 'Unexpected error')
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    // Step 2: Verify & Update
    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!otp || !newPassword || !confirmPassword) {
            toast.error(t('validation.required'))
            return
        }

        if (newPassword !== confirmPassword) {
            toast.error(isRTL ? 'كلمات المرور غير متطابقة' : 'Passwords do not match')
            return
        }

        if (newPassword.length < 10) {
            toast.error(isRTL ? 'كلمة المرور يجب أن تكون 10 أحرف على الأقل' : 'Password must be at least 10 characters')
            return
        }

        setIsLoading(true)
        try {
            // Call Edge Function 'update-password'
            const { error } = await supabase.functions.invoke('update-password', {
                body: {
                    email,
                    otp,
                    newPassword
                }
            })

            if (error) {
                // Parse error message
                let msg = error.message
                try {
                    // Sometimes edge function returns stringified error in body?
                    // But invoke usually throws error object or returns data/error
                    // If function returns status 400, invoke returns error
                    // error.message might be 'Edge Function returned a non-2xx status code'
                    // We need to check exact context usually.
                    // But here we rely on standard error catching
                    if (msg.includes('Invalid OTP')) msg = isRTL ? 'رمز التحقق غير صحيح أو منتهي' : 'Invalid or expired OTP'
                    else msg = isRTL ? 'فشل تحديث كلمة المرور' : 'Failed to update password'
                } catch { /* JSON parsing may fail, use original msg */ }
                toast.error(msg)
                console.error(error)
            } else {
                toast.success(isRTL ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully')
                navigate('/login')
            }
        } catch (error: any) {
            toast.error(isRTL ? 'حدث خطأ أثناء التحديث' : 'Update failed')
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="w-full">
            {/* Mobile Logo */}
            <div className="md:hidden flex flex-col items-center mb-8">
                <img
                    src="/images/logo-white.png"
                    alt="Mutqan"
                    className="w-24 h-auto object-contain mb-4 drop-shadow-md"
                />
            </div>

            {/* Card */}
            <div className="bg-white/95 backdrop-blur-[6px] rounded-2xl shadow-xl shadow-slate-900/5 p-8 lg:p-10 border border-white/50">
                {/* Header */}
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-[#1A202C] font-cairo mb-3">
                        {step === 1
                            ? (isRTL ? 'نسيت كلمة المرور؟' : 'Forgot Password?')
                            : (isRTL ? 'تغيير كلمة المرور' : 'Reset Password')
                        }
                    </h2>
                    <p className="text-[#6C7A86] font-cairo text-base">
                        {step === 1
                            ? (isRTL ? 'أدخل بريدك الإلكتروني لاستلام رمز التحقق' : 'Enter your email to receive verification code')
                            : (isRTL ? 'أدخل الرمز المرسل وكلمة المرور الجديدة' : 'Enter the code and your new password')
                        }
                    </p>
                </div>

                {/* Form Step 1 */}
                {step === 1 && (
                    <form onSubmit={handleSendOTP} className="space-y-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-[#1A202C] font-cairo">
                                {t('auth.email')}
                            </label>
                            <div className="relative group">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@company.com"
                                    className={cn(
                                        'w-full h-12 bg-white border border-[#E9EEF1] rounded-xl text-[#1A202C] placeholder-[#A0AEC0] font-cairo transition-all duration-200',
                                        'focus:border-[#3AAFA9] focus:ring-4 focus:ring-[#3AAFA9]/10 outline-none',
                                        isRTL ? 'pr-11 pl-4' : 'pl-11 pr-4'
                                    )}
                                    dir="ltr"
                                    required
                                />
                                <Mail className={cn(
                                    'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-[#A0AEC0] group-focus-within:text-[#3AAFA9] transition-colors',
                                    isRTL ? 'right-4' : 'left-4'
                                )} />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={cn(
                                'w-full h-12 rounded-xl font-bold text-white font-cairo text-base shadow-lg shadow-[#3AAFA9]/20',
                                'bg-[#3AAFA9] hover:bg-[#2B8C87] transition-all duration-200',
                                'flex items-center justify-center gap-2',
                                'disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-[0.99]'
                            )}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>{isRTL ? 'جاري الإرسال...' : 'Sending...'}</span>
                                </>
                            ) : (
                                <span>{isRTL ? 'إرسال رمز التحقق' : 'Send Code'}</span>
                            )}
                        </button>
                    </form>
                )}

                {/* Form Step 2 */}
                {step === 2 && (
                    <form onSubmit={handleUpdatePassword} className="space-y-6">
                        {/* OTP */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-[#1A202C] font-cairo">
                                {isRTL ? 'رمز التحقق' : 'Verification Code'}
                            </label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    placeholder="123456"
                                    className={cn(
                                        'w-full h-12 bg-white border border-[#E9EEF1] rounded-xl text-[#1A202C] placeholder-[#A0AEC0] font-cairo transition-all duration-200',
                                        'focus:border-[#3AAFA9] focus:ring-4 focus:ring-[#3AAFA9]/10 outline-none',
                                        isRTL ? 'pr-11 pl-4' : 'pl-11 pr-4',
                                        'text-center text-lg tracking-widest'
                                    )}
                                    dir="ltr"
                                    required
                                />
                                <KeyRound className={cn(
                                    'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-[#A0AEC0] group-focus-within:text-[#3AAFA9] transition-colors',
                                    isRTL ? 'right-4' : 'left-4'
                                )} />
                            </div>
                        </div>

                        {/* New Password */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-[#1A202C] font-cairo">
                                {isRTL ? 'كلمة المرور الجديدة' : 'New Password'}
                            </label>
                            <div className="relative group">
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className={cn(
                                        'w-full h-12 bg-white border border-[#E9EEF1] rounded-xl text-[#1A202C] placeholder-[#A0AEC0] font-cairo transition-all duration-200',
                                        'focus:border-[#3AAFA9] focus:ring-4 focus:ring-[#3AAFA9]/10 outline-none',
                                        isRTL ? 'pr-11 pl-4' : 'pl-11 pr-4'
                                    )}
                                    dir="ltr"
                                    required
                                />
                                <Lock className={cn(
                                    'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-[#A0AEC0] group-focus-within:text-[#3AAFA9] transition-colors',
                                    isRTL ? 'right-4' : 'left-4'
                                )} />
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-[#1A202C] font-cairo">
                                {isRTL ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                            </label>
                            <div className="relative group">
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className={cn(
                                        'w-full h-12 bg-white border border-[#E9EEF1] rounded-xl text-[#1A202C] placeholder-[#A0AEC0] font-cairo transition-all duration-200',
                                        'focus:border-[#3AAFA9] focus:ring-4 focus:ring-[#3AAFA9]/10 outline-none',
                                        isRTL ? 'pr-11 pl-4' : 'pl-11 pr-4'
                                    )}
                                    dir="ltr"
                                    required
                                />
                                <Lock className={cn(
                                    'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-[#A0AEC0] group-focus-within:text-[#3AAFA9] transition-colors',
                                    isRTL ? 'right-4' : 'left-4'
                                )} />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={cn(
                                'w-full h-12 rounded-xl font-bold text-white font-cairo text-base shadow-lg shadow-[#3AAFA9]/20',
                                'bg-[#3AAFA9] hover:bg-[#2B8C87] transition-all duration-200',
                                'flex items-center justify-center gap-2',
                                'disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-[0.99]'
                            )}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>{isRTL ? 'جاري التحديث...' : 'Updating...'}</span>
                                </>
                            ) : (
                                <span>{isRTL ? 'تغيير كلمة المرور' : 'Reset Password'}</span>
                            )}
                        </button>
                    </form>
                )}

                {/* Back Link */}
                <div className="mt-8 text-center pt-6 border-t border-[#E9EEF1]">
                    <button
                        onClick={() => step === 2 ? setStep(1) : navigate('/login')}
                        className="text-sm font-medium text-[#6C7A86] hover:text-[#3AAFA9] transition-colors font-cairo flex items-center justify-center gap-2 mx-auto"
                    >
                        {isRTL ? (
                            <>
                                <ArrowRight className="w-4 h-4" />
                                <span>{step === 2 ? 'العودة للخلف' : 'العودة لتسجيل الدخول'}</span>
                            </>
                        ) : (
                            <>
                                <ArrowLeft className="w-4 h-4" />
                                <span>{step === 2 ? 'Go Back' : 'Back to Login'}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Footer */}
            <p className="mt-8 text-center text-sm text-white/80 font-cairo text-shadow-sm md:hidden">
                © {new Date().getFullYear()} {t('app.name')}. {isRTL ? 'جميع الحقوق محفوظة' : 'All rights reserved'}
            </p>
        </div>
    )
}
