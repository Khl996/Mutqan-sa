import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    useTenantSettings,
    useUpdateSetting,
    useResetCategorySettings,
    SETTINGS_CATEGORIES
} from '@/hooks/useTenantSettings'
import { SettingsCategory, SettingDefinition, TenantSettings } from '@/config/tenantSettings'
import { cn } from '@/lib/utils'
import {
    Settings2,
    ClipboardList,
    Wrench,
    Package,
    Bell,
    Globe,
    QrCode,
    RotateCcw,
    Loader2,
    Info
} from 'lucide-react'
import { toast } from 'sonner'

// Icon mapping
const iconMap: Record<string, React.ElementType> = {
    ClipboardList,
    Wrench,
    Package,
    Bell,
    Globe,
    QrCode,
    Settings2,
}

export default function TenantSettingsPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    const { data: settings, isLoading } = useTenantSettings()
    const updateSetting = useUpdateSetting()
    const resetCategory = useResetCategorySettings()

    const [activeCategory, setActiveCategory] = useState<SettingsCategory>('work_orders')
    const [isResetting, setIsResetting] = useState(false)

    const handleSettingChange = async (category: SettingsCategory, key: string, value: unknown) => {
        try {
            await updateSetting.mutateAsync({ category, key, value })
            toast.success(isRTL ? 'تم حفظ الإعداد' : 'Setting saved')
        } catch {
            toast.error(isRTL ? 'فشل حفظ الإعداد' : 'Failed to save setting')
        }
    }

    const handleResetCategory = async (category: SettingsCategory) => {
        setIsResetting(true)
        try {
            await resetCategory.mutateAsync(category)
            toast.success(isRTL ? 'تم إعادة الإعدادات للافتراضي' : 'Settings reset to default')
        } catch {
            toast.error(isRTL ? 'فشل إعادة الإعدادات' : 'Failed to reset settings')
        } finally {
            setIsResetting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted font-cairo">{t('common.loading')}</p>
                </div>
            </div>
        )
    }

    // If settings is null/undefined, show with defaults
    const currentSettings = settings || {
        work_orders: {
            require_supervisor_approval: true,
            require_engineer_review: true,
            auto_close_after_days: 7,
            allow_technician_reject: true,
            max_response_time_hours: 24,
            priority_escalation_enabled: true
        },
        maintenance: {
            auto_generate_work_orders: false,
            advance_notice_days: 0,
            allow_postpone: false
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
            default_language: 'ar' as const,
            date_format: 'DD/MM/YYYY',
            time_format: '12h' as const,
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

    const activeCategoryDef = SETTINGS_CATEGORIES.find(c => c.code === activeCategory)
    const isMaintenanceSoftLaunchCategory = activeCategoryDef?.code === 'maintenance'
    const categorySettings = isMaintenanceSoftLaunchCategory ? [] : (activeCategoryDef?.settings || [])
    const activeCategoryDescription = isMaintenanceSoftLaunchCategory
        ? (isRTL
            ? 'الصيانة الوقائية اليدوية فقط في الإطلاق المبكر'
            : 'Manual preventive maintenance only in soft launch')
        : (isRTL ? activeCategoryDef?.description_ar : activeCategoryDef?.description)

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-primary font-cairo flex items-center gap-3">
                    <Settings2 className="w-7 h-7 text-secondary" />
                    {isRTL ? 'إعدادات المنشأة' : 'Tenant Settings'}
                </h1>
                <p className="text-muted font-cairo">
                    {isRTL
                        ? 'تخصيص سلوك النظام حسب احتياجات منشأتك'
                        : 'Customize system behavior based on your needs'}
                </p>
            </div>

            {/* Info Banner */}
            <div className="bg-info/10 border border-info/20 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 bg-info/20 rounded-lg">
                    <Info className="w-5 h-5 text-info" />
                </div>
                <div>
                    <p className="font-bold text-info font-cairo">
                        {isRTL ? 'إعدادات خاصة بمنشأتك' : 'Settings specific to your organization'}
                    </p>
                    <p className="text-sm text-info/80 font-cairo">
                        {isRTL
                            ? 'هذه الإعدادات تؤثر على سلوك النظام لمنشأتك فقط. لن تؤثر على المنشآت الأخرى.'
                            : 'These settings affect system behavior for your organization only. They won\'t affect other organizations.'}
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Categories Sidebar */}
                <div className="lg:col-span-1">
                    <div className="bg-card rounded-xl border p-2 space-y-1 sticky top-4">
                        {SETTINGS_CATEGORIES.map(category => {
                            const Icon = iconMap[category.icon] || Settings2
                            const isActive = activeCategory === category.code
                            return (
                                <button
                                    key={category.code}
                                    onClick={() => setActiveCategory(category.code)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-start",
                                        isActive
                                            ? "bg-secondary text-white"
                                            : "hover:bg-muted/10 text-primary"
                                    )}
                                >
                                    <Icon className="w-5 h-5 flex-shrink-0" />
                                    <span className="font-cairo text-sm">
                                        {isRTL ? category.name_ar : category.name}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Settings Panel */}
                <div className="lg:col-span-3">
                    {activeCategoryDef && (
                        <div className="bg-card rounded-xl border">
                            {/* Category Header */}
                            <div className="p-4 border-b flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-bold font-cairo text-primary">
                                        {isRTL ? activeCategoryDef.name_ar : activeCategoryDef.name}
                                    </h2>
                                    <p className="text-sm text-muted-foreground font-cairo">
                                        {activeCategoryDescription}
                                    </p>
                                </div>
                                {categorySettings.length > 0 && (
                                    <button
                                        onClick={() => handleResetCategory(activeCategory)}
                                        disabled={isResetting}
                                        className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-primary hover:bg-muted/10 rounded-lg transition-colors"
                                    >
                                    {isResetting ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <RotateCcw className="w-4 h-4" />
                                    )}
                                    {isRTL ? 'إعادة للافتراضي' : 'Reset to Default'}
                                    </button>
                                )}
                            </div>

                            {/* Settings List */}
                            <div className="p-4 space-y-4">
                                {categorySettings.map(setting => (
                                    <SettingItem
                                        key={setting.key}
                                        setting={setting}
                                        value={getNestedValue(currentSettings, activeCategory, setting.key)}
                                        onChange={(value) => handleSettingChange(activeCategory, setting.key, value)}
                                        isRTL={isRTL}
                                        isUpdating={updateSetting.isPending}
                                    />
                                ))}
                                {categorySettings.length === 0 && (
                                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                                        <p className="font-bold font-cairo text-blue-700">
                                            {isRTL ? 'الإطلاق المبكر للصيانة الوقائية يدوي فقط' : 'Preventive maintenance is manual-only in soft launch'}
                                        </p>
                                        <p className="mt-1 text-sm text-blue-700/80 font-cairo">
                                            {isRTL
                                                ? 'في هذه النسخة: الخطط اليدوية، المهام اليدوية، وإنشاء أمر عمل اختياري من المهمة فقط. التكرار، التوليد التلقائي، والتأجيل غير متاحة بعد.'
                                                : 'This release supports manual plans, manual tasks, and optional work order creation from a task only. Recurrence, auto-generation, and postpone flows are not available yet.'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// Get nested value from settings
function getNestedValue(settings: TenantSettings | undefined, category: string, key: string): unknown {
    if (!settings) return undefined
    const categoryObj = settings[category as keyof TenantSettings]
    if (!categoryObj) return undefined
    return (categoryObj as Record<string, unknown>)[key]
}

// Individual Setting Item Component
function SettingItem({
    setting,
    value,
    onChange,
    isRTL,
    isUpdating
}: {
    setting: SettingDefinition
    value: unknown
    onChange: (value: unknown) => void
    isRTL: boolean
    isUpdating: boolean
}) {
    const handleChange = (newValue: unknown) => {
        onChange(newValue)
    }

    return (
        <div className="flex items-start justify-between p-4 bg-muted/5 rounded-xl border border-border/50 hover:border-border transition-colors">
            <div className="flex-1">
                <h3 className="font-medium font-cairo text-primary">
                    {isRTL ? setting.name_ar : setting.name}
                </h3>
                <p className="text-sm text-muted-foreground font-cairo mt-0.5">
                    {isRTL ? setting.description_ar : setting.description}
                </p>
            </div>

            <div className={cn("flex-shrink-0", isRTL ? "mr-4" : "ml-4")}>
                {setting.type === 'boolean' && (
                    <button
                        onClick={() => handleChange(!value)}
                        disabled={isUpdating}
                        className={cn(
                            "relative w-14 h-7 rounded-full transition-colors",
                            value ? "bg-success" : "bg-muted/30",
                            isUpdating && "opacity-50 cursor-wait"
                        )}
                    >
                        <div className={cn(
                            "absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform",
                            value
                                ? (isRTL ? "left-1" : "right-1")
                                : (isRTL ? "right-1" : "left-1")
                        )} />
                    </button>
                )}

                {setting.type === 'number' && (
                    <input
                        type="number"
                        value={value as number ?? setting.default}
                        onChange={(e) => handleChange(parseInt(e.target.value) || setting.default)}
                        min={setting.min}
                        max={setting.max}
                        disabled={isUpdating}
                        className={cn(
                            "w-20 px-3 py-2 bg-background border rounded-lg text-center font-inter",
                            "focus:ring-2 focus:ring-secondary/20 outline-none",
                            isUpdating && "opacity-50 cursor-wait"
                        )}
                    />
                )}

                {setting.type === 'select' && setting.options && (
                    <select
                        value={value as string ?? setting.default}
                        onChange={(e) => handleChange(e.target.value)}
                        disabled={isUpdating}
                        className={cn(
                            "px-3 py-2 bg-background border rounded-lg font-cairo",
                            "focus:ring-2 focus:ring-secondary/20 outline-none cursor-pointer",
                            isUpdating && "opacity-50 cursor-wait"
                        )}
                    >
                        {setting.options.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {isRTL ? opt.label_ar : opt.label}
                            </option>
                        ))}
                    </select>
                )}

                {setting.type === 'string' && (
                    <input
                        type="text"
                        value={value as string ?? ''}
                        onChange={(e) => handleChange(e.target.value)}
                        disabled={isUpdating}
                        className={cn(
                            "w-48 px-3 py-2 bg-background border rounded-lg font-cairo",
                            "focus:ring-2 focus:ring-secondary/20 outline-none",
                            isUpdating && "opacity-50 cursor-wait"
                        )}
                    />
                )}
            </div>
        </div>
    )
}
