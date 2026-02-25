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

        // 1. Verify the charge with Tap API
        const response = await fetch(`https://api.tap.company/v2/charges/${tap_id}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TAP_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
        })

        const charge = await response.json()

        if (!response.ok) {
            return res.status(response.status).json({
                error: 'Failed to verify payment',
                details: charge,
            })
        }

        // 2. Check if payment was successful
        const isSuccess = charge.status === 'CAPTURED'

        if (!isSuccess) {
            return res.status(200).json({
                success: false,
                status: charge.status,
                message: 'Payment was not successful',
            })
        }

        // 3. Extract metadata
        const metadata = charge.metadata || {}
        const tenantId = metadata.tenant_id
        const planId = metadata.plan_id
        const billingCycle = metadata.billing_cycle || 'yearly'

        if (!tenantId || !planId) {
            return res.status(400).json({
                error: 'Missing tenant or plan information in payment metadata',
            })
        }

        // 4. Update subscription in Supabase
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

        const now = new Date()
        let endDate: Date

        if (billingCycle === 'yearly') {
            endDate = new Date(now)
            endDate.setFullYear(endDate.getFullYear() + 1)
        } else {
            endDate = new Date(now)
            endDate.setMonth(endDate.getMonth() + 1)
        }

        // Check if tenant already has a subscription
        const { data: existingSub } = await supabase
            .from('tenant_subscriptions')
            .select('id')
            .eq('tenant_id', tenantId)
            .single()

        if (existingSub) {
            // Update existing subscription
            const { error: updateError } = await supabase
                .from('tenant_subscriptions')
                .update({
                    plan_id: planId,
                    status: 'active',
                    billing_cycle: billingCycle,
                    current_period_start: now.toISOString(),
                    current_period_end: endDate.toISOString(),
                    amount: charge.amount,
                    currency: charge.currency,
                    cancel_at_period_end: false,
                    updated_at: now.toISOString(),
                })
                .eq('tenant_id', tenantId)

            if (updateError) {
                console.error('Supabase update error:', updateError)
                return res.status(500).json({ error: 'Failed to update subscription' })
            }
        } else {
            // Create new subscription
            const { error: insertError } = await supabase
                .from('tenant_subscriptions')
                .insert({
                    tenant_id: tenantId,
                    plan_id: planId,
                    status: 'active',
                    billing_cycle: billingCycle,
                    current_period_start: now.toISOString(),
                    current_period_end: endDate.toISOString(),
                    amount: charge.amount,
                    currency: charge.currency,
                    cancel_at_period_end: false,
                })

            if (insertError) {
                console.error('Supabase insert error:', insertError)
                return res.status(500).json({ error: 'Failed to create subscription' })
            }
        }

        // 5. Update tenant status
        await supabase
            .from('tenants')
            .update({ status: 'active', updated_at: now.toISOString() })
            .eq('id', tenantId)

        // 6. Log the payment in platform_invoices (optional but recommended)
        await supabase
            .from('platform_invoices')
            .insert({
                tenant_id: tenantId,
                amount: charge.amount,
                currency: charge.currency,
                status: 'paid',
                payment_method: 'tap',
                payment_reference: charge.id,
                description: charge.description || `Subscription - ${billingCycle}`,
                invoice_date: now.toISOString(),
                paid_at: now.toISOString(),
            })
            .single()

        return res.status(200).json({
            success: true,
            status: 'CAPTURED',
            message: 'Payment verified and subscription activated',
            subscription: {
                plan_id: planId,
                billing_cycle: billingCycle,
                period_end: endDate.toISOString(),
            },
        })

    } catch (error: any) {
        console.error('Verify Payment Error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
