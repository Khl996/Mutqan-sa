import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const startedAt = new Date()
    const runId = `pm-${startedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`

    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed', run_id: runId })
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !CRON_SECRET) {
        console.error('[pm-generate-wos] Missing database config', { runId })
        return res.status(500).json({ error: 'Missing PM generation config', run_id: runId })
    }

    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    const authHeader = req.headers.authorization
    const isCronRequest = authHeader === `Bearer ${CRON_SECRET}`
    const triggeredBy = 'cron'

    console.log('[pm-generate-wos] Start', {
        runId,
        triggeredBy,
        method: req.method,
        startedAt: startedAt.toISOString(),
    })

    if (!isCronRequest) {
        console.warn('[pm-generate-wos] Blocked non-cron request', { runId })
        return res.status(403).json({ error: 'PM generation endpoint is cron-only', run_id: runId })
    }

    // Cron intentionally uses service_role so the DB function can generate due work orders
    // across all active tenants. User-triggered generation must call the RPC with the
    // user's Supabase session so tenant scoping is enforced inside the function.
    const { data, error } = await adminSupabase.rpc('pm_generate_due_work_orders')
    const durationMs = Date.now() - startedAt.getTime()

    if (error) {
        console.error('[pm-generate-wos] RPC error', { runId, triggeredBy, durationMs, error })
        return res.status(500).json({
            error: error.message,
            run_id: runId,
            triggered_by: triggeredBy,
            duration_ms: durationMs,
        })
    }

    const result = typeof data === 'object' && data !== null ? data : { result: data }

    console.log('[pm-generate-wos] Complete', {
        runId,
        triggeredBy,
        durationMs,
        generated: 'generated' in result ? result.generated : undefined,
        result,
    })

    return res.status(200).json({
        ...result,
        triggered_by: triggeredBy,
        run_id: runId,
        duration_ms: durationMs,
    })
}
