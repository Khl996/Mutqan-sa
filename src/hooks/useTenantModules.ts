import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import { SYSTEM_MODULES, getRestrictedEnabledModules, isModuleEnabled, isFeatureEnabled } from '@/config/modules'

export interface TenantModuleConfig {
    enabled: boolean
    features: Record<string, boolean>
}

export type TenantModules = Record<string, TenantModuleConfig>

export const TENANT_MODULES_MANAGED_MESSAGE = 'Modules are managed by the active subscription plan.'

// Fetch tenant modules configuration
export function useTenantModules() {
    const { currentTenant } = useTenant()

    return useQuery({
        queryKey: ['tenant-modules', currentTenant?.id],
        queryFn: async () => {
            if (!currentTenant?.id) return null

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('tenants')
                .select('enabled_modules')
                .eq('id', currentTenant.id)
                .single() as any)

            if (error) throw error

            // Parse the JSONB field
            const enabledModules = data?.enabled_modules as TenantModules | null

            // If no modules are configured, fail closed except for core modules
            if (!enabledModules || Object.keys(enabledModules).length === 0) {
                return getRestrictedEnabledModules()
            }

            return enabledModules
        },
        enabled: !!currentTenant?.id
    })
}

// Update tenant modules configuration
export function useUpdateTenantModules() {
    return useMutation({
        mutationFn: async (_modules: TenantModules) => {
            throw new Error(TENANT_MODULES_MANAGED_MESSAGE)
        }
    })
}

// Toggle module enabled/disabled
export function useToggleModule() {
    return useMutation({
        mutationFn: async (_payload: { moduleCode: string; enabled: boolean }) => {
            throw new Error(TENANT_MODULES_MANAGED_MESSAGE)
        }
    })
}

// Toggle feature enabled/disabled
export function useToggleFeature() {
    return useMutation({
        mutationFn: async (_payload: { moduleCode: string; featureCode: string; enabled: boolean }) => {
            throw new Error(TENANT_MODULES_MANAGED_MESSAGE)
        }
    })
}

// Helper hooks for checking access
export function useModuleAccess(moduleCode: string): boolean {
    const { data: tenantModules } = useTenantModules()
    return isModuleEnabled(tenantModules, moduleCode)
}

export function useFeatureAccess(moduleCode: string, featureCode: string): boolean {
    const { data: tenantModules } = useTenantModules()
    return isFeatureEnabled(tenantModules, moduleCode, featureCode)
}

// Export module list for UI
export { SYSTEM_MODULES }
