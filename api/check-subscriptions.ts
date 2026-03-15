import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // =====================================================
    // FAIL-CLOSED: Always require CRON_SECRET
    // If CRON_SECRET is not set, reject ALL requests
    // =====================================================
    if (!CRON_SECRET) {
        console.error('CRON_SECRET is not configured — blocking request')
        return res.status(500).json({ error: 'Server misconfiguration: CRON_SECRET not set' })
    }

    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Missing database config' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    const now = new Date().toISOString()
    let cancelled = 0
    let expired = 0

    try {
        // 1. Find active subscriptions past their period end
        const { data: expiredSubs, error } = await supabase
            .from('tenant_subscriptions')
            .select('id, tenant_id, plan_id, cancel_at_period_end, billing_cycle')
            .in('status', ['active', 'trial'])
            .lt('current_period_end', now)

        if (error) {
            console.error('Query error:', error)
            return res.status(500).json({ error: 'Failed to query subscriptions' })
        }

        if (!expiredSubs || expiredSubs.length === 0) {
            return res.status(200).json({ message: 'No expired subscriptions found', cancelled: 0, expired: 0 })
        }

        for (const sub of expiredSubs) {
            const newStatus = sub.cancel_at_period_end ? 'cancelled' : 'expired'

            // Update tenant_subscriptions
            const subUpdate: Record<string, unknown> = {
                status: newStatus,
                updated_at: now,
            }
            if (newStatus === 'cancelled') {
                subUpdate.cancelled_at = now
            }
            await supabase
                .from('tenant_subscriptions')
                .update(subUpdate)
                .eq('id', sub.id)

            // =====================================================
            // Update ALL related fields on tenants table consistently
            // This prevents drift between subscription status sources
            // =====================================================
            await supabase
                .from('tenants')
                .update({
                    subscription_status: newStatus,
                    subscription_tier: newStatus === 'cancelled' ? 'free' : undefined,
                    updated_at: now,
                })
                .eq('id', sub.tenant_id)

            if (newStatus === 'cancelled') cancelled++
            else expired++
        }

        console.log(`Cron completed: ${cancelled} cancelled, ${expired} expired`)
        return res.status(200).json({
            message: 'Subscription check completed',
            total: expiredSubs.length,
            cancelled,
            expired,
        })

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error'
        console.error('Cron error:', msg)
        return res.status(500).json({ error: 'Cron job failed', details: msg })
    }
}
