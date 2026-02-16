
import { useQuery } from '@tanstack/react-query'
import { TeamMember } from './useTeams'

// Helper to get token
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

export function useTenantUsersList(tenantId: string | null) {
    return useQuery({
        queryKey: ['tenant-users', tenantId],
        queryFn: async () => {
            if (!tenantId) return []

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?tenant_id=eq.${tenantId}&order=full_name.asc`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch tenant users')

            const data = await response.json()
            return data as TeamMember[]
        },
        enabled: !!tenantId
    })
}
