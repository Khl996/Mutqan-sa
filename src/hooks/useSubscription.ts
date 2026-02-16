import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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

// Tenant Subscription Type
export interface TenantSubscription {
    id: string
    tenant_id: string
    plan_id: string
    status: 'active' | 'trial' | 'expired' | 'cancelled' | 'suspended'
    billing_cycle: 'monthly' | 'yearly'
    current_period_start: string
    current_period_end: string
    trial_ends_at: string | null
    cancelled_at: string | null
    amount: number
    currency: string
    cancel_at_period_end: boolean
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

// Query Keys
export const subscriptionKeys = {
    all: ['subscriptions'] as const,
    plans: () => [...subscriptionKeys.all, 'plans'] as const,
    tenantSubscription: (tenantId: string) => [...subscriptionKeys.all, 'tenant', tenantId] as const,
    usage: (tenantId: string) => [...subscriptionKeys.all, 'usage', tenantId] as const,
}

// Default Plans (can be seeded in DB)
export const DEFAULT_PLANS: Partial<SubscriptionPlan>[] = [
    {
        code: 'free',
        name: 'Free',
        name_ar: 'مجاني',
        description: 'For small teams getting started',
        description_ar: 'للفرق الصغيرة في البداية',
        price_monthly: 0,
        price_yearly: 0,
        currency: 'SAR',
        max_users: 3,
        max_buildings: 1,
        max_assets: 50,
        max_work_orders_monthly: 50,
        features: ['basic_reporting', 'email_support'],
        display_order: 1,
    },
    {
        code: 'basic',
        name: 'Basic',
        name_ar: 'أساسي',
        description: 'For growing organizations',
        description_ar: 'للمنظمات النامية',
        price_monthly: 299,
        price_yearly: 2990,
        currency: 'SAR',
        max_users: 10,
        max_buildings: 3,
        max_assets: 200,
        max_work_orders_monthly: 200,
        features: ['basic_reporting', 'email_support', 'inventory_management', 'maintenance_calendar'],
        display_order: 2,
    },
    {
        code: 'professional',
        name: 'Professional',
        name_ar: 'احترافي',
        description: 'For professional facilities management',
        description_ar: 'لإدارة المرافق الاحترافية',
        price_monthly: 599,
        price_yearly: 5990,
        currency: 'SAR',
        max_users: 25,
        max_buildings: 10,
        max_assets: 1000,
        max_work_orders_monthly: 1000,
        features: ['advanced_reporting', 'priority_support', 'inventory_management', 'maintenance_calendar', 'api_access', 'custom_workflows'],
        display_order: 3,
    },
    {
        code: 'enterprise',
        name: 'Enterprise',
        name_ar: 'مؤسسي',
        description: 'For large enterprises with custom needs',
        description_ar: 'للمؤسسات الكبيرة ذات الاحتياجات المخصصة',
        price_monthly: 1499,
        price_yearly: 14990,
        currency: 'SAR',
        max_users: -1, // Unlimited
        max_buildings: -1, // Unlimited
        max_assets: -1, // Unlimited
        max_work_orders_monthly: -1, // Unlimited
        features: ['advanced_reporting', 'dedicated_support', 'inventory_management', 'maintenance_calendar', 'api_access', 'custom_workflows', 'sla_management', 'multi_location', 'white_label'],
        display_order: 4,
    },
]

// Fetch Subscription Plans
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
                // If table doesn't exist, return default plans
                console.warn('subscription_plans table not found, using defaults')
                return DEFAULT_PLANS as SubscriptionPlan[]
            }
            return data as SubscriptionPlan[]
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
            return data as TenantSubscription
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

// Update Tenant Subscription
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
            // Get plan details
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: plan } = await supabase
                .from('subscription_plans')
                .select('*')
                .eq('id', planId)
                .single() as any

            if (!plan) throw new Error('Plan not found')

            const amount = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
            const now = new Date()
            const periodEnd = new Date(now)

            if (billingCycle === 'yearly') {
                periodEnd.setFullYear(periodEnd.getFullYear() + 1)
            } else {
                periodEnd.setMonth(periodEnd.getMonth() + 1)
            }

            // Upsert subscription
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('tenant_subscriptions')
                .upsert({
                    tenant_id: tenantId,
                    plan_id: planId,
                    status: 'active',
                    billing_cycle: billingCycle,
                    current_period_start: now.toISOString(),
                    current_period_end: periodEnd.toISOString(),
                    amount,
                    currency: plan.currency,
                    updated_at: now.toISOString(),
                }, { onConflict: 'tenant_id' }) as any)
                .select()
                .single()

            if (error) throw error

            // Update tenant's subscription info
            await (supabase
                .from('tenants')
                .update({
                    subscription_tier: plan.code,
                    subscription_status: 'active',
                    subscription_expires_at: periodEnd.toISOString(),
                    max_users: plan.max_users,
                    max_buildings: plan.max_buildings,
                    updated_at: now.toISOString(),
                }) as any)
                .eq('id', tenantId)

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
    return plan.features?.includes(feature) || false
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
