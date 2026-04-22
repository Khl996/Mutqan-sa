import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { isPlatformRole } from '@/config/roles'
import { toast } from 'sonner'
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LoginPage() {
    const { t, i18n } = useTranslation()
    const { signIn, profile, isAuthenticated } = useAuth()
    const navigate = useNavigate()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [rememberMe, setRememberMe] = useState(false)
    // Track that we just signed in and are waiting for profile to load
    const [pendingRedirect, setPendingRedirect] = useState(false)

    const isRTL = i18n.language === 'ar'

    // Redirect once profile is ready after sign-in
    useEffect(() => {
        if (!pendingRedirect || !isAuthenticated || !profile) return

        // Profile is now loaded — route based on role
        if (isPlatformRole(profile.role)) {
            navigate('/platform', { replace: true })
        } else if (!profile.tenant_id) {
            navigate('/register/complete', { replace: true })
        } else {
            navigate('/dashboard', { replace: true })
        }
        setPendingRedirect(false)
    }, [pendingRedirect, isAuthenticated, profile, navigate])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!email || !password) {
            toast.error(t('validation.required'))
            return
        }

        setIsLoading(true)

        try {
            const { error } = await signIn(email, password)

            if (error) {
                toast.error(t('auth.invalidCredentials'))
                setIsLoading(false)
            } else {
                toast.success(t('common.success'))
                // Signal that we should redirect once profile loads
                setPendingRedirect(true)
                // Keep isLoading=true so the button stays disabled until redirect
            }
        } catch (error) {
            console.error(error)
            toast.error(t('common.error'))
            setIsLoading(false)
        }
    }

    return (
        <div className="w-full max-w-full min-w-0">
            {/* Mobile Logo (visible only on small screens) */}
            <div className="md:hidden flex flex-col items-center mb-6">
                <img
                    src="/images/logo-white.png"
                    alt={t('authPages.mobileLogoAlt')}
                    className="w-20 h-auto object-contain mb-4 drop-shadow-md"
                />
            </div>

            {/* Login Card */}
            <div className="max-w-full overflow-hidden bg-white/95 backdrop-blur-[6px] rounded-xl shadow-card p-6 sm:p-8 lg:p-10 border border-white/60">
                {/* Header */}
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-[#1A202C] font-cairo mb-3">
                        {t('auth.welcomeBack')}
                    </h2>
                    <p className="text-[#6C7A86] font-cairo text-base">
                        {t('auth.enterCredentials')}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Email Field */}
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
                            />
                            <Mail className={cn(
                                'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-[#A0AEC0] group-focus-within:text-[#3AAFA9] transition-colors',
                                isRTL ? 'right-4' : 'left-4'
                            )} />
                        </div>
                    </div>

                    {/* Password Field */}
                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-[#1A202C] font-cairo">
                            {t('auth.password')}
                        </label>
                        <div className="relative group">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className={cn(
                                    'w-full h-12 bg-white border border-[#E9EEF1] rounded-xl text-[#1A202C] placeholder-[#A0AEC0] font-cairo transition-all duration-200',
                                    'focus:border-[#3AAFA9] focus:ring-4 focus:ring-[#3AAFA9]/10 outline-none',
                                    isRTL ? 'pr-11 pl-11' : 'pl-11 pr-11'
                                )}
                                dir="ltr"
                            />
                            <Lock className={cn(
                                'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-[#A0AEC0] group-focus-within:text-[#3AAFA9] transition-colors',
                                isRTL ? 'right-4' : 'left-4'
                            )} />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className={cn(
                                    'absolute top-1/2 -translate-y-1/2 text-[#A0AEC0] hover:text-[#3AAFA9] transition-colors p-1',
                                    isRTL ? 'left-3' : 'right-3'
                                )}
                            >
                                {showPassword ? (
                                    <EyeOff className="w-5 h-5" />
                                ) : (
                                    <Eye className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Remember Me & Forgot Password */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2.5 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="peer h-5 w-5 rounded-md border-2 border-[#E9EEF1] text-[#3AAFA9] focus:ring-[#3AAFA9]/20 transition-all checked:border-[#3AAFA9] checked:bg-[#3AAFA9]"
                                />
                            </div>
                            <span className="text-sm text-[#6C7A86] group-hover:text-[#1A202C] transition-colors font-cairo">
                                {t('auth.rememberMe')}
                            </span>
                        </label>
                        <button
                            type="button"
                            onClick={() => navigate('/forgot-password')}
                            className="text-sm text-[#3AAFA9] hover:text-[#2B8C87] font-semibold font-cairo transition-colors"
                        >
                            {t('auth.forgotPassword')}
                        </button>
                    </div>

                    {/* Submit Button */}
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
                                <span>{t('auth.loggingIn')}</span>
                            </>
                        ) : (
                            t('auth.loginButton')
                        )}
                    </button>
                </form>

            </div>

            {/* Footer */}
            <p className="mt-8 text-center text-sm text-white/80 font-cairo text-shadow-sm md:hidden">
                © {new Date().getFullYear()} {t('app.name')}. {t('authPages.rights')}
            </p>
        </div>
    )
}
