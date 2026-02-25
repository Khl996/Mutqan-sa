import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'

// Layouts
import AuthLayout from '@/components/layout/AuthLayout'
import DashboardLayout from '@/components/layout/DashboardLayout'
import PlatformLayout from '@/components/layout/PlatformLayout'
import ProtectedRoute from '@/components/auth/ProtectedRoute'

// Public Pages
import LandingPage from '@/pages/LandingPage'
import AboutPage from '@/pages/site/AboutPage'
import PrivacyPolicyPage from '@/pages/site/PrivacyPolicyPage'
import TermsOfUsePage from '@/pages/site/TermsOfUsePage'
import ContactPage from '@/pages/site/ContactPage'
import PaymentCallbackPage from '@/pages/payment/PaymentCallbackPage'
import PublicReportPage from '@/pages/public/PublicReportPage'

// Auth Pages
import LoginPage from '@/pages/auth/LoginPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import RegisterPage from '@/pages/auth/RegisterPage'

// Tenant Dashboard Pages
import DashboardPage from '@/pages/dashboard/DashboardPage'
import FacilitiesPage from '@/pages/facilities/FacilitiesPage'
import AssetsPage from '@/pages/assets/AssetsPage'
import AssetDetailsPage from '@/pages/assets/AssetDetailsPage'
import AssetLogsPage from '@/pages/assets/AssetLogsPage'
import WorkOrdersPage from '@/pages/work-orders/WorkOrdersPage'
import MaintenancePage from '@/pages/maintenance/MaintenancePage'
import MaintenancePlanDetailsPage from '@/pages/maintenance/MaintenancePlanDetailsPage'
import InventoryPage from '@/pages/inventory/InventoryPage'
import WorkOrderDetailsPage from '@/pages/work-orders/WorkOrderDetailsPage'
import TeamsPage from '@/pages/teams/TeamsPage'
import WorkTeamsPage from '@/pages/work-teams/WorkTeamsPage'
import ReportsPage from '@/pages/reports/ReportsPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import PortalSettingsPage from '@/pages/settings/PortalSettingsPage'
import ModulesSettingsPage from '@/pages/settings/ModulesSettingsPage'
import TenantSettingsPage from '@/pages/settings/TenantSettingsPage'
import AdminPage from '@/pages/admin/AdminPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import TenantSubscriptionPage from '@/pages/subscriptions/TenantSubscriptionPage'

// Platform Admin Pages
import PlatformDashboardPage from '@/pages/platform/PlatformDashboardPage'
import TenantsManagementPage from '@/pages/platform/TenantsManagementPage'
import SubscriptionPage from '@/pages/platform/SubscriptionPage'
import PlatformStaffPage from '@/pages/platform/PlatformStaffPage'
import FinancialsPage from '@/pages/platform/FinancialsPage'
import AuditLogsPage from '@/pages/platform/AuditLogsPage'
import PlatformReportsPage from '@/pages/platform/PlatformReportsPage'
import AnnouncementsPage from '@/pages/platform/AnnouncementsPage'

// Contexts
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { TenantProvider, useTenant } from '@/contexts/TenantContext'

function App() {
    const { i18n } = useTranslation()

    useEffect(() => {
        document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr'
        document.documentElement.lang = i18n.language
    }, [i18n.language])

    return (
        <ThemeProvider>
            <AuthProvider>
                <TenantProvider>
                    <Toaster
                        position={i18n.language === 'ar' ? 'top-left' : 'top-right'}
                        richColors
                        closeButton
                        dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}
                    />
                    <AppRoutes />
                </TenantProvider>
            </AuthProvider>
        </ThemeProvider>
    )
}

function AppRoutes() {
    const { isAuthenticated, isLoading: authLoading } = useAuth()
    const { currentTenant, isLoading: tenantLoading, isPlatformUser } = useTenant()
    const location = window.location.pathname

    const isPlatformRoute = location.startsWith('/platform')
    const isLoginRoute = location === '/login'
    const isPublicRoute = location === '/' || location.startsWith('/portal') || location === '/register'

    if (!isPlatformRoute && !isLoginRoute && !isPublicRoute && (authLoading || (isAuthenticated && tenantLoading))) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted font-cairo">جاري التحميل...</p>
                </div>
            </div>
        )
    }

    return (
        <Routes>
            {/* Public Pages */}
            <Route
                path="/"
                element={
                    isAuthenticated
                        ? (isPlatformUser && !currentTenant
                            ? <Navigate to="/platform" replace />
                            : <Navigate to="/dashboard" replace />)
                        : <LandingPage />
                }
            />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfUsePage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/payment/callback" element={<PaymentCallbackPage />} />

            {/* Auth Routes */}
            <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Platform Admin Routes */}
            <Route path="/platform" element={<PlatformLayout />}>
                <Route index element={<PlatformDashboardPage />} />
                <Route path="tenants" element={<TenantsManagementPage />} />
                <Route path="subscriptions" element={<SubscriptionPage />} />
                <Route path="staff" element={<PlatformStaffPage />} />
                <Route path="financials" element={<FinancialsPage />} />
                <Route path="logs" element={<AuditLogsPage />} />
                <Route path="reports" element={<PlatformReportsPage />} />
                <Route path="announcements" element={<AnnouncementsPage />} />
                <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Tenant Dashboard Routes */}
            <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />

                <Route element={<ProtectedRoute permission="facilities.view" />}>
                    <Route path="/facilities" element={<FacilitiesPage />} />
                </Route>

                <Route element={<ProtectedRoute permission="assets.view" />}>
                    <Route path="/assets" element={<AssetsPage />} />
                    <Route path="/assets/:id" element={<AssetDetailsPage />} />
                    <Route path="/asset-logs" element={<AssetLogsPage />} />
                </Route>

                <Route element={<ProtectedRoute permission="work_orders.view" />}>
                    <Route path="/work-orders" element={<WorkOrdersPage />} />
                    <Route path="/work-orders/:id" element={<WorkOrderDetailsPage />} />
                </Route>

                <Route element={<ProtectedRoute permission="maintenance.view" />}>
                    <Route path="/maintenance" element={<MaintenancePage />} />
                    <Route path="/maintenance/plans/:id" element={<MaintenancePlanDetailsPage />} />
                </Route>

                <Route element={<ProtectedRoute permission="inventory.view" />}>
                    <Route path="/inventory" element={<InventoryPage />} />
                </Route>

                <Route element={<ProtectedRoute permission="users.view" />}>
                    <Route path="/teams" element={<TeamsPage />} />
                    <Route path="/work-teams" element={<WorkTeamsPage />} />
                </Route>

                <Route element={<ProtectedRoute permission="reports.view" />}>
                    <Route path="/reports" element={<ReportsPage />} />
                </Route>

                <Route element={<ProtectedRoute permission="settings.view" />}>
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/settings/portal" element={<PortalSettingsPage />} />
                    <Route path="/settings/modules" element={<ModulesSettingsPage />} />
                    <Route path="/settings/tenant" element={<TenantSettingsPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                </Route>

                {/* Tenant Admin Only Routes */}
                <Route element={<ProtectedRoute allowedRoles={['tenant_admin']} />}>
                    <Route path="/subscription" element={<TenantSubscriptionPage />} />
                </Route>
            </Route>

            {/* Public Report Route */}
            <Route path="/portal/:token" element={<PublicReportPage />} />

            {/* 404 Redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}

export default App
