import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!

const CHARGE_ID_PATTERN = /^[A-Za-z0-9_.:-]{3,128}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PLAN_CODE_PATTERN = /^[A-Za-z0-9_-]{2,80}$/

function getBearerToken(req: VercelRequest) {
    const rawHeader = req.headers.authorization
    const authorization = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
    return authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : null
}

function getChargeId(body: any) {
    const rawChargeId = body?.tap_id ?? body?.id
    if (typeof rawChargeId !== 'string' && typeof rawChargeId !== 'number') {
        return null
    }

    const chargeId = String(rawChargeId).trim()
    return CHARGE_ID_PATTERN.test(chargeId) ? chargeId : null
}

function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_PATTERN.test(value.trim())
}

function getPositiveAmount(value: unknown) {
    const amount = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(amount) && amount > 0 ? amount : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const tapId = getChargeId(req.body)
        if (!tapId) {
            return res.status(400).json({ error: 'Missing or invalid tap_id' })
        }

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            return res.status(500).json({ error: 'Database configuration error' })
        }

        const userToken = getBearerToken(req)
        if (!userToken) {
            return res.status(401).json({ error: 'Authentication required' })
        }

        const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${userToken}` } },
            auth: { autoRefreshToken: false, persistSession: false },
        })

        const { data: { user }, error: authError } = await userSupabase.auth.getUser()
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' })
        }

        if (!TAP_SECRET_KEY) {
            return res.status(500).json({ error: 'Payment configuration error (TAP key missing)' })
        }

        if (!SUPABASE_SERVICE_KEY) {
            return res.status(500).json({ error: 'Database service configuration error' })
        }

        const tapResponse = await fetch(`https://api.tap.company/v2/charges/${tapId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TAP_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
        })

        const charge = await tapResponse.json()

        if (!tapResponse.ok) {
            console.error('Tap API error:', charge)
            return res.status(tapResponse.status).json({
                error: 'Failed to verify payment with gateway',
                details: charge?.errors || charge?.message,
            })
        }

        if (charge?.id && charge.id !== tapId) {
            return res.status(400).json({ error: 'Payment reference mismatch' })
        }

        if (charge.status !== 'CAPTURED') {
            return res.status(200).json({
                success: false,
                status: charge.status,
                message: charge.status === 'CANCELLED'
                    ? 'Payment was cancelled'
                    : `Payment not completed. Status: ${charge.status}`,
            })
        }

        const metadata = charge.metadata || {}
        const tenantId = typeof metadata.tenant_id === 'string' ? metadata.tenant_id.trim() : ''
        const rawPlanId = metadata.plan_id
        const planCode = typeof metadata.plan_code === 'string' ? metadata.plan_code.trim() : ''
        const planId = typeof rawPlanId === 'string' ? rawPlanId.trim() : ''
        const billingCycle = metadata.billing_cycle === 'monthly' ? 'monthly' : 'yearly'
        const verifiedAmount = getPositiveAmount(metadata.verified_amount)
        const paidAmount = getPositiveAmount(charge.amount)

        if (!isUuid(tenantId) || (planId && !isUuid(planId)) || (!planId && !PLAN_CODE_PATTERN.test(planCode))) {
            console.error('Invalid payment metadata:', metadata)
            return res.status(400).json({ error: 'Invalid payment metadata' })
        }

        if (!paidAmount) {
            return res.status(400).json({ error: 'Invalid paid amount from payment gateway' })
        }

        if (charge.currency && charge.currency !== 'SAR') {
            return res.status(400).json({ error: 'Payment currency mismatch' })
        }

        const { data: tenant, error: tenantError } = await userSupabase
            .from('tenants')
            .select('id')
            .eq('id', tenantId)
            .single()

        if (tenantError || !tenant) {
            return res.status(403).json({ error: 'You do not have access to this payment tenant' })
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        })

        const { data: existingInvoice } = await supabase
            .from('billing_invoices')
            .select('id, status, total')
            .eq('payment_reference', charge.id)
            .maybeSingle()

        if (existingInvoice) {
            return res.status(200).json({
                success: true,
                status: 'CAPTURED',
                message: 'Payment already processed',
                invoice_id: existingInvoice.id,
            })
        }

        let expectedAmount: number

        if (verifiedAmount) {
            expectedAmount = verifiedAmount
        } else {
            let resolvedPlanId = planId
            if (!resolvedPlanId && planCode) {
                const { data: p } = await supabase
                    .from('subscription_plans')
                    .select('id')
                    .eq('code', planCode)
                    .maybeSingle()
                resolvedPlanId = p?.id
            }

            if (!resolvedPlanId) {
                console.error('Plan lookup failed:', { planId, planCode, metadata })
                return res.status(400).json({ error: 'Invalid plan in payment metadata' })
            }

            const { data: calcResult, error: calcError } = await supabase.rpc('engine_calculate', {
                p_plan_id: resolvedPlanId,
                p_billing_cycle: billingCycle,
                p_add_on_ids: [],
                p_discount_policy_id: null,
            })

            if (calcError || !calcResult) {
                console.error('engine_calculate error during verification:', calcError)
                return res.status(500).json({ error: 'Failed to verify plan price' })
            }

            expectedAmount = Number(calcResult.total)
        }

        if (!Number.isFinite(expectedAmount) || Math.abs(paidAmount - expectedAmount) > 0.01) {
            console.error(
                `Amount mismatch! Paid: ${paidAmount}, Expected: ${expectedAmount}`,
                { planId, planCode, billingCycle }
            )
            return res.status(400).json({
                error: 'Payment amount does not match plan price',
                details: `Expected ${expectedAmount} SAR, got ${paidAmount}`,
            })
        }

        let finalPlanId = planId
        if (!finalPlanId && planCode) {
            const { data: p } = await supabase
                .from('subscription_plans')
                .select('id')
                .eq('code', planCode)
                .maybeSingle()
            finalPlanId = p?.id
        }

        if (!finalPlanId) {
            return res.status(400).json({ error: 'Cannot resolve plan ID from metadata' })
        }

        const { data: activateResult, error: activateError } = await supabase.rpc('engine_activate', {
            p_tenant_id: tenantId,
            p_plan_id: finalPlanId,
            p_billing_cycle: billingCycle,
            p_source: 'self_service',
            p_status: 'active',
            p_trial_days: null,
            p_discount_policy_id: null,
            p_quote_id: null,
            p_payment_method: 'tap',
            p_payment_reference: charge.id,
            p_amount: paidAmount,
            p_admin_note: null,
        })

        if (activateError) {
            console.error('engine_activate error:', activateError)
            return res.status(500).json({
                error: 'Failed to activate subscription',
                details: activateError.message,
            })
        }

        return res.status(200).json({
            success: true,
            status: 'CAPTURED',
            message: 'Payment verified and subscription activated',
            subscription_id: activateResult?.subscription_id,
            invoice_id: activateResult?.invoice_id,
            invoice_number: activateResult?.invoice_number,
        })

    } catch (error: any) {
        console.error('Verify Payment Error:', error?.message || error)
        return res.status(500).json({ error: 'Internal server error', details: error?.message })
    }
}
