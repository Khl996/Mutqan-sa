import { useState, type ReactNode, type ElementType } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useTenant } from '@/contexts/TenantContext'
import { usePermission } from '@/hooks/usePermission'
import {
    useTenants,
    useTenantStats,
    useCreateTenant,
    useUpdateTenant,
    useToggleTenantStatus,
    Tenant,
    CreateTenantInput,
} from '@/hooks/useTenants'
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans'
import {
    useTenantSubscriptionNew,
    useEngineActivate,
    useEngineCancel,
    useEngineExtendTrial,
    useEngineCalculate,
    useDiscountPolicies,
    formatSAR,
    subscriptionStatusColor,
    type NewSubscriptionStatus,
    type BillingCycle,
} from '@/hooks/useBillingEngine'
import { toast } from 'sonner'
import {
    Building2, Plus, Search, CheckCircle2, XCircle, Edit,
    ToggleLeft, ToggleRight, Mail, Phone, MapPin, Crown, X,
    ExternalLink, CreditCard, Calendar, Clock,
    AlertTriangle, Loader2, Zap, Ban, RefreshCw, Timer,
    ChevronDown, DollarSign, Tag,
} from 'lucide-react'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function TenantsManagementPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { switchTenant } = useTenant()
    const { can } = usePermission()

    const canManageTenants = can('platform.tenants.manage')
    const canEnterTenants = can('platform.tenants.enter')
    const canManageSubscriptions = can('platform.subscriptions.manage')

    const { data: tenants, isLoading } = useTenants()
    const { data: stats } = useTenantStats()
    const createTenant = useCreateTenant()
    const updateTenant = useUpdateTenant()
    const toggleStatus = useToggleTenantStatus()

    const [search, setSearch] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
    const [formData, setFormData] = useState<CreateTenantInput>({
        slug: '',
        name: '',
        name_ar: '',
        email: '',
        phone: '',
        address: '',
        timezone: 'Asia/Riyadh',
        subscription_status: 'trial',
        is_active: true,
    })

    const filteredTenants = tenants?.filter((tenant) =>
        tenant.name.toLowerCase().includes(search.toLowerCase())
        || tenant.slug.toLowerCase().includes(search.toLowerCase())
        || tenant.email?.toLowerCase().includes(search.toLowerCase()),
    ) || []

    const resetForm = () => {
        setFormData({
            slug: '',
            name: '',
            name_ar: '',
            email: '',
            phone: '',
            address: '',
            timezone: 'Asia/Riyadh',
            subscription_status: 'trial',
            is_active: true,
        })
        setEditingTenant(null)
    }

    const handleEnterTenant = async (tenant: Tenant) => {
        if (!canEnterTenants) return
        await switchTenant(tenant.id)
        window.location.href = '/dashboard'
    }

    const openEditModal = (tenant: Tenant) => {
        if (!canManageTenants) return

        setEditingTenant(tenant)
        setFormData({
            slug: tenant.slug,
            name: tenant.name,
            name_ar: tenant.name_ar,
            email: tenant.email,
            phone: tenant.phone,
            address: tenant.address,
            timezone: tenant.timezone,
            subscription_status: tenant.subscription_status,
            is_active: tenant.is_active,
        })
        setShowModal(true)
    }

    const handleSubmit = async () => {
        if (!canManageTenants) {
            toast.error(isRTL ? 'ليس لديك صلاحية لإدارة المنشآت' : 'You do not have permission to manage tenants')
            return
        }

        try {
            if (editingTenant) {
                await updateTenant.mutateAsync({ id: editingTenant.id, ...formData })
                toast.success(isRTL ? 'تم تحديث المنشأة بنجاح' : 'Tenant updated successfully')
            } else {
                await createTenant.mutateAsync(formData)
                toast.success(isRTL ? 'تم إنشاء المنشأة بنجاح' : 'Tenant created successfully')
            }

            setShowModal(false)
            resetForm()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            toast.error(isRTL ? `حدث خطأ: ${message}` : `Error: ${message}`)
        }
    }

    const handleToggleStatus = async (tenant: Tenant) => {
        if (!canManageTenants) {
            toast.error(isRTL ? 'ليس لديك صلاحية لتغيير حالة المنشأة' : 'You do not have permission to change tenant status')
            return
        }

        try {
            await toggleStatus.mutateAsync({ id: tenant.id, is_active: !tenant.is_active })
            toast.success(
                tenant.is_active
                    ? (isRTL ? 'تم تعطيل المنشأة' : 'Tenant disabled')
                    : (isRTL ? 'تم تفعيل المنشأة' : 'Tenant enabled'),
            )
        } catch {
            toast.error(isRTL ? 'حدث خطأ' : 'An error occurred')
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted font-cairo">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-8">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo flex items-center gap-3">
                        <Building2 className="w-7 h-7 text-secondary" />
                        {isRTL ? 'إدارة المنشآت' : 'Tenants Management'}
                    </h1>
                    <p className="text-muted font-cairo">
                        {isRTL ? 'إدارة وتنظيم المنشآت المشتركة في المنصة' : 'Manage platform tenants and organizations'}
                    </p>
                </div>

                {canManageTenants && (
                    <button
                        onClick={() => {
                            resetForm()
                            setShowModal(true)
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl font-cairo hover:bg-secondary/90 transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        {isRTL ? 'إضافة منشأة' : 'Add Tenant'}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title={isRTL ? 'إجمالي المنشآت' : 'Total Tenants'} value={stats?.total || 0} icon={Building2} color="info" />
                <StatCard title={isRTL ? 'نشطة' : 'Active'} value={stats?.active || 0} icon={CheckCircle2} color="success" />
                <StatCard title={isRTL ? 'معطلة' : 'Inactive'} value={stats?.inactive || 0} icon={XCircle} color="destructive" />
                <StatCard title={isRTL ? 'مؤسسية' : 'Enterprise'} value={stats?.byTier?.enterprise || 0} icon={Crown} color="warning" />
            </div>

            <div className="flex items-center gap-4 bg-card p-4 rounded-xl border">
                <div className="flex-1 relative">
                    <Search className="absolute top-1/2 -translate-y-1/2 left-3 rtl:right-3 rtl:left-auto w-5 h-5 text-muted" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={isRTL ? 'البحث عن منشأة...' : 'Search tenants...'}
                        className="w-full py-2 pl-10 rtl:pr-10 rtl:pl-4 pr-4 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                    />
                </div>
            </div>

            <div className="bg-card rounded-xl border shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-muted/5 border-b">
                            <tr>
                                <th className="px-4 py-3 text-start font-cairo font-medium text-muted-foreground">{isRTL ? 'المنشأة' : 'Tenant'}</th>
                                <th className="px-4 py-3 text-start font-cairo font-medium text-muted-foreground hidden md:table-cell">{isRTL ? 'التواصل' : 'Contact'}</th>
                                <th className="px-4 py-3 text-start font-cairo font-medium text-muted-foreground hidden lg:table-cell">{isRTL ? 'الموقع' : 'Location'}</th>
                                <th className="px-4 py-3 text-center font-cairo font-medium text-muted-foreground">{isRTL ? 'الباقة' : 'Tier'}</th>
                                <th className="px-4 py-3 text-center font-cairo font-medium text-muted-foreground">{isRTL ? 'الحالة' : 'Status'}</th>
                                <th className="px-4 py-3 text-center font-cairo font-medium text-muted-foreground">{isRTL ? 'إجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTenants.map((tenant) => (
                                <TenantRow
                                    key={tenant.id}
                                    tenant={tenant}
                                    isRTL={isRTL}
                                    canEdit={canManageTenants}
                                    canToggleStatus={canManageTenants}
                                    canEnter={canEnterTenants}
                                    canManageSubscription={canManageSubscriptions}
                                    onEdit={() => openEditModal(tenant)}
                                    onToggleStatus={() => handleToggleStatus(tenant)}
                                    onEnter={() => handleEnterTenant(tenant)}
                                    onManageSubscription={() => {
                                        if (!canManageSubscriptions) return
                                        setEditingTenant(tenant)
                                        setShowSubscriptionModal(true)
                                    }}
                                />
                            ))}

                            {filteredTenants.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-muted font-cairo">
                                        {isRTL ? 'لا توجد منشآت' : 'No tenants found'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showSubscriptionModal && editingTenant && canManageSubscriptions && (
                <ManageSubscriptionModal
                    tenant={editingTenant}
                    isRTL={isRTL}
                    onClose={() => {
                        setShowSubscriptionModal(false)
                        setEditingTenant(null)
                    }}
                />
            )}

            {showModal && canManageTenants && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-card rounded-xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="font-bold font-cairo text-lg">
                                {editingTenant
                                    ? (isRTL ? 'تعديل المنشأة' : 'Edit Tenant')
                                    : (isRTL ? 'إضافة منشأة جديدة' : 'Add New Tenant')}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-muted/10 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <InputField label={isRTL ? 'المعرف الفريد' : 'Slug'} required>
                                    <input
                                        type="text"
                                        value={formData.slug}
                                        onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-mono"
                                        placeholder="tenant-name"
                                    />
                                </InputField>

                                <InputField label={isRTL ? 'الحالة' : 'Status'}>
                                    <div className="w-full py-2 px-3 bg-muted/50 border rounded-lg font-cairo text-sm text-muted-foreground flex items-center gap-2">
                                        <span>{formData.subscription_status || 'trial'}</span>
                                        <span className="text-xs opacity-60">{isRTL ? '(يُدار عبر الباقة)' : '(managed via billing)'}</span>
                                    </div>
                                </InputField>
                            </div>

                            <InputField label={isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'} required>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                />
                            </InputField>

                            <InputField label={isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}>
                                <input
                                    type="text"
                                    value={formData.name_ar || ''}
                                    onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                                    className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                    dir="rtl"
                                />
                            </InputField>

                            <div className="grid grid-cols-2 gap-4">
                                <InputField label={isRTL ? 'البريد' : 'Email'}>
                                    <input
                                        type="email"
                                        value={formData.email || ''}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                    />
                                </InputField>

                                <InputField label={isRTL ? 'الهاتف' : 'Phone'}>
                                    <input
                                        type="tel"
                                        value={formData.phone || ''}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                    />
                                </InputField>
                            </div>

                            <InputField label={isRTL ? 'العنوان' : 'Address'}>
                                <input
                                    type="text"
                                    value={formData.address || ''}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                />
                            </InputField>

                            {!editingTenant && (
                                <div className="p-4 bg-muted/5 rounded-lg border space-y-4">
                                    <h4 className="font-bold flex items-center gap-2 font-cairo text-sm text-primary">
                                        <Crown className="w-4 h-4 text-secondary" />
                                        {isRTL ? 'بيانات مدير المنشأة' : 'Tenant Admin Details'}
                                    </h4>

                                    <InputField label={isRTL ? 'اسم المدير' : 'Admin Name'}>
                                        <input
                                            type="text"
                                            value={formData.admin_name || ''}
                                            onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
                                            className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                        />
                                    </InputField>

                                    <div className="grid grid-cols-2 gap-4">
                                        <InputField label={isRTL ? 'بريد المدير' : 'Admin Email'}>
                                            <input
                                                type="email"
                                                value={formData.admin_email || ''}
                                                onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                                                className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                                placeholder="admin@company.com"
                                            />
                                        </InputField>

                                        <InputField label={isRTL ? 'كلمة المرور' : 'Password'}>
                                            <input
                                                type="password"
                                                value={formData.admin_password || ''}
                                                onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
                                                className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                                placeholder="******"
                                            />
                                        </InputField>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-3 p-4 border-t">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 rounded-lg border hover:bg-muted/10 font-cairo"
                            >
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!formData.slug || !formData.name}
                                className="px-4 py-2 bg-secondary text-white rounded-lg font-cairo hover:bg-secondary/90 disabled:opacity-50"
                            >
                                {editingTenant
                                    ? (isRTL ? 'حفظ التغييرات' : 'Save Changes')
                                    : (isRTL ? 'إضافة' : 'Add')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function InputField({
    label,
    required = false,
    children,
}: {
    label: string
    required?: boolean
    children: ReactNode
}) {
    return (
        <div>
            <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                {label} {required ? '*' : ''}
            </label>
            {children}
        </div>
    )
}

function StatCard({ title, value, icon: Icon, color }: {
    title: string
    value: number
    icon: ElementType
    color: string
}) {
    const colorClasses: Record<string, string> = {
        info: 'bg-info/10 text-info',
        success: 'bg-success/10 text-success',
        destructive: 'bg-destructive/10 text-destructive',
        warning: 'bg-warning/10 text-warning',
    }

    return (
        <div className="bg-card rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-3">
                <div className={cn('p-3 rounded-lg', colorClasses[color])}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-primary font-inter">{value}</p>
                    <p className="text-xs text-muted-foreground font-cairo">{title}</p>
                </div>
            </div>
        </div>
    )
}

function TenantRow({
    tenant,
    isRTL,
    canEdit,
    canToggleStatus,
    canEnter,
    canManageSubscription,
    onEdit,
    onToggleStatus,
    onEnter,
    onManageSubscription,
}: {
    tenant: Tenant
    isRTL: boolean
    canEdit: boolean
    canToggleStatus: boolean
    canEnter: boolean
    canManageSubscription: boolean
    onEdit: () => void
    onToggleStatus: () => void
    onEnter: () => void
    onManageSubscription: () => void
}) {
    const statusInfo: Record<string, { label: string; labelAr: string; color: string }> = {
        trial: { label: 'Trial', labelAr: 'تجربة', color: 'bg-muted' },
        active: { label: 'Active', labelAr: 'نشط', color: 'bg-success' },
        suspended: { label: 'Suspended', labelAr: 'معلق', color: 'bg-warning' },
        cancelled: { label: 'Cancelled', labelAr: 'ملغي', color: 'bg-destructive' },
        expired: { label: 'Expired', labelAr: 'منتهي', color: 'bg-muted' },
    }
    const status = statusInfo[tenant.subscription_status || 'trial'] || statusInfo.trial

    return (
        <tr className="border-b hover:bg-muted/5 transition-colors">
            <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                        {tenant.logo_url ? (
                            <img src={tenant.logo_url} alt={tenant.name} className="w-full h-full rounded-lg object-cover" />
                        ) : (
                            <Building2 className="w-5 h-5 text-secondary" />
                        )}
                    </div>
                    <div>
                        <p className="font-medium font-cairo">{isRTL ? (tenant.name_ar || tenant.name) : tenant.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{tenant.slug}</p>
                    </div>
                </div>
            </td>

            <td className="px-4 py-3 hidden md:table-cell">
                <div className="space-y-1">
                    {tenant.email && (
                        <p className="text-sm flex items-center gap-2">
                            <Mail className="w-3 h-3 text-muted-foreground" />
                            {tenant.email}
                        </p>
                    )}
                    {tenant.phone && (
                        <p className="text-sm flex items-center gap-2">
                            <Phone className="w-3 h-3 text-muted-foreground" />
                            {tenant.phone}
                        </p>
                    )}
                </div>
            </td>

            <td className="px-4 py-3 hidden lg:table-cell">
                {tenant.address && (
                    <p className="text-sm flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        {tenant.address}
                    </p>
                )}
            </td>

            <td className="px-4 py-3 text-center">
                <span className={cn('px-2 py-1 rounded-full text-xs font-medium text-white', status.color)}>
                    {isRTL ? status.labelAr : status.label}
                </span>
            </td>

            <td className="px-4 py-3 text-center">
                {tenant.is_active ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                        <CheckCircle2 className="w-3 h-3" />
                        {isRTL ? 'نشط' : 'Active'}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                        <XCircle className="w-3 h-3" />
                        {isRTL ? 'معطل' : 'Inactive'}
                    </span>
                )}
            </td>

            <td className="px-4 py-3">
                <div className="flex items-center justify-center gap-2">
                    {canEnter && (
                        <button
                            onClick={onEnter}
                            className="p-2 hover:bg-secondary/10 rounded-lg transition-colors"
                            title={isRTL ? 'الدخول للمنشأة' : 'Enter Tenant'}
                        >
                            <ExternalLink className="w-4 h-4 text-secondary" />
                        </button>
                    )}

                    {canManageSubscription && (
                        <button
                            onClick={onManageSubscription}
                            className="p-2 hover:bg-warning/10 rounded-lg transition-colors"
                            title={isRTL ? 'إدارة الاشتراك' : 'Manage Subscription'}
                        >
                            <CreditCard className="w-4 h-4 text-warning" />
                        </button>
                    )}

                    {canEdit && (
                        <button
                            onClick={onEdit}
                            className="p-2 hover:bg-muted/10 rounded-lg transition-colors"
                            title={isRTL ? 'تعديل' : 'Edit'}
                        >
                            <Edit className="w-4 h-4 text-muted-foreground" />
                        </button>
                    )}

                    {canToggleStatus && (
                        <button
                            onClick={onToggleStatus}
                            className="p-2 hover:bg-muted/10 rounded-lg transition-colors"
                            title={tenant.is_active ? (isRTL ? 'تعطيل' : 'Disable') : (isRTL ? 'تفعيل' : 'Enable')}
                        >
                            {tenant.is_active ? (
                                <ToggleRight className="w-4 h-4 text-success" />
                            ) : (
                                <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                            )}
                        </button>
                    )}
                </div>
            </td>
        </tr>
    )
}


function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysFromNow(iso: string | null | undefined): number | null {
    if (!iso) return null
    const diff = new Date(iso).getTime() - Date.now()
    return Math.ceil(diff / 86_400_000)
}

// ─── ManageSubscriptionModal ─────────────────────────────────────────────────

type ModalAction = 'activate' | 'trial' | 'extend_trial' | 'change_plan' | 'cancel' | null

function ManageSubscriptionModal({
    tenant,
    isRTL,
    onClose,
}: {
    tenant: Tenant
    isRTL: boolean
    onClose: () => void
}) {
    const { t } = useTranslation()
    const { data: plans = [] } = useSubscriptionPlans()
    const { data: existing, isLoading: subLoading } = useTenantSubscriptionNew(tenant.id)
    const { data: discountPolicies = [] } = useDiscountPolicies(true)

    const engineActivate  = useEngineActivate()
    const engineCancel    = useEngineCancel()
    const engineExtend    = useEngineExtendTrial()

    // ── Action panel state ───────────────────────────────────────────────────
    const [activeAction, setActiveAction] = useState<ModalAction>(null)
    const [confirmCancel, setConfirmCancel] = useState(false)

    // ── Form fields ──────────────────────────────────────────────────────────
    const [selectedPlanId, setSelectedPlanId] = useState<string>('')
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly')
    const [discountPolicyId, setDiscountPolicyId] = useState<string>('')
    const [adminNote, setAdminNote] = useState('')
    const [extraDays, setExtraDays] = useState<string>('14')

    // Pre-fill from existing subscription once loaded
    const [initialized, setInitialized] = useState(false)
    if (!subLoading && !initialized) {
        if (existing) {
            setSelectedPlanId(existing.plan_id || '')
            setBillingCycle((existing.billing_cycle as BillingCycle) || 'yearly')
            setDiscountPolicyId(existing.discount_policy_id || '')
        } else if (plans.length > 0) {
            setSelectedPlanId(plans[0].id)
        }
        setInitialized(true)
    }

    // ── Live pricing preview ─────────────────────────────────────────────────
    const calcEnabled = !!selectedPlanId && (activeAction === 'activate' || activeAction === 'change_plan')
    const { data: pricing, isFetching: calcLoading } = useEngineCalculate({
        planId:           calcEnabled ? selectedPlanId : null,
        billingCycle,
        addOnIds:         [],
        discountPolicyId: discountPolicyId || null,
    })

    // ── Derived state ────────────────────────────────────────────────────────
    const currentStatus: NewSubscriptionStatus = (existing?.status ?? 'trial') as NewSubscriptionStatus
    const days = existing?.current_period_end ? daysFromNow(existing.current_period_end) : null

    // Which action buttons to show depends on current status
    const canActivate  = ['trial','expired','cancelled','past_due'].includes(currentStatus) || !existing
    const canExtend    = currentStatus === 'trial'
    const canChangePlan= currentStatus === 'active'
    const canCancel    = ['active','trial','past_due'].includes(currentStatus)

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleActivate = async (targetStatus: 'active' | 'trial') => {
        if (!selectedPlanId) {
            toast.error(isRTL ? 'يرجى اختيار باقة' : 'Please select a plan')
            return
        }
        try {
            await engineActivate.mutateAsync({
                tenantId:          tenant.id,
                planId:            selectedPlanId,
                billingCycle,
                source:            'admin',
                status:            targetStatus,
                trialDays:         targetStatus === 'trial' ? parseInt(extraDays) || 14 : null,
                discountPolicyId:  discountPolicyId || null,
                adminNote:         adminNote || null,
            })
            toast.success(isRTL ? t('billing.success.activated') : t('billing.success.activated'))
            onClose()
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            toast.error(`${t('billing.error.activation_failed')}: ${msg}`)
        }
    }

    const handleExtendTrial = async () => {
        const days = parseInt(extraDays)
        if (!days || days < 1) {
            toast.error(isRTL ? 'يرجى إدخال عدد أيام صحيح' : 'Please enter a valid number of days')
            return
        }
        try {
            await engineExtend.mutateAsync({ tenantId: tenant.id, extraDays: days, adminNote: adminNote || undefined })
            toast.success(t('billing.trial.extend.success'))
            onClose()
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            toast.error(msg)
        }
    }

    const handleCancel = async () => {
        try {
            await engineCancel.mutateAsync({ tenantId: tenant.id, adminNote: adminNote || undefined })
            toast.success(t('billing.success.cancelled'))
            setConfirmCancel(false)
            onClose()
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            toast.error(msg)
        }
    }

    const isPending = engineActivate.isPending || engineCancel.isPending || engineExtend.isPending

    // ── Pricing breakdown section ─────────────────────────────────────────────

    const PricingPreview = () => {
        if (!calcEnabled) return null
        if (calcLoading) return (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground font-cairo">
                <Loader2 className="w-4 h-4 animate-spin" />
                {isRTL ? 'جاري حساب السعر...' : 'Calculating...'}
            </div>
        )
        if (!pricing) return null
        return (
            <div className="bg-muted/5 border rounded-xl p-4 space-y-2 text-sm font-cairo mt-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    {isRTL ? 'تفصيل السعر' : 'Pricing Breakdown'}
                </p>
                {[
                    { label: t('billing.pricing.plan_amount'),    val: pricing.plan_amount },
                    { label: t('billing.pricing.subtotal'),        val: pricing.subtotal,       hide: !pricing.discount_amount },
                    { label: t('billing.pricing.discount_amount'), val: -pricing.discount_amount, hide: !pricing.discount_amount, green: true },
                    { label: t('billing.pricing.taxable_amount'),  val: pricing.taxable_amount,  hide: !pricing.discount_amount },
                    { label: t('billing.pricing.tax_amount'),      val: pricing.tax_amount },
                ].filter(r => !r.hide).map((row, i) => (
                    <div key={i} className="flex justify-between text-muted-foreground">
                        <span>{row.label}</span>
                        <span className={row.green ? 'text-success' : ''}>{formatSAR(Math.abs(row.val))}</span>
                    </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-bold text-base">
                    <span>{t('billing.pricing.total')}</span>
                    <span className="text-secondary">{formatSAR(pricing.total)}</span>
                </div>
            </div>
        )
    }

    // ── Action panel renderer ─────────────────────────────────────────────────

    const ActionPanel = ({ id, label, icon, children }: {
        id: ModalAction; label: string; icon: React.ReactNode; children: React.ReactNode
    }) => (
        <div className="border rounded-xl overflow-hidden">
            <button
                type="button"
                onClick={() => setActiveAction(prev => prev === id ? null : id)}
                className={cn(
                    'w-full flex items-center justify-between px-4 py-3 text-sm font-cairo font-semibold transition-colors',
                    activeAction === id ? 'bg-secondary/10 text-secondary' : 'hover:bg-muted/10 text-foreground'
                )}
            >
                <span className="flex items-center gap-2">{icon}{label}</span>
                <ChevronDown className={cn('w-4 h-4 transition-transform', activeAction === id && 'rotate-180')} />
            </button>
            {activeAction === id && (
                <div className="px-4 pb-4 pt-2 space-y-3 bg-background border-t">
                    {children}
                </div>
            )}
        </div>
    )

    // ── Plan selector (shared across activate / change_plan panels) ───────────

    const PlanSelector = () => (
        <div className="space-y-2">
            <label className="block text-xs font-medium font-cairo text-muted-foreground">
                {t('billing.plan.select')}
            </label>
            <div className="grid gap-2">
                {plans.map(plan => {
                    const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
                    return (
                        <button
                            key={plan.id}
                            type="button"
                            onClick={() => setSelectedPlanId(plan.id)}
                            className={cn(
                                'w-full text-start border rounded-lg p-3 transition-all hover:border-secondary/50 text-sm',
                                selectedPlanId === plan.id
                                    ? 'border-secondary bg-secondary/5 ring-1 ring-secondary'
                                    : 'bg-background'
                            )}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-medium font-cairo">
                                    {isRTL ? plan.name_ar || plan.name : plan.name}
                                </span>
                                <span className="text-xs text-muted-foreground font-mono">
                                    {formatSAR(price)}
                                </span>
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Billing cycle toggle */}
            <div className="flex items-center gap-2 mt-2">
                {(['monthly', 'yearly'] as BillingCycle[]).map(cycle => (
                    <button
                        key={cycle}
                        type="button"
                        onClick={() => setBillingCycle(cycle)}
                        className={cn(
                            'flex-1 py-2 rounded-lg text-xs font-cairo font-semibold border transition-colors',
                            billingCycle === cycle
                                ? 'bg-secondary text-white border-secondary'
                                : 'bg-background hover:bg-muted/10'
                        )}
                    >
                        {cycle === 'yearly' ? t('billing.plan.yearly') : t('billing.plan.monthly')}
                    </button>
                ))}
            </div>

            {/* Discount selector */}
            {discountPolicies.length > 0 && (
                <div>
                    <label className="block text-xs font-medium font-cairo text-muted-foreground mb-1">
                        {t('billing.discount.select')}
                    </label>
                    <select
                        value={discountPolicyId}
                        onChange={e => setDiscountPolicyId(e.target.value)}
                        className="w-full py-2 px-3 bg-background border rounded-lg text-sm font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                    >
                        <option value="">{t('billing.discount.none')}</option>
                        {discountPolicies.map(dp => (
                            <option key={dp.id} value={dp.id}>
                                {isRTL ? dp.name_ar : dp.name} ({dp.discount_value}{dp.discount_type === 'percentage' ? '%' : ' SAR'})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <PricingPreview />
        </div>
    )

    const AdminNoteField = () => (
        <div>
            <label className="block text-xs font-medium font-cairo text-muted-foreground mb-1">
                {t('billing.admin_note')}
            </label>
            <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                rows={2}
                placeholder={t('billing.admin_note_placeholder')}
                className="w-full py-2 px-3 bg-background border rounded-lg text-sm font-cairo focus:ring-2 focus:ring-secondary/20 outline-none resize-none"
            />
        </div>
    )

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-card rounded-xl border shadow-xl w-full max-w-2xl max-h-[95vh] flex flex-col">

                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                        <h3 className="font-bold font-cairo text-lg flex items-center gap-2">
                            <Crown className="w-5 h-5 text-warning" />
                            {isRTL ? 'إدارة اشتراك المنشأة' : 'Manage Subscription'}
                        </h3>
                        <button onClick={onClose} className="p-2 hover:bg-muted/10 rounded-lg">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-4">

                        {/* Tenant + current status */}
                        <div className="flex items-center gap-3 p-3 bg-muted/10 rounded-xl border">
                            <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                                <Building2 className="w-5 h-5 text-secondary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold font-cairo truncate">
                                    {isRTL ? tenant.name_ar || tenant.name : tenant.name}
                                </p>
                                <p className="text-xs text-muted-foreground font-mono">{tenant.slug}</p>
                            </div>
                            {existing && (
                                <span className={cn(
                                    'px-3 py-1 rounded-full border text-xs font-bold font-cairo',
                                    subscriptionStatusColor(currentStatus)
                                )}>
                                    {t(`billing.subscription.status.${currentStatus}`)}
                                </span>
                            )}
                        </div>

                        {/* Current subscription summary */}
                        {subLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : existing ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <SummaryItem
                                    icon={<Crown className="w-4 h-4" />}
                                    label={t('billing.plan.current')}
                                    value={isRTL ? existing.plan?.name_ar || existing.plan?.name || '—' : existing.plan?.name || '—'}
                                />
                                <SummaryItem
                                    icon={<Calendar className="w-4 h-4" />}
                                    label={isRTL ? 'ينتهي' : 'Ends'}
                                    value={formatDate(existing.current_period_end)}
                                />
                                <SummaryItem
                                    icon={<Clock className="w-4 h-4" />}
                                    label={isRTL ? 'متبقي' : 'Days left'}
                                    value={days !== null
                                        ? (days > 0 ? `${days} ${isRTL ? 'يوم' : 'd'}` : (isRTL ? 'منتهٍ' : 'Expired'))
                                        : '—'
                                    }
                                    highlight={days !== null && days <= 7 && days > 0}
                                />
                                <SummaryItem
                                    icon={<DollarSign className="w-4 h-4" />}
                                    label={isRTL ? 'المبلغ' : 'Amount'}
                                    value={existing.amount > 0 ? formatSAR(existing.amount) : (isRTL ? 'مجاناً' : 'Free')}
                                />
                            </div>
                        ) : (
                            <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl text-sm font-cairo flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                                {isRTL ? 'لا يوجد اشتراك مسجل لهذه المنشأة' : 'No subscription record found'}
                            </div>
                        )}

                        <div className="h-px bg-border" />

                        {/* Action panels — shown based on current status */}

                        {/* Activate as Trial */}
                        {(canActivate || !existing) && (
                            <ActionPanel id="trial" icon={<Timer className="w-4 h-4" />}
                                label={isRTL ? 'بدء تجربة مجانية' : 'Start Trial'}>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium font-cairo text-muted-foreground mb-1">
                                            {isRTL ? 'مدة التجربة (أيام)' : 'Trial duration (days)'}
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={1}
                                                value={extraDays}
                                                onChange={e => setExtraDays(e.target.value)}
                                                className="w-24 py-2 px-3 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-secondary/20 outline-none text-center"
                                            />
                                            <div className="flex gap-1">
                                                {[7, 14, 30].map(d => (
                                                    <button key={d} type="button" onClick={() => setExtraDays(String(d))}
                                                        className="px-2.5 py-1.5 text-xs border rounded-lg hover:bg-secondary/10 hover:text-secondary transition-colors font-cairo">
                                                        {d}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium font-cairo text-muted-foreground mb-1">
                                            {t('billing.plan.select')}
                                        </label>
                                        <select
                                            value={selectedPlanId}
                                            onChange={e => setSelectedPlanId(e.target.value)}
                                            className="w-full py-2 px-3 bg-background border rounded-lg text-sm font-cairo focus:ring-2 focus:ring-secondary/20 outline-none"
                                        >
                                            {plans.map(p => (
                                                <option key={p.id} value={p.id}>{isRTL ? p.name_ar || p.name : p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <AdminNoteField />
                                    <button
                                        type="button"
                                        onClick={() => handleActivate('trial')}
                                        disabled={isPending || !selectedPlanId}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-cairo font-bold transition-colors disabled:opacity-50"
                                    >
                                        {engineActivate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Timer className="w-4 h-4" />}
                                        {isRTL ? 'بدء التجربة' : 'Start Trial'}
                                    </button>
                                </div>
                            </ActionPanel>
                        )}

                        {/* Activate as Paid */}
                        {canActivate && (
                            <ActionPanel id="activate" icon={<Zap className="w-4 h-4" />}
                                label={t('billing.subscription.activate')}>
                                <PlanSelector />
                                <AdminNoteField />
                                <button
                                    type="button"
                                    onClick={() => handleActivate('active')}
                                    disabled={isPending || !selectedPlanId}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary hover:bg-secondary/90 text-white rounded-lg text-sm font-cairo font-bold transition-colors disabled:opacity-50"
                                >
                                    {engineActivate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    {t('billing.subscription.activate')}
                                </button>
                            </ActionPanel>
                        )}

                        {/* Change Plan (active only) */}
                        {canChangePlan && (
                            <ActionPanel id="change_plan" icon={<RefreshCw className="w-4 h-4" />}
                                label={t('billing.subscription.change_plan')}>
                                <PlanSelector />
                                <AdminNoteField />
                                <button
                                    type="button"
                                    onClick={() => handleActivate('active')}
                                    disabled={isPending || !selectedPlanId}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary hover:bg-secondary/90 text-white rounded-lg text-sm font-cairo font-bold transition-colors disabled:opacity-50"
                                >
                                    {engineActivate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    {t('billing.subscription.change_plan')}
                                </button>
                            </ActionPanel>
                        )}

                        {/* Extend Trial */}
                        {canExtend && (
                            <ActionPanel id="extend_trial" icon={<Tag className="w-4 h-4" />}
                                label={t('billing.subscription.extend_trial')}>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium font-cairo text-muted-foreground mb-1">
                                            {t('billing.trial.extend.days_label')}
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={1}
                                                value={extraDays}
                                                onChange={e => setExtraDays(e.target.value)}
                                                className="w-24 py-2 px-3 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-secondary/20 outline-none text-center"
                                            />
                                            <div className="flex gap-1">
                                                {[7, 14, 30].map(d => (
                                                    <button key={d} type="button" onClick={() => setExtraDays(String(d))}
                                                        className="px-2.5 py-1.5 text-xs border rounded-lg hover:bg-secondary/10 hover:text-secondary transition-colors font-cairo">
                                                        {d}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <AdminNoteField />
                                    <button
                                        type="button"
                                        onClick={handleExtendTrial}
                                        disabled={isPending}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-lg text-sm font-cairo font-bold transition-colors disabled:opacity-50"
                                    >
                                        {engineExtend.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                        {t('billing.subscription.extend_trial')}
                                    </button>
                                </div>
                            </ActionPanel>
                        )}

                        {/* Cancel Subscription */}
                        {canCancel && (
                            <ActionPanel id="cancel" icon={<Ban className="w-4 h-4 text-destructive" />}
                                label={t('billing.subscription.cancel')}>
                                <div className="space-y-3">
                                    <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-sm font-cairo text-destructive">
                                        {isRTL
                                            ? 'سيتم إلغاء الاشتراك فوراً وقد لا يتمكن المستخدمون من الوصول.'
                                            : 'The subscription will be cancelled immediately. Tenant access may be restricted.'}
                                    </div>
                                    <AdminNoteField />
                                    <button
                                        type="button"
                                        onClick={() => setConfirmCancel(true)}
                                        disabled={isPending}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-destructive hover:bg-destructive/90 text-white rounded-lg text-sm font-cairo font-bold transition-colors disabled:opacity-50"
                                    >
                                        <Ban className="w-4 h-4" />
                                        {t('billing.subscription.cancel')}
                                    </button>
                                </div>
                            </ActionPanel>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-5 py-4 border-t bg-muted/5 shrink-0">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg border bg-background hover:bg-muted/10 font-cairo transition-colors text-sm"
                        >
                            {isRTL ? 'إغلاق' : 'Close'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Cancel confirmation dialog */}
            <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-cairo">
                            {t('billing.subscription.cancel')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="font-cairo">
                            {t('billing.confirm.cancel')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="font-cairo">{isRTL ? 'تراجع' : 'Go back'}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleCancel}
                            className="bg-destructive hover:bg-destructive/90 font-cairo"
                        >
                            {engineCancel.isPending
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : t('billing.subscription.cancel')
                            }
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

// ─── Shared Sub-components ───────────────────────────────────────────────────

function SummaryItem({ icon, label, value, highlight }: {
    icon: ReactNode
    label: string
    value: string
    highlight?: boolean
}) {
    return (
        <div className="bg-background border rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                {icon}
                <span className="text-xs font-cairo">{label}</span>
            </div>
            <p className={cn('text-sm font-bold font-cairo truncate', highlight ? 'text-destructive' : 'text-primary')}>
                {value}
            </p>
        </div>
    )
}
