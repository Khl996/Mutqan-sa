import { supabase } from './supabase'

export type ManagedUserRole =
    | 'platform_admin'
    | 'platform_support'
    | 'platform_finance'
    | 'platform_hr'
    | 'tenant_admin'
    | 'facility_manager'
    | 'maintenance_manager'
    | 'supervisor'
    | 'technician'
    | 'engineer'
    | 'reporter'

export interface UpsertManagedUserInput {
    userId?: string
    email?: string
    password?: string
    fullName?: string
    role: ManagedUserRole
    tenantId?: string | null
    status?: 'active' | 'inactive'
    department?: string | null
    jobTitle?: string | null
}

export interface UpsertManagedUserResult {
    userId: string
    email: string
    created: boolean
    role: ManagedUserRole
    tenantId: string | null
    status: 'active' | 'inactive'
}

export interface RevokeManagedUserInput {
    userId?: string
    email?: string
}

export interface RevokeManagedUserResult {
    userId: string
    email: string
    role: 'user'
    tenantId: null
    status: 'active' | 'inactive'
}

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.access_token) {
        throw new Error('Not authenticated')
    }

    return session.access_token
}

export async function upsertManagedUser(input: UpsertManagedUserInput): Promise<UpsertManagedUserResult> {
    if (!input.userId && !input.email) {
        throw new Error('userId or email is required')
    }

    const accessToken = await getAccessToken()

    const response = await fetch('/api/admin-manage-user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ operation: 'upsert', ...input }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
        throw new Error(data.error || 'Failed to manage user')
    }

    return data as UpsertManagedUserResult
}

export async function revokeManagedUser(input: RevokeManagedUserInput): Promise<RevokeManagedUserResult> {
    if (!input.userId && !input.email) {
        throw new Error('userId or email is required')
    }

    const accessToken = await getAccessToken()

    const response = await fetch('/api/admin-manage-user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ operation: 'revoke', ...input }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
        throw new Error(data.error || 'Failed to revoke managed user')
    }

    return data as RevokeManagedUserResult
}
