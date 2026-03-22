import { useAuth } from '@/contexts/AuthContext'
import { hasPermission, Permission, Role } from '@/config/permissions'
import { isPlatformRole } from '@/config/roles'

export function usePermission() {
    const { profile } = useAuth()

    // Default role if not loaded yet or invalid is restricted (e.g. reporter or none)
    // But to be safe, assume no permissions if no profile

    const can = (permission: Permission): boolean => {
        if (!profile || !profile.role) return false
        return hasPermission(profile.role, permission)
    }

    const role = (profile?.role as Role) || null
    const userRole = profile?.role || ''

    return {
        can,
        role,
        isManager: isPlatformRole(userRole) || ['tenant_admin', 'tenant_owner', 'facility_manager', 'maintenance_manager'].includes(userRole),
        isAdmin: isPlatformRole(userRole) || ['tenant_admin', 'tenant_owner'].includes(userRole)
    }
}
