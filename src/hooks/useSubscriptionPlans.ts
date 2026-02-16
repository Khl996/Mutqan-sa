import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface SubscriptionPlan {
    id: string
    code: string
    name: string
    name_ar: string | null
    description: string | null
    description_ar: string | null
    price_monthly: number
    price_yearly: number
    currency: string
    max_users: number
    max_buildings: number
    max_assets: number
    max_work_orders_monthly: number
    max_storage_mb: number
    features: string[]
    is_active: boolean
    is_popular: boolean
    sort_order: number | null
    is_default: boolean
    trial_days: number
    created_at: string
    updated_at: string
}

export type CreatePlanInput = Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at'>

export const planKeys = {
    all: ['plans'] as const,
    list: () => [...planKeys.all, 'list'] as const,
    detail: (id: string) => [...planKeys.all, id] as const,
}

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

// Fetch All Plans
export function useSubscriptionPlans() {
    return useQuery({
        queryKey: planKeys.list(),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) throw new Error('Not authenticated')

            // Fetch plans and order by display_order
            const response = await fetch(`${supabaseUrl}/rest/v1/subscription_plans?order=display_order.asc`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Failed to fetch plans')
            }

            return await response.json() as SubscriptionPlan[]
        },
    })
}

// Create Plan
export function useCreatePlan() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (plan: CreatePlanInput) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/subscription_plans`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(plan)
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Failed to create plan')
            }

            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: planKeys.list() })
        },
    })
}

// Update Plan
export function useUpdatePlan() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<CreatePlanInput> & { id: string }) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/subscription_plans?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Failed to update plan')
            }

            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: planKeys.list() })
        },
    })
}

// Delete Plan
export function useDeletePlan() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/subscription_plans?id=eq.${id}`, {
                method: 'DELETE',
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                }
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Failed to delete plan')
            }

            const data = await response.json()
            if (!data || data.length === 0) {
                throw new Error('Could not delete plan. You may not have permission or it is in use.')
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: planKeys.list() })
        },
    })
}
