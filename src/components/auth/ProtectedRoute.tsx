import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import { Permission } from '@/config/permissions'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { normalizeRole } from '@/config/roles'

interface ProtectedRouteProps {
    permission?: Permission
    allowedRoles?: string[]
    redirectPath?: string
}

export default function ProtectedRoute({ permission, allowedRoles, redirectPath = '/dashboard' }: ProtectedRouteProps) {
    const { can } = usePermission()
    const { profile, isLoading, isAuthenticated } = useAuth()
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const normalizedRole = normalizeRole(profile?.role)
    const location = useLocation()

    void isRTL  // consumed by child components via context; suppress lint

    // Wait for auth to initialise — prevents cold-load redirect glitch
    if (isLoading) return null

    // Not authenticated: save the intended path so LoginPage can redirect back.
    // Only save internal paths (not /login, /register — avoids redirect loops).
    if (!isAuthenticated) {
        const intended = location.pathname + location.search
        if (!intended.startsWith('/login') && !intended.startsWith('/register')) {
            sessionStorage.setItem('redirectAfterLogin', intended)
        }
        return <Navigate to="/login" replace />
    }

    // Authenticated but missing required permission or role
    const hasPermission = permission ? can(permission) : true
    const hasRole = allowedRoles ? (!!normalizedRole && allowedRoles.includes(normalizedRole)) : true

    if (!hasPermission || !hasRole) {
        return <Navigate to={redirectPath} replace />
    }

    return <Outlet />
}
