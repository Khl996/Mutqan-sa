import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { isPlatformRole } from '@/config/roles'
import { LanguageToggle } from '@/components/site/LanguageToggle'
import { MutqanLogo } from '@/components/ui/MutqanLogo'

export default function AuthLayout() {
    const { isAuthenticated, isLoading, profile } = useAuth()
    const { t, i18n } = useTranslation()
    const location = useLocation()
    const isRTL = i18n.language === 'ar'

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted">{t('common.loading')}</p>
                </div>
            </div>
        )
    }

    const isRegistrationRoute = location.pathname === '/register' || location.pathname === '/register/complete'
    const canStayInRegistrationFlow =
        isRegistrationRoute &&
        (!profile || (!isPlatformRole(profile.role) && !profile.tenant_id))

    if (isAuthenticated && !canStayInRegistrationFlow) {
        if (profile && isPlatformRole(profile.role)) {
            return <Navigate to="/platform" replace />
        }

        if (profile && !profile.tenant_id) {
            return <Navigate to="/register/complete" replace />
        }

        return <Navigate to="/dashboard" replace />
    }

    return (
        <div
            className="min-h-screen w-full relative overflow-x-hidden overflow-y-auto flex flex-row bg-[#071113]"
            style={{ backgroundImage: 'linear-gradient(135deg, #071113 0%, #0d2225 55%, #11181d 100%)' }}
            dir={isRTL ? 'rtl' : 'ltr'}
        >
            <div className="absolute inset-0 z-0 select-none opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
            <div className="absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(7,17,19,0.2),rgba(7,17,19,0.72))]" />
            <div className="absolute top-4 z-20 ltr:right-4 rtl:left-4">
                <LanguageToggle variant="dark" />
            </div>

            <div className="relative z-10 flex h-full w-full min-w-0 flex-col md:flex-row">
                <div className="hidden md:flex flex-1 flex-col justify-center px-12 lg:px-20">
                    <div className="max-w-xl space-y-8 animate-in fade-in slide-in-from-right-8 duration-700">
                        <MutqanLogo
                            variant="vertical"
                            size="lg"
                            theme="dark"
                            label={t('site.brand.name')}
                            className="mb-8 drop-shadow-2xl [&>svg]:h-20 [&>svg]:w-20 lg:[&>svg]:h-24 lg:[&>svg]:w-24"
                        />

                        <div className="space-y-4">
                            <h1 className="text-4xl lg:text-5xl font-bold text-white font-cairo leading-tight">
                                {t('authPages.layoutTitle')}
                            </h1>
                            <p className="text-xl text-white/90 font-cairo font-light leading-relaxed max-w-lg">
                                {t('authPages.layoutBody')}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex min-h-screen min-w-0 flex-1 items-center justify-center overflow-x-hidden p-4 py-8 sm:p-6 md:p-10">
                    <div className="w-full max-w-[320px] sm:max-w-[440px] min-w-0 animate-in fade-in slide-in-from-left-8 duration-700 delay-150">
                        <Outlet />
                    </div>
                </div>
            </div>
        </div>
    )
}
