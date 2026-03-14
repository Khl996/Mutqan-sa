import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { tap_id } = req.body

        if (!tap_id) {
            return res.status(400).json({ error: 'Missing tap_id' })
        }

        if (!TAP_SECRET_KEY) {
            return res.status(500).json({ error: 'Payment configuration error (TAP key missing)' })
        }

        if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
            return res.status(500).json({ error: 'Database configuration error' })
        }

        // 1. Verify the charge with Tap API
        const tapResponse = await fetch(`https://api.tap.company/v2/charges/${tap_id}`, {
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

        // 2. Check if payment was successful
        if (charge.status !== 'CAPTURED') {
            return res.status(200).json({
                success: false,
                status: charge.status,
                message: charge.status === 'CANCELLED'
                    ? 'Payment was cancelled'
                    : `Payment not completed. Status: ${charge.status}`,
            })
        }

        // 3. Extract metadata from the charge
        const metadata = charge.metadata || {}
        const tenantId = metadata.tenant_id
        const planId = metadata.plan_id
        const billingCycle = metadata.billing_cycle || 'yearly'
        const planName = metadata.plan_name || 'Subscription'

        if (!tenantId || !planId) {
            console.error('Missing payment metadata:', metadata)
            return res.status(400).json({
                error: 'Missing tenant or plan information in payment metadata',
            })
        }

        // 4. SERVER-SIDE PRICE VERIFICATION
        //    Re-verify the amount against the actual plan price from DB
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        })

        const { data: plan, error: planError } = await supabase
            .from('subscription_plans')
            .select('id, code, price_monthly, price_yearly')
            .eq('id', planId)
            .single()

        if (planError || !plan) {
            console.error('Plan lookup failed:', planError)
            return res.status(400).json({ error: 'Invalid plan in payment metadata' })
        }

        // Verify the paid amount matches the expected price
        const expectedAmount = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
        const paidAmount = charge.amount

        if (Math.abs(paidAmount - expectedAmount) > 0.01) {
            console.error(`Amount mismatch! Paid: ${paidAmount}, Expected: ${expectedAmount} for plan ${plan.code} (${billingCycle})`)
            return res.status(400).json({
                error: 'Payment amount does not match plan price',
                details: `Expected ${expectedAmount} ${charge.currency}, got ${paidAmount}`,
            })
        }

        // 5. Activate subscription via RPC (service_role only)
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
            'activate_subscription_after_payment',
            {
                p_tenant_id: tenantId,
                p_plan_id: planId,
                p_billing_cycle: billingCycle,
                p_amount: paidAmount,
                p_currency: charge.currency || 'SAR',
                p_payment_reference: charge.id,
                p_plan_name: planName,
            }
        )

        if (rpcError) {
            console.error('RPC Error:', rpcError)
            return res.status(500).json({
                error: 'Failed to activate subscription',
                details: rpcError.message,
            })
        }

        // Check if RPC returned an error response
        if (rpcResult && !rpcResult.success) {
            // Could be idempotency (duplicate) — not an error
            if (rpcResult.duplicate) {
                return res.status(200).json({
                    success: true,
                    status: 'CAPTURED',
                    message: 'Payment already processed (duplicate)',
                    subscription: rpcResult,
                })
            }
            return res.status(400).json({
                error: rpcResult.error || 'Subscription activation failed',
            })
        }

        return res.status(200).json({
            success: true,
            status: 'CAPTURED',
            message: 'Payment verified and subscription activated',
            subscription: rpcResult,
        })

    } catch (error: any) {
        console.error('Verify Payment Error:', error?.message || error)
        return res.status(500).json({ error: 'Internal server error', details: error?.message })
    }
}
