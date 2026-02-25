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
            console.error('TAP_SECRET_KEY is not set')
            return res.status(500).json({ error: 'Payment configuration error (TAP key)' })
        }

        if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
            console.error('Supabase env vars missing:', { url: !!SUPABASE_URL, key: !!SUPABASE_SERVICE_KEY })
            return res.status(500).json({ error: 'Database configuration error' })
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
            console.error('Tap API error:', charge)
            return res.status(response.status).json({
                error: 'Failed to verify payment with gateway',
                details: charge,
            })
        }

        // 2. Check if payment was successful
        const isSuccess = charge.status === 'CAPTURED'

        if (!isSuccess) {
            return res.status(200).json({
                success: false,
                status: charge.status,
                message: charge.status === 'CANCELLED'
                    ? 'Payment was cancelled'
                    : `Payment not completed. Status: ${charge.status}`,
            })
        }

        // 3. Extract metadata
        const metadata = charge.metadata || {}
        const tenantId = metadata.tenant_id
        const planId = metadata.plan_id
        const billingCycle = metadata.billing_cycle || 'yearly'

        if (!tenantId || !planId) {
            console.error('Missing metadata:', metadata)
            return res.status(400).json({
                error: 'Missing tenant or plan information in payment metadata',
            })
        }

        // 4. Update subscription in Supabase (using service role to bypass RLS)
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
        const { data: existingSub, error: fetchError } = await supabase
            .from('tenant_subscriptions')
            .select('id')
            .eq('tenant_id', tenantId)
            .maybeSingle()

        if (fetchError) {
            console.error('Fetch subscription error:', fetchError)
            return res.status(500).json({ error: 'Failed to check existing subscription', details: fetchError.message })
        }

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
                    currency: charge.currency || 'SAR',
                    cancel_at_period_end: false,
                    updated_at: now.toISOString(),
                })
                .eq('tenant_id', tenantId)

            if (updateError) {
                console.error('Supabase update error:', updateError)
                return res.status(500).json({ error: 'Failed to update subscription', details: updateError.message })
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
                    currency: charge.currency || 'SAR',
                    cancel_at_period_end: false,
                })

            if (insertError) {
                console.error('Supabase insert error:', insertError)
                return res.status(500).json({ error: 'Failed to create subscription', details: insertError.message })
            }
        }

        // 5. Update tenant status
        const { error: tenantError } = await supabase
            .from('tenants')
            .update({ status: 'active', updated_at: now.toISOString() })
            .eq('id', tenantId)

        if (tenantError) {
            console.error('Tenant update error:', tenantError)
            // Don't fail for this - subscription was already updated
        }

        // 6. Log payment in platform_invoices (with proper column names)
        const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`

        try {
            await supabase
                .from('platform_invoices')
                .insert({
                    invoice_number: invoiceNumber,
                    tenant_id: tenantId,
                    plan_id: planId,
                    plan_name: metadata.plan_name || 'Subscription',
                    subtotal: charge.amount,
                    total: charge.amount,
                    currency: charge.currency || 'SAR',
                    status: 'paid',
                    payment_method: 'tap',
                    payment_reference: charge.id,
                    paid_at: now.toISOString(),
                    due_date: now.toISOString().split('T')[0],
                    billing_period_start: now.toISOString().split('T')[0],
                    billing_period_end: endDate.toISOString().split('T')[0],
                })
        } catch (invoiceError) {
            // Don't fail the whole request if invoice logging fails
            console.error('Invoice logging error:', invoiceError)
        }

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
        console.error('Verify Payment Error:', error?.message || error)
        return res.status(500).json({ error: 'Internal server error', details: error?.message })
    }
}
