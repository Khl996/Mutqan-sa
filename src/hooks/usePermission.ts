import { useAuth } from '@/contexts/AuthContext'
import { hasPermission, Permission, Role } from '@/config/permissions'

export function usePermission() {
    const { profile } = useAuth()

    // Default role if not loaded yet or invalid is restricted (e.g. reporter or none)
    // But to be safe, assume no permissions if no profile

    const can = (permission: Permission): boolean => {
        if (!profile || !profile.role) return false
        return hasPermission(profile.role, permission)
    }

    const role = (profile?.role as Role) || null

    return {
        can,
        role,
        isManager: ['platform_owner', 'platform_admin', 'tenant_admin', 'tenant_owner', 'facility_manager', 'maintenance_manager'].includes(profile?.role || ''),
        isAdmin: ['platform_owner', 'platform_admin', 'tenant_admin', 'tenant_owner'].includes(profile?.role || '')
    }
}
