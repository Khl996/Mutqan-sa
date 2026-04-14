/**
 * usePricingEngine.ts
 *
 * All React Query hooks for the Mutqan pricing engine.
 * Covers: add-ons, discount policies, quotes, and calculation.
 *
 * Design rules:
 *  - Backend is authoritative. No pricing logic lives in this file.
 *  - calculate_pricing_quote() is called server-side for live previews.
 *  - create / approve / activate all go through RPCs, not direct table writes.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AddOnCategory = 'support' | 'training' | 'integration' | 'reporting' | 'infrastructure' | 'service' | 'custom'
export type AddOnBillingType = 'recurring' | 'one_time'

export interface PricingAddOn {
    id: string
    code: string
    name: string
    name_ar: string | null
    description: string | null
    description_ar: string | null
    category: AddOnCategory
    billing_type: AddOnBillingType
    price_monthly: number
    price_yearly: number
    price_one_time: number
    currency: string
    is_active: boolean
    sort_order: number
    created_at: string
    updated_at: string
}

export type DiscountType = 'percentage' | 'fixed_amount'

export interface PricingDiscountPolicy {
    id: string
    code: string
    name: string
    name_ar: string | null
    description: string | null
    discount_type: DiscountType
    discount_value: number
    applies_to: 'subtotal' | 'base_plan_only' | 'addons_only'
    max_uses: number | null
    uses_count: number
    valid_from: string | null
    valid_to: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'activated'
export type BillingCycle = 'monthly' | 'yearly'
export type QuoteItemType = 'base_plan' | 'add_on' | 'discount' | 'custom'

export interface PricingQuoteItem {
    id: string
    quote_id: string
    item_type: QuoteItemType
    plan_id: string | null
    add_on_id: string | null
    description: string
    description_ar: string | null
    quantity: number
    unit_price: number
    subtotal: number
    sort_order: number
    metadata: Record<string, unknown>
    created_at: string
}

export interface PricingQuote {
    id: string
    quote_number: string
    tenant_id: string | null
    plan_id: string | null
    discount_policy_id: string | null
    status: QuoteStatus
    billing_cycle: BillingCycle
    input_users: number
    input_buildings: number
    input_assets: number
    input_work_orders_monthly: number
    base_plan_amount: number
    addons_amount: number
    subtotal: number
    discount_amount: number
    taxable_amount: number
    tax_rate: number
    tax_amount: number
    total: number
    currency: string
    manual_override_total: number | null
    manual_override_reason: string | null
    valid_until: string | null
    admin_notes: string | null
    client_notes: string | null
    pricing_snapshot: Record<string, unknown>
    subscription_id: string | null
    created_by: string | null
    approved_by: string | null
    activated_by: string | null
    approved_at: string | null
    activated_at: string | null
    created_at: string
    updated_at: string
    // Joined
    tenant?: { id: string; name: string; name_ar: string | null }
    plan?: { id: string; code: string; name: string; name_ar: string | null }
    items?: PricingQuoteItem[]
}

export interface QuoteCalculationResult {
    base_plan_amount: number
    addons_amount: number
    subtotal: number
    discount_type: string
    discount_value: number
    discount_amount: number
    taxable_amount: number
    tax_rate: number
    tax_amount: number
    total: number
    currency: string
    items: Array<{
        item_type: QuoteItemType
        description: string
        description_ar: string | null
        plan_id: string | null
        add_on_id: string | null
        quantity: number
        unit_price: number
        subtotal: number
        sort_order: number
    }>
}

export interface CreateQuoteInput {
    tenantId: string
    planId?: string | null
    billingCycle: BillingCycle
    addOnIds?: string[]
    discountPolicyId?: string | null
    manualDiscType?: 'none' | DiscountType
    manualDiscValue?: number
    taxRate?: number
    validDays?: number
    adminNotes?: string | null
    clientNotes?: string | null
    inputUsers?: number
    inputBuildings?: number
    inputAssets?: number
    inputWorkOrders?: number
}

export interface CalculateQuoteInput {
    planId?: string | null
    billingCycle: BillingCycle
    addOnIds?: string[]
    discountPolicyId?: string | null
    manualDiscType?: 'none' | DiscountType
    manualDiscValue?: number
    taxRate?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY KEYS
// ─────────────────────────────────────────────────────────────────────────────

export const pricingKeys = {
    addOns: () => ['pricing', 'add_ons'] as const,
    discountPolicies: () => ['pricing', 'discount_policies'] as const,
    quotes: (filters?: Record<string, unknown>) => ['pricing', 'quotes', filters] as const,
    quote: (id: string) => ['pricing', 'quote', id] as const,
    calculation: (input: CalculateQuoteInput) => ['pricing', 'calc', input] as const,
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD-ONS
// ─────────────────────────────────────────────────────────────────────────────

export function usePricingAddOns(activeOnly = true) {
    return useQuery({
        queryKey: pricingKeys.addOns(),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q = (supabase.from('pricing_add_ons').select('*') as any)
            if (activeOnly) q = q.eq('is_active', true)
            const { data, error } = await q.order('sort_order')
            if (error) throw error
            return (data || []) as PricingAddOn[]
        },
    })
}

export function useCreateAddOn() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: Omit<PricingAddOn, 'id' | 'created_at' | 'updated_at'>) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('pricing_add_ons') as any)
                .insert(input)
                .select()
                .single()
            if (error) throw error
            return data as PricingAddOn
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: pricingKeys.addOns() }),
    })
}

export function useUpdateAddOn() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<PricingAddOn> & { id: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('pricing_add_ons') as any)
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single()
            if (error) throw error
            return data as PricingAddOn
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: pricingKeys.addOns() }),
    })
}

export function useDeleteAddOn() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('pricing_add_ons') as any)
                .delete()
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: pricingKeys.addOns() }),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOUNT POLICIES
// ─────────────────────────────────────────────────────────────────────────────

export function usePricingDiscountPolicies(activeOnly = false) {
    return useQuery({
        queryKey: pricingKeys.discountPolicies(),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q = (supabase.from('pricing_discount_policies').select('*') as any)
            if (activeOnly) q = q.eq('is_active', true)
            const { data, error } = await q.order('created_at', { ascending: false })
            if (error) throw error
            return (data || []) as PricingDiscountPolicy[]
        },
    })
}

export function useCreateDiscountPolicy() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: Omit<PricingDiscountPolicy, 'id' | 'uses_count' | 'created_at' | 'updated_at'>) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('pricing_discount_policies') as any)
                .insert(input)
                .select()
                .single()
            if (error) throw error
            return data as PricingDiscountPolicy
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: pricingKeys.discountPolicies() }),
    })
}

export function useUpdateDiscountPolicy() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<PricingDiscountPolicy> & { id: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('pricing_discount_policies') as any)
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single()
            if (error) throw error
            return data as PricingDiscountPolicy
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: pricingKeys.discountPolicies() }),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTES — LIST
// ─────────────────────────────────────────────────────────────────────────────

export function usePricingQuotes(filters?: { tenantId?: string; status?: QuoteStatus }) {
    return useQuery({
        queryKey: pricingKeys.quotes(filters),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q = (supabase
                .from('pricing_quotes')
                .select(`
                    *,
                    tenant:tenants(id, name, name_ar),
                    plan:subscription_plans(id, code, name, name_ar)
                `) as any)

            if (filters?.tenantId) q = q.eq('tenant_id', filters.tenantId)
            if (filters?.status)   q = q.eq('status', filters.status)

            const { data, error } = await q.order('created_at', { ascending: false })
            if (error) throw error
            return (data || []) as PricingQuote[]
        },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTES — SINGLE (with line items)
// ─────────────────────────────────────────────────────────────────────────────

export function usePricingQuote(quoteId: string | null) {
    return useQuery({
        queryKey: pricingKeys.quote(quoteId ?? ''),
        enabled: !!quoteId,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('pricing_quotes')
                .select(`
                    *,
                    tenant:tenants(id, name, name_ar),
                    plan:subscription_plans(id, code, name, name_ar),
                    items:pricing_quote_items(*)
                `)
                .eq('id', quoteId!)
                .single() as any)
            if (error) throw error
            const q = data as PricingQuote
            if (q.items) {
                q.items = [...q.items].sort((a, b) => a.sort_order - b.sort_order)
            }
            return q
        },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE PRICING CALCULATION (calls the backend calculator)
// Debounced by React Query's staleTime. No side effects.
// ─────────────────────────────────────────────────────────────────────────────

export function useCalculatePricingQuote(input: CalculateQuoteInput) {
    return useQuery({
        queryKey: pricingKeys.calculation(input),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('calculate_pricing_quote', {
                p_plan_id:            input.planId ?? null,
                p_billing_cycle:      input.billingCycle,
                p_add_on_ids:         input.addOnIds ?? [],
                p_discount_policy_id: input.discountPolicyId ?? null,
                p_manual_disc_type:   input.manualDiscType ?? 'none',
                p_manual_disc_value:  input.manualDiscValue ?? 0,
                p_tax_rate:           input.taxRate ?? 15,
            })
            if (error) throw error
            return data as QuoteCalculationResult
        },
        staleTime: 30_000,   // re-fetch at most every 30 s for the same inputs
        gcTime: 60_000,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTES — CREATE / APPROVE / REJECT / ACTIVATE
// ─────────────────────────────────────────────────────────────────────────────

export function useCreatePricingQuote() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: CreateQuoteInput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('create_pricing_quote', {
                p_tenant_id:           input.tenantId,
                p_plan_id:             input.planId ?? null,
                p_billing_cycle:       input.billingCycle,
                p_add_on_ids:          input.addOnIds ?? [],
                p_discount_policy_id:  input.discountPolicyId ?? null,
                p_manual_disc_type:    input.manualDiscType ?? 'none',
                p_manual_disc_value:   input.manualDiscValue ?? 0,
                p_tax_rate:            input.taxRate ?? 15,
                p_valid_days:          input.validDays ?? 30,
                p_admin_notes:         input.adminNotes ?? null,
                p_client_notes:        input.clientNotes ?? null,
                p_input_users:         input.inputUsers ?? 0,
                p_input_buildings:     input.inputBuildings ?? 0,
                p_input_assets:        input.inputAssets ?? 0,
                p_input_work_orders:   input.inputWorkOrders ?? 0,
            })
            if (error) throw error
            return data as { success: boolean; quote_id: string; quote_number: string; total: number }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing', 'quotes'] }),
    })
}

export function useApprovePricingQuote() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ quoteId, adminNote }: { quoteId: string; adminNote?: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('approve_pricing_quote', {
                p_quote_id:   quoteId,
                p_admin_note: adminNote ?? null,
            })
            if (error) throw error
            return data
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['pricing', 'quotes'] })
        },
    })
}

export function useRejectPricingQuote() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ quoteId, reason }: { quoteId: string; reason?: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('pricing_quotes') as any)
                .update({
                    status: 'rejected',
                    admin_notes: reason ?? null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', quoteId)
            if (error) throw error
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing', 'quotes'] }),
    })
}

export function useActivateSubscriptionFromQuote() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ quoteId, periodMonths }: { quoteId: string; periodMonths?: number }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('activate_subscription_from_quote', {
                p_quote_id:      quoteId,
                p_period_months: periodMonths ?? null,
            })
            if (error) throw error
            return data as {
                success: boolean
                subscription_id: string
                quote_id: string
                quote_number: string
                period_end: string
                amount: number
            }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['pricing', 'quotes'] })
            qc.invalidateQueries({ queryKey: ['subscriptions'] })
            qc.invalidateQueries({ queryKey: ['tenants'] })
        },
    })
}

// Update manual override total on a draft/approved quote
export function useUpdateQuoteOverride() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({
            quoteId,
            overrideTotal,
            reason,
        }: {
            quoteId: string
            overrideTotal: number | null
            reason: string | null
        }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase.from('pricing_quotes') as any)
                .update({
                    manual_override_total:  overrideTotal,
                    manual_override_reason: reason,
                    updated_at:             new Date().toISOString(),
                })
                .eq('id', quoteId)
            if (error) throw error
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: pricingKeys.quote(vars.quoteId) })
            qc.invalidateQueries({ queryKey: ['pricing', 'quotes'] })
        },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export function quoteStatusColor(status: QuoteStatus): string {
    switch (status) {
        case 'draft':     return 'bg-gray-100 text-gray-600'
        case 'sent':      return 'bg-blue-100 text-blue-700'
        case 'approved':  return 'bg-emerald-100 text-emerald-700'
        case 'activated': return 'bg-green-100 text-green-800'
        case 'rejected':  return 'bg-red-100 text-red-700'
        case 'expired':   return 'bg-orange-100 text-orange-700'
        default:          return 'bg-gray-100 text-gray-600'
    }
}

export function quoteStatusLabelAr(status: QuoteStatus): string {
    switch (status) {
        case 'draft':     return 'مسودة'
        case 'sent':      return 'مرسل'
        case 'approved':  return 'معتمد'
        case 'activated': return 'مُفعَّل'
        case 'rejected':  return 'مرفوض'
        case 'expired':   return 'منتهي'
        default:          return status
    }
}

export function formatSAR(amount: number): string {
    return new Intl.NumberFormat('en-SA', {
        style: 'currency', currency: 'SAR', minimumFractionDigits: 2,
    }).format(amount)
}
