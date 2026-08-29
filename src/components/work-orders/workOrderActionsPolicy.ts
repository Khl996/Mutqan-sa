const START_ACTION_ROLES = new Set([
    'tenant_admin',
    'maintenance_manager',
    'engineer',
    'technician',
    'platform_owner',
    'platform_admin',
])

const UNASSIGNED_START_ROLES = new Set([
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

interface AssignableMember {
    role: string
    is_active: boolean
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

    if (UNASSIGNED_START_ROLES.has(actorRole)) return true

    return actorRole === 'technician' && actorId !== null && assignedTo === actorId
}

export function isAssignableWorkOrderMember(member: AssignableMember): boolean {
    return member.is_active && (member.role === 'technician' || member.role === 'engineer')
}
