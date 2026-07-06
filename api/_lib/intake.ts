import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

// Shared helpers for the intake endpoints (/api/intake, /api/intake/config).
// The capture layer is external and swappable; everything enters through one
// unified payload authenticated by a per-source shared secret that resolves
// BOTH the tenant and the source (never trust tenant_id from the body).

export interface IntakeSource {
    id: string
    tenant_id: string
    source_type: string
    display_name: string
    phone_number: string | null
    allowed_groups: Array<{ jid: string; name: string }>
    is_active: boolean
}

export interface IntakePayload {
    source: 'whatsapp' | 'form' | 'email' | 'manual'
    source_adapter?: string | null
    external_message_id: string
    sender_name?: string | null
    sender_phone?: string | null
    group_name?: string | null
    message_text: string
    media_urls?: string[]
    sent_at?: string | null
}

export interface Classification {
    is_maintenance_report: boolean
    title?: string
    description?: string
    location?: string
    priority?: 'low' | 'medium' | 'high' | 'urgent'
    category?: string
}

export class ClassificationParseError extends Error {}

export function getServiceClient(): SupabaseClient {
    const url = process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        throw new Error('Missing Supabase service configuration')
    }
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

// Resolve the intake source from the shared-secret header. Returns null for
// unknown secrets (caller responds 401 without revealing which part failed).
export async function resolveIntakeSource(
    client: SupabaseClient,
    secret: string
): Promise<IntakeSource | null> {
    const { data, error } = await client
        .from('intake_sources')
        .select('id, tenant_id, source_type, display_name, phone_number, allowed_groups, is_active')
        .eq('secret', secret)
        .maybeSingle()

    if (error) throw error
    return (data as IntakeSource | null) ?? null
}

export function normalizeMessageText(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
}

export function hashMessageText(text: string): string {
    return createHash('sha256').update(normalizeMessageText(text), 'utf8').digest('hex')
}

const VALID_SOURCES = new Set(['whatsapp', 'form', 'email', 'manual'])
const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent'])

export function validateIntakePayload(body: unknown): { payload: IntakePayload } | { error: string } {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return { error: 'Body must be a JSON object' }
    }
    const b = body as Record<string, unknown>

    const source = typeof b.source === 'string' ? b.source : 'whatsapp'
    if (!VALID_SOURCES.has(source)) {
        return { error: `Invalid source: ${source}` }
    }

    const externalMessageId = typeof b.external_message_id === 'string' ? b.external_message_id.trim() : ''
    if (!externalMessageId) {
        return { error: 'external_message_id is required' }
    }

    const messageText = typeof b.message_text === 'string' ? b.message_text.trim() : ''
    if (!messageText) {
        return { error: 'message_text is required' }
    }

    const mediaUrls = Array.isArray(b.media_urls)
        ? b.media_urls.filter((u): u is string => typeof u === 'string').slice(0, 20)
        : []

    let sentAt: string | null = null
    if (typeof b.sent_at === 'string' && b.sent_at) {
        const parsed = new Date(b.sent_at)
        if (!Number.isNaN(parsed.getTime())) sentAt = parsed.toISOString()
    }

    const asOptionalString = (v: unknown, max = 500): string | null =>
        typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

    return {
        payload: {
            source: source as IntakePayload['source'],
            source_adapter: asOptionalString(b.source_adapter, 100),
            external_message_id: externalMessageId.slice(0, 500),
            sender_name: asOptionalString(b.sender_name),
            sender_phone: asOptionalString(b.sender_phone, 50),
            group_name: asOptionalString(b.group_name),
            message_text: messageText.slice(0, 10000),
            media_urls: mediaUrls,
            sent_at: sentAt,
        },
    }
}

const CLASSIFIER_SYSTEM_PROMPT = `أنت مصنّف بلاغات صيانة لمنشأة صحية (مستشفى). تستقبل رسائل من مجموعات واتساب خاصة بالصيانة، مكتوبة غالباً بلهجة خليجية عامية.

مهمتك قراران:
1. هل الرسالة ملاحظة/بلاغ صيانة فعلي؟ (وليست تحية، دردشة، رد شكر، سؤال إداري، أو خارج الموضوع)
2. إذا كانت بلاغاً: استخرج البيانات المنظمة.

سياق المنشأة: أقسام المستشفى تشمل: عيادات، تنويم، طوارئ، مختبر، أشعة، صيدلية، دورات مياه، ممرات، مواقف، مطبخ، مغسلة، مصاعد، استقبال.

أجب بصيغة JSON فقط، بدون أي نص آخر وبدون أسوار تنسيق (code fences):
{
  "is_maintenance_report": true/false,
  "title": "عنوان عربي موجز (أقل من 60 حرفاً)",
  "description": "وصف واضح للمشكلة بصياغة مهنية مختصرة",
  "location": "الموقع كما ذُكر في الرسالة نصاً حراً",
  "priority": "low" | "medium" | "high" | "urgent",
  "category": "تصنيف عام مثل: سباكة، كهرباء، تكييف، نجارة، أجهزة طبية، نظافة، أخرى"
}

عند is_maintenance_report = false أعد الحقل الأول فقط.

إرشادات الأولوية:
- urgent: خطر على المرضى/السلامة، انقطاع كهرباء أو ماء كامل، تسرب كبير، مصعد معطل وفيه أشخاص.
- high: عطل يوقف عمل قسم أو جهاز مهم.
- medium: عطل مزعج لا يوقف العمل (الافتراضي).
- low: تحسينات وملاحظات شكلية.

أمثلة:

رسالة: "مسكة المقعد في دورة مياه العيادات مصدية وتحتاج تغيير"
{"is_maintenance_report": true, "title": "تغيير مسكة مقعد دورة مياه العيادات", "description": "مسكة المقعد في دورة مياه قسم العيادات متآكلة (صدأ) وتحتاج إلى استبدال.", "location": "دورة مياه العيادات", "priority": "medium", "category": "سباكة"}

رسالة: "في ريحة غريبة عند الممر الي جنب المختبر ما ادري من وين"
{"is_maintenance_report": true, "title": "رائحة غريبة في الممر المجاور للمختبر", "description": "وجود رائحة غير معروفة المصدر في الممر المجاور للمختبر، تحتاج إلى فحص لتحديد السبب.", "location": "الممر المجاور للمختبر", "priority": "high", "category": "أخرى"}

رسالة: "صباح الخير شباب الله يعطيكم العافية"
{"is_maintenance_report": false}

رسالة: "المكيف بالطوارئ للحين ما انصلح؟ امس بلغنا عنه"
{"is_maintenance_report": true, "title": "متابعة عطل مكيف قسم الطوارئ", "description": "مكيف قسم الطوارئ لا يزال معطلاً، سبق التبليغ عنه أمس (قد يكون بلاغاً مكرراً — للمراجعة والدمج).", "location": "قسم الطوارئ", "priority": "high", "category": "تكييف"}`

const GEMINI_DEFAULT_MODEL = 'gemini-flash-lite-latest'
const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash-lite'

function getClassifierUserContent(messageText: string, groupName: string | null): string {
    return groupName
        ? `المجموعة: ${groupName}\nالرسالة: ${messageText}`
        : `الرسالة: ${messageText}`
}

function getAiProvider(): 'gemini' | 'anthropic' {
    return process.env.AI_PROVIDER?.toLowerCase() === 'anthropic' ? 'anthropic' : 'gemini'
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function isGeminiModelNotFound(status: number, detail: string): boolean {
    return status === 404 || /model[^a-z0-9_-]*not[^a-z0-9_-]*found/i.test(detail)
}

async function classifyWithAnthropic(userContent: string): Promise<Classification> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
        throw new Error('Missing ANTHROPIC_API_KEY')
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
            max_tokens: 1024,
            system: CLASSIFIER_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userContent }],
        }),
    })

    if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`Anthropic API error ${response.status}: ${detail.slice(0, 300)}`)
    }

    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> }
    const rawText = (data.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('')
        .trim()

    return parseClassification(rawText)
}

async function requestGemini(model: string, userContent: string): Promise<Response> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
        throw new Error('Missing GEMINI_API_KEY')
    }

    return fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `${CLASSIFIER_SYSTEM_PROMPT}\n\n${userContent}` }],
                    },
                ],
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 1024,
                    responseMimeType: 'application/json',
                },
            }),
        }
    )
}

async function classifyWithGeminiModel(model: string, userContent: string): Promise<Classification> {
    const backoffMs = [1000, 2000, 4000]

    for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
        const response = await requestGemini(model, userContent)
        if (response.ok) {
            const data = (await response.json()) as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
            }
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
            return parseClassification(rawText)
        }

        const detail = await response.text().catch(() => '')
        if (isGeminiModelNotFound(response.status, detail)) {
            throw new Error(`Gemini model not found: ${detail.slice(0, 300)}`)
        }

        if (response.status === 429 && attempt < backoffMs.length) {
            await sleep(backoffMs[attempt])
            continue
        }

        throw new Error(`Gemini API error ${response.status}: ${detail.slice(0, 300)}`)
    }

    throw new Error('Gemini API error 429: retry limit exceeded')
}

async function classifyWithGemini(userContent: string): Promise<Classification> {
    const configuredModel = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL

    try {
        return await classifyWithGeminiModel(configuredModel, userContent)
    } catch (err) {
        if (configuredModel !== GEMINI_FALLBACK_MODEL && err instanceof Error && isGeminiModelNotFound(0, err.message)) {
            return classifyWithGeminiModel(GEMINI_FALLBACK_MODEL, userContent)
        }
        throw err
    }
}

// Calls the configured AI provider to classify one intake message. Text only
// in v1 — media never leaves Mutqan. Throws ClassificationParseError when the
// model responds with something that is not valid JSON (message → failed);
// other errors (network, 5xx, 429 after retry) propagate so the message stays
// 'new' for retry.
export async function classifyIntakeMessage(
    messageText: string,
    groupName: string | null
): Promise<Classification> {
    const userContent = getClassifierUserContent(messageText, groupName)
    return getAiProvider() === 'anthropic'
        ? classifyWithAnthropic(userContent)
        : classifyWithGemini(userContent)
}

// Defensive parse: strip code fences, extract the first JSON object, validate
// shape. Anything unusable raises ClassificationParseError.
export function parseClassification(rawText: string): Classification {
    let text = rawText.trim()
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) text = fenceMatch[1].trim()

    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
        throw new ClassificationParseError(`No JSON object in model output: ${rawText.slice(0, 200)}`)
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(text.slice(start, end + 1))
    } catch {
        throw new ClassificationParseError(`Invalid JSON in model output: ${rawText.slice(0, 200)}`)
    }

    if (typeof parsed !== 'object' || parsed === null) {
        throw new ClassificationParseError('Model output is not a JSON object')
    }
    const obj = parsed as Record<string, unknown>

    if (typeof obj.is_maintenance_report !== 'boolean') {
        throw new ClassificationParseError('Missing boolean is_maintenance_report')
    }

    if (!obj.is_maintenance_report) {
        return { is_maintenance_report: false }
    }

    const title = typeof obj.title === 'string' ? obj.title.trim().slice(0, 200) : ''
    if (!title) {
        throw new ClassificationParseError('Maintenance report classification is missing a title')
    }

    const priority =
        typeof obj.priority === 'string' && VALID_PRIORITIES.has(obj.priority)
            ? (obj.priority as Classification['priority'])
            : 'medium'

    return {
        is_maintenance_report: true,
        title,
        description: typeof obj.description === 'string' ? obj.description.trim().slice(0, 2000) : undefined,
        location: typeof obj.location === 'string' ? obj.location.trim().slice(0, 500) : undefined,
        priority,
        category: typeof obj.category === 'string' ? obj.category.trim().slice(0, 100) : undefined,
    }
}
