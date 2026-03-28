import { Suspense, lazy, useEffect, type ComponentType, type LazyExoticComponent } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'

// Layouts
import AuthLayout from '@/components/layout/AuthLayout'
import DashboardLayout from '@/components/layout/DashboardLayout'
import PlatformLayout from '@/components/layout/PlatformLayout'
import ProtectedRoute from '@/components/auth/ProtectedRoute'

// Contexts
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { TenantProvider, useTenant } from '@/contexts/TenantContext'
import { isPlatformRole } from '@/config/roles'

const LandingPage = lazy(() => import('@/pages/LandingPage'))
const AboutPage = lazy(() => import('@/pages/site/AboutPage'))
const PrivacyPolicyPage = lazy(() => import('@/pages/site/PrivacyPolicyPage'))
const TermsOfUsePage = lazy(() => import('@/pages/site/TermsOfUsePage'))
const ContactPage = lazy(() => import('@/pages/site/ContactPage'))
const PaymentCallbackPage = lazy(() => import('@/pages/payment/PaymentCallbackPage'))
const PublicReportPage = lazy(() => import('@/pages/public/PublicReportPage'))

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const CompleteRegistrationPage = lazy(() => import('@/pages/auth/CompleteRegistrationPage'))

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const FacilitiesPage = lazy(() => import('@/pages/facilities/FacilitiesPage'))
const AssetsPage = lazy(() => import('@/pages/assets/AssetsPage'))
const AssetDetailsPage = lazy(() => import('@/pages/assets/AssetDetailsPage'))
const AssetLogsPage = lazy(() => import('@/pages/assets/AssetLogsPage'))
const WorkOrdersPage = lazy(() => import('@/pages/work-orders/WorkOrdersPage'))
const MaintenancePage = lazy(() => import('@/pages/maintenance/MaintenancePage'))
const MaintenancePlanDetailsPage = lazy(() => import('@/pages/maintenance/MaintenancePlanDetailsPage'))
const InventoryPage = lazy(() => import('@/pages/inventory/InventoryPage'))
const WorkOrderDetailsPage = lazy(() => import('@/pages/work-orders/WorkOrderDetailsPage'))
const TeamsPage = lazy(() => import('@/pages/teams/TeamsPage'))
const WorkTeamsPage = lazy(() => import('@/pages/work-teams/WorkTeamsPage'))
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const PortalSettingsPage = lazy(() => import('@/pages/settings/PortalSettingsPage'))
const ModulesSettingsPage = lazy(() => import('@/pages/settings/ModulesSettingsPage'))
const TenantSettingsPage = lazy(() => import('@/pages/settings/TenantSettingsPage'))
const AdminPage = lazy(() => import('@/pages/admin/AdminPage'))
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'))
const TenantSubscriptionPage = lazy(() => import('@/pages/subscriptions/TenantSubscriptionPage'))

const PlatformDashboardPage = lazy(() => import('@/pages/platform/PlatformDashboardPage'))
const TenantsManagementPage = lazy(() => import('@/pages/platform/TenantsManagementPage'))
const SubscriptionPage = lazy(() => import('@/pages/platform/SubscriptionPage'))
const PlatformStaffPage = lazy(() => import('@/pages/platform/PlatformStaffPage'))
const FinancialsPage = lazy(() => import('@/pages/platform/FinancialsPage'))
const AuditLogsPage = lazy(() => import('@/pages/platform/AuditLogsPage'))
const PlatformReportsPage = lazy(() => import('@/pages/platform/PlatformReportsPage'))
const AnnouncementsPage = lazy(() => import('@/pages/platform/AnnouncementsPage'))
const PlatformSettingsPage = lazy(() => import('@/pages/platform/PlatformSettingsPage'))

type LazyRouteComponent = LazyExoticComponent<ComponentType<object>>

function RouteFallback() {
    return (
        <div className="flex items-center justify-center min-h-[40vh] bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                <p className="text-muted font-cairo">جارٍ تحميل الصفحة...</p>
            </div>
        </div>
    )
}

function renderLazyPage(Component: LazyRouteComponent) {
    return (
        <Suspense fallback={<RouteFallback />}>
            <Component />
        </Suspense>
    )
}

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
    const { isAuthenticated, isLoading: authLoading, profile } = useAuth()
    const { currentTenant, isLoading: tenantLoading, isPlatformUser } = useTenant()
    const location = window.location.pathname

    const isPlatformRoute = location.startsWith('/platform')
    const isLoginRoute = location === '/login'
    const isPublicRoute =
        location === '/' ||
        location.startsWith('/portal') ||
        location === '/register' ||
        location === '/register/complete'
    const needsTenantProvisioning =
        isAuthenticated &&
        !!profile &&
        !isPlatformRole(profile.role) &&
        !profile.tenant_id

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
                        ? (needsTenantProvisioning
                            ? <Navigate to="/register/complete" replace />
                            : isPlatformUser && !currentTenant
                            ? <Navigate to="/platform" replace />
                            : <Navigate to="/dashboard" replace />)
                        : renderLazyPage(LandingPage)
                }
            />
            <Route path="/about" element={renderLazyPage(AboutPage)} />
            <Route path="/privacy" element={renderLazyPage(PrivacyPolicyPage)} />
            <Route path="/terms" element={renderLazyPage(TermsOfUsePage)} />
            <Route path="/contact" element={renderLazyPage(ContactPage)} />
            <Route path="/payment/callback" element={renderLazyPage(PaymentCallbackPage)} />

            {/* Auth Routes */}
            <Route element={<AuthLayout />}>
                <Route path="/login" element={renderLazyPage(LoginPage)} />
                <Route path="/forgot-password" element={renderLazyPage(ForgotPasswordPage)} />
                <Route path="/register" element={renderLazyPage(RegisterPage)} />
                <Route path="/register/complete" element={renderLazyPage(CompleteRegistrationPage)} />
            </Route>

            {/* Platform Admin Routes */}
            <Route path="/platform" element={<PlatformLayout />}>
                <Route index element={renderLazyPage(PlatformDashboardPage)} />
                <Route path="tenants" element={renderLazyPage(TenantsManagementPage)} />
                <Route path="subscriptions" element={renderLazyPage(SubscriptionPage)} />
                <Route path="staff" element={renderLazyPage(PlatformStaffPage)} />
                <Route path="financials" element={renderLazyPage(FinancialsPage)} />
                <Route path="logs" element={renderLazyPage(AuditLogsPage)} />
                <Route path="reports" element={renderLazyPage(PlatformReportsPage)} />
                <Route path="announcements" element={renderLazyPage(AnnouncementsPage)} />
                <Route path="settings" element={renderLazyPage(PlatformSettingsPage)} />
            </Route>

            {/* Tenant Dashboard Routes */}
            <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={renderLazyPage(DashboardPage)} />
                <Route path="/profile" element={renderLazyPage(ProfilePage)} />

                <Route element={<ProtectedRoute permission="facilities.view" />}>
                    <Route path="/facilities" element={renderLazyPage(FacilitiesPage)} />
                </Route>

                <Route element={<ProtectedRoute permission="assets.view" />}>
                    <Route path="/assets" element={renderLazyPage(AssetsPage)} />
                    <Route path="/assets/:id" element={renderLazyPage(AssetDetailsPage)} />
                    <Route path="/asset-logs" element={renderLazyPage(AssetLogsPage)} />
                </Route>

                <Route element={<ProtectedRoute permission="work_orders.view" />}>
                    <Route path="/work-orders" element={renderLazyPage(WorkOrdersPage)} />
                    <Route path="/work-orders/:id" element={renderLazyPage(WorkOrderDetailsPage)} />
                </Route>

                <Route element={<ProtectedRoute permission="maintenance.view" />}>
                    <Route path="/maintenance" element={renderLazyPage(MaintenancePage)} />
                    <Route path="/maintenance/plans/:id" element={renderLazyPage(MaintenancePlanDetailsPage)} />
                </Route>

                <Route element={<ProtectedRoute permission="inventory.view" />}>
                    <Route path="/inventory" element={renderLazyPage(InventoryPage)} />
                </Route>

                <Route element={<ProtectedRoute permission="users.view" />}>
                    <Route path="/teams" element={renderLazyPage(TeamsPage)} />
                    <Route path="/work-teams" element={renderLazyPage(WorkTeamsPage)} />
                </Route>

                <Route element={<ProtectedRoute permission="reports.view" />}>
                    <Route path="/reports" element={renderLazyPage(ReportsPage)} />
                </Route>

                <Route element={<ProtectedRoute permission="settings.view" />}>
                    <Route path="/settings" element={renderLazyPage(SettingsPage)} />
                    <Route path="/settings/portal" element={renderLazyPage(PortalSettingsPage)} />
                    <Route path="/settings/modules" element={renderLazyPage(ModulesSettingsPage)} />
                    <Route path="/settings/tenant" element={renderLazyPage(TenantSettingsPage)} />
                    <Route path="/admin" element={renderLazyPage(AdminPage)} />
                </Route>

                {/* Tenant Admin/Owner Routes */}
                <Route element={<ProtectedRoute allowedRoles={['tenant_admin', 'tenant_owner']} />}>
                    <Route path="/subscription" element={renderLazyPage(TenantSubscriptionPage)} />
                </Route>
            </Route>

            {/* Public Report Route */}
            <Route path="/portal/:token" element={renderLazyPage(PublicReportPage)} />

            {/* 404 Redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}

export default App
