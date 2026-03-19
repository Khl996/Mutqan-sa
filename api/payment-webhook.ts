import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Payment Webhook Handler
 *
 * Called by Tap Payments when a charge status changes.
 * This is the reliable path for activating subscriptions,
 * as it doesn't depend on the user's browser redirect.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const chargeId = req.body?.id || req.body?.tap_id

        if (!chargeId) {
            console.error('Webhook: Missing charge ID in body:', JSON.stringify(req.body))
            return res.status(400).json({ error: 'Missing charge ID' })
        }

        if (!TAP_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
            console.error('Webhook: Missing configuration')
            return res.status(500).json({ error: 'Server configuration error' })
        }

        // 1. Verify the charge with Tap API (don't trust webhook body)
        const tapResponse = await fetch(`https://api.tap.company/v2/charges/${chargeId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TAP_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
        })

        const charge = await tapResponse.json()

        if (!tapResponse.ok) {
            console.error('Webhook: Tap API error:', charge)
            return res.status(500).json({ received: true, processed: false, reason: 'tap_api_error' })
        }

        // 2. Only process successful payments
        if (charge.status !== 'CAPTURED') {
            console.log(`Webhook: Charge ${chargeId} status is ${charge.status}, skipping activation`)
            return res.status(200).json({ received: true, processed: false, status: charge.status })
        }

        // 3. Extract and validate metadata
        const metadata = charge.metadata || {}
        const tenantId = metadata.tenant_id
        const rawPlanId = metadata.plan_id
        const planCode = metadata.plan_code
        const planId = typeof rawPlanId === 'string' ? rawPlanId.trim() : rawPlanId
        const billingCycle = metadata.billing_cycle || 'yearly'
        const planName = metadata.plan_name || 'Subscription'

        if (!tenantId || (!planId && !planCode)) {
            console.error('Webhook: Missing metadata:', metadata)
            return res.status(200).json({ received: true, processed: false, reason: 'missing_metadata' })
        }

        // 4. Verify amount against DB
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        })

        let plan = null
        let planLookupError = null

        if (planId) {
            const { data, error } = await supabase
                .from('subscription_plans')
                .select('id, code, price_monthly, price_yearly')
                .eq('id', planId)
                .maybeSingle()

            plan = data
            planLookupError = error
        }

        if (!plan && planCode) {
            const { data, error } = await supabase
                .from('subscription_plans')
                .select('id, code, price_monthly, price_yearly')
                .eq('code', planCode)
                .maybeSingle()

            if (data) {
                plan = data
                planLookupError = null
            } else if (!planLookupError) {
                planLookupError = error
            }
        }

        if (!plan) {
            console.error('Webhook: Plan lookup failed:', {
                error: planLookupError,
                planId,
                planCode,
                metadata,
            })
            return res.status(500).json({ received: true, processed: false, reason: 'plan_lookup_error' })
        }

        const expectedAmount = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
        const paidAmount = charge.amount

        if (Math.abs(paidAmount - expectedAmount) > 0.01) {
            console.error(`Webhook: Amount mismatch! Paid: ${paidAmount}, Expected: ${expectedAmount}`)
            return res.status(200).json({ received: true, processed: false, reason: 'amount_mismatch' })
        }

        // 5. Activate subscription (idempotent - safe to call multiple times)
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
            'activate_subscription_after_payment',
            {
                p_tenant_id: tenantId,
                p_plan_id: plan.id,
                p_billing_cycle: billingCycle,
                p_amount: paidAmount,
                p_currency: charge.currency || 'SAR',
                p_payment_reference: charge.id,
                p_plan_name: planName,
            }
        )

        if (rpcError) {
            console.error('Webhook: RPC error:', rpcError)
            return res.status(500).json({ received: true, processed: false, reason: 'rpc_error' })
        }

        console.log(`Webhook: Subscription activated for tenant ${tenantId}, plan ${plan.code}`)

        return res.status(200).json({
            received: true,
            processed: true,
            subscription: rpcResult,
        })
    } catch (error: any) {
        console.error('Webhook Error:', error?.message || error)
        return res.status(500).json({ received: true, processed: false, reason: 'internal_error' })
    }
}
