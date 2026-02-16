import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import { SYSTEM_MODULES, getDefaultEnabledModules, isModuleEnabled, isFeatureEnabled } from '@/config/modules'

export interface TenantModuleConfig {
    enabled: boolean
    features: Record<string, boolean>
}

export type TenantModules = Record<string, TenantModuleConfig>

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

            // If no modules configured, return defaults
            if (!enabledModules || Object.keys(enabledModules).length === 0) {
                return getDefaultEnabledModules()
            }

            return enabledModules
        },
        enabled: !!currentTenant?.id
    })
}

// Update tenant modules configuration
export function useUpdateTenantModules() {
    const queryClient = useQueryClient()
    const { currentTenant } = useTenant()

    return useMutation({
        mutationFn: async (modules: TenantModules) => {
            if (!currentTenant?.id) throw new Error('No tenant selected')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase
                .from('tenants')
                .update({ enabled_modules: modules })
                .eq('id', currentTenant.id) as any)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tenant-modules'] })
            queryClient.invalidateQueries({ queryKey: ['tenants'] })
        }
    })
}

// Toggle module enabled/disabled
export function useToggleModule() {
    const queryClient = useQueryClient()
    const { currentTenant } = useTenant()

    return useMutation({
        mutationFn: async ({ moduleCode, enabled }: { moduleCode: string; enabled: boolean }) => {
            if (!currentTenant?.id) throw new Error('No tenant selected')

            // Get current modules
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: tenant } = await (supabase
                .from('tenants')
                .select('enabled_modules')
                .eq('id', currentTenant.id)
                .single() as any)

            const currentModules = (tenant?.enabled_modules as TenantModules) || getDefaultEnabledModules()

            // Update the specific module
            const updatedModules = {
                ...currentModules,
                [moduleCode]: {
                    ...currentModules[moduleCode],
                    enabled
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase
                .from('tenants')
                .update({ enabled_modules: updatedModules })
                .eq('id', currentTenant.id) as any)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tenant-modules'] })
        }
    })
}

// Toggle feature enabled/disabled
export function useToggleFeature() {
    const queryClient = useQueryClient()
    const { currentTenant } = useTenant()

    return useMutation({
        mutationFn: async ({ moduleCode, featureCode, enabled }: { moduleCode: string; featureCode: string; enabled: boolean }) => {
            if (!currentTenant?.id) throw new Error('No tenant selected')

            // Get current modules
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: tenant } = await (supabase
                .from('tenants')
                .select('enabled_modules')
                .eq('id', currentTenant.id)
                .single() as any)

            const currentModules = (tenant?.enabled_modules as TenantModules) || getDefaultEnabledModules()

            // Update the specific feature
            const updatedModules = {
                ...currentModules,
                [moduleCode]: {
                    ...currentModules[moduleCode],
                    features: {
                        ...currentModules[moduleCode]?.features,
                        [featureCode]: enabled
                    }
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase
                .from('tenants')
                .update({ enabled_modules: updatedModules })
                .eq('id', currentTenant.id) as any)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tenant-modules'] })
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
