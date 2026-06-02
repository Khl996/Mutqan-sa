import { Suspense, lazy, useEffect, type ComponentType, type LazyExoticComponent } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Toaster } from 'sonner'

// Layouts
import AuthLayout from '@/components/layout/AuthLayout'
import DashboardLayout from '@/components/layout/DashboardLayout'
import PlatformLayout from '@/components/layout/PlatformLayout'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import ModuleProtectedRoute from '@/components/auth/ModuleProtectedRoute'

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
const PMJobPlanDetailsPage = lazy(() => import('@/pages/maintenance/PMJobPlanDetailsPage'))
const PMScheduleDetailsPage = lazy(() => import('@/pages/maintenance/PMScheduleDetailsPage'))
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
const QuotesPage = lazy(() => import('@/pages/platform/QuotesPage'))
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
        location === '/about' ||
        location === '/contact' ||
        location === '/privacy' ||
        location === '/terms' ||
        location === '/payment/callback' ||
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
                    authLoading
                        ? null
                        : isAuthenticated
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

            {/* Platform Routes */}
            <Route path="/platform" element={<PlatformLayout />}>
                <Route element={<ProtectedRoute permission="platform.dashboard.view" redirectPath="/dashboard" />}>
                    <Route index element={renderLazyPage(PlatformDashboardPage)} />
                </Route>
                <Route element={<ProtectedRoute permission="platform.tenants.view" redirectPath="/platform" />}>
                    <Route path="tenants" element={renderLazyPage(TenantsManagementPage)} />
                </Route>
                <Route element={<ProtectedRoute permission="platform.subscriptions.manage" redirectPath="/platform" />}>
                    <Route path="subscriptions" element={renderLazyPage(SubscriptionPage)} />
                    <Route path="quotes" element={renderLazyPage(QuotesPage)} />
                </Route>
                <Route element={<ProtectedRoute permission="platform.staff.manage" redirectPath="/platform" />}>
                    <Route path="staff" element={renderLazyPage(PlatformStaffPage)} />
                </Route>
                <Route element={<ProtectedRoute permission="platform.financials.view" redirectPath="/platform" />}>
                    <Route path="financials" element={renderLazyPage(FinancialsPage)} />
                </Route>
                <Route element={<ProtectedRoute permission="platform.audit.view" redirectPath="/platform" />}>
                    <Route path="logs" element={renderLazyPage(AuditLogsPage)} />
                </Route>
                <Route element={<ProtectedRoute permission="platform.reports.view" redirectPath="/platform" />}>
                    <Route path="reports" element={renderLazyPage(PlatformReportsPage)} />
                </Route>
                <Route element={<ProtectedRoute permission="platform.announcements.manage" redirectPath="/platform" />}>
                    <Route path="announcements" element={renderLazyPage(AnnouncementsPage)} />
                </Route>
                <Route element={<ProtectedRoute permission="platform.settings.manage" redirectPath="/platform" />}>
                    <Route path="settings" element={renderLazyPage(PlatformSettingsPage)} />
                </Route>
            </Route>

            {/* Tenant Dashboard Routes */}
            <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={renderLazyPage(DashboardPage)} />
                <Route path="/profile" element={renderLazyPage(ProfilePage)} />

                <Route element={<ProtectedRoute permission="facilities.view" />}>
                    <Route element={<ModuleProtectedRoute moduleCode="facilities" />}>
                        <Route path="/facilities" element={renderLazyPage(FacilitiesPage)} />
                    </Route>
                </Route>

                <Route element={<ProtectedRoute permission="assets.view" />}>
                    <Route element={<ModuleProtectedRoute moduleCode="assets" />}>
                        <Route path="/assets" element={renderLazyPage(AssetsPage)} />
                        <Route path="/assets/:id" element={renderLazyPage(AssetDetailsPage)} />
                        <Route path="/asset-logs" element={renderLazyPage(AssetLogsPage)} />
                    </Route>
                </Route>

                <Route element={<ProtectedRoute permission="work_orders.view" />}>
                    <Route element={<ModuleProtectedRoute moduleCode="work_orders" />}>
                        <Route path="/work-orders" element={renderLazyPage(WorkOrdersPage)} />
                        <Route path="/work-orders/:id" element={renderLazyPage(WorkOrderDetailsPage)} />
                    </Route>
                </Route>

                <Route element={<ProtectedRoute permission="maintenance.view" />}>
                    <Route element={<ModuleProtectedRoute moduleCode="maintenance" />}>
                        <Route path="/maintenance" element={renderLazyPage(MaintenancePage)} />
                        <Route path="/maintenance/job-plans/:id" element={renderLazyPage(PMJobPlanDetailsPage)} />
                        <Route path="/maintenance/schedules/:id" element={renderLazyPage(PMScheduleDetailsPage)} />
                        <Route path="/maintenance/plans/:id" element={<Navigate to="/maintenance" replace />} />
                    </Route>
                </Route>

                <Route element={<ProtectedRoute permission="inventory.view" />}>
                    <Route element={<ModuleProtectedRoute moduleCode="inventory" />}>
                        <Route path="/inventory" element={renderLazyPage(InventoryPage)} />
                    </Route>
                </Route>

                <Route element={<ProtectedRoute permission="users.view" />}>
                    <Route path="/teams" element={renderLazyPage(TeamsPage)} />
                </Route>

                <Route element={<ProtectedRoute permission="work_teams.view" />}>
                    <Route element={<ModuleProtectedRoute moduleCode="work_teams" />}>
                        <Route path="/work-teams" element={renderLazyPage(WorkTeamsPage)} />
                    </Route>
                </Route>

                <Route element={<ProtectedRoute permission="reports.view" />}>
                    <Route element={<ModuleProtectedRoute moduleCode="reports" />}>
                        <Route path="/reports" element={renderLazyPage(ReportsPage)} />
                    </Route>
                </Route>

                <Route element={<ProtectedRoute permission="settings.view" />}>
                    <Route path="/settings" element={renderLazyPage(SettingsPage)} />
                    <Route path="/settings/modules" element={renderLazyPage(ModulesSettingsPage)} />
                </Route>

                <Route element={<ProtectedRoute permission="settings.manage" />}>
                    <Route path="/settings/portal" element={renderLazyPage(PortalSettingsPage)} />
                    <Route path="/settings/tenant" element={renderLazyPage(TenantSettingsPage)} />
                    <Route path="/admin" element={renderLazyPage(AdminPage)} />
                </Route>

                <Route element={<ProtectedRoute permission="subscription.manage" />}>
                    <Route element={<ModuleProtectedRoute moduleCode="billing" defaultAccess={true} />}>
                        <Route path="/subscription" element={renderLazyPage(TenantSubscriptionPage)} />
                    </Route>
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
