import { Navigate, Outlet } from 'react-router-dom'
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
    const { profile, isLoading } = useAuth()
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const normalizedRole = normalizeRole(profile?.role)

    // Wait for auth to initialise — prevents cold-load redirect glitch
    if (isLoading) return null

    // Check Permission
    const hasPermission = permission ? can(permission) : true

    // Check Role
    const hasRole = allowedRoles ? (!!normalizedRole && allowedRoles.includes(normalizedRole)) : true

    const hasAccess = hasPermission && hasRole

    if (!hasAccess) {
        return <Navigate to={redirectPath} replace />
    }

    return <Outlet />
}
