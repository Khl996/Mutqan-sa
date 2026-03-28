export interface PendingRegistrationDraft {
    version: 1
    created_at: string
    org_name_ar: string
    org_name_en: string
    org_email: string
    org_phone: string
    org_website: string
    org_address: string
    org_country: string
    org_city: string
    org_postal_code: string
    cr_number: string
    tax_number: string
    first_name: string
    last_name: string
    admin_email: string
    admin_phone: string
}

export const PENDING_REGISTRATION_STORAGE_KEY = 'mutqan:pending-registration'

const isDraftLike = (value: unknown): value is PendingRegistrationDraft => {
    if (!value || typeof value !== 'object') {
        return false
    }

    const draft = value as Record<string, unknown>

    return (
        draft.version === 1 &&
        typeof draft.org_name_ar === 'string' &&
        typeof draft.org_name_en === 'string' &&
        typeof draft.org_address === 'string' &&
        typeof draft.cr_number === 'string' &&
        typeof draft.tax_number === 'string'
    )
}

export function savePendingRegistrationDraft(draft: PendingRegistrationDraft) {
    if (typeof window === 'undefined') {
        return
    }

    localStorage.setItem(PENDING_REGISTRATION_STORAGE_KEY, JSON.stringify(draft))
}

export function loadPendingRegistrationDraft(): PendingRegistrationDraft | null {
    if (typeof window === 'undefined') {
        return null
    }

    const rawValue = localStorage.getItem(PENDING_REGISTRATION_STORAGE_KEY)

    if (!rawValue) {
        return null
    }

    try {
        const parsedValue = JSON.parse(rawValue)
        return isDraftLike(parsedValue) ? parsedValue : null
    } catch {
        return null
    }
}

export function clearPendingRegistrationDraft() {
    if (typeof window === 'undefined') {
        return
    }

    localStorage.removeItem(PENDING_REGISTRATION_STORAGE_KEY)
}
