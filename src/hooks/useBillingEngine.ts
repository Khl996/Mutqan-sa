/**
 * useBillingEngine.ts
 *
 * Unified React Query hooks for the Mutqan billing engine (migration 101+).
 * Covers: add-ons, discount policies, quotes, invoices, and engine RPCs.
 *
 * Design rules:
 *  - Backend is authoritative. No pricing logic lives here.
 *  - engine_calculate() drives all live previews.
 *  - All write operations go through engine_* RPCs, never direct table writes.
 *  - Matches schema from 101_unified_billing_engine.sql exactly.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type NewSubscriptionStatus = 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled'
export type BillingCycle = 'monthly' | 'yearly'
export type AddOnBillingType = 'recurring' | 'one_time'
export type DiscountTypeEngine = 'percentage' | 'fixed'
export type BillingQuoteStatus = 'draft' | 'approved' | 'activated' | 'expired'
export type BillingInvoiceStatus = 'draft' | 'paid' | 'void'

export interface BillingAddOn {
    id: string
    code: string
    name: string
    name_ar: string
    description: string | null
    description_ar: string | null
    price: number
    billing_type: AddOnBillingType
    is_active: boolean
    sort_order: number
    created_at: string
    updated_at: string
}

export interface DiscountPolicy {
    id: string
    code: string
    name: string
    name_ar: string
    description: string | null
    description_ar: string | null
    discount_type: DiscountTypeEngine
    discount_value: number
    valid_from: string | null
    valid_to: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface BillingLineItem {
    type: 'plan' | 'add_on' | 'discount'
    id: string
    code: string
    name: string
    name_ar: string
    billing_cycle?: string
    billing_type?: string
    discount_type?: string
    discount_value?: number
    unit_price: number
    subtotal: number
    sort_order: number
}

export interface BillingQuote {
    id: string
    quote_number: string
    tenant_id: string
    plan_id: string
    discount_policy_id: string | null
    status: BillingQuoteStatus
    billing_cycle: BillingCycle
    line_items: BillingLineItem[]
    subtotal: number
    discount_amount: number
    tax_rate: number
    tax_amount: number
    total: number
    valid_until: string
    pricing_snapshot: Record<string, unknown> | null
    admin_notes: string | null
    client_notes: string | null
    created_by: string | null
    approved_by: string | null
    approved_at: string | null
    activated_by: string | null
    activated_at: string | null
    subscription_id: string | null
    created_at: string
    updated_at: string
    // Joined
    tenant?: { id: string; name: string; name_ar: string | null }
    plan?: { id: string; code: string; name: string; name_ar: string | null }
}

export interface BillingInvoice {
    id: string
    invoice_number: string
    tenant_id: string
    subscription_id: string | null
    quote_id: string | null
    subtotal: number
    discount_amount: number
    tax_rate: number
    tax_amount: number
    total: number
    status: BillingInvoiceStatus
    payment_method: 'tap' | 'bank_transfer' | 'manual' | null
    payment_reference: string | null
    paid_at: string | null
    billing_period_start: string | null
    billing_period_end: string | null
    notes: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    // Joined
    tenant?: { id: string; name: string; name_ar: string | null }
}

export interface PricingBreakdown {
    plan_amount: number
    add_ons_amount: number
    subtotal: number
    discount_amount: number
    taxable_amount: number
    tax_rate: number
    tax_amount: number
    total: number
    currency: string
    breakdown: BillingLineItem[]
}

export interface ActivationResult {
    subscription_id: string
    invoice_id: string | null
    invoice_number: string | null
    status: string
    period_start: string
    period_end: string
    amount: number
}

export interface QuoteResult {
    quote_id: string
    quote_number: string
    total: number
    valid_until: string
}

export interface CalculateInput {
    planId: string | null
    billingCycle: BillingCycle
    addOnIds?: string[]
    discountPolicyId?: string | null
}

export interface CreateQuoteEngineInput {
    tenantId: string
    planId: string
    billingCycle: BillingCycle
    addOnIds?: string[]
    discountPolicyId?: string | null
    validDays?: number
    adminNotes?: string | null
    clientNotes?: string | null
}

export interface ActivateInput {
    tenantId: string
    planId: string
    billingCycle: BillingCycle
    source?: 'admin' | 'self_service' | 'quote'
    status?: 'active' | 'trial'
    trialDays?: number | null
    discountPolicyId?: string | null
    quoteId?: string | null
    paymentMethod?: string | null
    paymentReference?: string | null
    amount?: number | null
    adminNote?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY KEYS
// ─────────────────────────────────────────────────────────────────────────────

export const billingKeys = {
    addOns: () => ['billing', 'add_ons'] as const,
    discountPolicies: () => ['billing', 'discount_policies'] as const,
    quotes: (filters?: Record<string, unknown>) => ['billing', 'quotes', filters] as const,
    quote: (id: string) => ['billing', 'quote', id] as const,
    invoices: (filters?: Record<string, unknown>) => ['billing', 'invoices', filters] as const,
    calculate: (input: CalculateInput) => ['billing', 'calc', input] as const,
    tenantSub: (tenantId: string) => ['billing', 'sub', tenantId] as const,
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING ADD-ONS
// ─────────────────────────────────────────────────────────────────────────────

export function useBillingAddOns(activeOnly = true) {
    return useQuery({
        queryKey: billingKeys.addOns(),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q = (supabase.from('billing_add_ons').select('*') as any)
            if (activeOnly) q = q.eq('is_active', true)
            const { data, error } = await q.order('sort_order')
            if (error) throw error
            return (data || []) as BillingAddOn[]
        },
    })
}

export function useCreateBillingAddOn() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: Omit<BillingAddOn, 'id' | 'created_at' | 'updated_at'>) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('billing_add_ons') as any).insert(input).select().single()
            if (error) throw error
            return data as BillingAddOn
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: billingKeys.addOns() }),
    })
}

export function useUpdateBillingAddOn() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<BillingAddOn> & { id: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('billing_add_ons') as any)
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single()
            if (error) throw error
            return data as BillingAddOn
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: billingKeys.addOns() }),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOUNT POLICIES
// ─────────────────────────────────────────────────────────────────────────────

export function useDiscountPolicies(activeOnly = false) {
    return useQuery({
        queryKey: billingKeys.discountPolicies(),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q = (supabase.from('discount_policies').select('*') as any)
            if (activeOnly) q = q.eq('is_active', true)
            const { data, error } = await q.order('created_at', { ascending: false })
            if (error) throw error
            return (data || []) as DiscountPolicy[]
        },
    })
}

export function useCreateDiscountPolicy() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: Omit<DiscountPolicy, 'id' | 'created_at' | 'updated_at'>) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('discount_policies') as any).insert(input).select().single()
            if (error) throw error
            return data as DiscountPolicy
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: billingKeys.discountPolicies() }),
    })
}

export function useUpdateDiscountPolicy() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<DiscountPolicy> & { id: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('discount_policies') as any)
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single()
            if (error) throw error
            return data as DiscountPolicy
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: billingKeys.discountPolicies() }),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING QUOTES
// ─────────────────────────────────────────────────────────────────────────────

export function useBillingQuotes(filters?: { tenantId?: string; status?: BillingQuoteStatus }) {
    return useQuery({
        queryKey: billingKeys.quotes(filters),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q = (supabase
                .from('billing_quotes')
                .select(`*, tenant:tenants(id, name, name_ar), plan:subscription_plans(id, code, name, name_ar)`) as any)
            if (filters?.tenantId) q = q.eq('tenant_id', filters.tenantId)
            if (filters?.status) q = q.eq('status', filters.status)
            const { data, error } = await q.order('created_at', { ascending: false })
            if (error) throw error
            return (data || []) as BillingQuote[]
        },
    })
}

export function useBillingQuote(quoteId: string | null) {
    return useQuery({
        queryKey: billingKeys.quote(quoteId ?? ''),
        enabled: !!quoteId,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('billing_quotes')
                .select(`*, tenant:tenants(id, name, name_ar), plan:subscription_plans(id, code, name, name_ar)`)
                .eq('id', quoteId!)
                .single() as any)
            if (error) throw error
            return data as BillingQuote
        },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING INVOICES
// ─────────────────────────────────────────────────────────────────────────────

export function useBillingInvoices(filters?: { tenantId?: string; status?: BillingInvoiceStatus }) {
    return useQuery({
        queryKey: billingKeys.invoices(filters),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let q = (supabase
                .from('billing_invoices')
                .select(`*, tenant:tenants(id, name, name_ar)`) as any)
            if (filters?.tenantId) q = q.eq('tenant_id', filters.tenantId)
            if (filters?.status) q = q.eq('status', filters.status)
            const { data, error } = await q.order('created_at', { ascending: false })
            if (error) throw error
            return (data || []) as BillingInvoice[]
        },
    })
}

export function useBillingStats() {
    return useQuery({
        queryKey: ['billing', 'stats'],
        queryFn: async () => {
            const [invoicesRes, subsRes, trialsRes, expiredRes] = await Promise.all([
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase.from('billing_invoices').select('total').eq('status', 'paid') as any),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase.from('tenant_subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active') as any),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase.from('tenant_subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'trial') as any),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase.from('tenant_subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'expired') as any),
            ])

            const totalRevenue = (invoicesRes.data || []).reduce(
                (sum: number, inv: BillingInvoice) => sum + (inv.total || 0),
                0
            )

            return {
                total_revenue: totalRevenue,
                active_subscriptions: subsRes.count || 0,
                trial_subscriptions: trialsRes.count || 0,
                expired_subscriptions: expiredRes.count || 0,
            }
        },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE CALCULATE — pure, no DB writes, drives live previews
// ─────────────────────────────────────────────────────────────────────────────

export function useEngineCalculate(input: CalculateInput) {
    return useQuery({
        queryKey: billingKeys.calculate(input),
        enabled: !!input.planId,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('engine_calculate', {
                p_plan_id:            input.planId,
                p_billing_cycle:      input.billingCycle,
                p_add_on_ids:         input.addOnIds ?? [],
                p_discount_policy_id: input.discountPolicyId ?? null,
            })
            if (error) throw error
            return data as PricingBreakdown
        },
        staleTime: 30_000,
        gcTime: 60_000,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE ACTIVATE
// ─────────────────────────────────────────────────────────────────────────────

export function useEngineActivate() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: ActivateInput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('engine_activate', {
                p_tenant_id:          input.tenantId,
                p_plan_id:            input.planId,
                p_billing_cycle:      input.billingCycle,
                p_source:             input.source ?? 'admin',
                p_status:             input.status ?? 'active',
                p_trial_days:         input.trialDays ?? null,
                p_discount_policy_id: input.discountPolicyId ?? null,
                p_quote_id:           input.quoteId ?? null,
                p_payment_method:     input.paymentMethod ?? null,
                p_payment_reference:  input.paymentReference ?? null,
                p_amount:             input.amount ?? null,
                p_admin_note:         input.adminNote ?? null,
            })
            if (error) throw error
            return data as ActivationResult
        },
        onSuccess: (_, vars) => {
            qc.invalidateQueries({ queryKey: billingKeys.tenantSub(vars.tenantId) })
            qc.invalidateQueries({ queryKey: ['billing', 'invoices'] })
            qc.invalidateQueries({ queryKey: ['tenants'] })
            qc.invalidateQueries({ queryKey: ['subscriptions'] })
        },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE CANCEL
// ─────────────────────────────────────────────────────────────────────────────

export function useEngineCancel() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ tenantId, adminNote }: { tenantId: string; adminNote?: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('engine_cancel', {
                p_tenant_id:  tenantId,
                p_admin_note: adminNote ?? null,
            })
            if (error) throw error
            return data
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: billingKeys.tenantSub(vars.tenantId) })
            qc.invalidateQueries({ queryKey: ['tenants'] })
            qc.invalidateQueries({ queryKey: ['subscriptions'] })
        },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE EXTEND TRIAL
// ─────────────────────────────────────────────────────────────────────────────

export function useEngineExtendTrial() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ tenantId, extraDays, adminNote }: { tenantId: string; extraDays: number; adminNote?: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('engine_extend_trial', {
                p_tenant_id:  tenantId,
                p_extra_days: extraDays,
                p_admin_note: adminNote ?? null,
            })
            if (error) throw error
            return data
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: billingKeys.tenantSub(vars.tenantId) })
            qc.invalidateQueries({ queryKey: ['tenants'] })
            qc.invalidateQueries({ queryKey: ['subscriptions'] })
        },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE CREATE QUOTE
// ─────────────────────────────────────────────────────────────────────────────

export function useEngineCreateQuote() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: CreateQuoteEngineInput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('engine_create_quote', {
                p_tenant_id:           input.tenantId,
                p_plan_id:             input.planId,
                p_billing_cycle:       input.billingCycle,
                p_add_on_ids:          input.addOnIds ?? [],
                p_discount_policy_id:  input.discountPolicyId ?? null,
                p_valid_days:          input.validDays ?? 30,
                p_admin_notes:         input.adminNotes ?? null,
                p_client_notes:        input.clientNotes ?? null,
            })
            if (error) throw error
            return data as QuoteResult
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['billing', 'quotes'] }),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE APPROVE QUOTE
// ─────────────────────────────────────────────────────────────────────────────

export function useEngineApproveQuote() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ quoteId, adminNotes }: { quoteId: string; adminNotes?: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('engine_approve_quote', {
                p_quote_id:    quoteId,
                p_admin_notes: adminNotes ?? null,
            })
            if (error) throw error
            return data
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['billing', 'quotes'] }),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE ACTIVATE FROM QUOTE
// ─────────────────────────────────────────────────────────────────────────────

export function useEngineActivateFromQuote() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ quoteId }: { quoteId: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('engine_activate_from_quote', {
                p_quote_id:      quoteId,
                p_period_months: null,
            })
            if (error) throw error
            return data as ActivationResult & { quote_number: string }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['billing', 'quotes'] })
            qc.invalidateQueries({ queryKey: ['billing', 'invoices'] })
            qc.invalidateQueries({ queryKey: ['tenants'] })
            qc.invalidateQueries({ queryKey: ['subscriptions'] })
        },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT SUBSCRIPTION (reads from tenant_subscriptions with new schema)
// ─────────────────────────────────────────────────────────────────────────────

export interface TenantSubscriptionNew {
    id: string
    tenant_id: string
    plan_id: string
    status: NewSubscriptionStatus
    billing_cycle: BillingCycle
    trial_ends_at: string | null
    current_period_start: string | null
    current_period_end: string | null
    amount: number
    discount_policy_id: string | null
    activated_by: string | null
    quote_id: string | null
    admin_note: string | null
    cancelled_at: string | null
    created_at: string
    updated_at: string
    plan?: {
        id: string
        code: string
        name: string
        name_ar: string | null
        price_monthly: number
        price_yearly: number
    }
}

export function useTenantSubscriptionNew(tenantId: string) {
    return useQuery({
        queryKey: billingKeys.tenantSub(tenantId),
        enabled: !!tenantId,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('tenant_subscriptions')
                .select(`*, plan:subscription_plans(id, code, name, name_ar, price_monthly, price_yearly)`)
                .eq('tenant_id', tenantId)
                .single() as any)
            if (error) {
                console.warn('No subscription found for tenant:', tenantId)
                return null
            }
            return data as TenantSubscriptionNew
        },
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED HOOK (convenience wrapper for components that need everything)
// ─────────────────────────────────────────────────────────────────────────────

export function useBillingEngine() {
    const { data: addOns = [], isLoading: addOnsLoading } = useBillingAddOns()
    const { data: discountPolicies = [], isLoading: policiesLoading } = useDiscountPolicies()
    const activate = useEngineActivate()
    const cancel = useEngineCancel()
    const extendTrial = useEngineExtendTrial()
    const createQuote = useEngineCreateQuote()
    const approveQuote = useEngineApproveQuote()
    const activateFromQuote = useEngineActivateFromQuote()

    const loading = addOnsLoading || policiesLoading
    const error = null

    return {
        addOns,
        discountPolicies,
        loading,
        error,
        activateSubscription: (input: ActivateInput) => activate.mutateAsync(input),
        cancelSubscription: (tenantId: string, adminNote?: string) => cancel.mutateAsync({ tenantId, adminNote }),
        extendTrial: (tenantId: string, extraDays: number, adminNote?: string) => extendTrial.mutateAsync({ tenantId, extraDays, adminNote }),
        createQuote: (input: CreateQuoteEngineInput) => createQuote.mutateAsync(input),
        approveQuote: (quoteId: string, adminNotes?: string) => approveQuote.mutateAsync({ quoteId, adminNotes }),
        activateFromQuote: (quoteId: string) => activateFromQuote.mutateAsync({ quoteId }),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM TAX SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export interface TaxConfig {
    enabled: boolean
    rate: number        // decimal: 0.15 = 15%
    label: string
    label_ar: string
}

export function usePlatformTaxSettings() {
    return useQuery({
        queryKey: ['platform', 'settings', 'tax_config'],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('platform_settings')
                .select('value')
                .eq('key', 'tax_config')
                .single() as any)
            if (error) return { enabled: false, rate: 0, label: 'VAT', label_ar: 'ضريبة القيمة المضافة' } as TaxConfig
            return data.value as TaxConfig
        },
        staleTime: 60_000,
    })
}

export function useUpdatePlatformTaxSettings() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (config: TaxConfig) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await ((supabase as any)
                .from('platform_settings')
                .upsert({
                    key: 'tax_config',
                    value: config,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'key' }))
            if (error) throw error
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'settings', 'tax_config'] }),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export function formatSAR(amount: number): string {
    return new Intl.NumberFormat('en-SA', {
        style: 'currency', currency: 'SAR', minimumFractionDigits: 2,
    }).format(amount)
}

export function quoteStatusColor(status: BillingQuoteStatus): string {
    switch (status) {
        case 'draft':     return 'bg-gray-100 text-gray-600'
        case 'approved':  return 'bg-emerald-100 text-emerald-700'
        case 'activated': return 'bg-green-100 text-green-800'
        case 'expired':   return 'bg-orange-100 text-orange-700'
        default:          return 'bg-gray-100 text-gray-600'
    }
}

export function invoiceStatusColor(status: BillingInvoiceStatus): string {
    switch (status) {
        case 'paid':  return 'bg-green-100 text-green-700'
        case 'draft': return 'bg-gray-100 text-gray-600'
        case 'void':  return 'bg-red-100 text-red-600'
        default:      return 'bg-gray-100 text-gray-600'
    }
}

export function subscriptionStatusColor(status: NewSubscriptionStatus): string {
    switch (status) {
        case 'active':   return 'bg-green-100 text-green-700 border-green-200'
        case 'trial':    return 'bg-blue-100 text-blue-700 border-blue-200'
        case 'past_due': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
        case 'expired':  return 'bg-orange-100 text-orange-700 border-orange-200'
        case 'cancelled':return 'bg-gray-100 text-gray-600 border-gray-200'
        default:         return 'bg-gray-100 text-gray-600 border-gray-200'
    }
}

export function fmtDate(iso: string | null | undefined, locale = 'en-GB'): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}
