import { useTenantModules } from './useTenantModules'
import { isFeatureEnabled as checkFeatureEnabled } from '@/config/modules'

/**
 * Hook to check if a specific feature is enabled for the current tenant
 * Usage: const isEnabled = useFeatureEnabled('work_orders', 'workflow')
 */
export function useFeatureEnabled(moduleCode: string, featureCode: string): boolean {
    const { data: tenantModules } = useTenantModules()
    return checkFeatureEnabled(tenantModules, moduleCode, featureCode)
}

/**
 * Hook to get all feature states for a module
 * Returns an object with feature codes as keys and boolean as values
 */
export function useModuleFeatures(moduleCode: string): Record<string, boolean> {
    const { data: tenantModules } = useTenantModules()

    if (!tenantModules?.[moduleCode]?.features) {
        return {}
    }

    return tenantModules[moduleCode].features || {}
}
