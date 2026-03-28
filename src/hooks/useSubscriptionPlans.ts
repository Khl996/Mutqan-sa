import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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

type SubscriptionPlanRecord = Omit<SubscriptionPlan, 'sort_order'> & {
    display_order: number | null
}

export type CreatePlanInput = Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at'>

export const planKeys = {
    all: ['plans'] as const,
    list: () => [...planKeys.all, 'list'] as const,
    detail: (id: string) => [...planKeys.all, id] as const,
}

const getAccessToken = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
    const storedSession = localStorage.getItem(storageKey)

    if (storedSession) {
        try {
            return JSON.parse(storedSession).access_token
        } catch {
            return null
        }
    }

    return null
}

const mapPlanRecord = (plan: SubscriptionPlanRecord): SubscriptionPlan => ({
    ...plan,
    sort_order: plan.display_order,
})

const toPlanPayload = (plan: Partial<CreatePlanInput>) => {
    const { sort_order, ...rest } = plan

    return {
        ...rest,
        ...(sort_order !== undefined ? { display_order: sort_order } : {}),
    }
}

export function useSubscriptionPlans() {
    return useQuery({
        queryKey: planKeys.list(),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/subscription_plans?order=display_order.asc`, {
                headers: {
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                },
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Failed to fetch plans')
            }

            const plans = await response.json() as SubscriptionPlanRecord[]
            return plans.map(mapPlanRecord)
        },
    })
}

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
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                    Prefer: 'return=representation',
                },
                body: JSON.stringify(toPlanPayload(plan)),
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Failed to create plan')
            }

            const data = await response.json() as SubscriptionPlanRecord[]
            return data.length > 0 ? mapPlanRecord(data[0]) : null
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: planKeys.list() })
        },
    })
}

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
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                    Prefer: 'return=representation',
                },
                body: JSON.stringify({
                    ...toPlanPayload(updates),
                    updated_at: new Date().toISOString(),
                }),
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Failed to update plan')
            }

            const data = await response.json() as SubscriptionPlanRecord[]
            return data.length > 0 ? mapPlanRecord(data[0]) : null
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: planKeys.list() })
        },
    })
}

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
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                    Prefer: 'return=representation',
                },
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