import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, Loader2, LogOut, RefreshCw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { clearPendingRegistrationDraft, loadPendingRegistrationDraft } from '@/lib/pendingRegistration'
import { useAuth } from '@/contexts/AuthContext'
import { isPlatformRole } from '@/config/roles'
import { MutqanLogo } from '@/components/ui/MutqanLogo'

export default function CompleteRegistrationPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { isLoading, isAuthenticated, profile, refreshProfile, signOut } = useAuth()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const attemptedRef = useRef(false)

    const isPlatformUser = !!profile && (isPlatformRole(profile.role) || profile.is_super_admin)
    const getErrorMessage = (error: unknown, fallback: string) =>
        error instanceof Error ? error.message : fallback

    const completeRegistration = useCallback(async () => {
        setIsSubmitting(true)
        setErrorMessage(null)

        try {
            const draft = loadPendingRegistrationDraft()

            const { error } = await supabase.rpc('complete_pending_registration', {
                p_draft: draft,
            })

            if (error) {
                throw error
            }

            clearPendingRegistrationDraft()
            await refreshProfile()

            toast.success(
                t('authPages.complete.successToast'),
            )

            navigate('/dashboard', { replace: true })
        } catch (error: unknown) {
            console.error('Pending registration completion failed:', error)

            const fallbackMessage = t('authPages.complete.fallbackError')

            setErrorMessage(getErrorMessage(error, fallbackMessage))
        } finally {
            setIsSubmitting(false)
        }
    }, [navigate, refreshProfile, t])

    useEffect(() => {
        if (!isAuthenticated || isLoading || isPlatformUser || profile?.tenant_id || attemptedRef.current) {
            return
        }

        attemptedRef.current = true
        void completeRegistration()
    }, [completeRegistration, isAuthenticated, isLoading, isPlatformUser, profile?.tenant_id])

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted font-cairo">
                        {t('authPages.complete.checking')}
                    </p>
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />
    }

    if (isPlatformUser) {
        return <Navigate to="/platform" replace />
    }

    if (profile?.tenant_id) {
        return <Navigate to="/dashboard" replace />
    }

    const handleSignOut = async () => {
        clearPendingRegistrationDraft()
        await signOut()
        navigate('/register', { replace: true })
    }

    return (
        <div className="w-full">
            <div className="md:hidden flex flex-col items-center mb-8">
                <MutqanLogo
                    variant="symbol"
                    size="lg"
                    theme="dark"
                    label={t('authPages.mobileLogoAlt')}
                    className="mb-4 drop-shadow-md"
                />
            </div>

            <div className="bg-white/95 backdrop-blur-[6px] rounded-2xl shadow-xl shadow-slate-900/5 p-8 border border-white/50 overflow-hidden relative">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto">
                        {errorMessage ? (
                            <ShieldAlert className="w-8 h-8 text-amber-600" />
                        ) : (
                            <Building2 className="w-8 h-8 text-secondary" />
                        )}
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-[#1A202C] font-cairo">
                            {errorMessage
                                ? t('authPages.complete.blockedTitle')
                                : t('authPages.complete.progressTitle')}
                        </h2>
                        <p className="text-sm text-[#6C7A86] font-cairo leading-7">
                            {errorMessage
                                ? t('authPages.complete.blockedBody')
                                : t('authPages.complete.progressBody')}
                        </p>
                    </div>
                </div>

                <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                    {errorMessage ? (
                        <p className="text-sm text-slate-700 leading-7 font-cairo">
                            {errorMessage}
                        </p>
                    ) : (
                        <div className="flex items-center justify-center gap-3 text-secondary font-cairo">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>{t('authPages.complete.completing')}</span>
                        </div>
                    )}
                </div>

                <div className="mt-8 flex flex-col gap-3">
                    <button
                        type="button"
                        onClick={() => void completeRegistration()}
                        disabled={isSubmitting}
                        className="w-full h-12 bg-secondary text-white rounded-xl font-bold hover:bg-secondary/90 transition-all shadow-lg shadow-secondary/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <RefreshCw className="w-5 h-5" />
                        )}
                        <span>{t('authPages.complete.retry')}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => void handleSignOut()}
                        className="w-full h-12 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>{t('authPages.complete.backToRegistration')}</span>
                    </button>
                </div>
            </div>
        </div>
    )
}
