import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { activatePaidSubscription } from '../server/paymentActivation'

const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WEBHOOK_SHARED_SECRETS = [
    process.env.PAYMENT_WEBHOOK_SECRET,
    process.env.TAP_WEBHOOK_SECRET,
    process.env.CRON_SECRET,
]
    .map(value => value?.trim().replace(/^['"]|['"]$/g, ''))
    .filter((value): value is string => Boolean(value))

const CHARGE_ID_PATTERN = /^[A-Za-z0-9_.:-]{3,128}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PLAN_CODE_PATTERN = /^[A-Za-z0-9_-]{2,80}$/
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 30

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()
let hasWarnedMissingWebhookSecret = false

function logWebhook(level: 'log' | 'warn' | 'error', stage: string, details: Record<string, unknown> = {}) {
    const payload = { stage, ...details }
    if (level === 'error') {
        console.error('[payment-webhook]', payload)
        return
    }
    if (level === 'warn') {
        console.warn('[payment-webhook]', payload)
        return
    }
    console.log('[payment-webhook]', payload)
}

function getHeader(req: VercelRequest, name: string) {
    const value = req.headers[name.toLowerCase()]
    return Array.isArray(value) ? value[0] : value
}

function getClientIp(req: VercelRequest) {
    const forwardedFor = getHeader(req, 'x-forwarded-for')
    if (forwardedFor) {
        return forwardedFor.split(',')[0]?.trim() || 'unknown'
    }
    return getHeader(req, 'x-real-ip') || req.socket?.remoteAddress || 'unknown'
}

function isRateLimited(req: VercelRequest, chargeId: string) {
    const now = Date.now()
    const key = `${getClientIp(req)}:${chargeId}`
    const existing = rateLimitBuckets.get(key)

    if (!existing || existing.resetAt <= now) {
        rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
        return false
    }

    existing.count += 1
    return existing.count > RATE_LIMIT_MAX_REQUESTS
}

function safeCompare(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function getSuppliedWebhookSecret(req: VercelRequest) {
    const directSecret = getHeader(req, 'x-mutqan-webhook-secret') || getHeader(req, 'x-webhook-secret')
    if (directSecret) return directSecret.trim().replace(/^['"]|['"]$/g, '')

    const authorization = getHeader(req, 'authorization')
    if (authorization?.startsWith('Bearer ')) {
        return authorization.slice('Bearer '.length).trim().replace(/^['"]|['"]$/g, '')
    }

    return undefined
}

function hasValidSharedSecret(req: VercelRequest) {
    if (WEBHOOK_SHARED_SECRETS.length === 0) {
        if (!hasWarnedMissingWebhookSecret) {
            hasWarnedMissingWebhookSecret = true
            logWebhook('warn', 'webhook_secret_not_configured', {
                action: 'Continuing with Tap API re-fetch verification only.',
            })
        }
        return true
    }

    const suppliedSecret = getSuppliedWebhookSecret(req)
    return Boolean(suppliedSecret && WEBHOOK_SHARED_SECRETS.some(secret => safeCompare(suppliedSecret, secret)))
}

function getChargeId(body: any) {
    const rawChargeId = body?.id ?? body?.tap_id ?? body?.charge?.id
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

/**
 * Payment Webhook Handler
 *
 * Called by Tap Payments when a charge status changes.
 * The body is never trusted as proof of payment. The handler always re-fetches
 * the charge from Tap, validates server-created metadata, and then activates
 * the subscription through the billing engine.
 *
 * Idempotent: safe to receive the same charge event multiple times.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const chargeId = getChargeId(req.body)

        if (!chargeId) {
            logWebhook('warn', 'invalid_charge_id', { bodyKeys: Object.keys(req.body || {}) })
            return res.status(400).json({ error: 'Missing or invalid charge ID' })
        }

        if (isRateLimited(req, chargeId)) {
            logWebhook('warn', 'rate_limited', { chargeId, ip: getClientIp(req) })
            return res.status(429).json({ error: 'Too many webhook attempts' })
        }

        if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
            logWebhook('error', 'missing_database_configuration', {
                hasSupabaseUrl: Boolean(SUPABASE_URL),
                hasServiceKey: Boolean(SUPABASE_SERVICE_KEY),
            })
            return res.status(500).json({ error: 'Server configuration error' })
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        })

        const { data: existingInvoice } = await supabase
            .from('billing_invoices')
            .select('id, tenant_id, total, status')
            .eq('payment_reference', chargeId)
            .maybeSingle()

        if (existingInvoice) {
            logWebhook('log', 'already_processed', {
                chargeId,
                invoiceId: existingInvoice.id,
                tenantId: existingInvoice.tenant_id,
                status: existingInvoice.status,
            })
            return res.status(200).json({ received: true, processed: false, reason: 'already_processed' })
        }

        if (!hasValidSharedSecret(req)) {
            logWebhook('warn', 'shared_secret_rejected', { chargeId, ip: getClientIp(req) })
            return res.status(401).json({ error: 'Unauthorized webhook' })
        }

        if (!TAP_SECRET_KEY) {
            logWebhook('error', 'missing_configuration', {
                hasTapKey: Boolean(TAP_SECRET_KEY),
            })
            return res.status(500).json({ error: 'Server configuration error' })
        }

        const tapResponse = await fetch(`https://api.tap.company/v2/charges/${chargeId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TAP_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
        })

        const charge = await tapResponse.json()

        if (!tapResponse.ok) {
            logWebhook('error', 'tap_api_error', { chargeId, status: tapResponse.status, error: charge })
            return res.status(500).json({ received: true, processed: false, reason: 'tap_api_error' })
        }

        if (charge?.id && charge.id !== chargeId) {
            logWebhook('warn', 'charge_id_mismatch', { suppliedChargeId: chargeId, tapChargeId: charge.id })
            return res.status(200).json({ received: true, processed: false, reason: 'charge_id_mismatch' })
        }

        if (charge.status !== 'CAPTURED') {
            logWebhook('log', 'non_captured_charge_skipped', { chargeId, status: charge.status })
            return res.status(200).json({ received: true, processed: false, status: charge.status })
        }

        const metadata = charge.metadata || {}
        const tenantId = typeof metadata.tenant_id === 'string' ? metadata.tenant_id.trim() : ''
        const rawPlanId = metadata.plan_id
        const planCode = typeof metadata.plan_code === 'string' ? metadata.plan_code.trim() : ''
        const planId = typeof rawPlanId === 'string' ? rawPlanId.trim() : ''
        const billingCycle = metadata.billing_cycle === 'monthly' ? 'monthly' : 'yearly'
        const verifiedAmount = getPositiveAmount(metadata.verified_amount)
        const paidAmount = getPositiveAmount(charge.amount)

        if (!isUuid(tenantId)) {
            logWebhook('warn', 'invalid_tenant_metadata', { chargeId, tenantId })
            return res.status(200).json({ received: true, processed: false, reason: 'invalid_tenant_metadata' })
        }

        if (planId && !isUuid(planId)) {
            logWebhook('warn', 'invalid_plan_metadata', { chargeId, tenantId, planId })
            return res.status(200).json({ received: true, processed: false, reason: 'invalid_plan_metadata' })
        }

        if (!planId && (!planCode || !PLAN_CODE_PATTERN.test(planCode))) {
            logWebhook('warn', 'missing_plan_metadata', { chargeId, tenantId, planCode })
            return res.status(200).json({ received: true, processed: false, reason: 'missing_plan_metadata' })
        }

        if (!paidAmount) {
            logWebhook('warn', 'invalid_paid_amount', { chargeId, tenantId, amount: charge.amount })
            return res.status(200).json({ received: true, processed: false, reason: 'invalid_paid_amount' })
        }

        if (charge.currency && charge.currency !== 'SAR') {
            logWebhook('warn', 'currency_mismatch', { chargeId, tenantId, currency: charge.currency })
            return res.status(200).json({ received: true, processed: false, reason: 'currency_mismatch' })
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
                logWebhook('warn', 'plan_lookup_error', { chargeId, tenantId, planCode })
                return res.status(200).json({ received: true, processed: false, reason: 'plan_lookup_error' })
            }

            const { data: calcResult, error: calcError } = await supabase.rpc('engine_calculate', {
                p_plan_id: resolvedPlanId,
                p_billing_cycle: billingCycle,
                p_add_on_ids: [],
                p_discount_policy_id: null,
            })

            if (calcError || !calcResult) {
                logWebhook('error', 'calc_error', { chargeId, tenantId, error: calcError })
                return res.status(500).json({ received: true, processed: false, reason: 'calc_error' })
            }

            expectedAmount = Number(calcResult.total)
        }

        if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
            logWebhook('warn', 'invalid_expected_amount', { chargeId, tenantId, expectedAmount })
            return res.status(200).json({ received: true, processed: false, reason: 'invalid_expected_amount' })
        }

        if (Math.abs(paidAmount - expectedAmount) > 0.01) {
            logWebhook('warn', 'amount_mismatch', { chargeId, tenantId, paidAmount, expectedAmount })
            return res.status(200).json({ received: true, processed: false, reason: 'amount_mismatch' })
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
            logWebhook('warn', 'plan_id_unresolvable', { chargeId, tenantId, planCode })
            return res.status(200).json({ received: true, processed: false, reason: 'plan_id_unresolvable' })
        }

        const activateResult = await activatePaidSubscription(supabase, {
            tenantId,
            planId: finalPlanId,
            billingCycle,
            paymentReference: charge.id,
            amount: paidAmount,
            adminNote: null,
        })

        logWebhook('log', 'subscription_activated', {
            chargeId,
            tenantId,
            planId: finalPlanId,
            invoiceNumber: activateResult?.invoice_number,
        })

        return res.status(200).json({
            received: true,
            processed: true,
            subscription_id: activateResult?.subscription_id,
            invoice_number: activateResult?.invoice_number,
        })
    } catch (error: any) {
        logWebhook('error', 'internal_error', { error: error?.message || error })
        return res.status(500).json({ received: true, processed: false, reason: 'internal_error' })
    }
}
