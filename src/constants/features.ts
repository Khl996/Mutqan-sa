export interface SystemFeature {
    id: string
    key: string
    name: string
    name_ar: string
    description: string
    category: 'core' | 'operations' | 'reports' | 'support'
}

export const SYSTEM_FEATURES: SystemFeature[] = [
    // Core Features
    {
        id: 'dashboard_access',
        key: 'dashboard',
        name: 'Dashboard Access',
        name_ar: 'الوصول للوحة التحكم',
        description: 'Access to the main dashboard and statistics',
        category: 'core'
    },
    {
        id: 'multi_user',
        key: 'users',
        name: 'Multi-user Access',
        name_ar: 'تعدد المستخدمين',
        description: 'Ability to add multiple users to the system',
        category: 'core'
    },

    // Operations
    {
        id: 'asset_management',
        key: 'assets',
        name: 'Asset Management',
        name_ar: 'إدارة الأصول',
        description: 'Full asset tracking and management',
        category: 'operations'
    },
    {
        id: 'work_orders',
        key: 'work_orders',
        name: 'Work Orders',
        name_ar: 'أوامر العمل',
        description: 'Create and manage maintenance work orders',
        category: 'operations'
    },
    {
        id: 'preventive_maintenance',
        key: 'pm',
        name: 'Preventive Maintenance',
        name_ar: 'الصيانة الوقائية',
        description: 'Schedule recurring maintenance tasks',
        category: 'operations'
    },
    {
        id: 'inventory',
        key: 'inventory',
        name: 'Inventory Management',
        name_ar: 'إدارة المخزون',
        description: 'Track spare parts and stock levels',
        category: 'operations'
    },

    // Reports
    {
        id: 'basic_reports',
        key: 'reports_basic',
        name: 'Basic Reports',
        name_ar: 'تقارير أساسية',
        description: 'Access to standard system reports',
        category: 'reports'
    },
    {
        id: 'advanced_reports',
        key: 'reports_advanced',
        name: 'Advanced Analytics',
        name_ar: 'تحليلات متقدمة',
        description: 'Deep insights and custom reporting',
        category: 'reports'
    },

    // Support
    {
        id: 'email_support',
        key: 'support_email',
        name: 'Email Support',
        name_ar: 'دعم عبر البريد الإلكتروني',
        description: 'Standard email support',
        category: 'support'
    },
    {
        id: 'priority_support',
        key: 'support_priority',
        name: 'Priority Support',
        name_ar: 'دعم ذو أولوية',
        description: 'Fast response time and priority handling',
        category: 'support'
    }
]
