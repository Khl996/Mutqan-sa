export type Role =
    | 'platform_owner'
    | 'platform_admin'
    | 'platform_support'
    | 'platform_finance'
    | 'platform_hr'
    | 'tenant_owner'
    | 'tenant_admin'
    | 'facility_manager'
    | 'maintenance_manager'
    | 'engineer'
    | 'supervisor'
    | 'technician'
    | 'reporter'
    | 'user';

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

    // Reports
    | 'reports.view'
    | 'reports.export'

    // Settings
    | 'settings.view'
    | 'settings.manage';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    platform_owner: [
        'dashboard.view',
        'facilities.view', 'facilities.manage',
        'assets.view', 'assets.manage',
        'work_orders.view', 'work_orders.create', 'work_orders.update', 'work_orders.manage', 'work_orders.approve',
        'maintenance.view', 'maintenance.manage',
        'inventory.view', 'inventory.manage',
        'users.view', 'users.manage',
        'reports.view', 'reports.export',
        'settings.view', 'settings.manage'
    ],
    platform_admin: [
        'dashboard.view',
        'facilities.view', 'facilities.manage',
        'assets.view', 'assets.manage',
        'work_orders.view', 'work_orders.create', 'work_orders.update', 'work_orders.manage', 'work_orders.approve',
        'maintenance.view', 'maintenance.manage',
        'inventory.view', 'inventory.manage',
        'users.view', 'users.manage',
        'reports.view', 'reports.export',
        'settings.view', 'settings.manage'
    ],
    // Platform support: read-only access to most things for troubleshooting
    platform_support: [
        'dashboard.view',
        'facilities.view',
        'assets.view',
        'work_orders.view',
        'maintenance.view',
        'inventory.view',
        'users.view',
        'reports.view',
        'settings.view'
    ],
    // Platform finance: view dashboard and reports for financial oversight
    platform_finance: [
        'dashboard.view',
        'reports.view', 'reports.export',
        'settings.view'
    ],
    // Platform HR: view users and reports
    platform_hr: [
        'dashboard.view',
        'users.view',
        'reports.view',
        'settings.view'
    ],
    // Tenant owner: same as tenant_admin (full access to their tenant)
    tenant_owner: [
        'dashboard.view',
        'facilities.view', 'facilities.manage',
        'assets.view', 'assets.manage',
        'work_orders.view', 'work_orders.create', 'work_orders.update', 'work_orders.manage', 'work_orders.approve',
        'maintenance.view', 'maintenance.manage',
        'inventory.view', 'inventory.manage',
        'users.view', 'users.manage',
        'reports.view', 'reports.export',
        'settings.view', 'settings.manage'
    ],
    tenant_admin: [
        'dashboard.view',
        'facilities.view', 'facilities.manage',
        'assets.view', 'assets.manage',
        'work_orders.view', 'work_orders.create', 'work_orders.update', 'work_orders.manage', 'work_orders.approve',
        'maintenance.view', 'maintenance.manage',
        'inventory.view', 'inventory.manage',
        'users.view', 'users.manage',
        'reports.view', 'reports.export',
        'settings.view', 'settings.manage'
    ],
    facility_manager: [
        'dashboard.view',
        'facilities.view', 'facilities.manage',
        'assets.view', 'assets.manage',
        'work_orders.view', 'work_orders.create',
        'reports.view'
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
        'settings.view' // View only
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
        'work_orders.view', 'work_orders.create', 'work_orders.update', // Can create and update
        'assets.view',
        'maintenance.view', 'maintenance.manage', // Can manage maintenance plans and assign technicians
        'inventory.view'
    ],
    technician: [
        'dashboard.view',
        'work_orders.view', 'work_orders.update', // Can update status of assigned tasks
        'inventory.view'
    ],
    reporter: [
        'dashboard.view',
        'work_orders.create', 'work_orders.view' // Only their own usually, but view permission is generic here
    ],
    // Base role: minimal access
    user: [
        'dashboard.view',
        'work_orders.view'
    ]
};

export function hasPermission(role: string, permission: Permission): boolean {
    const userPermissions = ROLE_PERMISSIONS[role as Role];
    if (!userPermissions) return false;
    return userPermissions.includes(permission);
}
