import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentTenantId } from './useTenantQuery'
import { assetsKeys } from './useAssets'

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
    currentStatus?: string // Optional, for logging previous status
}

export const assetOperationsKeys = {
    logs: (assetId?: string) => [...assetsKeys.all, 'logs', assetId || 'all'] as const,
}

// Hook to change asset status and log it
export function useChangeAssetStatus() {
    const queryClient = useQueryClient()
    const tenantId = useCurrentTenantId()

    return useMutation({
        mutationFn: async ({ assetId, newStatus, notes, currentStatus }: ChangeStatusInput) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            // 1. Update Asset Status
            const updateRes = await fetch(`${supabaseUrl}/rest/v1/assets?id=eq.${assetId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
            })

            if (!updateRes.ok) throw new Error('Failed to update asset status')

            // 2. Insert Log
            // Need user ID for 'performed_by'. 
            // We can decode token or fetch user, but usually RLS handles 'auth.uid()'.
            // However, our table schema has explicit 'performed_by' column. 
            // Let's fetch current user first quickly or rely on backend triggers? 
            // Better fetch user ID from local auth context / decoding token is safer in client side logic 
            // but for now let's get it from the /auth/v1/user endpoint just to be robust or assume the passed logic is correct.
            // Actually, best practice: Let the backend handle 'performed_by' via default or trigger, 
            // BUT since we are using direct REST insert, we should send it if we can.

            // Getting user ID from the token payload (simple parse)
            const tokenBody = JSON.parse(atob(accessToken.split('.')[1]))
            const userId = tokenBody.sub
            console.log('Performing action by User ID:', userId)

            const logRes = await fetch(`${supabaseUrl}/rest/v1/asset_activity_logs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    tenant_id: tenantId,
                    asset_id: assetId,
                    performed_by: userId,
                    action_type: 'status_change',
                    previous_status: currentStatus,
                    new_status: newStatus,
                    notes: notes || null
                })
            })

            if (!logRes.ok) {
                console.warn('Failed to insert asset log', await logRes.text())
                // We don't throw here to avoid failing the whole UI operation if just logging fails, 
                // but ideally logging should be mandatory.
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: assetsKeys.list() })
            queryClient.invalidateQueries({ queryKey: assetsKeys.hierarchy() })
            queryClient.invalidateQueries({ queryKey: assetsKeys.stats() })
            queryClient.invalidateQueries({ queryKey: assetOperationsKeys.logs(variables.assetId) }) // Invalidate specific logs
            queryClient.invalidateQueries({ queryKey: assetOperationsKeys.logs() }) // Invalidate all logs
        }
    })
}

// Hook to fetch Asset Logs
export function useAssetLogs(assetId?: string) {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: assetOperationsKeys.logs(assetId),
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
