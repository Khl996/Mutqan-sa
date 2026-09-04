const START_ACTION_ROLES = new Set([
    'tenant_admin',
    'maintenance_manager',
    'engineer',
    'technician',
    'platform_owner',
    'platform_admin',
])

const MANAGEMENT_START_ROLES = new Set([
    'tenant_admin',
    'maintenance_manager',
    'engineer',
    'platform_owner',
    'platform_admin',
])

interface StartActionContext {
    actorRole: string
    actorId: string | null
    assignedTo: string | null
    status: string
    hasUpdatePermission: boolean
}

export function canShowStartWorkOrderAction({
    actorRole,
    actorId,
    assignedTo,
    status,
    hasUpdatePermission,
}: StartActionContext): boolean {
    if (!hasUpdatePermission || !START_ACTION_ROLES.has(actorRole)) return false
    if (status !== 'pending' && status !== 'assigned') return false

    if (MANAGEMENT_START_ROLES.has(actorRole)) return true

    return actorRole === 'technician' && actorId !== null && assignedTo === actorId
}
