import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Verify cron secret to prevent unauthorized access
    const authHeader = req.headers.authorization
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
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
            .select('id, tenant_id, cancel_at_period_end, billing_cycle')
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
            if (sub.cancel_at_period_end) {
                // User wanted to cancel - mark as cancelled
                await supabase
                    .from('tenant_subscriptions')
                    .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
                    .eq('id', sub.id)

                await supabase
                    .from('tenants')
                    .update({ subscription_status: 'cancelled', updated_at: now })
                    .eq('id', sub.tenant_id)

                cancelled++
            } else {
                // Auto-renew not implemented yet - mark as expired
                await supabase
                    .from('tenant_subscriptions')
                    .update({ status: 'expired', updated_at: now })
                    .eq('id', sub.id)

                await supabase
                    .from('tenants')
                    .update({ subscription_status: 'expired', updated_at: now })
                    .eq('id', sub.tenant_id)

                expired++
            }
        }

        console.log(`Cron completed: ${cancelled} cancelled, ${expired} expired`)
        return res.status(200).json({
            message: 'Subscription check completed',
            total: expiredSubs.length,
            cancelled,
            expired,
        })

    } catch (error: any) {
        console.error('Cron error:', error?.message)
        return res.status(500).json({ error: 'Cron job failed', details: error?.message })
    }
}
