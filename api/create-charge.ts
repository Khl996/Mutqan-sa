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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    if (process.env.SELF_SERVICE_BILLING_ENABLED !== 'true') {
        return res.status(403).json({ error: 'Self-service billing is disabled' })
    }

    try {
        const baseUrl = getBaseUrl(req)
        const {
            planId,
            billingCycle = 'yearly',
            tenantId,
            customerEmail,
            customerName,
            customerPhone,
        } = req.body

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
        // AUTH CHECK — Verify caller is tenant_admin of this tenant
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

        const { data: profile, error: profileError } = await userSupabase
            .from('profiles')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single()

        if (profileError || !profile) {
            return res.status(403).json({
                error: 'User profile not found',
                details: profileError?.message || 'Row not found',
            })
        }

        if (profile.tenant_id !== tenantId) {
            return res.status(403).json({ error: 'You are not authorized to manage this tenant' })
        }

        if (profile.role !== 'tenant_admin') {
            return res.status(403).json({ error: 'Only tenant administrators can initiate payments' })
        }

        // =====================================================
        // SERVER-SIDE PRICE CALCULATION via engine_calculate
        // Never trust client-supplied amounts.
        // engine_calculate is STABLE SECURITY DEFINER — safe for
        // authenticated callers. Returns total including 15% VAT.
        // =====================================================
        const { data: calcResult, error: calcError } = await userSupabase.rpc('engine_calculate', {
            p_plan_id: planId,
            p_billing_cycle: billingCycle,
            p_add_on_ids: [],
            p_discount_policy_id: null,
        })

        if (calcError || !calcResult) {
            console.error('engine_calculate error:', calcError, 'Plan ID:', planId)
            // Surface the DB error (plan not found / inactive) as a 400
            return res.status(400).json({
                error: calcError?.message?.includes('not found')
                    ? 'Invalid or inactive subscription plan'
                    : 'Failed to calculate plan price',
                details: calcError?.message,
            })
        }

        const amount: number = calcResult.total
        const planName: string = calcResult.breakdown?.[0]?.name || 'Subscription'
        const planCode: string = calcResult.breakdown?.[0]?.code || ''

        if (!amount || amount <= 0) {
            return res.status(400).json({
                error: 'This plan has no price configured for the selected billing cycle',
            })
        }

        // =====================================================
        // Verify tenant exists (RLS ensures user can only see their own)
        // =====================================================
        const { data: tenant, error: tenantError } = await userSupabase
            .from('tenants')
            .select('id, name')
            .eq('id', tenantId)
            .single()

        if (tenantError || !tenant) {
            return res.status(400).json({ error: 'Invalid tenant ID or you lack permissions' })
        }

        // =====================================================
        // Create Tap charge with server-verified amount
        // =====================================================
        const response = await fetch('https://api.tap.company/v2/charges', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TAP_SECRET_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                amount,
                currency: 'SAR',
                customer_initiated: true,
                threeDSecure: true,
                save_card: false,
                description: `Mutqan ${planName} - ${billingCycle === 'yearly' ? 'Annual' : 'Monthly'} Subscription`,
                metadata: {
                    plan_id: planId,
                    plan_name: planName,
                    plan_code: planCode,
                    billing_cycle: billingCycle,
                    tenant_id: tenantId,
                    // Server-computed amount — used for verification in verify-payment / webhook
                    verified_amount: amount,
                },
                receipt: {
                    email: true,
                    sms: false,
                },
                customer: {
                    first_name: customerName || 'Customer',
                    email: customerEmail || '',
                    phone: customerPhone
                        ? { country_code: '966', number: customerPhone }
                        : undefined,
                },
                source: { id: 'src_all' },
                redirect: { url: `${baseUrl}/payment/callback` },
                post: { url: `${baseUrl}/api/payment-webhook` },
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
