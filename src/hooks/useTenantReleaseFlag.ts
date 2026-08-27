import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { supabase } from '@/lib/supabase'
import {
    resolveTenantReleaseFlag,
    type TenantReleaseFlagDecision,
} from '@/lib/tenantReleaseFlag'
import type { TenantReleaseFlagKey } from '@/config/releaseFlags'

interface ReleaseFlagRpcClient {
    rpc: (
        functionName: 'get_my_tenant_release_flag',
        args: { p_flag_key: string }
    ) => PromiseLike<{ data: unknown; error: unknown }>
}

export interface TenantReleaseFlagState {
    status: TenantReleaseFlagDecision
    enabled: boolean
    isChecking: boolean
    error: unknown
}

export function useTenantReleaseFlag(flagKey: TenantReleaseFlagKey): TenantReleaseFlagState {
    const { user, isLoading: authIsLoading } = useAuth()
    const { currentTenant, isLoading: tenantIsLoading } = useTenant()
    const userId = user?.id ?? null
    const tenantId = currentTenant?.id ?? null

    const query = useQuery({
        queryKey: ['tenant-release-flag', userId, tenantId, flagKey],
        queryFn: async () => {
            const client = supabase as unknown as ReleaseFlagRpcClient
            const { data, error } = await client.rpc('get_my_tenant_release_flag', {
                p_flag_key: flagKey,
            })

            if (error) throw error
            return data
        },
        enabled: Boolean(userId && tenantId),
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        networkMode: 'always',
    })

    const status = resolveTenantReleaseFlag({
        currentUserId: userId,
        currentTenantId: tenantId,
        requestedFlagKey: flagKey,
        data: query.data,
        pending: authIsLoading
            || tenantIsLoading
            || Boolean(userId && tenantId && query.isPending),
        failed: query.isError,
    })

    return {
        status,
        enabled: status === 'enabled',
        isChecking: status === 'checking',
        error: query.error,
    }
}
