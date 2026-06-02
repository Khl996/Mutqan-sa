import { Navigate, Outlet } from 'react-router-dom'
import { useTenantModules } from '@/hooks/useTenantModules'
import { isModuleEnabled } from '@/config/modules'

interface ModuleProtectedRouteProps {
    moduleCode: string
    redirectPath?: string
    /**
     * defaultAccess=false (default): fail-closed — blocked unless tenant explicitly
     *   enables the module. Use for feature modules (facilities, assets, etc.).
     * defaultAccess=true: fail-open — accessible unless tenant explicitly disables it.
     *   Use for opt-out concepts like billing where absence of the key = allowed.
     */
    defaultAccess?: boolean
}

export default function ModuleProtectedRoute({
    moduleCode,
    redirectPath = '/dashboard',
    defaultAccess = false,
}: ModuleProtectedRouteProps) {
    const { data: tenantModules, isLoading } = useTenantModules()

    // Wait for the tenant modules query before deciding — prevents false redirects
    // on cold load when tenantModules is still undefined.
    if (isLoading) return null

    const hasAccess = defaultAccess
        // fail-open: allowed unless the key is explicitly set to false
        ? tenantModules?.[moduleCode]?.enabled !== false
        // fail-closed: use the standard isModuleEnabled check (core modules always pass)
        : isModuleEnabled(tenantModules, moduleCode)

    if (!hasAccess) {
        return <Navigate to={redirectPath} replace />
    }

    return <Outlet />
}
