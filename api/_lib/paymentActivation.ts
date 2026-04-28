import type { SupabaseClient } from '@supabase/supabase-js'

type BillingCycle = 'monthly' | 'yearly'
type ActivationInput = {
    tenantId: string
    planId: string
    billingCycle: BillingCycle
    paymentReference: string
    amount: number
    adminNote?: string | null
}

type ActivationRpcError = {
    message?: string
    code?: string
    details?: string
    hint?: string
}

export class PaymentActivationError extends Error {
    code?: string
    details?: string
    hint?: string
    tenantId: string
    planId: string
    paymentReference: string

    constructor(input: ActivationInput, error: ActivationRpcError) {
        super(`Billing engine activation failed: ${error.message || 'unknown error'}`)
        this.name = 'PaymentActivationError'
        this.code = error.code
        this.details = error.details
        this.hint = error.hint
        this.tenantId = input.tenantId
        this.planId = input.planId
        this.paymentReference = input.paymentReference
    }
}

export async function activatePaidSubscription(
    supabase: SupabaseClient,
    input: ActivationInput,
) {
    const rpcPayload = {
        p_tenant_id: input.tenantId,
        p_plan_id: input.planId,
        p_billing_cycle: input.billingCycle,
        p_source: 'self_service',
        p_status: 'active',
        p_trial_days: null,
        p_discount_policy_id: null,
        p_quote_id: null,
        p_payment_method: 'tap',
        p_payment_reference: input.paymentReference,
        p_amount: input.amount,
        p_admin_note: input.adminNote ?? null,
    }

    const { data, error } = await supabase.rpc('engine_activate', rpcPayload)
    if (!error) {
        return data
    }

    console.error('[payment-activation] engine_activate failed; activation failed closed:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        tenantId: input.tenantId,
        planId: input.planId,
        paymentReference: input.paymentReference,
    })

    throw new PaymentActivationError(input, error)
}
