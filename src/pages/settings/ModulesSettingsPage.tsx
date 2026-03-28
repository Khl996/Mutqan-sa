import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    useTenantModules,
    TENANT_MODULES_MANAGED_MESSAGE,
    SYSTEM_MODULES
} from '@/hooks/useTenantModules'
import { isFeatureEnabled, isModuleEnabled, SystemModule } from '@/config/modules'
import { cn } from '@/lib/utils'
import {
    Settings2,
    LayoutDashboard,
    Building2,
    Box,
    ClipboardList,
    Wrench,
    Package,
    Users,
    Users2,
    FileText,
    Globe,
    ChevronDown,
    ChevronUp,
    Check,
    X,
    Lock,
} from 'lucide-react'
import { toast } from 'sonner'

const iconMap: Record<string, React.ElementType> = {
    LayoutDashboard,
    Building2,
    Box,
    ClipboardList,
    Wrench,
    Package,
    Users,
    Users2,
    FileText,
    Globe,
    Settings2,
}

export default function ModulesSettingsPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { data: tenantModules, isLoading } = useTenantModules()
    const [expandedModule, setExpandedModule] = useState<string | null>(null)

    const planManagedMessage = isRTL
        ? 'الموديولات والميزات تُدار تلقائيًا حسب الباقة النشطة.'
        : TENANT_MODULES_MANAGED_MESSAGE

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

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-primary font-cairo flex items-center gap-3">
                    <Settings2 className="w-7 h-7 text-secondary" />
                    {isRTL ? 'إدارة الموديولات' : 'Module Management'}
                </h1>
                <p className="text-muted font-cairo">
                    {isRTL
                        ? 'عرض الموديولات والميزات المفعلة حسب باقة المنشأة الحالية.'
                        : 'View the modules and features enabled by the active subscription plan.'}
                </p>
            </div>

            <div className="bg-info/10 border border-info/20 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 bg-info/20 rounded-lg">
                    <Settings2 className="w-5 h-5 text-info" />
                </div>
                <div>
                    <p className="font-bold text-info font-cairo">
                        {isRTL ? 'الاستحقاقات مرتبطة بالاشتراك' : 'Entitlements follow your subscription'}
                    </p>
                    <p className="text-sm text-info/80 font-cairo">
                        {planManagedMessage}
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                {SYSTEM_MODULES.map(module => (
                    <ModuleCard
                        key={module.code}
                        module={module}
                        isEnabled={isModuleEnabled(tenantModules, module.code)}
                        tenantModules={tenantModules}
                        isExpanded={expandedModule === module.code}
                        onToggleExpand={() => setExpandedModule(expandedModule === module.code ? null : module.code)}
                        onPlanManagedAction={() => toast.info(planManagedMessage)}
                        isRTL={isRTL}
                    />
                ))}
            </div>
        </div>
    )
}

function ModuleCard({
    module,
    isEnabled,
    tenantModules,
    isExpanded,
    onToggleExpand,
    onPlanManagedAction,
    isRTL
}: {
    module: SystemModule
    isEnabled: boolean
    tenantModules: Record<string, { enabled: boolean; features?: Record<string, boolean> }> | null | undefined
    isExpanded: boolean
    onToggleExpand: () => void
    onPlanManagedAction: () => void
    isRTL: boolean
}) {
    const Icon = iconMap[module.icon] || Settings2

    return (
        <div className={cn(
            'bg-card rounded-xl border overflow-hidden transition-all',
            isEnabled ? 'border-border' : 'border-muted/30 opacity-70'
        )}>
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                    <div className={cn(
                        'p-3 rounded-xl',
                        isEnabled ? 'bg-secondary/10' : 'bg-muted/10'
                    )}>
                        <Icon className={cn(
                            'w-6 h-6',
                            isEnabled ? 'text-secondary' : 'text-muted'
                        )} />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold font-cairo">
                                {isRTL ? module.name_ar : module.name}
                            </h3>
                            {module.isCore && (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-warning/10 text-warning text-xs rounded-full">
                                    <Lock className="w-3 h-3" />
                                    {isRTL ? 'أساسي' : 'Core'}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground font-cairo">
                            {isRTL ? module.description_ar : module.description}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={onPlanManagedAction}
                        disabled
                        title={isRTL ? 'تُدار من الباقة' : 'Managed by subscription'}
                        className={cn(
                            'relative w-14 h-7 rounded-full transition-colors cursor-not-allowed opacity-70',
                            isEnabled ? 'bg-success' : 'bg-muted/30'
                        )}
                    >
                        <div className={cn(
                            'absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform',
                            isEnabled ? (isRTL ? 'left-1' : 'right-1') : (isRTL ? 'right-1' : 'left-1')
                        )}>
                            {isEnabled ? (
                                <Check className="w-3 h-3 m-1 text-success" />
                            ) : (
                                <X className="w-3 h-3 m-1 text-muted" />
                            )}
                        </div>
                    </button>

                    {module.features.length > 0 && (
                        <button
                            onClick={onToggleExpand}
                            className="p-2 hover:bg-muted/10 rounded-lg transition-colors"
                        >
                            {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-muted" />
                            ) : (
                                <ChevronDown className="w-5 h-5 text-muted" />
                            )}
                        </button>
                    )}
                </div>
            </div>

            {isExpanded && module.features.length > 0 && (
                <div className="border-t bg-muted/5 p-4">
                    <p className="text-sm font-medium text-muted-foreground mb-3 font-cairo">
                        {isRTL ? 'الميزات الفرعية:' : 'Sub-features:'}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {module.features.map(feature => {
                            const featureEnabled = isFeatureEnabled(tenantModules, module.code, feature.code)
                            return (
                                <div
                                    key={feature.code}
                                    className={cn(
                                        'flex items-center justify-between p-3 rounded-lg border',
                                        featureEnabled ? 'bg-card border-border' : 'bg-muted/5 border-muted/20'
                                    )}
                                >
                                    <span className={cn(
                                        'font-cairo text-sm',
                                        featureEnabled ? 'text-primary' : 'text-muted'
                                    )}>
                                        {isRTL ? feature.name_ar : feature.name}
                                    </span>
                                    <button
                                        onClick={onPlanManagedAction}
                                        disabled
                                        title={isRTL ? 'تُدار من الباقة' : 'Managed by subscription'}
                                        className={cn(
                                            'w-10 h-5 rounded-full transition-colors relative cursor-not-allowed opacity-70',
                                            featureEnabled ? 'bg-success' : 'bg-muted/30',
                                            !isEnabled && 'opacity-50'
                                        )}
                                    >
                                        <div className={cn(
                                            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                                            featureEnabled
                                                ? (isRTL ? 'left-0.5' : 'right-0.5')
                                                : (isRTL ? 'right-0.5' : 'left-0.5')
                                        )} />
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
