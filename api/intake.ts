import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
    ClassificationParseError,
    classifyIntakeMessage,
    getServiceClient,
    hashMessageText,
    resolveIntakeSource,
    validateIntakePayload,
} from './_lib/intake.js'

// POST /api/intake — unified, source-agnostic intake endpoint.
// Auth: X-Intake-Secret header, matched against intake_sources to resolve
// BOTH the tenant and the source (tenant_id is never read from the body).
// Idempotent on (tenant_id, external_message_id): duplicates return 200.
// Classification failure never fails the request — the message stays 'new'
// (transport errors, retryable) or becomes 'failed' (unparseable output).
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
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
        console.error('[intake] Missing configuration', err)
        return res.status(500).json({ error: 'Intake endpoint is not configured' })
    }

    let source
    try {
        source = await resolveIntakeSource(supabase, secret)
    } catch (err) {
        console.error('[intake] Source lookup failed', err)
        return res.status(500).json({ error: 'Intake source lookup failed' })
    }

    if (!source) {
        return res.status(401).json({ error: 'Invalid intake secret' })
    }

    // Kill switch: paused sources acknowledge and store NOTHING.
    if (!source.is_active) {
        return res.status(200).json({ status: 'paused' })
    }

    const validation = validateIntakePayload(req.body)
    if ('error' in validation) {
        return res.status(400).json({ error: validation.error })
    }
    const payload = validation.payload

    // Insert-or-skip on the (tenant_id, external_message_id) unique constraint:
    // capture layers retry and reconnect, so duplicates must be a calm 200.
    const { data: inserted, error: insertError } = await supabase
        .from('intake_raw_messages')
        .upsert(
            {
                tenant_id: source.tenant_id,
                intake_source_id: source.id,
                source: payload.source,
                source_adapter: payload.source_adapter,
                external_message_id: payload.external_message_id,
                sender_name: payload.sender_name,
                sender_phone: payload.sender_phone,
                group_name: payload.group_name,
                message_text: payload.message_text,
                media_urls: payload.media_urls,
                message_hash: hashMessageText(payload.message_text),
                status: 'new',
                sent_at: payload.sent_at,
            },
            { onConflict: 'tenant_id,external_message_id', ignoreDuplicates: true }
        )
        .select('id')

    if (insertError) {
        console.error('[intake] Insert failed', { error: insertError })
        return res.status(500).json({ error: 'Failed to store intake message' })
    }

    if (!inserted || inserted.length === 0) {
        return res.status(200).json({ status: 'duplicate' })
    }

    const messageId = inserted[0].id as string

    // Classification: best effort, never fails the capture.
    let classification: 'classified' | 'ignored' | 'failed' | 'pending' = 'pending'
    let draftId: string | null = null
    try {
        const result = await classifyIntakeMessage(payload.message_text, payload.group_name ?? null)

        if (!result.is_maintenance_report) {
            await supabase.from('intake_raw_messages').update({ status: 'ignored' }).eq('id', messageId)
            classification = 'ignored'
        } else {
            const { data: draft, error: draftError } = await supabase
                .from('intake_drafts')
                .insert({
                    tenant_id: source.tenant_id,
                    intake_message_id: messageId,
                    suggested_title: result.title,
                    suggested_description: result.description ?? null,
                    suggested_location: result.location ?? null,
                    suggested_priority: result.priority ?? 'medium',
                    suggested_category: result.category ?? null,
                    review_status: 'pending',
                })
                .select('id')
                .single()

            if (draftError) throw draftError

            await supabase.from('intake_raw_messages').update({ status: 'classified' }).eq('id', messageId)
            classification = 'classified'
            draftId = draft.id as string
        }
    } catch (err) {
        if (err instanceof ClassificationParseError) {
            // Model answered but unusably: mark failed so it surfaces in the
            // review UI's recovery tab instead of retrying forever.
            console.error('[intake] Classification parse failure', { messageId, error: err.message })
            await supabase
                .from('intake_raw_messages')
                .update({ status: 'failed', failure_reason: err.message.slice(0, 500) })
                .eq('id', messageId)
            classification = 'failed'
        } else {
            // Transport/API error: leave the message 'new' so a later pass can retry.
            console.error('[intake] Classification error (message left as new)', { messageId, error: err })
            classification = 'pending'
        }
    }

    return res.status(200).json({
        status: 'accepted',
        message_id: messageId,
        classification,
        ...(draftId ? { draft_id: draftId } : {}),
    })
}
