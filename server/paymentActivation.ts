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

type DbPayload = Record<string, unknown>

function missingColumn(message: string) {
    return (
        message.match(/Could not find the '([^']+)' column/)?.[1] ||
        message.match(/column "([^"]+)" of relation "[^"]+" does not exist/)?.[1] ||
        null
    )
}

function dropColumn(payload: DbPayload, column: string): DbPayload {
    return Object.fromEntries(Object.entries(payload).filter(([key]) => key !== column))
}

function invoiceNumber() {
    const stamp = Date.now().toString(36).toUpperCase()
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase()
    return `INV-${stamp}-${suffix}`.slice(0, 20)
}

async function selectPlan(supabase: SupabaseClient, planId: string) {
    const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, trial_days')
        .eq('id', planId)
        .eq('is_active', true)
        .maybeSingle()

    if (error || !data) {
        throw error || new Error(`Plan not found or inactive: ${planId}`)
    }

    return data
}

async function calculatePlan(supabase: SupabaseClient, input: ActivationInput) {
    const { data, error } = await supabase.rpc('engine_calculate', {
        p_plan_id: input.planId,
        p_billing_cycle: input.billingCycle,
        p_add_on_ids: [],
        p_discount_policy_id: null,
    })

    if (error || !data) {
        console.error('[payment-activation] engine_calculate fallback degraded:', error)
        return {
            subtotal: input.amount,
            discount_amount: 0,
            tax_rate: 0,
            tax_amount: 0,
            total: input.amount,
        }
    }

    return {
        subtotal: Number(data.subtotal ?? input.amount),
        discount_amount: Number(data.discount_amount ?? 0),
        tax_rate: Number(data.tax_rate ?? 0),
        tax_amount: Number(data.tax_amount ?? 0),
        total: Number(data.total ?? input.amount),
    }
}

async function upsertReturningId(
    supabase: SupabaseClient,
    table: string,
    payload: DbPayload,
    onConflict: string,
) {
    let currentPayload = payload
    const skipped: string[] = []

    for (let attempt = 0; attempt < 16; attempt += 1) {
        const { data, error } = await supabase
            .from(table)
            .upsert(currentPayload, { onConflict })
            .select('id')
            .single()

        if (!error) {
            if (skipped.length > 0) {
                console.warn(`[payment-activation] ${table}: skipped missing columns: ${skipped.join(', ')}`)
            }
            return data.id as string
        }

        const column = missingColumn(error.message)
        if (!column || !Object.prototype.hasOwnProperty.call(currentPayload, column)) {
            throw error
        }

        skipped.push(column)
        currentPayload = dropColumn(currentPayload, column)
    }

    throw new Error(`${table}: too many missing-column retries`)
}

async function insertReturningInvoice(
    supabase: SupabaseClient,
    payload: DbPayload,
) {
    let currentPayload = payload
    const skipped: string[] = []

    for (let attempt = 0; attempt < 16; attempt += 1) {
        const { data, error } = await supabase
            .from('billing_invoices')
            .insert(currentPayload)
            .select('id, invoice_number')
            .single()

        if (!error) {
            if (skipped.length > 0) {
                console.warn(`[payment-activation] billing_invoices: skipped missing columns: ${skipped.join(', ')}`)
            }
            return data as { id: string; invoice_number: string }
        }

        const column = missingColumn(error.message)
        if (!column || !Object.prototype.hasOwnProperty.call(currentPayload, column)) {
            throw error
        }

        skipped.push(column)
        currentPayload = dropColumn(currentPayload, column)
    }

    throw new Error('billing_invoices: too many missing-column retries')
}

async function insertAuditBestEffort(
    supabase: SupabaseClient,
    input: ActivationInput,
    subscriptionId: string,
) {
    const payload = {
        user_id: null,
        action: 'engine_activate_fallback',
        action_type: 'update',
        target_type: 'subscription',
        target_id: subscriptionId,
        new_values: {
            plan_id: input.planId,
            status: 'active',
            billing_cycle: input.billingCycle,
            amount: input.amount,
            source: 'self_service',
        },
        metadata: {
            tenant_id: input.tenantId,
            plan_id: input.planId,
            payment_reference: input.paymentReference,
            source: 'self_service',
            activation_path: 'api_fallback',
        },
    }

    try {
        await supabase.from('platform_audit_logs').insert(payload)
    } catch (error) {
        console.warn('[payment-activation] fallback audit insert skipped:', error)
    }
}

async function activateViaTables(supabase: SupabaseClient, input: ActivationInput) {
    await selectPlan(supabase, input.planId)
    const calc = await calculatePlan(supabase, input)
    const now = new Date()
    const periodEnd = new Date(now)
    if (input.billingCycle === 'yearly') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1)
    }

    const subscriptionId = await upsertReturningId(
        supabase,
        'tenant_subscriptions',
        {
            tenant_id: input.tenantId,
            plan_id: input.planId,
            status: 'active',
            billing_cycle: input.billingCycle,
            trial_ends_at: null,
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            amount: input.amount,
            discount_policy_id: null,
            activated_by: 'self_service',
            quote_id: null,
            admin_note: input.adminNote ?? null,
            cancelled_at: null,
            updated_at: now.toISOString(),
        },
        'tenant_id',
    )

    const invoice = await insertReturningInvoice(supabase, {
        invoice_number: invoiceNumber(),
        tenant_id: input.tenantId,
        subscription_id: subscriptionId,
        quote_id: null,
        subtotal: calc.subtotal,
        discount_amount: calc.discount_amount,
        tax_rate: calc.tax_rate,
        tax_amount: calc.tax_amount,
        total: input.amount,
        status: 'paid',
        payment_method: 'tap',
        payment_reference: input.paymentReference,
        paid_at: now.toISOString(),
        billing_period_start: now.toISOString().slice(0, 10),
        billing_period_end: periodEnd.toISOString().slice(0, 10),
        created_by: null,
        created_at: now.toISOString(),
    })

    await insertAuditBestEffort(supabase, input, subscriptionId)

    return {
        subscription_id: subscriptionId,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        status: 'active',
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
        amount: input.amount,
        activation_path: 'api_fallback',
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

    console.error('[payment-activation] engine_activate failed, using table fallback:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        tenantId: input.tenantId,
        planId: input.planId,
        paymentReference: input.paymentReference,
    })

    return activateViaTables(supabase, input)
}
