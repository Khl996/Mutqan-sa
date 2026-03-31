/**
 * System Modules Configuration
 * ظƒظ„ ظ…ظˆط¯ظٹظˆظ„ ظ‚ط§ط¨ظ„ ظ„ظ„طھظپط¹ظٹظ„/ط§ظ„طھط¹ط·ظٹظ„ ظˆط§ظ„طھط®طµظٹطµ ظ„ظƒظ„ ظ…ط¤ط³ط³ط©
 */

export interface SystemModule {
    code: string
    name: string
    name_ar: string
    description: string
    description_ar: string
    icon: string
    route: string
    isCore: boolean  // Core modules cannot be disabled
    features: ModuleFeature[]
    defaultEnabled: boolean
}

export interface ModuleFeature {
    code: string
    name: string
    name_ar: string
    description?: string
    description_ar?: string
    defaultEnabled: boolean
}

// All available system modules
export const SYSTEM_MODULES: SystemModule[] = [
    {
        code: 'dashboard',
        name: 'Dashboard',
        name_ar: 'ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ…',
        description: 'Main dashboard with KPIs and statistics',
        description_ar: 'ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ… ط§ظ„ط±ط¦ظٹط³ظٹط© ظ…ط¹ ط§ظ„ظ…ط¤ط´ط±ط§طھ ظˆط§ظ„ط¥ط­طµط§ط¦ظٹط§طھ',
        icon: 'LayoutDashboard',
        route: '/dashboard',
        isCore: true,  // Cannot be disabled
        defaultEnabled: true,
        features: [
            { code: 'quick_stats', name: 'Quick Stats', name_ar: 'ط¥ط­طµط§ط¦ظٹط§طھ ط³ط±ظٹط¹ط©', defaultEnabled: true },
            { code: 'charts', name: 'Charts', name_ar: 'ط§ظ„ط±ط³ظˆظ… ط§ظ„ط¨ظٹط§ظ†ظٹط©', defaultEnabled: true },
            { code: 'recent_activity', name: 'Recent Activity', name_ar: 'ط§ظ„ظ†ط´ط§ط· ط§ظ„ط£ط®ظٹط±', defaultEnabled: true },
        ]
    },
    {
        code: 'facilities',
        name: 'Facilities Management',
        name_ar: 'ط¥ط¯ط§ط±ط© ط§ظ„ظ…ط±ط§ظپظ‚',
        description: 'Manage buildings and floors',
        description_ar: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0645\u0628\u0627\u0646\u064a \u0648\u0627\u0644\u0637\u0648\u0627\u0628\u0642',
        icon: 'Building2',
        route: '/facilities',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'buildings', name: 'Buildings', name_ar: 'ط§ظ„ظ…ط¨ط§ظ†ظٹ', defaultEnabled: true },
            { code: 'floors', name: 'Floors', name_ar: 'ط§ظ„ط·ظˆط§ط¨ظ‚', defaultEnabled: true },
            { code: 'departments', name: 'Departments', name_ar: '\u0627\u0644\u0623\u0642\u0633\u0627\u0645', defaultEnabled: false },
            { code: 'rooms', name: 'Rooms', name_ar: '\u0627\u0644\u063a\u0631\u0641', defaultEnabled: false },
        ]
    },
    {
        code: 'assets',
        name: 'Asset Management',
        name_ar: 'ط¥ط¯ط§ط±ط© ط§ظ„ط£طµظˆظ„',
        description: 'Track and manage all assets and equipment',
        description_ar: 'طھطھط¨ط¹ ظˆط¥ط¯ط§ط±ط© ط¬ظ…ظٹط¹ ط§ظ„ط£طµظˆظ„ ظˆط§ظ„ظ…ط¹ط¯ط§طھ',
        icon: 'Box',
        route: '/assets',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'asset_tracking', name: 'Asset Tracking', name_ar: 'طھطھط¨ط¹ ط§ظ„ط£طµظˆظ„', defaultEnabled: true },
            { code: 'qr_codes', name: 'QR Codes', name_ar: 'ط±ظ…ظˆط² QR', defaultEnabled: true },
            { code: 'asset_history', name: 'Asset History', name_ar: 'ط³ط¬ظ„ ط§ظ„ط£طµظˆظ„', defaultEnabled: true },
            { code: 'warranty_tracking', name: 'Warranty Tracking', name_ar: 'طھطھط¨ط¹ ط§ظ„ط¶ظ…ط§ظ†', defaultEnabled: true },
        ]
    },
    {
        code: 'work_orders',
        name: 'Work Orders',
        name_ar: 'ط£ظˆط§ظ…ط± ط§ظ„ط¹ظ…ظ„',
        description: 'Create and manage work orders and maintenance requests',
        description_ar: 'ط¥ظ†ط´ط§ط، ظˆط¥ط¯ط§ط±ط© ط£ظˆط§ظ…ط± ط§ظ„ط¹ظ…ظ„ ظˆط·ظ„ط¨ط§طھ ط§ظ„طµظٹط§ظ†ط©',
        icon: 'ClipboardList',
        route: '/work-orders',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'create_wo', name: 'Create Work Orders', name_ar: 'ط¥ظ†ط´ط§ط، ط£ظˆط§ظ…ط± ط¹ظ…ظ„', defaultEnabled: true },
            { code: 'workflow', name: 'Workflow Approvals', name_ar: 'ط³ظٹط± ط§ظ„ط¹ظ…ظ„ ظˆط§ظ„ط§ط¹طھظ…ط§ط¯ط§طھ', defaultEnabled: true },
            { code: 'assignment', name: 'Team Assignment', name_ar: 'طھط¹ظٹظٹظ† ط§ظ„ظپط±ظ‚', defaultEnabled: true },
            { code: 'parts_tracking', name: 'Parts Tracking', name_ar: 'طھطھط¨ط¹ ط§ظ„ظ‚ط·ط¹', defaultEnabled: true },
        ]
    },
    {
        code: 'maintenance',
        name: 'Preventive Maintenance',
        name_ar: 'ط§ظ„طµظٹط§ظ†ط© ط§ظ„ظˆظ‚ط§ط¦ظٹط©',
        description: 'Schedule and manage preventive maintenance plans',
        description_ar: 'ط¬ط¯ظˆظ„ط© ظˆط¥ط¯ط§ط±ط© ط®ط·ط· ط§ظ„طµظٹط§ظ†ط© ط§ظ„ظˆظ‚ط§ط¦ظٹط©',
        icon: 'Wrench',
        route: '/maintenance',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'maintenance_plans', name: 'Maintenance Plans', name_ar: 'ط®ط·ط· ط§ظ„طµظٹط§ظ†ط©', defaultEnabled: true },
            { code: 'schedules', name: 'Maintenance Tasks', name_ar: 'ظ…ظ‡ط§ظ… ط§ظ„طµظٹط§ظ†ط©', defaultEnabled: true },
            { code: 'auto_generation', name: 'Auto Work Order Generation (Coming Soon)', name_ar: 'طھظˆظ„ظٹط¯ ط£ظˆط§ظ…ط± طھظ„ظ‚ط§ط¦ظٹ (ظ‚ط±ظٹط¨ط§ظ‹)', defaultEnabled: false },
        ]
    },
    {
        code: 'inventory',
        name: 'Inventory Management',
        name_ar: 'ط¥ط¯ط§ط±ط© ط§ظ„ظ…ط®ط²ظˆظ†',
        description: 'Manage spare parts and inventory stock',
        description_ar: 'ط¥ط¯ط§ط±ط© ظ‚ط·ط¹ ط§ظ„ط؛ظٹط§ط± ظˆط§ظ„ظ…ط®ط²ظˆظ†',
        icon: 'Package',
        route: '/inventory',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'stock_tracking', name: 'Stock Tracking', name_ar: 'طھطھط¨ط¹ ط§ظ„ظ…ط®ط²ظˆظ†', defaultEnabled: true },
            { code: 'low_stock_alerts', name: 'Low Stock Alerts', name_ar: 'طھظ†ط¨ظٹظ‡ط§طھ ظ†ظ‚طµ ط§ظ„ظ…ط®ط²ظˆظ†', defaultEnabled: true },
            { code: 'consumption_reports', name: 'Consumption Reports', name_ar: 'طھظ‚ط§ط±ظٹط± ط§ظ„ط§ط³طھظ‡ظ„ط§ظƒ', defaultEnabled: true },
        ]
    },
    {
        code: 'employees',
        name: 'Employee Management',
        name_ar: 'ط¥ط¯ط§ط±ط© ط§ظ„ظ…ظˆط¸ظپظٹظ†',
        description: 'Manage employee accounts and roles',
        description_ar: 'ط¥ط¯ط§ط±ط© ط­ط³ط§ط¨ط§طھ ط§ظ„ظ…ظˆط¸ظپظٹظ† ظˆط§ظ„طµظ„ط§ط­ظٹط§طھ',
        icon: 'Users',
        route: '/teams',
        isCore: true,  // Required for system operation
        defaultEnabled: true,
        features: [
            { code: 'user_management', name: 'User Management', name_ar: 'ط¥ط¯ط§ط±ط© ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ†', defaultEnabled: true },
            { code: 'role_assignment', name: 'Role Assignment', name_ar: 'طھط¹ظٹظٹظ† ط§ظ„ط£ط¯ظˆط§ط±', defaultEnabled: true },
        ]
    },
    {
        code: 'work_teams',
        name: 'Work Teams',
        name_ar: 'ظپط±ظ‚ ط§ظ„ط¹ظ…ظ„',
        description: 'Create and manage specialized work teams',
        description_ar: 'ط¥ظ†ط´ط§ط، ظˆط¥ط¯ط§ط±ط© ظپط±ظ‚ ط§ظ„ط¹ظ…ظ„ ط§ظ„ظ…طھط®طµطµط©',
        icon: 'Users2',
        route: '/work-teams',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'team_creation', name: 'Team Creation', name_ar: 'ط¥ظ†ط´ط§ط، ط§ظ„ظپط±ظ‚', defaultEnabled: true },
            { code: 'member_assignment', name: 'Member Assignment', name_ar: 'طھط¹ظٹظٹظ† ط§ظ„ط£ط¹ط¶ط§ط،', defaultEnabled: true },
        ]
    },
    {
        code: 'reports',
        name: 'Reports & Analytics',
        name_ar: 'ط§ظ„طھظ‚ط§ط±ظٹط± ظˆط§ظ„طھط­ظ„ظٹظ„ط§طھ',
        description: 'View reports and analytics',
        description_ar: 'ط¹ط±ط¶ ط§ظ„طھظ‚ط§ط±ظٹط± ظˆط§ظ„طھط­ظ„ظٹظ„ط§طھ',
        icon: 'FileText',
        route: '/reports',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'operational_reports', name: 'Operational Reports', name_ar: 'ط§ظ„طھظ‚ط§ط±ظٹط± ط§ظ„طھط´ط؛ظٹظ„ظٹط©', defaultEnabled: true },
            { code: 'export', name: 'Export Reports', name_ar: 'طھطµط¯ظٹط± ط§ظ„طھظ‚ط§ط±ظٹط±', defaultEnabled: true },
        ]
    },
    {
        code: 'public_portal',
        name: 'Public Portal',
        name_ar: 'ط§ظ„ط¨ظˆط§ط¨ط© ط§ظ„ط¹ط§ظ…ط©',
        description: 'Allow public users to submit reports',
        description_ar: 'ط§ظ„ط³ظ…ط§ط­ ظ„ظ„ظ…ط³طھط®ط¯ظ…ظٹظ† ط§ظ„ط¹ظ…ظˆظ…ظٹظٹظ† ط¨ط±ظپط¹ ط§ظ„ط¨ظ„ط§ط؛ط§طھ',
        icon: 'Globe',
        route: '/settings/portal',
        isCore: false,
        defaultEnabled: false,  // Opt-in feature
        features: [
            { code: 'public_submission', name: 'Public Submission', name_ar: 'ط±ظپط¹ ط¨ظ„ط§ط؛ط§طھ ط¹ط§ظ…ط©', defaultEnabled: true },
            { code: 'qr_portal', name: 'QR Portal Links', name_ar: 'ط±ظˆط§ط¨ط· QR ظ„ظ„ط¨ظˆط§ط¨ط©', defaultEnabled: true },
        ]
    },
]

const MODULE_CODES = SYSTEM_MODULES.map(module => module.code)

const LEGACY_PLAN_FEATURE_MAP: Record<string, string[]> = {
    dashboard: ['dashboard'],
    basic_dashboard: ['dashboard'],
    full_dashboard: ['dashboard'],
    facilities: ['facilities'],
    multi_location: ['facilities'],
    assets: ['facilities', 'assets'],
    basic_assets: ['facilities', 'assets'],
    work_orders: ['facilities', 'work_orders'],
    basic_work_orders: ['facilities', 'work_orders'],
    custom_workflows: ['facilities', 'work_orders'],
    maintenance: ['facilities', 'maintenance'],
    maintenance_calendar: ['facilities', 'maintenance'],
    inventory: ['facilities', 'inventory'],
    inventory_management: ['facilities', 'inventory'],
    employees: ['employees'],
    teams: ['work_teams'],
    work_teams: ['work_teams'],
    reports: ['reports'],
    basic_reporting: ['reports'],
    advanced_reporting: ['reports'],
    public_portal: ['public_portal'],
}

// Get module by code
export function getModuleByCode(code: string): SystemModule | undefined {
    return SYSTEM_MODULES.find(m => m.code === code)
}

// Get default enabled modules for new tenants
export function getDefaultEnabledModules(): Record<string, { enabled: boolean; features: Record<string, boolean> }> {
    const result: Record<string, { enabled: boolean; features: Record<string, boolean> }> = {}

    for (const module of SYSTEM_MODULES) {
        result[module.code] = {
            enabled: module.defaultEnabled,
            features: module.features.reduce((acc, f) => {
                acc[f.code] = f.defaultEnabled
                return acc
            }, {} as Record<string, boolean>)
        }
    }

    return result
}

export function getRestrictedEnabledModules(): Record<string, { enabled: boolean; features: Record<string, boolean> }> {
    const result: Record<string, { enabled: boolean; features: Record<string, boolean> }> = {}

    for (const module of SYSTEM_MODULES) {
        result[module.code] = {
            enabled: module.isCore,
            features: module.features.reduce((acc, feature) => {
                acc[feature.code] = module.isCore ? feature.defaultEnabled : false
                return acc
            }, {} as Record<string, boolean>)
        }
    }

    return result
}

export function normalizePlanFeatureCodes(features: string[] | null | undefined): string[] {
    if (!Array.isArray(features)) return []

    const normalized = new Set<string>()

    for (const rawFeature of features) {
        const feature = rawFeature.trim().toLowerCase()

        if (!feature) continue

        if (feature === 'all_features') {
            MODULE_CODES.forEach(code => normalized.add(code))
            continue
        }

        const mappedModules = LEGACY_PLAN_FEATURE_MAP[feature]
        if (mappedModules) {
            mappedModules.forEach(code => normalized.add(code))
            continue
        }

        if (MODULE_CODES.includes(feature)) {
            normalized.add(feature)
        }
    }

    return MODULE_CODES.filter(code => normalized.has(code))
}

// Check if a module is enabled for a tenant
export function isModuleEnabled(
    tenantModules: Record<string, { enabled: boolean }> | null | undefined,
    moduleCode: string
): boolean {
    const module = getModuleByCode(moduleCode)

    // Core modules are always enabled
    if (module?.isCore) return true

    // If tenant config is missing, fail closed except for core modules
    if (!tenantModules) {
        return module?.isCore ?? false
    }

    return tenantModules[moduleCode]?.enabled ?? module?.defaultEnabled ?? false
}

// Check if a feature is enabled for a tenant
export function isFeatureEnabled(
    tenantModules: Record<string, { enabled: boolean; features?: Record<string, boolean> }> | null | undefined,
    moduleCode: string,
    featureCode: string
): boolean {
    // First check if module is enabled
    if (!isModuleEnabled(tenantModules, moduleCode)) return false

    const module = getModuleByCode(moduleCode)
    const feature = module?.features.find(f => f.code === featureCode)

    // If the module has no features object in DB (e.g. provisioned before feature flags were added),
    // fall back to the code-defined default — do NOT return false just because features are missing.
    if (!tenantModules?.[moduleCode]?.features) {
        return feature?.defaultEnabled ?? false
    }

    return tenantModules[moduleCode].features?.[featureCode] ?? feature?.defaultEnabled ?? false
}

