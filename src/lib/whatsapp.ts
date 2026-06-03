import type { WorkOrder } from '@/hooks/useWorkOrders'

// Normalizes a Saudi phone number to international format (+966XXXXXXXXX).
// Assumption: all numbers belong to Saudi Arabia (country code 966) unless
// already prefixed.  Three input forms are handled:
//   05XXXXXXXX   → +9665XXXXXXXX  (local mobile, strip leading zero)
//   9665XXXXXXXX → +9665XXXXXXXX  (without + sign)
//   +9665XXXXXXXX → +9665XXXXXXXX  (already normalized, pass through)
// Returns null for unrecognized formats; callers should disable the button.
export function normalizePhone(raw: string): string | null {
    const cleaned = raw.replace(/[\s\-().]/g, '')
    if (/^05\d{8}$/.test(cleaned))   return `+966${cleaned.slice(1)}`
    if (/^9665\d{8}$/.test(cleaned)) return `+${cleaned}`
    if (/^\+9665\d{8}$/.test(cleaned)) return cleaned
    return null
}

type LocationRef = { name: string; name_ar: string | null } | null | undefined

function joinLocation(parts: LocationRef[], ar: boolean): string {
    return parts
        .map(p => (p ? (ar ? (p.name_ar ?? p.name) : p.name) : ''))
        .filter(Boolean)
        .join(' > ')
}

export interface WhatsAppMessageParams {
    workOrder: Pick<WorkOrder, 'code' | 'description' | 'id' | 'building' | 'floor' | 'room'>
    assigneeName: string
    issueTypeAr?: string | null
    issueTypeEn?: string | null
    baseUrl: string
}

export function buildWhatsAppMessage({
    workOrder,
    assigneeName,
    issueTypeAr,
    issueTypeEn,
    baseUrl,
}: WhatsAppMessageParams): string {
    const locationAr = joinLocation([workOrder.building, workOrder.floor, workOrder.room], true)
    const locationEn = joinLocation([workOrder.building, workOrder.floor, workOrder.room], false)
    const link = `${baseUrl}/work-orders/${workOrder.id}`

    const lines: (string | null)[] = [
        '🔧 أمر عمل جديد / New Work Order',
        `رقم / No: ${workOrder.code}`,
        issueTypeAr || issueTypeEn
            ? `النوع / Type: ${[issueTypeAr, issueTypeEn].filter(Boolean).join(' / ')}`
            : null,
        locationAr || locationEn
            ? `الموقع / Location: ${[locationAr, locationEn].filter(Boolean).join(' / ')}`
            : null,
        `المكلّف / Assigned to: ${assigneeName}`,
        workOrder.description
            ? `الوصف / Description: ${workOrder.description}`
            : null,
        `الرابط / Link: ${link}`,
    ]

    return lines.filter(Boolean).join('\n')
}

export function buildWhatsAppUrl(normalizedPhone: string, message: string): string {
    return `https://wa.me/${normalizedPhone.replace('+', '')}?text=${encodeURIComponent(message)}`
}
