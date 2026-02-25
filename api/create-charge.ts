import type { VercelRequest, VercelResponse } from '@vercel/node'

const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY
const BASE_URL = process.env.VITE_APP_URL || 'https://mutqan-sa.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const {
            amount,
            currency = 'SAR',
            planId,
            planName,
            billingCycle,
            tenantId,
            customerEmail,
            customerName,
            customerPhone
        } = req.body

        // Validate required fields
        if (!amount || !planId || !tenantId) {
            return res.status(400).json({ error: 'Missing required fields: amount, planId, tenantId' })
        }

        // Create charge via Tap API
        const response = await fetch('https://api.tap.company/v2/charges', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TAP_SECRET_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                amount: amount,
                currency: currency,
                customer_initiated: true,
                threeDSecure: true,
                save_card: false,
                description: `Mutqan ${planName} - ${billingCycle === 'yearly' ? 'Annual' : 'Monthly'} Subscription`,
                metadata: {
                    plan_id: planId,
                    plan_name: planName,
                    billing_cycle: billingCycle,
                    tenant_id: tenantId,
                },
                receipt: {
                    email: true,
                    sms: false,
                },
                customer: {
                    first_name: customerName || 'Customer',
                    email: customerEmail || '',
                    phone: customerPhone ? {
                        country_code: '966',
                        number: customerPhone,
                    } : undefined,
                },
                merchant: {
                    id: '',  // Tap will use the default merchant from the API key
                },
                source: {
                    id: 'src_all',  // Allow all payment methods
                },
                redirect: {
                    url: `${BASE_URL}/payment/callback`,
                },
                post: {
                    url: `${BASE_URL}/api/payment-webhook`,
                },
            }),
        })

        const data = await response.json()

        if (!response.ok) {
            console.error('Tap API Error:', data)
            return res.status(response.status).json({
                error: 'Payment creation failed',
                details: data?.errors || data?.message || 'Unknown error',
            })
        }

        // Return the charge ID and redirect URL
        return res.status(200).json({
            id: data.id,
            status: data.status,
            redirect_url: data.transaction?.url || null,
        })

    } catch (error: any) {
        console.error('Create Charge Error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
