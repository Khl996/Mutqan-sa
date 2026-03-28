import { Navigate, Outlet } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import { Permission } from '@/config/permissions'
import { toast } from 'sonner'
import { useEffect } from 'react'
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
    const { profile } = useAuth()
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const normalizedRole = normalizeRole(profile?.role)

    // Check Permission
    const hasPermission = permission ? can(permission) : true

    // Check Role
    const hasRole = allowedRoles ? (!!normalizedRole && allowedRoles.includes(normalizedRole)) : true

    const hasAccess = hasPermission && hasRole

    useEffect(() => {
        if (!hasAccess) {
            // Only show toast if it's a permission denial, not just a redirect
            // toast.error(isRTL ? 'ليس لديك صلاحية للوصول إلى هذه الصفحة' : 'You do not have permission to access this page')
        }
    }, [hasAccess, isRTL])

    if (!hasAccess) {
        return <Navigate to={redirectPath} replace />
    }

    return <Outlet />
}
