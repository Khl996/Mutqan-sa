import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import {
    TenantSettings,
    SettingsCategory,
    DEFAULT_TENANT_SETTINGS,
    mergeWithDefaults,
    getSettingValue as getSettingValueHelper
} from '@/config/tenantSettings'

// Query key
const TENANT_SETTINGS_KEY = 'tenant-settings'

export interface ProofTenantContext {
    id: string
    name: string
    name_ar: string | null
    settings: TenantSettings
}

interface ProofTenantRow {
    id: string
    name: string
    name_ar: string | null
    settings: unknown
}

// Proof documents must derive identity from the work order's tenant, never
// from whichever tenant happens to be selected in ambient application state.
export function useProofTenantContext(
    tenantId: string | null | undefined,
    enabled = true
) {
    return useQuery({
        queryKey: [TENANT_SETTINGS_KEY, 'proof-context', tenantId],
        queryFn: async (): Promise<ProofTenantContext> => {
            if (!tenantId) throw new Error('A work-order tenant is required for proof identity.')

            // The repository's generated Database type intentionally lags the
            // live settings column. Keep the exception local and retain an
            // explicit result shape instead of weakening the shared client.
            const query = supabase
                .from('tenants')
                .select('id, name, name_ar, settings')
                .eq('id', tenantId)
                .single()
            const { data, error } = await (query as unknown as PromiseLike<{
                data: ProofTenantRow | null
                error: unknown
            }>)

            if (error) throw error
            if (!data || data.id !== tenantId) {
                throw new Error('Proof tenant identity could not be verified.')
            }

            return {
                id: data.id,
                name: data.name,
                name_ar: data.name_ar,
                settings: mergeWithDefaults(data.settings as Partial<TenantSettings> | null),
            }
        },
        enabled: enabled && !!tenantId,
    })
}

// Fetch tenant settings
export function useTenantSettings() {
    const { currentTenant } = useTenant()

    return useQuery({
        queryKey: [TENANT_SETTINGS_KEY, currentTenant?.id],
        queryFn: async () => {
            if (!currentTenant?.id) return DEFAULT_TENANT_SETTINGS

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('tenants')
                .select('settings')
                .eq('id', currentTenant.id)
                .single() as any)

            if (error) throw error

            // Merge with defaults to ensure all settings exist
            return mergeWithDefaults(data?.settings as Partial<TenantSettings> | null)
        },
        enabled: !!currentTenant?.id
    })
}

// Update entire settings
export function useUpdateTenantSettings() {
    const queryClient = useQueryClient()
    const { currentTenant } = useTenant()

    return useMutation({
        mutationFn: async (settings: TenantSettings) => {
            if (!currentTenant?.id) throw new Error('No tenant selected')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase
                .from('tenants')
                .update({ settings })
                .eq('id', currentTenant.id) as any)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_KEY] })
        }
    })
}

// Update a single category
export function useUpdateSettingsCategory() {
    const queryClient = useQueryClient()
    const { currentTenant } = useTenant()

    return useMutation({
        mutationFn: async ({
            category,
            values
        }: {
            category: SettingsCategory
            values: Record<string, unknown>
        }) => {
            if (!currentTenant?.id) throw new Error('No tenant selected')

            // Get current settings
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: tenant } = await (supabase
                .from('tenants')
                .select('settings')
                .eq('id', currentTenant.id)
                .single() as any)

            const currentSettings = mergeWithDefaults(tenant?.settings as Partial<TenantSettings> | null)

            // Update the specific category
            const updatedSettings = {
                ...currentSettings,
                [category]: {
                    ...currentSettings[category],
                    ...values
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase
                .from('tenants')
                .update({ settings: updatedSettings })
                .eq('id', currentTenant.id) as any)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_KEY] })
        }
    })
}

// Update a single setting
export function useUpdateSetting() {
    const queryClient = useQueryClient()
    const { currentTenant } = useTenant()

    return useMutation({
        mutationFn: async ({
            category,
            key,
            value
        }: {
            category: SettingsCategory
            key: string
            value: unknown
        }) => {
            if (!currentTenant?.id) throw new Error('No tenant selected')

            // Get current settings
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: tenant } = await (supabase
                .from('tenants')
                .select('settings')
                .eq('id', currentTenant.id)
                .single() as any)

            const currentSettings = mergeWithDefaults(tenant?.settings as Partial<TenantSettings> | null)

            // Update the specific setting
            const updatedSettings = {
                ...currentSettings,
                [category]: {
                    ...currentSettings[category],
                    [key]: value
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase
                .from('tenants')
                .update({ settings: updatedSettings })
                .eq('id', currentTenant.id) as any)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_KEY] })
        }
    })
}

// Reset category to defaults
export function useResetCategorySettings() {
    const queryClient = useQueryClient()
    const { currentTenant } = useTenant()

    return useMutation({
        mutationFn: async (category: SettingsCategory) => {
            if (!currentTenant?.id) throw new Error('No tenant selected')

            // Get current settings
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: tenant } = await (supabase
                .from('tenants')
                .select('settings')
                .eq('id', currentTenant.id)
                .single() as any)

            const currentSettings = mergeWithDefaults(tenant?.settings as Partial<TenantSettings> | null)

            // Reset the category to defaults
            const updatedSettings = {
                ...currentSettings,
                [category]: DEFAULT_TENANT_SETTINGS[category]
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase
                .from('tenants')
                .update({ settings: updatedSettings })
                .eq('id', currentTenant.id) as any)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_KEY] })
        }
    })
}

// Helper hook to get a specific setting value
export function useSettingValue<T>(category: SettingsCategory, key: string): T | undefined {
    const { data: settings } = useTenantSettings()
    return getSettingValueHelper<T>(settings, category, key)
}

// Export types and helpers
export type { TenantSettings, SettingsCategory } from '@/config/tenantSettings'
export { DEFAULT_TENANT_SETTINGS, SETTINGS_CATEGORIES } from '@/config/tenantSettings'

