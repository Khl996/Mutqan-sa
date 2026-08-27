export type TenantReleaseFlagDecision = 'checking' | 'enabled' | 'disabled'

interface ResolveTenantReleaseFlagInput {
    currentUserId: string | null | undefined
    currentTenantId: string | null | undefined
    requestedFlagKey: string
    data: unknown
    pending: boolean
    failed: boolean
}

interface TenantReleaseFlagRow {
    tenant_id: string | null
    flag_key: string
    enabled: boolean
}

function isTenantReleaseFlagRow(value: unknown): value is TenantReleaseFlagRow {
    if (typeof value !== 'object' || value === null) return false

    const row = value as Record<string, unknown>
    return (typeof row.tenant_id === 'string' || row.tenant_id === null)
        && typeof row.flag_key === 'string'
        && typeof row.enabled === 'boolean'
}

/**
 * Resolve the server response without optimistic or client-side fallbacks.
 * A single exact row is required before a release can be enabled.
 */
export function resolveTenantReleaseFlag({
    currentUserId,
    currentTenantId,
    requestedFlagKey,
    data,
    pending,
    failed,
}: ResolveTenantReleaseFlagInput): TenantReleaseFlagDecision {
    // While Auth/Tenant context or the first authoritative RPC is unresolved,
    // render neither experience. This prevents a legacy-to-canary flash when
    // the tenant context arrives a moment after the authenticated session.
    if (pending) return 'checking'
    if (!currentUserId || !currentTenantId) return 'disabled'
    if (failed) return 'disabled'
    if (!Array.isArray(data) || data.length !== 1) return 'disabled'

    const row = data[0]
    if (!isTenantReleaseFlagRow(row)) return 'disabled'
    if (row.tenant_id !== currentTenantId) return 'disabled'
    if (row.flag_key !== requestedFlagKey) return 'disabled'

    return row.enabled === true ? 'enabled' : 'disabled'
}

export function isTenantReleaseEnabledForRecord(
    decision: TenantReleaseFlagDecision,
    currentTenantId: string | null | undefined,
    recordTenantId: string | null | undefined
): boolean {
    return decision === 'enabled'
        && typeof currentTenantId === 'string'
        && currentTenantId.length > 0
        && currentTenantId === recordTenantId
}
