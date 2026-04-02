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
import { AlertCircle } from 'lucide-react'

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
            <div className="min-h-screen flex items-center justify-center bg-background">
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
        const statusExpired =
            currentTenant.subscription_status === 'expired' ||
            currentTenant.subscription_status === 'suspended' ||
            currentTenant.subscription_status === 'cancelled'

        const endDateStr = currentTenant.subscription_ends_at || currentTenant.trial_ends_at
        const subscriptionEndDate = endDateStr ? new Date(endDateStr) : null
        const periodExpired = subscriptionEndDate ? subscriptionEndDate < new Date() : false
        const isFreePlanExpired = currentTenant.subscription_status === 'trial' && periodExpired
        const isSubscriptionExpired = statusExpired || isFreePlanExpired

        if (isSubscriptionExpired) {
            if (isTenantAdmin) {
                if (location.pathname !== '/subscription' && location.pathname !== '/settings/tenant') {
                    return <Navigate to="/subscription" replace />
                }
            } else {
                return <ServiceSuspended />
            }
        }
    }

    const marginClass = cn(
        'transition-all duration-300',
        isRTL
            ? (sidebarCollapsed ? 'lg:mr-20' : 'lg:mr-64')
            : (sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64')
    )

    return (
        <div className="min-h-screen bg-background">
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
                    {isTenantAdmin && (currentTenant?.subscription_status === 'trial' || currentTenant?.subscription_status === 'expired') && (
                        <div className="mb-6 bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                    <AlertCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-blue-900 font-cairo">
                                        {currentTenant.subscription_status === 'trial'
                                            ? (isRTL ? 'نسخة تجريبية' : 'Trial Version')
                                            : (isRTL ? 'الاشتراك منتهي' : 'Subscription Expired')}
                                    </h4>
                                    <p className="text-sm text-blue-700 font-cairo">
                                        {isRTL
                                            ? 'يرجى ترقية الباقة للاستمرار في استخدام جميع المميزات.'
                                            : 'Please upgrade your plan to continue using all features.'}
                                    </p>
                                </div>
                            </div>
                            {location.pathname !== '/subscription' && (
                                <Link
                                    to="/subscription"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 font-cairo"
                                >
                                    {isRTL ? 'ترقية الآن' : 'Upgrade Now'}
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
