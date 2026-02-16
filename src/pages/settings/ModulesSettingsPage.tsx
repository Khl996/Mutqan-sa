import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    useTenantModules,
    useToggleModule,
    useToggleFeature,
    SYSTEM_MODULES
} from '@/hooks/useTenantModules'
import { isModuleEnabled, isFeatureEnabled, SystemModule } from '@/config/modules'
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
    Loader2
} from 'lucide-react'
import { toast } from 'sonner'

// Icon mapping
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
    const toggleModule = useToggleModule()
    const toggleFeature = useToggleFeature()

    const [expandedModule, setExpandedModule] = useState<string | null>(null)

    const handleToggleModule = async (moduleCode: string, currentEnabled: boolean) => {
        const module = SYSTEM_MODULES.find(m => m.code === moduleCode)
        if (module?.isCore) {
            toast.error(isRTL ? 'لا يمكن تعطيل هذا الموديول الأساسي' : 'Cannot disable this core module')
            return
        }

        try {
            await toggleModule.mutateAsync({ moduleCode, enabled: !currentEnabled })
            toast.success(
                !currentEnabled
                    ? (isRTL ? 'تم تفعيل الموديول' : 'Module enabled')
                    : (isRTL ? 'تم تعطيل الموديول' : 'Module disabled')
            )
        } catch (error: any) {
            toast.error(isRTL ? 'حدث خطأ' : 'An error occurred')
        }
    }

    const handleToggleFeature = async (moduleCode: string, featureCode: string, currentEnabled: boolean) => {
        try {
            await toggleFeature.mutateAsync({ moduleCode, featureCode, enabled: !currentEnabled })
            toast.success(
                !currentEnabled
                    ? (isRTL ? 'تم تفعيل الميزة' : 'Feature enabled')
                    : (isRTL ? 'تم تعطيل الميزة' : 'Feature disabled')
            )
        } catch (error: any) {
            toast.error(isRTL ? 'حدث خطأ' : 'An error occurred')
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-primary font-cairo flex items-center gap-3">
                    <Settings2 className="w-7 h-7 text-secondary" />
                    {isRTL ? 'إدارة الموديولات' : 'Module Management'}
                </h1>
                <p className="text-muted font-cairo">
                    {isRTL
                        ? 'تفعيل وتعطيل الموديولات والميزات حسب احتياجات المنشأة'
                        : 'Enable and disable modules and features based on your needs'}
                </p>
            </div>

            {/* Info Banner */}
            <div className="bg-info/10 border border-info/20 rounded-xl p-4 flex items-start gap-3">
                <div className="p-2 bg-info/20 rounded-lg">
                    <Settings2 className="w-5 h-5 text-info" />
                </div>
                <div>
                    <p className="font-bold text-info font-cairo">
                        {isRTL ? 'تخصيص حسب احتياجاتك' : 'Customize to your needs'}
                    </p>
                    <p className="text-sm text-info/80 font-cairo">
                        {isRTL
                            ? 'يمكنك تفعيل أو تعطيل أي موديول حسب احتياجات منشأتك. الموديولات المعطلة لن تظهر في القائمة الجانبية.'
                            : 'You can enable or disable any module based on your needs. Disabled modules will not appear in the sidebar.'}
                    </p>
                </div>
            </div>

            {/* Modules List */}
            <div className="space-y-4">
                {SYSTEM_MODULES.map(module => (
                    <ModuleCard
                        key={module.code}
                        module={module}
                        isEnabled={isModuleEnabled(tenantModules, module.code)}
                        tenantModules={tenantModules}
                        isExpanded={expandedModule === module.code}
                        onToggleExpand={() => setExpandedModule(
                            expandedModule === module.code ? null : module.code
                        )}
                        onToggleModule={() => handleToggleModule(
                            module.code,
                            isModuleEnabled(tenantModules, module.code)
                        )}
                        onToggleFeature={(featureCode, currentEnabled) =>
                            handleToggleFeature(module.code, featureCode, currentEnabled)
                        }
                        isRTL={isRTL}
                        isToggling={toggleModule.isPending || toggleFeature.isPending}
                    />
                ))}
            </div>
        </div>
    )
}

// Module Card Component
function ModuleCard({
    module,
    isEnabled,
    tenantModules,
    isExpanded,
    onToggleExpand,
    onToggleModule,
    onToggleFeature,
    isRTL,
    isToggling
}: {
    module: SystemModule
    isEnabled: boolean
    tenantModules: Record<string, { enabled: boolean; features?: Record<string, boolean> }> | null | undefined
    isExpanded: boolean
    onToggleExpand: () => void
    onToggleModule: () => void
    onToggleFeature: (featureCode: string, currentEnabled: boolean) => void
    isRTL: boolean
    isToggling: boolean
}) {
    const Icon = iconMap[module.icon] || Settings2

    return (
        <div className={cn(
            "bg-card rounded-xl border overflow-hidden transition-all",
            isEnabled ? "border-border" : "border-muted/30 opacity-70"
        )}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                    <div className={cn(
                        "p-3 rounded-xl",
                        isEnabled ? "bg-secondary/10" : "bg-muted/10"
                    )}>
                        <Icon className={cn(
                            "w-6 h-6",
                            isEnabled ? "text-secondary" : "text-muted"
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
                    {/* Toggle Switch */}
                    <button
                        onClick={onToggleModule}
                        disabled={module.isCore || isToggling}
                        className={cn(
                            "relative w-14 h-7 rounded-full transition-colors",
                            isEnabled ? "bg-success" : "bg-muted/30",
                            module.isCore && "cursor-not-allowed opacity-50"
                        )}
                    >
                        <div className={cn(
                            "absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform",
                            isEnabled ? (isRTL ? "left-1" : "right-1") : (isRTL ? "right-1" : "left-1")
                        )}>
                            {isToggling ? (
                                <Loader2 className="w-3 h-3 m-1 animate-spin text-muted" />
                            ) : isEnabled ? (
                                <Check className="w-3 h-3 m-1 text-success" />
                            ) : (
                                <X className="w-3 h-3 m-1 text-muted" />
                            )}
                        </div>
                    </button>

                    {/* Expand Features */}
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

            {/* Features (Expanded) */}
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
                                        "flex items-center justify-between p-3 rounded-lg border",
                                        featureEnabled ? "bg-card border-border" : "bg-muted/5 border-muted/20"
                                    )}
                                >
                                    <span className={cn(
                                        "font-cairo text-sm",
                                        featureEnabled ? "text-primary" : "text-muted"
                                    )}>
                                        {isRTL ? feature.name_ar : feature.name}
                                    </span>
                                    <button
                                        onClick={() => onToggleFeature(feature.code, featureEnabled)}
                                        disabled={!isEnabled || isToggling}
                                        className={cn(
                                            "w-10 h-5 rounded-full transition-colors relative",
                                            featureEnabled ? "bg-success" : "bg-muted/30",
                                            !isEnabled && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <div className={cn(
                                            "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                                            featureEnabled
                                                ? (isRTL ? "left-0.5" : "right-0.5")
                                                : (isRTL ? "right-0.5" : "left-0.5")
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
