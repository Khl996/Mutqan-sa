import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getBaseUrl(req: VercelRequest) {
    const configuredBaseUrl = process.env.VITE_APP_URL?.trim()
    if (configuredBaseUrl) {
        return configuredBaseUrl.replace(/\/$/, '')
    }

    const forwardedProto = req.headers['x-forwarded-proto']
    const forwardedHost = req.headers['x-forwarded-host']
    const host = forwardedHost || req.headers.host

    const protocol = Array.isArray(forwardedProto)
        ? forwardedProto[0]
        : forwardedProto || 'https'
    const normalizedHost = Array.isArray(host) ? host[0] : host

    if (!normalizedHost) {
        throw new Error('Unable to determine application base URL')
    }

    return `${protocol}://${normalizedHost}`.replace(/\/$/, '')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const baseUrl = getBaseUrl(req)
        const {
            planId,
            billingCycle = 'yearly',
            tenantId,
            customerEmail,
            customerName,
            customerPhone
        } = req.body

        // Validate required fields (amount is NO LONGER accepted from client)
        if (!planId || !tenantId) {
            return res.status(400).json({ error: 'Missing required fields: planId, tenantId' })
        }

        if (!TAP_SECRET_KEY) {
            return res.status(500).json({ error: 'Payment configuration error (TAP key missing)' })
        }

        if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
            return res.status(500).json({ error: 'Database configuration error' })
        }

        // =====================================================
        // AUTH CHECK — Verify caller is admin/owner of this tenant
        // =====================================================
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' })
        }

        const userToken = authHeader.replace('Bearer ', '')
        const { createClient: createUserClient } = await import('@supabase/supabase-js')
        const userSupabase = createUserClient(SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY!, {
            global: { headers: { Authorization: `Bearer ${userToken}` } },
            auth: { autoRefreshToken: false, persistSession: false },
        })

        const { data: { user }, error: authError } = await userSupabase.auth.getUser()
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' })
        }

        // Verify user belongs to this tenant and has admin/owner role
        // We use userSupabase because RLS allows the user to read their own profile natively
        const { data: profile, error: profileError } = await userSupabase
            .from('profiles')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single()

        if (profileError || !profile) {
            console.error('Profile fetch error:', profileError, 'User:', user.id)
            return res.status(403).json({
                error: 'User profile not found',
                details: profileError?.message || 'Row not found'
            })
        }

        if (profile.tenant_id !== tenantId) {
            return res.status(403).json({ error: 'You are not authorized to manage this tenant' })
        }

        if (!['tenant_admin', 'tenant_owner'].includes(profile.role)) {
            return res.status(403).json({ error: 'Only tenant administrators can initiate payments' })
        }

        // =====================================================
        // SERVER-SIDE PRICE LOOKUP — Never trust client amount
        // We use userSupabase so it respects RLS automatically
        // =====================================================

        const { data: plan, error: planError } = await userSupabase
            .from('subscription_plans')
            .select('id, code, name, name_ar, price_monthly, price_yearly, is_active')
            .eq('id', planId)
            .single()

        if (planError || !plan) {
            console.error('Plan fetch error:', planError, 'Plan ID:', planId)
            return res.status(400).json({ error: 'Invalid subscription plan selected' })
        }

        if (!plan.is_active) {
            return res.status(400).json({ error: 'This plan is not currently available' })
        }

        // Determine price from DB (not from client!)
        const amount = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
        const currency = 'SAR'
        const planName = plan.name

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'This plan has no price configured for the selected billing cycle' })
        }

        // =====================================================
        // Verify tenant exists
        // =====================================================
        const { data: tenant, error: tenantError } = await userSupabase
            .from('tenants')
            .select('id, name')
            .eq('id', tenantId)
            .single()

        if (tenantError || !tenant) {
            console.error('Tenant fetch error:', tenantError, 'Tenant ID:', tenantId)
            return res.status(400).json({ error: 'Invalid tenant ID or you lack permissions' })
        }

        // =====================================================
        // Create charge via Tap API with server-verified data
        // =====================================================
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
                    plan_code: plan.code,
                    billing_cycle: billingCycle,
                    tenant_id: tenantId,
                    // Store server-verified amount in metadata for double-check in verify
                    verified_amount: amount,
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
                source: {
                    id: 'src_all',  // Allow all payment methods
                },
                redirect: {
                    url: `${baseUrl}/payment/callback`,
                },
                post: {
                    url: `${baseUrl}/api/payment-webhook`,
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
