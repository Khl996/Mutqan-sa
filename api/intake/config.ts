import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getServiceClient, resolveIntakeSource } from '../_lib/intake.js'

// GET /api/intake/config — polled by the external capture service (~60s) so
// UI changes (allowlist, kill switch, phone number) apply without redeploys
// or server access. Same X-Intake-Secret auth as POST /api/intake.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const secret = req.headers['x-intake-secret']
    if (typeof secret !== 'string' || !secret) {
        return res.status(401).json({ error: 'Missing intake secret' })
    }

    let supabase
    try {
        supabase = getServiceClient()
    } catch (err) {
        console.error('[intake-config] Missing configuration', err)
        return res.status(500).json({ error: 'Intake endpoint is not configured' })
    }

    let source
    try {
        source = await resolveIntakeSource(supabase, secret)
    } catch (err) {
        console.error('[intake-config] Source lookup failed', err)
        return res.status(500).json({ error: 'Intake source lookup failed' })
    }

    if (!source) {
        return res.status(401).json({ error: 'Invalid intake secret' })
    }

    // Config is returned even when paused — the capture service needs to see
    // is_active = false to stop forwarding (this IS the kill switch).
    return res.status(200).json({
        is_active: source.is_active,
        allowed_groups: source.allowed_groups ?? [],
        phone_number: source.phone_number,
        display_name: source.display_name,
    })
}
