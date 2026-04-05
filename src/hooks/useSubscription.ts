import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { normalizePlanFeatureCodes } from '@/config/modules'

// Subscription Plan Type
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
    features: string[]
    is_active: boolean
    display_order: number
    created_at: string
    updated_at: string
}

export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'cancelled' | 'suspended'
export type OverrideType = 'none' | 'trial_extension' | 'one_time_discount' | 'complimentary' | 'free_forever'
export type DiscountType = 'none' | 'percentage' | 'fixed_amount'

// Tenant Subscription Type
export interface TenantSubscription {
    id: string
    tenant_id: string
    plan_id: string
    status: SubscriptionStatus
    billing_cycle: 'monthly' | 'yearly'
    current_period_start: string
    current_period_end: string
    trial_ends_at: string | null
    cancelled_at: string | null
    amount: number
    currency: string
    cancel_at_period_end: boolean
    // Admin override fields (migration 099)
    override_type: OverrideType
    discount_type: DiscountType
    discount_value: number
    discount_applies_to_next_only: boolean
    admin_note: string | null
    created_at: string
    updated_at: string
    // Joined
    plan?: SubscriptionPlan
    tenant?: { id: string; name: string; name_ar: string | null }
}

// Usage Stats Type
export interface TenantUsage {
    users_count: number
    buildings_count: number
    assets_count: number
    work_orders_this_month: number
}

// Input for admin_manage_subscription RPC
export interface AdminManageSubscriptionInput {
    tenantId: string
    status: SubscriptionStatus
    planId?: string
    periodEnd?: string          // ISO date string
    billingCycle?: 'monthly' | 'yearly'
    overrideType?: OverrideType
    discountType?: DiscountType
    discountValue?: number
    discountAppliesToNextOnly?: boolean
    adminNote?: string | null
}

// Query Keys
export const subscriptionKeys = {
    all: ['subscriptions'] as const,
    plans: () => [...subscriptionKeys.all, 'plans'] as const,
    tenantSubscription: (tenantId: string) => [...subscriptionKeys.all, 'tenant', tenantId] as const,
    usage: (tenantId: string) => [...subscriptionKeys.all, 'usage', tenantId] as const,
}

// Fetch Subscription Plans — DB is the single source of truth
export function useSubscriptionPlans() {
    return useQuery({
        queryKey: subscriptionKeys.plans(),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await supabase
                .from('subscription_plans')
                .select('*')
                .eq('is_active', true)
                .order('display_order') as any

            if (error) {
                console.error('Failed to fetch subscription_plans:', error.message)
                throw new Error('Could not load subscription plans')
            }
            return ((data || []) as SubscriptionPlan[]).map(plan => ({
                ...plan,
                features: normalizePlanFeatureCodes(plan.features),
            }))
        },
    })
}

// Fetch Tenant Subscription
export function useTenantSubscription(tenantId: string) {
    return useQuery({
        queryKey: subscriptionKeys.tenantSubscription(tenantId),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await supabase
                .from('tenant_subscriptions')
                .select(`
                    *,
                    plan:subscription_plans(*),
                    tenant:tenants(id, name, name_ar)
                `)
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single() as any

            if (error) {
                console.warn('No subscription found for tenant')
                return null
            }
            const subscription = data as TenantSubscription

            // Normalize override fields (may be missing on older rows)
            subscription.override_type = subscription.override_type ?? 'none'
            subscription.discount_type = subscription.discount_type ?? 'none'
            subscription.discount_value = subscription.discount_value ?? 0
            subscription.discount_applies_to_next_only = subscription.discount_applies_to_next_only ?? false

            if (subscription.plan) {
                subscription.plan = {
                    ...subscription.plan,
                    features: normalizePlanFeatureCodes(subscription.plan.features),
                }
            }

            return subscription
        },
        enabled: !!tenantId,
    })
}

// Fetch Tenant Usage
export function useTenantUsage(tenantId: string) {
    return useQuery({
        queryKey: subscriptionKeys.usage(tenantId),
        queryFn: async () => {
            // Get counts from different tables
            const [usersRes, buildingsRes, assetsRes, workOrdersRes] = await Promise.all([
                supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
                supabase.from('buildings').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
                supabase.from('assets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
                supabase.from('work_orders')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', tenantId)
                    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
            ])

            return {
                users_count: usersRes.count || 0,
                buildings_count: buildingsRes.count || 0,
                assets_count: assetsRes.count || 0,
                work_orders_this_month: workOrdersRes.count || 0,
            } as TenantUsage
        },
        enabled: !!tenantId,
    })
}

// Admin: Comprehensive subscription management (migration 099)
export function useAdminManageSubscription() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: AdminManageSubscriptionInput) => {
            const { data, error } = await supabase.rpc('admin_manage_subscription', {
                p_tenant_id:                    input.tenantId,
                p_status:                       input.status,
                p_plan_id:                      input.planId ?? null,
                p_period_end:                   input.periodEnd ?? null,
                p_billing_cycle:                input.billingCycle ?? null,
                p_override_type:                input.overrideType ?? 'none',
                p_discount_type:                input.discountType ?? 'none',
                p_discount_value:               input.discountValue ?? 0,
                p_discount_applies_to_next_only: input.discountAppliesToNextOnly ?? false,
                p_admin_note:                   input.adminNote ?? null,
            } as any)

            if (error) throw error
            return data
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: subscriptionKeys.tenantSubscription(variables.tenantId) })
            queryClient.invalidateQueries({ queryKey: ['tenants'] })
        },
    })
}

// Legacy: Update Subscription (kept for backwards compat, delegates to admin_update_subscription)
export function useUpdateSubscription() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            tenantId,
            planId,
            billingCycle
        }: {
            tenantId: string
            planId: string
            billingCycle: 'monthly' | 'yearly'
        }) => {
            const { data, error } = await supabase.rpc('admin_update_subscription', {
                p_tenant_id: tenantId,
                p_plan_id: planId,
                p_billing_cycle: billingCycle,
                p_status: 'active'
            } as any)

            if (error) throw error
            return data
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: subscriptionKeys.tenantSubscription(variables.tenantId) })
            queryClient.invalidateQueries({ queryKey: ['tenants'] })
        },
    })
}

// Cancel Subscription (Set to cancel at period end)
export function useCancelSubscription() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (tenantId: string) => {
            const now = new Date()

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error }: any = await (supabase
                .from('tenant_subscriptions') as any)
                .update({
                    cancel_at_period_end: true,
                    updated_at: now.toISOString(),
                })
                .eq('tenant_id', tenantId)

            if (error) throw error

            // We DO NOT update tenant status to 'cancelled' immediately.
            // Access remains until the period ends.
        },
        onSuccess: (_, tenantId) => {
            queryClient.invalidateQueries({ queryKey: subscriptionKeys.tenantSubscription(tenantId) })
            queryClient.invalidateQueries({ queryKey: ['tenants'] })
        },
    })
}

// Resume Subscription (Undo cancellation)
export function useResumeSubscription() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (tenantId: string) => {
            const now = new Date()

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error }: any = await (supabase
                .from('tenant_subscriptions') as any)
                .update({
                    cancel_at_period_end: false,
                    updated_at: now.toISOString(),
                })
                .eq('tenant_id', tenantId)

            if (error) throw error
        },
        onSuccess: (_, tenantId) => {
            queryClient.invalidateQueries({ queryKey: subscriptionKeys.tenantSubscription(tenantId) })
            queryClient.invalidateQueries({ queryKey: ['tenants'] })
        },
    })
}

// Feature Check Helper
export function hasFeature(plan: SubscriptionPlan | null | undefined, feature: string): boolean {
    if (!plan) return false
    return normalizePlanFeatureCodes(plan.features).includes(feature)
}

// Usage Limit Check Helper
export function isWithinLimits(
    usage: TenantUsage | null | undefined,
    plan: SubscriptionPlan | null | undefined
): { isValid: boolean; limitedResource: string | null } {
    if (!usage || !plan) return { isValid: true, limitedResource: null }

    if (plan.max_users > 0 && usage.users_count >= plan.max_users) {
        return { isValid: false, limitedResource: 'users' }
    }
    if (plan.max_buildings > 0 && usage.buildings_count >= plan.max_buildings) {
        return { isValid: false, limitedResource: 'buildings' }
    }
    if (plan.max_assets > 0 && usage.assets_count >= plan.max_assets) {
        return { isValid: false, limitedResource: 'assets' }
    }
    if (plan.max_work_orders_monthly > 0 && usage.work_orders_this_month >= plan.max_work_orders_monthly) {
        return { isValid: false, limitedResource: 'work_orders' }
    }

    return { isValid: true, limitedResource: null }
}
