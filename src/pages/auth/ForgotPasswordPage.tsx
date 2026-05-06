import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Mail, Lock, Loader2, ArrowLeft, ArrowRight, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendPasswordResetOTP } from '@/lib/otpService'
import { supabase } from '@/lib/supabase'
import { MutqanLogo } from '@/components/ui/MutqanLogo'

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
            toast.error(t('authPages.forgot.errors.unexpected'))
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
            toast.error(t('authPages.forgot.errors.passwordMismatch'))
            return
        }

        if (newPassword.length < 10) {
            toast.error(t('authPages.forgot.errors.passwordMin'))
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
                    if (msg.includes('Invalid OTP')) msg = t('authPages.forgot.errors.otpInvalid')
                    else msg = t('authPages.forgot.errors.updateFailed')
                } catch { /* JSON parsing may fail, use original msg */ }
                toast.error(msg)
                console.error(error)
            } else {
                toast.success(t('authPages.forgot.success.passwordChanged'))
                navigate('/login')
            }
        } catch (error: any) {
            toast.error(t('authPages.forgot.errors.updateError'))
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="w-full">
            {/* Mobile Logo */}
            <div className="md:hidden flex flex-col items-center mb-8">
                <MutqanLogo
                    variant="symbol"
                    size="lg"
                    theme="dark"
                    label={t('authPages.mobileLogoAlt')}
                    className="mb-4 drop-shadow-md"
                />
            </div>

            {/* Card */}
            <div className="bg-white/95 backdrop-blur-[6px] rounded-2xl shadow-xl shadow-slate-900/5 p-8 lg:p-10 border border-white/50">
                {/* Header */}
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-[#1A202C] font-cairo mb-3">
                        {step === 1
                            ? t('authPages.forgot.title')
                            : t('authPages.forgot.resetTitle')
                        }
                    </h2>
                    <p className="text-[#6C7A86] font-cairo text-base">
                        {step === 1
                            ? t('authPages.forgot.description')
                            : t('authPages.forgot.resetDescription')
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
                                    <span>{t('authPages.forgot.sending')}</span>
                                </>
                            ) : (
                                <span>{t('authPages.forgot.sendCode')}</span>
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
                                {t('authPages.forgot.verificationCode')}
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
                                {t('authPages.forgot.newPassword')}
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
                                {t('authPages.forgot.confirmPassword')}
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
                                    <span>{t('authPages.forgot.updating')}</span>
                                </>
                            ) : (
                                <span>{t('authPages.forgot.resetTitle')}</span>
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
                                <span>{step === 2 ? t('authPages.forgot.back') : t('authPages.forgot.backToLogin')}</span>
                            </>
                        ) : (
                            <>
                                <ArrowLeft className="w-4 h-4" />
                                <span>{step === 2 ? t('authPages.forgot.back') : t('authPages.forgot.backToLogin')}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Footer */}
            <p className="mt-8 text-center text-sm text-white/80 font-cairo text-shadow-sm md:hidden">
                © {new Date().getFullYear()} {t('app.name')}. {t('authPages.rights')}
            </p>
        </div>
    )
}
