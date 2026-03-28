import { useAuth } from '@/contexts/AuthContext'
import { getPermissionsForRole, hasPermission, Permission, Role } from '@/config/permissions'
import { isPlatformRole, normalizeRole } from '@/config/roles'

export function usePermission() {
    const { profile } = useAuth()
    const normalizedRole = normalizeRole(profile?.role)

    const can = (permission: Permission): boolean => {
        if (!normalizedRole) return false
        return hasPermission(normalizedRole, permission)
    }

    const role = (normalizedRole as Role) || null
    const userRole = normalizedRole || ''
    const permissions = getPermissionsForRole(profile?.role)
    const hasRole = (...roles: Role[]) => !!role && roles.includes(role)

    return {
        can,
        hasRole,
        role,
        rawRole: profile?.role || null,
        permissions,
        isPlatformUser: isPlatformRole(userRole),
        isManager: isPlatformRole(userRole) || ['tenant_admin', 'facility_manager', 'maintenance_manager'].includes(userRole),
        isAdmin: isPlatformRole(userRole) || userRole === 'tenant_admin',
        canManageWorkTeams: isPlatformRole(userRole)
            ? ['platform_owner', 'platform_admin'].includes(userRole)
            : ['tenant_admin', 'maintenance_manager'].includes(userRole),
    }
}
