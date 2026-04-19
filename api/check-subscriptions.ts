import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // =====================================================
    // FAIL-CLOSED: Always require CRON_SECRET
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
    let expired = 0

    try {
        // Find active/trial subscriptions that have passed their period end.
        // Note: cancel_at_period_end and override_type columns were removed in migration 101.
        // The sync trigger on tenant_subscriptions automatically keeps the tenants
        // table in sync — no manual tenants update is required here.
        const { data: expiredSubs, error } = await supabase
            .from('tenant_subscriptions')
            .select('id, tenant_id')
            .in('status', ['active', 'trial'])
            .lt('current_period_end', now)

        if (error) {
            console.error('Query error:', error)
            return res.status(500).json({ error: 'Failed to query subscriptions' })
        }

        if (!expiredSubs || expiredSubs.length === 0) {
            return res.status(200).json({ message: 'No expired subscriptions found', expired: 0 })
        }

        for (const sub of expiredSubs) {
            const { error: updateError } = await supabase
                .from('tenant_subscriptions')
                .update({ status: 'expired', updated_at: now })
                .eq('id', sub.id)

            if (updateError) {
                // Log and continue — don't abort the entire batch for one failure
                console.error(`Failed to expire subscription ${sub.id}:`, updateError.message)
                continue
            }

            // The AFTER UPDATE trigger on tenant_subscriptions automatically syncs
            // tenants.subscription_status = 'expired'. No additional update needed.
            expired++
        }

        console.log(`Cron completed: ${expired} expired (of ${expiredSubs.length} found)`)
        return res.status(200).json({
            message: 'Subscription check completed',
            total: expiredSubs.length,
            expired,
        })

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error'
        console.error('Cron error:', msg)
        return res.status(500).json({ error: 'Cron job failed', details: msg })
    }
}
