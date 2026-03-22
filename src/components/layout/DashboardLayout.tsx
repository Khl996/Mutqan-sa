import { Outlet, Navigate, Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
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

    // Apply tenant display settings (language, date/time format, etc.)
    useTenantDisplaySettings()

    const isRTL = i18n.language === 'ar'

    // Show loading spinner while checking auth
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

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />
    }

    // Guard: platform users without a selected tenant must go to /platform
    if (isPlatformRole(profile?.role) && !currentTenant) {
        console.log('⛔ DashboardLayout: platform user without tenant → redirect to /platform')
        return <Navigate to="/platform" replace />
    }

    // Check for subscription status
    const isTenantAdmin = profile?.role === 'tenant_owner' || profile?.role === 'tenant_admin'

    // Redirect logic for expired subscriptions
    if (currentTenant && !isPlatformUser) {
        // Check both the status field AND the actual period end date
        const statusExpired =
            currentTenant.subscription_status === 'expired' ||
            currentTenant.subscription_status === 'suspended' ||
            currentTenant.subscription_status === 'cancelled'

        // Also check if subscription period has actually ended (real-time check)
        const endDateStr = currentTenant.subscription_ends_at || currentTenant.trial_ends_at
        const subscriptionEndDate = endDateStr ? new Date(endDateStr) : null
        const periodExpired = subscriptionEndDate ? subscriptionEndDate < new Date() : false

        // Free plan check - if on free plan AND trial ended, treat as expired
        const isFreePlanExpired = currentTenant.subscription_status === 'trial' && periodExpired

        const isSubscriptionExpired = statusExpired || isFreePlanExpired

        if (isSubscriptionExpired) {
            // If admin, force redirect to subscription page (unless already there)
            if (isTenantAdmin) {
                if (location.pathname !== '/subscription' && location.pathname !== '/settings/tenant') {
                    return <Navigate to="/subscription" replace />
                }
            } else {
                // If regular user, show suspended screen
                return <ServiceSuspended />
            }
        }
    }

    // حساب margins بناءً على اتجاه اللغة وحالة الـ sidebar
    const sidebarWidth = sidebarCollapsed ? 'w-20' : 'w-64'
    const marginClass = cn(
        'transition-all duration-300',
        // RTL: margin-right (لأن الـ sidebar على اليمين)
        // LTR: margin-left (لأن الـ sidebar على اليسار)
        isRTL
            ? (sidebarCollapsed ? 'mr-20' : 'mr-64')
            : (sidebarCollapsed ? 'ml-20' : 'ml-64')
    )

    return (
        <div className="min-h-screen bg-background">
            {/* Sidebar */}
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />

            {/* Main Content - مع margin ديناميكي */}
            <div className={cn('flex flex-col min-h-screen', marginClass)}>
                {/* Header */}
                <Header onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)} />

                {/* Page Content */}
                <main className="flex-1 p-6 pb-24 overflow-auto">
                    {/* Expiration Banner for Admins */}
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
