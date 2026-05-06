import { Outlet, Navigate, Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useTranslation } from 'react-i18next'
import { useTenantDisplaySettings } from '@/hooks/useTenantDisplaySettings'
import { isPlatformRole } from '@/config/roles'
import ServiceSuspended from '@/components/ServiceSuspended'
import Sidebar from './Sidebar'
import Header from './Header'
import { cn } from '@/lib/utils'
import { Clock, XCircle } from 'lucide-react'

export default function DashboardLayout() {
    const { isAuthenticated, isLoading, profile } = useAuth()
    const { currentTenant, isPlatformUser } = useTenant()
    const location = useLocation()
    const { t, i18n } = useTranslation()
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

    useTenantDisplaySettings()

    const isRTL = i18n.language === 'ar'

    useEffect(() => {
        setMobileSidebarOpen(false)
    }, [location.pathname])

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setMobileSidebarOpen(false)
            }
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        if (!mobileSidebarOpen) return

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [mobileSidebarOpen])

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-mutqan-bg">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted">{t('common.loading')}</p>
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />
    }

    if (!isPlatformRole(profile?.role) && !profile?.tenant_id) {
        return <Navigate to="/register/complete" replace />
    }

    if (isPlatformRole(profile?.role) && !currentTenant) {
        console.log('DashboardLayout: platform user without tenant -> redirect to /platform')
        return <Navigate to="/platform" replace />
    }

    const isTenantAdmin = profile?.role === 'tenant_admin'

    if (currentTenant && !isPlatformUser) {
        const status = currentTenant.subscription_status
        // Non-admins cannot self-service — hard block on expired/cancelled
        if ((status === 'expired' || status === 'cancelled') && !isTenantAdmin) {
            return <ServiceSuspended />
        }
    }

    // Banner state computations (tenant admins only)
    const status = currentTenant?.subscription_status
    const trialEndStr = currentTenant?.trial_ends_at
    const trialDaysLeft = trialEndStr
        ? Math.max(0, Math.ceil((new Date(trialEndStr).getTime() - Date.now()) / 86_400_000))
        : null
    const showTrialWarning = !isPlatformUser && isTenantAdmin
        && status === 'trial'
        && trialDaysLeft !== null && trialDaysLeft <= 3
    const showExpiredBanner = !isPlatformUser && isTenantAdmin
        && (status === 'expired' || status === 'cancelled')

    const marginClass = cn(
        'transition-all duration-300',
        isRTL
            ? (sidebarCollapsed ? 'lg:mr-20' : 'lg:mr-64')
            : (sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64')
    )

    return (
        <div className="min-h-screen bg-mutqan-bg">
            <Sidebar
                collapsed={sidebarCollapsed}
                mobileOpen={mobileSidebarOpen}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                onNavigate={() => setMobileSidebarOpen(false)}
            />

            <div
                className={cn(
                    'fixed inset-0 bg-black/50 transition-opacity duration-300 lg:hidden',
                    mobileSidebarOpen ? 'opacity-100 pointer-events-auto z-40' : 'opacity-0 pointer-events-none'
                )}
                onClick={() => setMobileSidebarOpen(false)}
                aria-hidden="true"
            />

            <div className={cn('flex flex-col min-h-screen', marginClass)}>
                <Header onMenuClick={() => setMobileSidebarOpen((open) => !open)} />

                <main className="flex-1 p-4 sm:p-6 pb-24 overflow-x-hidden">
                    {/* Trial expiring soon (≤3 days) */}
                    {showTrialWarning && (
                        <div className="mb-6 bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-100 rounded-lg text-amber-600 shrink-0">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-amber-900 font-cairo">
                                        {t('tenant.banner.trial_expiring_title')}
                                    </h4>
                                    <p className="text-sm text-amber-700 font-cairo">
                                        {t('tenant.banner.trial_expiring_msg', { days: trialDaysLeft })}
                                    </p>
                                </div>
                            </div>
                            {location.pathname !== '/subscription' && (
                                <Link
                                    to="/subscription"
                                    className="shrink-0 px-4 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 font-cairo"
                                >
                                    {t('tenant.banner.trial_expiring_cta')}
                                </Link>
                            )}
                        </div>
                    )}

                    {/* Expired / Cancelled — read-only banner */}
                    {showExpiredBanner && (
                        <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 rounded-lg text-red-600 shrink-0">
                                    <XCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-red-900 font-cairo">
                                        {t(status === 'cancelled' ? 'tenant.banner.cancelled_title' : 'tenant.banner.expired_title')}
                                    </h4>
                                    <p className="text-sm text-red-700 font-cairo">
                                        {t('tenant.banner.read_only_note')}
                                    </p>
                                </div>
                            </div>
                            {location.pathname !== '/subscription' && (
                                <Link
                                    to="/subscription"
                                    className="shrink-0 px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 font-cairo"
                                >
                                    {t(status === 'cancelled' ? 'tenant.banner.cancelled_cta' : 'tenant.banner.expired_cta')}
                                </Link>
                            )}
                        </div>
                    )}

                    <Outlet />
                </main>
            </div>
        </div>
    )
}
