import { type ActiveRole, normalizeRole } from './roles'

export type Role = ActiveRole;

export type Permission =
    // Dashboard
    | 'dashboard.view'

    // Facilities
    | 'facilities.view'
    | 'facilities.manage' // Add, Edit, Delete

    // Assets
    | 'assets.view'
    | 'assets.manage'

    // Work Orders
    | 'work_orders.view'
    | 'work_orders.create'
    | 'work_orders.update' // Update status, add comments
    | 'work_orders.manage' // Delete, Assign
    | 'work_orders.approve'

    // Maintenance
    | 'maintenance.view'
    | 'maintenance.manage'

    // Inventory
    | 'inventory.view'
    | 'inventory.manage'

    // Users & Teams
    | 'users.view'
    | 'users.manage'
    | 'work_teams.view'
    | 'work_teams.manage'

    // Reports
    | 'reports.view'
    | 'reports.export'

    // Settings
    | 'settings.view'
    | 'settings.manage'

    // Tenant Subscription
    | 'subscription.manage'

    // Platform
    | 'platform.dashboard.view'
    | 'platform.tenants.view'
    | 'platform.tenants.manage'
    | 'platform.tenants.enter'
    | 'platform.subscriptions.manage'
    | 'platform.staff.view'
    | 'platform.staff.manage'
    | 'platform.financials.view'
    | 'platform.financials.manage'
    | 'platform.audit.view'
    | 'platform.reports.view'
    | 'platform.announcements.view'
    | 'platform.announcements.manage'
    | 'platform.settings.manage';

const FULL_TENANT_PERMISSIONS: Permission[] = [
    'dashboard.view',
    'facilities.view', 'facilities.manage',
    'assets.view', 'assets.manage',
    'work_orders.view', 'work_orders.create', 'work_orders.update', 'work_orders.manage', 'work_orders.approve',
    'maintenance.view', 'maintenance.manage',
    'inventory.view', 'inventory.manage',
    'users.view', 'users.manage',
    'work_teams.view', 'work_teams.manage',
    'reports.view', 'reports.export',
    'settings.view', 'settings.manage',
    'subscription.manage',
]

const FULL_PLATFORM_PERMISSIONS: Permission[] = [
    'platform.dashboard.view',
    'platform.tenants.view', 'platform.tenants.manage', 'platform.tenants.enter',
    'platform.subscriptions.manage',
    'platform.staff.view', 'platform.staff.manage',
    'platform.financials.view', 'platform.financials.manage',
    'platform.audit.view',
    'platform.reports.view',
    'platform.announcements.view', 'platform.announcements.manage',
    'platform.settings.manage',
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    platform_owner: [
        ...FULL_TENANT_PERMISSIONS,
        ...FULL_PLATFORM_PERMISSIONS,
    ],
    platform_admin: [
        ...FULL_TENANT_PERMISSIONS,
        ...FULL_PLATFORM_PERMISSIONS,
    ],
    platform_support: [
        'dashboard.view',
        'facilities.view',
        'assets.view',
        'work_orders.view',
        'maintenance.view',
        'inventory.view',
        'users.view',
        'work_teams.view',
        'reports.view',
        'settings.view',
        'platform.dashboard.view',
        'platform.tenants.view',
        'platform.audit.view',
        'platform.reports.view',
        'platform.announcements.view',
        'platform.announcements.manage',
    ],
    platform_finance: [
        'dashboard.view',
        'reports.view', 'reports.export',
        'platform.dashboard.view',
        'platform.financials.view', 'platform.financials.manage',
        'platform.reports.view',
    ],
    platform_hr: [
        'dashboard.view',
        'users.view',
        'reports.view',
        'platform.dashboard.view',
        'platform.staff.view', 'platform.staff.manage',
        'platform.reports.view',
    ],
    tenant_admin: [
        ...FULL_TENANT_PERMISSIONS,
    ],
    facility_manager: [
        'dashboard.view',
        'facilities.view', 'facilities.manage',
        'assets.view', 'assets.manage',
        'work_orders.view', 'work_orders.create', 'work_orders.update',
        'maintenance.view', 'maintenance.manage',
        'reports.view',
    ],
    maintenance_manager: [
        'dashboard.view',
        'facilities.view',
        'assets.view',
        'work_orders.view', 'work_orders.create', 'work_orders.update', 'work_orders.manage', 'work_orders.approve',
        'maintenance.view', 'maintenance.manage',
        'inventory.view', 'inventory.manage',
        'users.view',
        'reports.view', 'reports.export',
        'work_teams.view', 'work_teams.manage',
    ],
    supervisor: [
        'dashboard.view',
        'work_orders.view', 'work_orders.create', 'work_orders.update', 'work_orders.approve',
        'maintenance.view',
        'inventory.view',
        'reports.view'
    ],
    engineer: [
        'dashboard.view',
        'work_orders.view', 'work_orders.create', 'work_orders.update', 'work_orders.approve',
        'assets.view',
        'maintenance.view',
        'inventory.view'
    ],
    technician: [
        'dashboard.view',
        'work_orders.view', 'work_orders.update',
        'inventory.view'
    ],
    reporter: [
        'dashboard.view',
        'work_orders.create', 'work_orders.view'
    ]
};

export function hasPermission(role: string, permission: Permission): boolean {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) return false;

    const userPermissions = ROLE_PERMISSIONS[normalizedRole];
    if (!userPermissions) return false;
    return userPermissions.includes(permission);
}

export function getPermissionsForRole(role: string | null | undefined): Permission[] {
    const normalizedRole = normalizeRole(role);
    return normalizedRole ? ROLE_PERMISSIONS[normalizedRole] : [];
}
