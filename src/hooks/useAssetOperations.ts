import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentTenantId } from './useTenantQuery'
import { assetsKeys } from './useAssets'
import { supabase } from '@/lib/supabase'

// Helper to get token (reused)
const getAccessToken = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
    const storedSession = localStorage.getItem(storageKey)
    if (storedSession) {
        try {
            return JSON.parse(storedSession).access_token
        } catch { return null }
    }
    return null
}

export interface AssetLog {
    id: string
    tenant_id: string
    asset_id: string
    performed_by: string
    action_type: string
    previous_status: string | null
    new_status: string | null
    notes: string | null
    created_at: string
    // Joined
    performer?: {
        full_name: string
        email: string
    }
    asset?: {
        name: string
        code: string
    }
}

export interface ChangeStatusInput {
    assetId: string
    newStatus: 'operational' | 'under_maintenance' | 'out_of_service' | 'retired'
    notes?: string
}

export const assetOperationsKeys = {
    logs: (tenantId?: string | null, assetId?: string) => [...assetsKeys.all, 'logs', tenantId || 'all-tenants', assetId || 'all'] as const,
}

// Hook to change asset status and log it
export function useChangeAssetStatus() {
    const queryClient = useQueryClient()
    const tenantId = useCurrentTenantId()

    return useMutation({
        mutationFn: async ({ assetId, newStatus, notes }: ChangeStatusInput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('update_asset_status_with_log', {
                p_asset_id: assetId,
                p_new_status: newStatus,
                p_notes: notes || null,
            })

            if (error) throw error
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: assetsKeys.list() })
            queryClient.invalidateQueries({ queryKey: assetsKeys.asset(variables.assetId) })
            queryClient.invalidateQueries({ queryKey: assetsKeys.hierarchy() })
            queryClient.invalidateQueries({ queryKey: assetsKeys.stats() })
            queryClient.invalidateQueries({ queryKey: assetOperationsKeys.logs(tenantId, variables.assetId) })
            queryClient.invalidateQueries({ queryKey: assetOperationsKeys.logs(tenantId) })
        }
    })
}

// Hook to fetch Asset Logs
export function useAssetLogs(assetId?: string) {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: assetOperationsKeys.logs(tenantId, assetId),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            // Simplified query to check if relations are working
            let query = `${supabaseUrl}/rest/v1/asset_activity_logs?select=*,profiles(full_name,email),assets(name,code)&order=created_at.desc`

            if (tenantId) query += `&tenant_id=eq.${tenantId}`
            if (assetId) query += `&asset_id=eq.${assetId}`

            const response = await fetch(query, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch asset logs')

            const data = await response.json()

            // Map the simple names back to our expected interface if needed
            return data.map((item: any) => ({
                ...item,
                performer: item.profiles, // Map profiles -> performer
                asset: item.assets       // Map assets -> asset
            })) as AssetLog[]
        }
    })
}
