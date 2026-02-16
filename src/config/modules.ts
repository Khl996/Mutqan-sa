/**
 * System Modules Configuration
 * كل موديول قابل للتفعيل/التعطيل والتخصيص لكل مؤسسة
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
        name_ar: 'لوحة التحكم',
        description: 'Main dashboard with KPIs and statistics',
        description_ar: 'لوحة التحكم الرئيسية مع المؤشرات والإحصائيات',
        icon: 'LayoutDashboard',
        route: '/dashboard',
        isCore: true,  // Cannot be disabled
        defaultEnabled: true,
        features: [
            { code: 'quick_stats', name: 'Quick Stats', name_ar: 'إحصائيات سريعة', defaultEnabled: true },
            { code: 'charts', name: 'Charts', name_ar: 'الرسوم البيانية', defaultEnabled: true },
            { code: 'recent_activity', name: 'Recent Activity', name_ar: 'النشاط الأخير', defaultEnabled: true },
        ]
    },
    {
        code: 'facilities',
        name: 'Facilities Management',
        name_ar: 'إدارة المرافق',
        description: 'Manage buildings, floors, departments and rooms',
        description_ar: 'إدارة المباني والطوابق والأقسام والغرف',
        icon: 'Building2',
        route: '/facilities',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'buildings', name: 'Buildings', name_ar: 'المباني', defaultEnabled: true },
            { code: 'floors', name: 'Floors', name_ar: 'الطوابق', defaultEnabled: true },
            { code: 'departments', name: 'Departments', name_ar: 'الأقسام', defaultEnabled: true },
            { code: 'rooms', name: 'Rooms', name_ar: 'الغرف', defaultEnabled: true },
        ]
    },
    {
        code: 'assets',
        name: 'Asset Management',
        name_ar: 'إدارة الأصول',
        description: 'Track and manage all assets and equipment',
        description_ar: 'تتبع وإدارة جميع الأصول والمعدات',
        icon: 'Box',
        route: '/assets',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'asset_tracking', name: 'Asset Tracking', name_ar: 'تتبع الأصول', defaultEnabled: true },
            { code: 'qr_codes', name: 'QR Codes', name_ar: 'رموز QR', defaultEnabled: true },
            { code: 'asset_history', name: 'Asset History', name_ar: 'سجل الأصول', defaultEnabled: true },
            { code: 'warranty_tracking', name: 'Warranty Tracking', name_ar: 'تتبع الضمان', defaultEnabled: true },
        ]
    },
    {
        code: 'work_orders',
        name: 'Work Orders',
        name_ar: 'أوامر العمل',
        description: 'Create and manage work orders and maintenance requests',
        description_ar: 'إنشاء وإدارة أوامر العمل وطلبات الصيانة',
        icon: 'ClipboardList',
        route: '/work-orders',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'create_wo', name: 'Create Work Orders', name_ar: 'إنشاء أوامر عمل', defaultEnabled: true },
            { code: 'workflow', name: 'Workflow Approvals', name_ar: 'سير العمل والاعتمادات', defaultEnabled: true },
            { code: 'assignment', name: 'Team Assignment', name_ar: 'تعيين الفرق', defaultEnabled: true },
            { code: 'parts_tracking', name: 'Parts Tracking', name_ar: 'تتبع القطع', defaultEnabled: true },
        ]
    },
    {
        code: 'maintenance',
        name: 'Preventive Maintenance',
        name_ar: 'الصيانة الوقائية',
        description: 'Schedule and manage preventive maintenance plans',
        description_ar: 'جدولة وإدارة خطط الصيانة الوقائية',
        icon: 'Wrench',
        route: '/maintenance',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'maintenance_plans', name: 'Maintenance Plans', name_ar: 'خطط الصيانة', defaultEnabled: true },
            { code: 'schedules', name: 'Schedules', name_ar: 'الجداول الزمنية', defaultEnabled: true },
            { code: 'auto_generation', name: 'Auto Work Order Generation', name_ar: 'توليد أوامر تلقائي', defaultEnabled: true },
        ]
    },
    {
        code: 'inventory',
        name: 'Inventory Management',
        name_ar: 'إدارة المخزون',
        description: 'Manage spare parts and inventory stock',
        description_ar: 'إدارة قطع الغيار والمخزون',
        icon: 'Package',
        route: '/inventory',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'stock_tracking', name: 'Stock Tracking', name_ar: 'تتبع المخزون', defaultEnabled: true },
            { code: 'low_stock_alerts', name: 'Low Stock Alerts', name_ar: 'تنبيهات نقص المخزون', defaultEnabled: true },
            { code: 'consumption_reports', name: 'Consumption Reports', name_ar: 'تقارير الاستهلاك', defaultEnabled: true },
        ]
    },
    {
        code: 'employees',
        name: 'Employee Management',
        name_ar: 'إدارة الموظفين',
        description: 'Manage employee accounts and roles',
        description_ar: 'إدارة حسابات الموظفين والصلاحيات',
        icon: 'Users',
        route: '/teams',
        isCore: true,  // Required for system operation
        defaultEnabled: true,
        features: [
            { code: 'user_management', name: 'User Management', name_ar: 'إدارة المستخدمين', defaultEnabled: true },
            { code: 'role_assignment', name: 'Role Assignment', name_ar: 'تعيين الأدوار', defaultEnabled: true },
        ]
    },
    {
        code: 'work_teams',
        name: 'Work Teams',
        name_ar: 'فرق العمل',
        description: 'Create and manage specialized work teams',
        description_ar: 'إنشاء وإدارة فرق العمل المتخصصة',
        icon: 'Users2',
        route: '/work-teams',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'team_creation', name: 'Team Creation', name_ar: 'إنشاء الفرق', defaultEnabled: true },
            { code: 'member_assignment', name: 'Member Assignment', name_ar: 'تعيين الأعضاء', defaultEnabled: true },
        ]
    },
    {
        code: 'reports',
        name: 'Reports & Analytics',
        name_ar: 'التقارير والتحليلات',
        description: 'View reports and analytics',
        description_ar: 'عرض التقارير والتحليلات',
        icon: 'FileText',
        route: '/reports',
        isCore: false,
        defaultEnabled: true,
        features: [
            { code: 'operational_reports', name: 'Operational Reports', name_ar: 'التقارير التشغيلية', defaultEnabled: true },
            { code: 'export', name: 'Export Reports', name_ar: 'تصدير التقارير', defaultEnabled: true },
        ]
    },
    {
        code: 'public_portal',
        name: 'Public Portal',
        name_ar: 'البوابة العامة',
        description: 'Allow public users to submit reports',
        description_ar: 'السماح للمستخدمين العموميين برفع البلاغات',
        icon: 'Globe',
        route: '/settings/portal',
        isCore: false,
        defaultEnabled: false,  // Opt-in feature
        features: [
            { code: 'public_submission', name: 'Public Submission', name_ar: 'رفع بلاغات عامة', defaultEnabled: true },
            { code: 'qr_portal', name: 'QR Portal Links', name_ar: 'روابط QR للبوابة', defaultEnabled: true },
        ]
    },
]

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

// Check if a module is enabled for a tenant
export function isModuleEnabled(
    tenantModules: Record<string, { enabled: boolean }> | null | undefined,
    moduleCode: string
): boolean {
    const module = getModuleByCode(moduleCode)

    // Core modules are always enabled
    if (module?.isCore) return true

    // If no tenant config, use default
    if (!tenantModules) {
        return module?.defaultEnabled ?? false
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

    if (!tenantModules?.[moduleCode]?.features) {
        return feature?.defaultEnabled ?? false
    }

    return tenantModules[moduleCode].features?.[featureCode] ?? feature?.defaultEnabled ?? false
}
