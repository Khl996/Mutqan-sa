/**
 * Tenant Settings Configuration
 * كل منشأة يمكنها تخصيص سلوك النظام حسب احتياجاتها
 */

// Settings Categories
export type SettingsCategory =
    | 'work_orders'
    | 'maintenance'
    | 'inventory'
    | 'notifications'
    | 'display'
    | 'portal'

// Individual Setting Definition
export interface SettingDefinition {
    key: string
    name: string
    name_ar: string
    description: string
    description_ar: string
    type: 'boolean' | 'number' | 'string' | 'select'
    default: boolean | number | string
    options?: { value: string | number; label: string; label_ar: string }[]
    min?: number
    max?: number
}

// Category Definition
export interface SettingsCategoryDefinition {
    code: SettingsCategory
    name: string
    name_ar: string
    description: string
    description_ar: string
    icon: string
    settings: SettingDefinition[]
}

// Full Tenant Settings Type
export interface TenantSettings {
    work_orders: {
        require_supervisor_approval: boolean
        require_engineer_review: boolean
        auto_close_after_days: number
        allow_technician_reject: boolean
        max_response_time_hours: number
        priority_escalation_enabled: boolean
    }
    maintenance: {
        auto_generate_work_orders: boolean
        advance_notice_days: number
        allow_postpone: boolean
    }
    inventory: {
        low_stock_threshold_percent: number
        require_approval_for_consumption: boolean
        track_consumption_by_technician: boolean
    }
    notifications: {
        notify_on_new_work_order: boolean
        notify_on_status_change: boolean
        notify_admins_on_escalation: boolean
        daily_summary_enabled: boolean
    }
    display: {
        default_language: 'ar' | 'en'
        date_format: string
        time_format: '12h' | '24h'
        timezone: string
    }
    portal: {
        require_phone: boolean
        auto_assign_to_team: boolean
        show_estimated_time: boolean
        welcome_message: string | null
        thank_you_message: string | null
    }
}

// All Settings Categories with their definitions
export const SETTINGS_CATEGORIES: SettingsCategoryDefinition[] = [
    {
        code: 'work_orders',
        name: 'Work Orders',
        name_ar: 'أوامر العمل',
        description: 'Configure work order workflow and behavior',
        description_ar: 'تكوين سير عمل وسلوك أوامر العمل',
        icon: 'ClipboardList',
        settings: [
            {
                key: 'require_supervisor_approval',
                name: 'Require Supervisor Approval',
                name_ar: 'إلزام اعتماد المشرف',
                description: 'Work orders must be approved by supervisor before closing',
                description_ar: 'يجب اعتماد أوامر العمل من المشرف قبل الإغلاق',
                type: 'boolean',
                default: true
            },
            {
                key: 'require_engineer_review',
                name: 'Require Engineer Review',
                name_ar: 'إلزام مراجعة المهندس',
                description: 'Work orders must be reviewed by engineer before closing',
                description_ar: 'يجب مراجعة أوامر العمل من المهندس قبل الإغلاق',
                type: 'boolean',
                default: true
            },
            {
                key: 'auto_close_after_days',
                name: 'Auto Close After (Days)',
                name_ar: 'الإغلاق التلقائي بعد (أيام)',
                description: 'Automatically close work orders after specified days if no response',
                description_ar: 'إغلاق أوامر العمل تلقائياً بعد الأيام المحددة إذا لم يتم الرد',
                type: 'number',
                default: 7,
                min: 1,
                max: 30
            },
            {
                key: 'allow_technician_reject',
                name: 'Allow Technician to Reject',
                name_ar: 'السماح للفني بالرفض',
                description: 'Technicians can reject work orders assigned to them',
                description_ar: 'يمكن للفنيين رفض أوامر العمل المسندة إليهم',
                type: 'boolean',
                default: true
            },
            {
                key: 'max_response_time_hours',
                name: 'Max Response Time (Hours)',
                name_ar: 'الحد الأقصى لوقت الاستجابة (ساعات)',
                description: 'Maximum time to respond to a new work order',
                description_ar: 'الحد الأقصى للوقت للاستجابة لأمر عمل جديد',
                type: 'number',
                default: 24,
                min: 1,
                max: 168
            },
            {
                key: 'priority_escalation_enabled',
                name: 'Priority Escalation',
                name_ar: 'تصعيد الأولوية',
                description: 'Automatically escalate priority if response time exceeded',
                description_ar: 'تصعيد الأولوية تلقائياً إذا تجاوز وقت الاستجابة',
                type: 'boolean',
                default: true
            }
        ]
    },
    {
        code: 'maintenance',
        name: 'Preventive Maintenance',
        name_ar: 'الصيانة الوقائية',
        description: 'Configure preventive maintenance settings',
        description_ar: 'تكوين إعدادات الصيانة الوقائية',
        icon: 'Wrench',
        settings: [
            {
                key: 'auto_generate_work_orders',
                name: 'Auto Generate Work Orders',
                name_ar: 'توليد أوامر العمل تلقائياً',
                description: 'Automatically create work orders from maintenance schedules',
                description_ar: 'إنشاء أوامر عمل تلقائياً من جداول الصيانة',
                type: 'boolean',
                default: true
            },
            {
                key: 'advance_notice_days',
                name: 'Advance Notice (Days)',
                name_ar: 'الإشعار المسبق (أيام)',
                description: 'Days before scheduled maintenance to create work order',
                description_ar: 'عدد الأيام قبل موعد الصيانة لإنشاء أمر العمل',
                type: 'number',
                default: 3,
                min: 1,
                max: 14
            },
            {
                key: 'allow_postpone',
                name: 'Allow Postpone',
                name_ar: 'السماح بالتأجيل',
                description: 'Allow postponing scheduled maintenance tasks',
                description_ar: 'السماح بتأجيل مهام الصيانة المجدولة',
                type: 'boolean',
                default: true
            }
        ]
    },
    {
        code: 'inventory',
        name: 'Inventory',
        name_ar: 'المخزون',
        description: 'Configure inventory and spare parts settings',
        description_ar: 'تكوين إعدادات المخزون وقطع الغيار',
        icon: 'Package',
        settings: [
            {
                key: 'low_stock_threshold_percent',
                name: 'Low Stock Threshold (%)',
                name_ar: 'حد تنبيه نقص المخزون (%)',
                description: 'Percentage threshold for low stock alerts',
                description_ar: 'النسبة المئوية لتنبيه نقص المخزون',
                type: 'number',
                default: 20,
                min: 5,
                max: 50
            },
            {
                key: 'require_approval_for_consumption',
                name: 'Require Approval for Consumption',
                name_ar: 'اعتماد قبل صرف القطع',
                description: 'Require supervisor or maintenance manager approval before consuming inventory',
                description_ar: 'إلزام موافقة المدير قبل صرف القطع من المخزون',
                type: 'boolean',
                default: false
            },
            {
                key: 'track_consumption_by_technician',
                name: 'Track by Technician',
                name_ar: 'تتبع الاستهلاك بالفني',
                description: 'Track which technician consumed each part',
                description_ar: 'تتبع أي فني استهلك كل قطعة',
                type: 'boolean',
                default: true
            }
        ]
    },
    {
        code: 'notifications',
        name: 'Notifications',
        name_ar: 'الإشعارات',
        description: 'Configure notification preferences',
        description_ar: 'تكوين تفضيلات الإشعارات',
        icon: 'Bell',
        settings: [
            {
                key: 'notify_on_new_work_order',
                name: 'New Work Order Notification',
                name_ar: 'إشعار عند بلاغ جديد',
                description: 'Send notification when a new work order is created',
                description_ar: 'إرسال إشعار عند إنشاء بلاغ جديد',
                type: 'boolean',
                default: true
            },
            {
                key: 'notify_on_status_change',
                name: 'Status Change Notification',
                name_ar: 'إشعار عند تغيير الحالة',
                description: 'Send notification when work order status changes',
                description_ar: 'إرسال إشعار عند تغيير حالة البلاغ',
                type: 'boolean',
                default: true
            },
            {
                key: 'notify_admins_on_escalation',
                name: 'Escalation Notification',
                name_ar: 'إشعار عند التصعيد',
                description: 'Notify admins when a work order is escalated',
                description_ar: 'إشعار المدراء عند تصعيد بلاغ',
                type: 'boolean',
                default: true
            },
            {
                key: 'daily_summary_enabled',
                name: 'Daily Summary',
                name_ar: 'الملخص اليومي',
                description: 'Send daily summary email to managers',
                description_ar: 'إرسال ملخص يومي بالبريد للمدراء',
                type: 'boolean',
                default: false
            }
        ]
    },
    {
        code: 'display',
        name: 'Display & Regional',
        name_ar: 'العرض والإقليمية',
        description: 'Configure display and regional settings',
        description_ar: 'تكوين إعدادات العرض والإقليمية',
        icon: 'Globe',
        settings: [
            {
                key: 'default_language',
                name: 'Default Language',
                name_ar: 'اللغة الافتراضية',
                description: 'Default language for new users',
                description_ar: 'اللغة الافتراضية للمستخدمين الجدد',
                type: 'select',
                default: 'ar',
                options: [
                    { value: 'ar', label: 'Arabic', label_ar: 'العربية' },
                    { value: 'en', label: 'English', label_ar: 'الإنجليزية' }
                ]
            },
            {
                key: 'time_format',
                name: 'Time Format',
                name_ar: 'تنسيق الوقت',
                description: '12-hour or 24-hour format',
                description_ar: 'تنسيق 12 ساعة أو 24 ساعة',
                type: 'select',
                default: '12h',
                options: [
                    { value: '12h', label: '12 Hour (AM/PM)', label_ar: '12 ساعة (ص/م)' },
                    { value: '24h', label: '24 Hour', label_ar: '24 ساعة' }
                ]
            },
            {
                key: 'timezone',
                name: 'Timezone',
                name_ar: 'المنطقة الزمنية',
                description: 'Default timezone for the organization',
                description_ar: 'المنطقة الزمنية الافتراضية للمنشأة',
                type: 'select',
                default: 'Asia/Riyadh',
                options: [
                    { value: 'Asia/Riyadh', label: 'Riyadh (GMT+3)', label_ar: 'الرياض (+3)' },
                    { value: 'Asia/Dubai', label: 'Dubai (GMT+4)', label_ar: 'دبي (+4)' },
                    { value: 'Asia/Kuwait', label: 'Kuwait (GMT+3)', label_ar: 'الكويت (+3)' },
                    { value: 'Africa/Cairo', label: 'Cairo (GMT+2)', label_ar: 'القاهرة (+2)' }
                ]
            },
            {
                key: 'date_format',
                name: 'Date Format',
                name_ar: 'تنسيق التاريخ',
                description: 'Date display format',
                description_ar: 'تنسيق عرض التاريخ',
                type: 'select',
                default: 'DD/MM/YYYY',
                options: [
                    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', label_ar: 'يوم/شهر/سنة' },
                    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', label_ar: 'شهر/يوم/سنة' },
                    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', label_ar: 'سنة-شهر-يوم' }
                ]
            }
        ]
    },
    {
        code: 'portal',
        name: 'Public Portal',
        name_ar: 'البوابة العامة',
        description: 'Configure public reporting portal',
        description_ar: 'تكوين بوابة البلاغات العامة',
        icon: 'QrCode',
        settings: [
            {
                key: 'require_phone',
                name: 'Require Phone Number',
                name_ar: 'إلزام رقم الهاتف',
                description: 'Require phone number when submitting reports',
                description_ar: 'إلزام رقم الهاتف عند رفع البلاغ',
                type: 'boolean',
                default: false
            },
            {
                key: 'auto_assign_to_team',
                name: 'Auto Assign to Team',
                name_ar: 'تعيين تلقائي للفريق',
                description: 'Automatically assign based on issue type',
                description_ar: 'تعيين تلقائي للفريق بناءً على نوع المشكلة',
                type: 'boolean',
                default: true
            },
            {
                key: 'show_estimated_time',
                name: 'Show Estimated Time',
                name_ar: 'عرض الوقت المتوقع',
                description: 'Show estimated response time to reporters',
                description_ar: 'عرض الوقت المتوقع للاستجابة للمبلغين',
                type: 'boolean',
                default: false
            }
        ]
    }
]

// Default settings for new tenants
export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
    work_orders: {
        require_supervisor_approval: true,
        require_engineer_review: true,
        auto_close_after_days: 7,
        allow_technician_reject: true,
        max_response_time_hours: 24,
        priority_escalation_enabled: true
    },
    maintenance: {
        auto_generate_work_orders: true,
        advance_notice_days: 3,
        allow_postpone: true
    },
    inventory: {
        low_stock_threshold_percent: 20,
        require_approval_for_consumption: false,
        track_consumption_by_technician: true
    },
    notifications: {
        notify_on_new_work_order: true,
        notify_on_status_change: true,
        notify_admins_on_escalation: true,
        daily_summary_enabled: false
    },
    display: {
        default_language: 'ar',
        date_format: 'DD/MM/YYYY',
        time_format: '12h',
        timezone: 'Asia/Riyadh'
    },
    portal: {
        require_phone: false,
        auto_assign_to_team: true,
        show_estimated_time: false,
        welcome_message: null,
        thank_you_message: null
    }
}

// Helper function to get a setting value
export function getSettingValue<T>(
    settings: TenantSettings | null | undefined,
    category: SettingsCategory,
    key: string
): T {
    if (!settings) {
        const categoryDef = SETTINGS_CATEGORIES.find(c => c.code === category)
        const settingDef = categoryDef?.settings.find(s => s.key === key)
        return settingDef?.default as T
    }

    const categorySettings = settings[category] as Record<string, unknown>
    if (categorySettings && key in categorySettings) {
        return categorySettings[key] as T
    }

    // Return default
    const categoryDef = SETTINGS_CATEGORIES.find(c => c.code === category)
    const settingDef = categoryDef?.settings.find(s => s.key === key)
    return settingDef?.default as T
}

// Helper to merge settings with defaults
export function mergeWithDefaults(settings: Partial<TenantSettings> | null): TenantSettings {
    if (!settings) return DEFAULT_TENANT_SETTINGS

    return {
        work_orders: { ...DEFAULT_TENANT_SETTINGS.work_orders, ...settings.work_orders },
        maintenance: { ...DEFAULT_TENANT_SETTINGS.maintenance, ...settings.maintenance },
        inventory: { ...DEFAULT_TENANT_SETTINGS.inventory, ...settings.inventory },
        notifications: { ...DEFAULT_TENANT_SETTINGS.notifications, ...settings.notifications },
        display: { ...DEFAULT_TENANT_SETTINGS.display, ...settings.display },
        portal: { ...DEFAULT_TENANT_SETTINGS.portal, ...settings.portal }
    }
}
