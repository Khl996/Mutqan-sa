import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
    useSubscriptionPlans,
    useCreatePlan,
    useUpdatePlan,
    useDeletePlan,
    SubscriptionPlan
} from '@/hooks/useSubscriptionPlans'
import {
    Crown,
    Plus,
    Edit2,
    Trash2,
    Check,
    X,
    Users,
    Building2,
    Package,
    ClipboardList,
    DollarSign,
    Settings2,
    ChevronDown,
    ChevronUp,
    Star,
    Zap,
    Tag,
    Loader2,
} from 'lucide-react'
import {
    useBillingAddOns,
    useCreateBillingAddOn,
    useUpdateBillingAddOn,
    useDiscountPolicies,
    useCreateDiscountPolicy,
    useUpdateDiscountPolicy,
    usePlatformTaxSettings,
    useUpdatePlatformTaxSettings,
    formatSAR,
    fmtDate,
    type BillingAddOn,
    type DiscountPolicy,
    type TaxConfig,
} from '@/hooks/useBillingEngine'

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function SubscriptionManagementPage() {
    // ... existing hooks ...
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    // Hooks
    const { data: plans = [], isLoading } = useSubscriptionPlans()
    const createPlan = useCreatePlan()
    const updatePlan = useUpdatePlan()
    const deletePlan = useDeletePlan()

    const [activeTab, setActiveTab] = useState<'plans' | 'addons' | 'discounts' | 'settings'>('plans')
    const [editingPlan, setEditingPlan] = useState<Partial<SubscriptionPlan> | null>(null)
    const [isAddingPlan, setIsAddingPlan] = useState(false)
    const [expandedPlan, setExpandedPlan] = useState<string | null>(null)
    const [planToDelete, setPlanToDelete] = useState<string | null>(null)

    const handleSavePlan = async (plan: Partial<SubscriptionPlan>) => {
        // ... (keep existing implementation)
        try {
            if (isAddingPlan) {
                // Map the form data to CreatePlanInput
                await createPlan.mutateAsync({
                    code: plan.code || '',
                    name: plan.name || '',
                    name_ar: plan.name_ar || null,
                    description: plan.description || null,
                    description_ar: plan.description_ar || null,
                    price_monthly: plan.price_monthly || 0,
                    price_yearly: plan.price_yearly || 0,
                    currency: plan.currency || 'SAR',
                    max_users: plan.max_users || 5,
                    max_buildings: plan.max_buildings || 1,
                    max_assets: plan.max_assets || 100,
                    max_work_orders_monthly: plan.max_work_orders_monthly || 100,
                    max_storage_mb: plan.max_storage_mb || 500,
                    features: plan.features || [],
                    is_active: plan.is_active ?? true,
                    is_popular: plan.is_popular ?? false,
                    is_default: plan.is_default ?? false,
                    trial_days: plan.trial_days ?? 14,
                    sort_order: (plans.length || 0) + 1
                })
                toast.success(isRTL ? 'تمت إضافة الخطة بنجاح' : 'Plan added successfully')
            } else {
                if (plan.id) {
                    await updatePlan.mutateAsync({ id: plan.id, ...plan })
                    toast.success(isRTL ? 'تم تحديث الخطة بنجاح' : 'Plan updated successfully')
                }
            }
            setEditingPlan(null)
            setIsAddingPlan(false)
        } catch (error: any) {
            toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`)
        }
    }

    const handleDeletePlan = async () => {
        if (!planToDelete) return

        try {
            console.log('Calling delete mutation for:', planToDelete)
            await deletePlan.mutateAsync(planToDelete)
            console.log('Delete mutation successful')
            toast.success(isRTL ? 'تم حذف الخطة بنجاح' : 'Plan deleted successfully')
            setPlanToDelete(null)
        } catch (error: any) {
            console.error('Delete failed:', error)
            const message = error.message === 'Could not delete plan. You may not have permission or it is in use.'
                ? (isRTL ? 'لم يتم حذف الخطة. قد لا تملك الصلاحية أو أنها قيد الاستخدام، أو مرتبطة باشتراكات نشطة.' : 'Could not delete plan. Permission denied or plan is in use.')
                : (isRTL ? `فشل الحذف: ${error.message}` : `Deletion failed: ${error.message}`)
            toast.error(message)
        }
    }



    const handleToggleActive = async (id: string, currentState: boolean) => {
        try {
            await updatePlan.mutateAsync({ id, is_active: !currentState })
            toast.success(isRTL ? 'تم تحديث الحالة' : 'Status updated')
        } catch (error) {
            toast.error(isRTL ? 'فشل التحديث' : 'Update failed')
        }
    }

    const handleTogglePopular = async (id: string, currentState: boolean) => {
        try {
            await updatePlan.mutateAsync({ id, is_popular: !currentState })
        } catch (error) {
            toast.error(isRTL ? 'فشل التحديث' : 'Update failed')
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <div className="space-y-6 pb-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center shadow-lg shadow-secondary/20">
                    <Crown className="w-7 h-7 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo">
                        {isRTL ? 'إدارة الاشتراكات' : 'Subscription Management'}
                    </h1>
                    <p className="text-muted-foreground font-cairo">
                        {isRTL
                            ? 'إدارة خطط الاشتراك والأسعار والميزات والإضافات'
                            : 'Manage subscription plans, pricing, add-ons, and discounts'
                        }
                    </p>
                </div>
            </div>

            {/* Tab navigation */}
            <div className="flex gap-1 border-b">
                {([
                    { id: 'plans',    label: 'Plans',            labelAr: 'الخطط',           icon: Crown },
                    { id: 'addons',   label: 'Add-ons Catalog',  labelAr: 'كتالوج الإضافات', icon: Package },
                    { id: 'discounts',label: 'Discount Policies',labelAr: 'سياسات الخصم',    icon: Tag },
                    { id: 'settings', label: 'Settings',         labelAr: 'الإعدادات',        icon: Settings2 },
                ] as const).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-3 font-cairo text-sm font-medium border-b-2 transition-colors',
                            activeTab === tab.id
                                ? 'border-secondary text-secondary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <tab.icon className="w-4 h-4" />
                        {isRTL ? tab.labelAr : tab.label}
                    </button>
                ))}
            </div>

            {/* Plans tab — Add Plan button + stats */}
            {activeTab === 'plans' && (
            <div className="flex justify-end">
                <button
                    onClick={() => {
                        setEditingPlan({
                            code: '',
                            name: '',
                            name_ar: '',
                            description: '',
                            description_ar: '',
                            price_monthly: 0,
                            price_yearly: 0,
                            currency: 'SAR',
                            max_users: 5,
                            max_buildings: 3,
                            max_assets: 100,
                            max_work_orders_monthly: 50,
                            max_storage_mb: 500,
                            features: [],
                            is_active: true,
                            is_popular: false,
                            is_default: false,
                            trial_days: 14,
                        })
                        setIsAddingPlan(true)
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors font-cairo"
                >
                    <Plus className="w-5 h-5" />
                    {isRTL ? 'إضافة خطة جديدة' : 'Add New Plan'}
                </button>
            </div>
            )}

            {activeTab === 'plans' && (<>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card rounded-xl border p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                            <Crown className="w-5 h-5 text-secondary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{plans.length}</p>
                            <p className="text-sm text-muted-foreground font-cairo">
                                {isRTL ? 'إجمالي الخطط' : 'Total Plans'}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-card rounded-xl border p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                            <Check className="w-5 h-5 text-success" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{plans.filter(p => p.is_active).length}</p>
                            <p className="text-sm text-muted-foreground font-cairo">
                                {isRTL ? 'الخطط النشطة' : 'Active Plans'}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-card rounded-xl border p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                            <Star className="w-5 h-5 text-warning" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{plans.filter(p => p.is_popular).length}</p>
                            <p className="text-sm text-muted-foreground font-cairo">
                                {isRTL ? 'الخطط المميزة' : 'Popular Plans'}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-card rounded-xl border p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-info" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">
                                {Math.max(...plans.map(p => p.price_monthly))} SAR
                            </p>
                            <p className="text-sm text-muted-foreground font-cairo">
                                {isRTL ? 'أعلى سعر شهري' : 'Highest Monthly'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Plans List */}
            <div className="bg-card rounded-xl border overflow-hidden">
                <div className="p-4 border-b bg-muted/5">
                    <h2 className="font-semibold font-cairo flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-muted-foreground" />
                        {isRTL ? 'خطط الاشتراك' : 'Subscription Plans'}
                    </h2>
                </div>

                <div className="divide-y">
                    {plans.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((plan) => (
                        <div key={plan.id} className="hover:bg-muted/5">
                            <div className="p-4 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center",
                                        plan.is_popular ? "bg-secondary/10" : "bg-muted/10"
                                    )}>
                                        {plan.is_popular ? (
                                            <Zap className="w-6 h-6 text-secondary" />
                                        ) : (
                                            <Crown className="w-6 h-6 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold font-cairo">
                                                {isRTL ? plan.name_ar : plan.name}
                                            </h3>
                                            {plan.is_popular && (
                                                <span className="bg-secondary text-white text-xs px-2 py-0.5 rounded-full">
                                                    {isRTL ? 'مميز' : 'Popular'}
                                                </span>
                                            )}
                                            {plan.is_default && (
                                                <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                                                    {isRTL ? 'الافتراضية' : 'Default'}
                                                </span>
                                            )}
                                            <span className={cn(
                                                "text-xs px-2 py-0.5 rounded-full",
                                                plan.is_active
                                                    ? "bg-success/10 text-success"
                                                    : "bg-destructive/10 text-destructive"
                                            )}>
                                                {plan.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'معطل' : 'Inactive')}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground font-cairo">
                                            {isRTL ? plan.description_ar : plan.description}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-center">
                                        <p className="text-lg font-bold">
                                            {plan.price_monthly} <span className="text-sm font-normal text-muted-foreground">SAR</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground font-cairo">
                                            {isRTL ? 'شهري' : 'Monthly'}
                                        </p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-bold">
                                            {plan.trial_days} <span className="text-sm font-normal text-muted-foreground">{isRTL ? 'يوم' : 'Days'}</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground font-cairo">
                                            {isRTL ? 'الفترة التجريبية' : 'Trial Period'}
                                        </p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-bold text-success">
                                            {plan.price_yearly} <span className="text-sm font-normal text-muted-foreground">SAR</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground font-cairo">
                                            {isRTL ? 'سنوي' : 'Yearly'}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                                            className="p-2 hover:bg-muted/10 rounded-lg transition-colors"
                                            title={isRTL ? 'تفاصيل' : 'Details'}
                                        >
                                            {expandedPlan === plan.id ? (
                                                <ChevronUp className="w-5 h-5" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5" />
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleTogglePopular(plan.id, plan.is_popular)}
                                            className={cn(
                                                "p-2 rounded-lg transition-colors",
                                                plan.is_popular
                                                    ? "bg-warning/10 text-warning"
                                                    : "hover:bg-muted/10 text-muted-foreground"
                                            )}
                                            title={isRTL ? 'تمييز' : 'Mark Popular'}
                                        >
                                            <Star className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleToggleActive(plan.id, plan.is_active)}
                                            className={cn(
                                                "p-2 rounded-lg transition-colors",
                                                plan.is_active
                                                    ? "bg-success/10 text-success"
                                                    : "bg-destructive/10 text-destructive"
                                            )}
                                            title={plan.is_active ? (isRTL ? 'تعطيل' : 'Deactivate') : (isRTL ? 'تفعيل' : 'Activate')}
                                        >
                                            {plan.is_active ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setEditingPlan(plan)
                                                setIsAddingPlan(false)
                                            }}
                                            className="p-2 hover:bg-info/10 text-info rounded-lg transition-colors"
                                            title={isRTL ? 'تعديل' : 'Edit'}
                                        >
                                            <Edit2 className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => setPlanToDelete(plan.id)}
                                            className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors"
                                            title={isRTL ? 'حذف' : 'Delete'}
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {expandedPlan === plan.id && (
                                <div className="px-4 pb-4 pt-0">
                                    <div className="bg-muted/5 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-4">
                                        <div className="flex items-center gap-2">
                                            <Users className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm font-cairo">
                                                {plan.max_users === -1 ? (isRTL ? 'غير محدود' : 'Unlimited') : plan.max_users} {isRTL ? 'مستخدم' : 'Users'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Building2 className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm font-cairo">
                                                {plan.max_buildings === -1 ? (isRTL ? 'غير محدود' : 'Unlimited') : plan.max_buildings} {isRTL ? 'مبنى' : 'Buildings'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Package className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm font-cairo">
                                                {plan.max_assets === -1 ? (isRTL ? 'غير محدود' : 'Unlimited') : plan.max_assets} {isRTL ? 'أصل' : 'Assets'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <ClipboardList className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm font-cairo">
                                                {plan.max_work_orders_monthly === -1 ? (isRTL ? 'غير محدود' : 'Unlimited') : plan.max_work_orders_monthly} {isRTL ? 'أمر عمل/شهر' : 'WO/Month'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Package className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm font-cairo">
                                                {plan.max_storage_mb === -1 ? (isRTL ? 'غير محدود' : 'Unlimited') : `${plan.max_storage_mb} MB`}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {plan.features.map((feature) => (
                                            <span
                                                key={feature}
                                                className="bg-secondary/10 text-secondary text-xs px-3 py-1 rounded-full font-cairo"
                                            >
                                                {feature.replace(/_/g, ' ')}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!planToDelete} onOpenChange={(open) => !open && setPlanToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-cairo text-right">
                            {isRTL ? 'هل أنت متأكد من حذف هذه الخطة؟' : 'Are you sure you want to delete this plan?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="font-cairo text-right">
                            {isRTL
                                ? 'لا يمكن التراجع عن هذا الإجراء. سيتم حذف الخطة نهائياً من النظام.'
                                : 'This action cannot be undone. This will permanently delete the plan from the system.'
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="sm:justify-start">
                        <AlertDialogCancel className="font-cairo">
                            {isRTL ? 'إلغاء' : 'Cancel'}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeletePlan}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-cairo"
                        >
                            {isRTL ? 'تأكيد الحذف' : 'Delete Plan'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Edit/Add Modal */}
            {editingPlan && (
                <PlanEditModal
                    plan={editingPlan}
                    isRTL={isRTL}
                    isNew={isAddingPlan}
                    onSave={handleSavePlan}
                    onClose={() => {
                        setEditingPlan(null)
                        setIsAddingPlan(false)
                    }}
                />
            )}
            </>)}

            {activeTab === 'addons'    && <AddOnsSection    isRTL={isRTL} />}
            {activeTab === 'discounts' && <DiscountsSection isRTL={isRTL} />}
            {activeTab === 'settings'  && <TaxSettingsSection isRTL={isRTL} />}
        </div>
    )
}

// Import System Modules
import { SYSTEM_MODULES } from '@/config/modules'

// ... (keep creating other components if needed, but inserting SYSTEM_MODULES import at top is tricky with replace, so I will add it to the implementation below and let the user know I am modifying the file)

// Plan Edit Modal Component
function PlanEditModal({
    plan,
    isRTL,
    isNew,
    onSave,
    onClose
}: {
    plan: Partial<SubscriptionPlan>
    isRTL: boolean
    isNew: boolean
    onSave: (plan: Partial<SubscriptionPlan>) => void
    onClose: () => void
}) {
    // Initialize form data with defaults for undefined/null values
    const [formData, setFormData] = useState<Partial<SubscriptionPlan>>({
        ...plan,
        features: plan.features || [],
        description: plan.description || '',
        description_ar: plan.description_ar || '',
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.code || !formData.name) {
            toast.error(isRTL ? 'الرجاء ملء جميع الحقول المطلوبة' : 'Please fill all required fields')
            return
        }
        onSave(formData)
    }

    // Toggle a specific module
    const toggleModule = (moduleCode: string) => {
        const currentFeatures = formData.features || []
        const isSelected = currentFeatures.includes(moduleCode)

        if (isSelected) {
            setFormData({
                ...formData,
                features: currentFeatures.filter(f => f !== moduleCode)
            })
        } else {
            setFormData({
                ...formData,
                features: [...currentFeatures, moduleCode]
            })
        }
    }

    // Toggle All Modules
    const toggleAllModules = () => {
        const allModuleCodes = SYSTEM_MODULES.map(m => m.code)
        const currentFeatures = formData.features || []
        const isAllSelected = allModuleCodes.every(code => currentFeatures.includes(code))

        if (isAllSelected) {
            // Deselect all
            setFormData({ ...formData, features: [] })
        } else {
            // Select all
            setFormData({ ...formData, features: allModuleCodes })
        }
    }

    const isAllSelected = SYSTEM_MODULES.every(m => (formData.features || []).includes(m.code))

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b flex items-center justify-between">
                    <h2 className="text-xl font-bold font-cairo">
                        {isNew
                            ? (isRTL ? 'إضافة خطة جديدة' : 'Add New Plan')
                            : (isRTL ? 'تعديل الخطة' : 'Edit Plan')
                        }
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted/10 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium font-cairo mb-2">
                                {isRTL ? 'الكود' : 'Code'} *
                            </label>
                            <input
                                type="text"
                                value={formData.code || ''}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                placeholder="e.g., professional"
                                className="w-full px-4 py-2 bg-muted/10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium font-cairo mb-2">
                                {isRTL ? 'العملة' : 'Currency'}
                            </label>
                            <select
                                value={formData.currency || 'SAR'}
                                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                                className="w-full px-4 py-2 bg-muted/10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                            >
                                <option value="SAR">SAR</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2 border p-3 rounded-lg bg-muted/10">
                            <input
                                type="checkbox"
                                id="is_default"
                                checked={formData.is_default || false}
                                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                                className="w-4 h-4 text-secondary rounded focus:ring-secondary"
                            />
                            <label htmlFor="is_default" className="text-sm font-medium font-cairo cursor-pointer">
                                {isRTL ? 'تعيين كخطة افتراضية' : 'Set as Default Plan'}
                            </label>
                        </div>
                        <div>
                            <label className="block text-sm font-medium font-cairo mb-2">
                                {isRTL ? 'أيام الفترة التجريبية' : 'Trial Days'}
                            </label>
                            <input
                                type="number"
                                value={formData.trial_days ?? 14}
                                onChange={(e) => setFormData({ ...formData, trial_days: Number(e.target.value) })}
                                className="w-full px-4 py-2 bg-muted/10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium font-cairo mb-2">
                                {isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'} *
                            </label>
                            <input
                                type="text"
                                value={formData.name || ''}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2 bg-muted/10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium font-cairo mb-2">
                                {isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}
                            </label>
                            <input
                                type="text"
                                value={formData.name_ar || ''}
                                onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                                className="w-full px-4 py-2 bg-muted/10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium font-cairo mb-2">
                                {isRTL ? 'الوصف (إنجليزي)' : 'Description (English)'}
                            </label>
                            <input
                                type="text"
                                value={formData.description || ''}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full px-4 py-2 bg-muted/10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium font-cairo mb-2">
                                {isRTL ? 'الوصف (عربي)' : 'Description (Arabic)'}
                            </label>
                            <input
                                type="text"
                                value={formData.description_ar || ''}
                                onChange={(e) => setFormData({ ...formData, description_ar: e.target.value })}
                                className="w-full px-4 py-2 bg-muted/10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                            />
                        </div>
                    </div>

                    {/* Pricing */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium font-cairo mb-2">
                                {isRTL ? 'السعر الشهري' : 'Monthly Price'}
                            </label>
                            <input
                                type="number"
                                value={formData.price_monthly || 0}
                                onChange={(e) => setFormData({ ...formData, price_monthly: Number(e.target.value) })}
                                className="w-full px-4 py-2 bg-muted/10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium font-cairo mb-2">
                                {isRTL ? 'السعر السنوي' : 'Yearly Price'}
                            </label>
                            <input
                                type="number"
                                value={formData.price_yearly || 0}
                                onChange={(e) => setFormData({ ...formData, price_yearly: Number(e.target.value) })}
                                className="w-full px-4 py-2 bg-muted/10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                            />
                        </div>
                    </div>

                    {/* Limits */}
                    <div>
                        <h3 className="font-semibold font-cairo mb-3">{isRTL ? 'الحدود (القيود)' : 'Usage Limits'}</h3>
                        <p className="text-sm text-muted-foreground mb-3 font-cairo">
                            {isRTL ? 'استخدم "غير محدود" لتعطيل الحد الأقصى' : 'Use "Unlimited" to disable limit'}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <LimitInput
                                label={isRTL ? 'المستخدمين' : 'Users'}
                                value={formData.max_users ?? 5}
                                onChange={(v) => setFormData(prev => ({ ...prev, max_users: v }))}
                                isRTL={isRTL}
                            />
                            <LimitInput
                                label={isRTL ? 'المباني' : 'Buildings'}
                                value={formData.max_buildings ?? 1}
                                onChange={(v) => setFormData(prev => ({ ...prev, max_buildings: v }))}
                                isRTL={isRTL}
                            />
                            <LimitInput
                                label={isRTL ? 'الأصول' : 'Assets'}
                                value={formData.max_assets ?? 100}
                                onChange={(v) => setFormData(prev => ({ ...prev, max_assets: v }))}
                                isRTL={isRTL}
                            />
                            <LimitInput
                                label={isRTL ? 'أوامر العمل (شهرياً)' : 'Work Orders (Monthly)'}
                                value={formData.max_work_orders_monthly ?? 50}
                                onChange={(v) => setFormData(prev => ({ ...prev, max_work_orders_monthly: v }))}
                                isRTL={isRTL}
                            />
                            <LimitInput
                                label={isRTL ? 'التخزين (MB)' : 'Storage (MB)'}
                                value={formData.max_storage_mb ?? 500}
                                onChange={(v) => setFormData(prev => ({ ...prev, max_storage_mb: v }))}
                                isRTL={isRTL}
                            />
                        </div>
                    </div>

                    {/* Features Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold font-cairo">{isRTL ? 'الميزات والوحدات' : 'Included Modules'}</h3>
                            <button
                                type="button"
                                onClick={toggleAllModules}
                                className="text-sm text-secondary font-bold hover:underline font-cairo"
                            >
                                {isAllSelected
                                    ? (isRTL ? 'إلغاء تحديد الكل' : 'Deselect All')
                                    : (isRTL ? 'تحديد كافة المزايا' : 'Select All Features')
                                }
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {SYSTEM_MODULES.map((module) => {
                                const isSelected = (formData.features || []).includes(module.code)
                                return (
                                    <div
                                        key={module.code}
                                        onClick={() => toggleModule(module.code)}
                                        className={cn(
                                            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                            isSelected
                                                ? "bg-secondary/5 border-secondary/30 shadow-sm"
                                                : "bg-background border-border hover:border-secondary/30"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5",
                                            isSelected ? "bg-secondary border-secondary text-white" : "border-muted-foreground"
                                        )}>
                                            {isSelected && <Check className="w-3.5 h-3.5" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm font-cairo">
                                                {isRTL ? module.name_ar : module.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground font-cairo line-clamp-1">
                                                {isRTL ? module.description_ar : module.description}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 bg-muted/10 rounded-lg hover:bg-muted/20 font-cairo transition-colors"
                        >
                            {isRTL ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 font-cairo transition-colors"
                        >
                            {isNew ? (isRTL ? 'إضافة الخطة' : 'Create Plan') : (isRTL ? 'حفظ التعديلات' : 'Save Changes')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// Limit Input Component
function LimitInput({
    label,
    value,
    onChange,
    isRTL
}: {
    label: string
    value: number
    onChange: (value: number) => void
    isRTL: boolean
}) {
    const isUnlimited = value === -1

    return (
        <div className="bg-muted/10 p-3 rounded-lg border border-border/50">
            <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold font-cairo text-primary">{label}</label>
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={isUnlimited}
                        onChange={(e) => onChange(e.target.checked ? -1 : 0)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-secondary focus:ring-secondary"
                    />
                    <span className="text-[10px] text-muted-foreground font-cairo cursor-pointer" onClick={() => onChange(isUnlimited ? 0 : -1)}>
                        {isRTL ? 'غير محدود' : 'Unlimited'}
                    </span>
                </div>
            </div>
            <input
                type="number"
                value={isUnlimited ? '' : value}
                disabled={isUnlimited}
                onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder={isUnlimited ? (isRTL ? 'غير محدود' : 'Unlimited') : '0'}
                className={cn(
                    "w-full px-3 py-1.5 bg-background border rounded-md text-sm transition-all",
                    isUnlimited ? "opacity-50 cursor-not-allowed bg-muted" : "focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none"
                )}
            />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD-ONS SECTION
// ─────────────────────────────────────────────────────────────────────────────

function AddOnsSection({ isRTL }: { isRTL: boolean }) {
    const { data: addOns = [], isLoading } = useBillingAddOns(false)
    const createAO = useCreateBillingAddOn()
    const updateAO = useUpdateBillingAddOn()
    const [editing, setEditing] = useState<Partial<BillingAddOn> | null>(null)

    const emptyForm: Partial<BillingAddOn> = {
        code: '', name: '', name_ar: '', description: null, description_ar: null,
        billing_type: 'recurring', price: 0,
        is_active: true, sort_order: 0,
    }

    const handleSave = async () => {
        if (!editing) return
        try {
            if (editing.id) {
                await updateAO.mutateAsync(editing as Partial<BillingAddOn> & { id: string })
                toast.success(isRTL ? 'تم تحديث الإضافة' : 'Add-on updated')
            } else {
                await createAO.mutateAsync(editing as Omit<BillingAddOn, 'id' | 'created_at' | 'updated_at'>)
                toast.success(isRTL ? 'تمت إضافة الخدمة' : 'Add-on created')
            }
            setEditing(null)
        } catch (e: unknown) {
            toast.error((e as Error).message)
        }
    }

    if (editing !== null) {
        return (
            <div className="bg-card border rounded-xl p-5 max-w-2xl">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-base font-bold font-cairo">
                        {editing.id ? (isRTL ? 'تعديل الإضافة' : 'Edit Add-on') : (isRTL ? 'إضافة خدمة جديدة' : 'New Add-on')}
                    </h2>
                    <button onClick={() => setEditing(null)} className="text-xs text-muted-foreground font-cairo hover:underline">
                        {isRTL ? 'إلغاء' : 'Cancel'}
                    </button>
                </div>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { k: 'code' as const,    l: 'Code',       la: 'الكود' },
                            { k: 'name' as const,    l: 'Name (EN)',  la: 'الاسم (إنجليزي)' },
                            { k: 'name_ar' as const, l: 'Name (AR)',  la: 'الاسم (عربي)' },
                        ].map(f => (
                            <div key={f.k}>
                                <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">
                                    {isRTL ? f.la : f.l}
                                </label>
                                <input
                                    type="text"
                                    value={(editing[f.k] as string) || ''}
                                    onChange={e => setEditing({ ...editing, [f.k]: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                                />
                            </div>
                        ))}
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">
                                {isRTL ? 'النوع' : 'Billing Type'}
                            </label>
                            <select
                                value={editing.billing_type}
                                onChange={e => setEditing({ ...editing, billing_type: e.target.value as 'recurring' | 'one_time' })}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                            >
                                <option value="recurring">{isRTL ? 'متكرر' : 'Recurring'}</option>
                                <option value="one_time">{isRTL ? 'دفعة واحدة' : 'One-time'}</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">
                            {isRTL ? 'السعر (ريال)' : 'Price (SAR)'}
                        </label>
                        <input
                            type="number" min={0}
                            value={editing.price || 0}
                            onChange={e => setEditing({ ...editing, price: parseFloat(e.target.value) || 0 })}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                        />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={editing.is_active ?? true}
                            onChange={e => setEditing({ ...editing, is_active: e.target.checked })}
                            className="accent-secondary"
                        />
                        <span className="text-sm font-cairo">{isRTL ? 'نشط' : 'Active'}</span>
                    </label>

                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={handleSave}
                            disabled={createAO.isPending || updateAO.isPending}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-xl font-cairo text-sm font-bold hover:bg-secondary/90 disabled:opacity-50"
                        >
                            {(createAO.isPending || updateAO.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {isRTL ? 'حفظ' : 'Save'}
                        </button>
                        <button onClick={() => setEditing(null)} className="px-4 py-2.5 border rounded-xl font-cairo text-sm hover:bg-muted/10">
                            {isRTL ? 'إلغاء' : 'Cancel'}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground font-cairo">
                    {isRTL
                        ? 'كتالوج الخدمات والإضافات القابلة للفوترة.'
                        : 'Catalog of billable add-ons used in pricing quotes.'}
                </p>
                <button
                    onClick={() => setEditing({ ...emptyForm })}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg text-sm font-cairo font-bold hover:bg-secondary/90"
                >
                    <Plus className="w-4 h-4" />
                    {isRTL ? 'إضافة خدمة' : 'Add Service'}
                </button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-secondary" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {addOns.map(ao => (
                        <div key={ao.id} className={cn('bg-card border rounded-xl p-4', !ao.is_active && 'opacity-60')}>
                            <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-sm font-cairo truncate">
                                        {isRTL ? ao.name_ar || ao.name : ao.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{ao.code}</p>
                                </div>
                                <button onClick={() => setEditing({ ...ao })} className="p-1.5 rounded hover:bg-muted/10 shrink-0">
                                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs bg-muted/20 text-muted-foreground px-2 py-0.5 rounded font-cairo">
                                    {ao.billing_type === 'one_time' ? (isRTL ? 'مرة واحدة' : 'One-time') : (isRTL ? 'متكرر' : 'Recurring')}
                                </span>
                                <span className="text-sm font-bold text-secondary font-mono">{formatSAR(ao.price)}</span>
                                {!ao.is_active && (
                                    <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded font-cairo">
                                        {isRTL ? 'معطل' : 'Inactive'}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOUNTS SECTION
// ─────────────────────────────────────────────────────────────────────────────

function DiscountsSection({ isRTL }: { isRTL: boolean }) {
    const { data: policies = [], isLoading } = useDiscountPolicies()
    const create = useCreateDiscountPolicy()
    const update = useUpdateDiscountPolicy()
    const [editing, setEditing] = useState<Record<string, unknown> | null>(null)

    const emptyForm = {
        code: '', name: '', name_ar: '', description: null, description_ar: null,
        discount_type: 'percentage', discount_value: 10,
        valid_from: '', valid_to: '', is_active: true,
    }

    const handleSave = async () => {
        if (!editing) return
        const payload = {
            ...editing,
            valid_from: (editing.valid_from as string) || null,
            valid_to:   (editing.valid_to as string) || null,
        }
        try {
            if (editing.id) {
                await update.mutateAsync(payload as Parameters<typeof update.mutateAsync>[0])
                toast.success(isRTL ? 'تم التحديث' : 'Policy updated')
            } else {
                await create.mutateAsync(payload as Parameters<typeof create.mutateAsync>[0])
                toast.success(isRTL ? 'تمت الإضافة' : 'Policy created')
            }
            setEditing(null)
        } catch (e: unknown) {
            toast.error((e as Error).message)
        }
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground font-cairo">
                    {isRTL
                        ? 'سياسات الخصم القابلة لإعادة الاستخدام.'
                        : 'Named discount templates applied to quote totals.'}
                </p>
                <button
                    onClick={() => setEditing({ ...emptyForm })}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg text-sm font-cairo font-bold hover:bg-secondary/90"
                >
                    <Plus className="w-4 h-4" />
                    {isRTL ? 'سياسة جديدة' : 'New Policy'}
                </button>
            </div>

            {editing && (
                <div className="bg-card border rounded-xl p-5 mb-5 max-w-2xl">
                    <h3 className="font-bold font-cairo mb-4">
                        {editing.id ? (isRTL ? 'تعديل السياسة' : 'Edit Policy') : (isRTL ? 'سياسة جديدة' : 'New Policy')}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { k: 'code',    l: 'Code',       la: 'الكود' },
                            { k: 'name',    l: 'Name (EN)',  la: 'الاسم إنجليزي' },
                            { k: 'name_ar', l: 'Name (AR)',  la: 'الاسم عربي' },
                        ].map(f => (
                            <div key={f.k}>
                                <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">{isRTL ? f.la : f.l}</label>
                                <input
                                    type="text"
                                    value={(editing[f.k] as string) || ''}
                                    onChange={e => setEditing({ ...editing, [f.k]: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                                />
                            </div>
                        ))}
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">{isRTL ? 'نوع الخصم' : 'Type'}</label>
                            <select
                                value={editing.discount_type as string}
                                onChange={e => setEditing({ ...editing, discount_type: e.target.value })}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                            >
                                <option value="percentage">{isRTL ? 'نسبة مئوية' : 'Percentage'}</option>
                                <option value="fixed">{isRTL ? 'مبلغ ثابت' : 'Fixed Amount'}</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">
                                {isRTL ? 'القيمة' : 'Value'}
                                {editing.discount_type === 'percentage' ? ' (%)' : ' (SAR)'}
                            </label>
                            <input
                                type="number" min={0}
                                value={(editing.discount_value as number) || 0}
                                onChange={e => setEditing({ ...editing, discount_value: parseFloat(e.target.value) || 0 })}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">{isRTL ? 'صالح من' : 'Valid From'}</label>
                            <input
                                type="date"
                                value={(editing.valid_from as string) || ''}
                                onChange={e => setEditing({ ...editing, valid_from: e.target.value })}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground mb-1 font-cairo">{isRTL ? 'صالح حتى' : 'Valid To'}</label>
                            <input
                                type="date"
                                value={(editing.valid_to as string) || ''}
                                onChange={e => setEditing({ ...editing, valid_to: e.target.value })}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button
                            onClick={handleSave}
                            disabled={create.isPending || update.isPending}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-2 bg-secondary text-white rounded-xl font-cairo text-sm font-bold hover:bg-secondary/90 disabled:opacity-50"
                        >
                            {isRTL ? 'حفظ' : 'Save'}
                        </button>
                        <button onClick={() => setEditing(null)} className="px-4 py-2 border rounded-xl font-cairo text-sm hover:bg-muted/10">
                            {isRTL ? 'إلغاء' : 'Cancel'}
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-secondary" />
                </div>
            ) : (
                <div className="space-y-2">
                    {policies.map((p: DiscountPolicy) => {
                        const isExpired = p.valid_to && new Date(p.valid_to) < new Date()
                        return (
                            <div key={p.id} className={cn('bg-card border rounded-xl p-4 flex items-center gap-4', !p.is_active && 'opacity-60')}>
                                <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                                    <Tag className="w-5 h-5 text-secondary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-sm font-cairo">{isRTL ? p.name_ar || p.name : p.name}</p>
                                        {isExpired && (
                                            <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded font-cairo">
                                                {isRTL ? 'منتهي' : 'Expired'}
                                            </span>
                                        )}
                                        {!p.is_active && (
                                            <span className="text-xs bg-muted/20 text-muted-foreground px-2 py-0.5 rounded font-cairo">
                                                {isRTL ? 'معطل' : 'Inactive'}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{p.code}</p>
                                    <p className="text-xs text-muted-foreground font-cairo mt-0.5">
                                        {p.valid_from && p.valid_to
                                            ? `${fmtDate(p.valid_from)} → ${fmtDate(p.valid_to)}`
                                            : isRTL ? 'بدون تاريخ انتهاء' : 'No expiry'}
                                    </p>
                                </div>
                                <div className="text-end shrink-0">
                                    <p className="font-bold text-lg text-secondary font-mono">
                                        {p.discount_value}{p.discount_type === 'percentage' ? '%' : ' SAR'}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-cairo">
                                        {p.discount_type === 'percentage' ? (isRTL ? 'خصم نسبي' : 'Percentage') : (isRTL ? 'خصم ثابت' : 'Fixed')}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setEditing({ ...p, valid_from: p.valid_from || '', valid_to: p.valid_to || '' })}
                                    className="p-2 rounded hover:bg-muted/10"
                                >
                                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ─── Tax Settings Section ─────────────────────────────────────────────────────

function TaxSettingsSection({ isRTL }: { isRTL: boolean }) {
    const { t } = useTranslation()
    const { data: taxConfig, isLoading } = usePlatformTaxSettings()
    const updateTax = useUpdatePlatformTaxSettings()

    const [enabled, setEnabled] = useState(taxConfig?.enabled ?? false)
    const [rateInput, setRateInput] = useState(String(Math.round((taxConfig?.rate ?? 0) * 100)))

    // Sync once data arrives
    useEffect(() => {
        if (taxConfig) {
            setEnabled(taxConfig.enabled)
            setRateInput(String(Math.round(taxConfig.rate * 100)))
        }
    }, [taxConfig])

    const handleSave = async () => {
        const ratePercent = parseFloat(rateInput) || 0
        if (ratePercent < 0 || ratePercent > 100) {
            toast.error(isRTL ? 'النسبة يجب أن تكون بين 0 و 100' : 'Rate must be between 0 and 100')
            return
        }
        const config: TaxConfig = {
            enabled,
            rate: ratePercent / 100,
            label: taxConfig?.label || 'VAT',
            label_ar: taxConfig?.label_ar || 'ضريبة القيمة المضافة',
        }
        await updateTax.mutateAsync(config)
        toast.success(t('billing.settings.tax_saved'))
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-6 h-6 animate-spin text-secondary" />
            </div>
        )
    }

    return (
        <div className="max-w-lg space-y-6">
            <div>
                <h2 className="text-base font-bold text-foreground font-cairo">
                    {t('billing.settings.tax_title')}
                </h2>
                <p className="text-sm text-muted-foreground font-cairo mt-1">
                    {t('billing.settings.tax_warning')}
                </p>
            </div>

            <div className="bg-white rounded-xl border p-5 space-y-5">
                {/* Enable toggle */}
                <div className="flex items-center justify-between">
                    <label className="font-cairo font-medium text-sm text-foreground">
                        {t('billing.settings.tax_enabled')}
                    </label>
                    <button
                        onClick={() => setEnabled(v => !v)}
                        className={cn(
                            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                            enabled ? 'bg-secondary' : 'bg-muted/40'
                        )}
                    >
                        <span
                            className={cn(
                                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                                enabled ? (isRTL ? '-translate-x-6' : 'translate-x-6') : (isRTL ? '-translate-x-1' : 'translate-x-1')
                            )}
                        />
                    </button>
                </div>

                {/* Rate input — only shown when enabled */}
                {enabled && (
                    <div className="space-y-1">
                        <label className="block font-cairo text-sm font-medium text-foreground">
                            {t('billing.settings.tax_rate')}
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                value={rateInput}
                                onChange={e => setRateInput(e.target.value)}
                                className="w-28 py-2 px-3 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-secondary/30 outline-none"
                            />
                            <span className="text-muted-foreground font-cairo text-sm">%</span>
                            <span className="text-muted-foreground font-cairo text-xs ms-2">
                                = {((parseFloat(rateInput) || 0) / 100).toFixed(4)}
                            </span>
                        </div>
                    </div>
                )}

                {/* Disabled note */}
                {!enabled && (
                    <p className="text-sm text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2 font-cairo">
                        {t('billing.settings.tax_disabled_note')}
                    </p>
                )}

                <button
                    onClick={handleSave}
                    disabled={updateTax.isPending}
                    className="flex items-center gap-2 px-5 py-2 bg-secondary text-white rounded-lg font-cairo text-sm font-bold hover:bg-secondary/90 disabled:opacity-60 transition-colors"
                >
                    {updateTax.isPending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Check className="w-4 h-4" />}
                    {t('billing.settings.save')}
                </button>
            </div>
        </div>
    )
}
