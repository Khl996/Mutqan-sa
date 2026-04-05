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
    useAdminManageSubscription,
    useTenantSubscription,
    AdminManageSubscriptionInput,
    SubscriptionStatus,
    OverrideType,
    DiscountType,
} from '@/hooks/useSubscription'
import { toast } from 'sonner'
import {
    Building2,
    Plus,
    Search,
    CheckCircle2,
    XCircle,
    Edit,
    ToggleLeft,
    ToggleRight,
    Mail,
    Phone,
    MapPin,
    Crown,
    X,
    ExternalLink,
    CreditCard,
    Calendar,
    Clock,
    Tag,
    FileText,
    AlertTriangle,
    Gift,
    Infinity,
    Loader2,
} from 'lucide-react'

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
                                    <select
                                        value={formData.subscription_status || 'trial'}
                                        onChange={(e) => setFormData({ ...formData, subscription_status: e.target.value })}
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                    >
                                        <option value="trial">{isRTL ? 'تجربة' : 'Trial'}</option>
                                        <option value="active">{isRTL ? 'نشط' : 'Active'}</option>
                                        <option value="suspended">{isRTL ? 'معلق' : 'Suspended'}</option>
                                        <option value="cancelled">{isRTL ? 'ملغي' : 'Cancelled'}</option>
                                        <option value="expired">{isRTL ? 'منتهي' : 'Expired'}</option>
                                    </select>
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

// ─── Subscription Status Display Helpers ────────────────────────────────────

const STATUS_META: Record<SubscriptionStatus, { labelAr: string; label: string; color: string; bg: string }> = {
    trial:     { label: 'Trial',     labelAr: 'تجريبي',      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
    active:    { label: 'Active',    labelAr: 'نشط',         color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
    expired:   { label: 'Expired',   labelAr: 'منتهي',       color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
    suspended: { label: 'Suspended', labelAr: 'معلق',        color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
    cancelled: { label: 'Cancelled', labelAr: 'ملغي',        color: 'text-gray-700',   bg: 'bg-gray-50 border-gray-200' },
}

const OVERRIDE_META: Record<OverrideType, { labelAr: string; label: string }> = {
    none:             { label: 'None',             labelAr: 'لا يوجد' },
    trial_extension:  { label: 'Trial Extension',  labelAr: 'تمديد تجربة' },
    one_time_discount:{ label: 'One-time Discount', labelAr: 'خصم مرة واحدة' },
    complimentary:    { label: 'Complimentary',    labelAr: 'مجاني مؤقت' },
    free_forever:     { label: 'Free Forever',     labelAr: 'مجاني دائم' },
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

function ManageSubscriptionModal({
    tenant,
    isRTL,
    onClose,
}: {
    tenant: Tenant
    isRTL: boolean
    onClose: () => void
}) {
    const { data: plans = [] } = useSubscriptionPlans()
    const { data: existing, isLoading: subLoading } = useTenantSubscription(tenant.id)
    const manageSubscription = useAdminManageSubscription()

    // ── Form State ──────────────────────────────────────────────────────────
    const [selectedPlanId, setSelectedPlanId] = useState<string>('')
    const [status, setStatus] = useState<SubscriptionStatus>('trial')
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly')
    const [periodEnd, setPeriodEnd] = useState<string>('')           // YYYY-MM-DD
    const [overrideType, setOverrideType] = useState<OverrideType>('none')
    const [discountType, setDiscountType] = useState<DiscountType>('none')
    const [discountValue, setDiscountValue] = useState<string>('0')
    const [discountNextOnly, setDiscountNextOnly] = useState(false)
    const [adminNote, setAdminNote] = useState('')
    const [initialized, setInitialized] = useState(false)

    // Populate form from existing subscription once loaded
    if (!subLoading && !initialized) {
        if (existing) {
            setSelectedPlanId(existing.plan_id || '')
            setStatus(existing.status)
            setBillingCycle(existing.billing_cycle || 'yearly')
            if (existing.current_period_end) {
                setPeriodEnd(existing.current_period_end.slice(0, 10))
            }
            setOverrideType(existing.override_type || 'none')
            setDiscountType(existing.discount_type || 'none')
            setDiscountValue(String(existing.discount_value ?? 0))
            setDiscountNextOnly(existing.discount_applies_to_next_only ?? false)
            setAdminNote(existing.admin_note || '')
        } else {
            // No existing subscription: default to trial
            if (plans.length > 0) setSelectedPlanId(plans[0].id)
        }
        setInitialized(true)
    }

    // Auto-adjust: free_forever/complimentary → active + far future date
    const handleOverrideTypeChange = (val: OverrideType) => {
        setOverrideType(val)
        if (val === 'free_forever' || val === 'complimentary') {
            setStatus('active')
            setPeriodEnd('2099-12-31')
        }
        if (val !== 'one_time_discount') {
            setDiscountType('none')
            setDiscountValue('0')
            setDiscountNextOnly(false)
        }
    }

    const handleSave = async () => {
        if (!selectedPlanId) {
            toast.error(isRTL ? 'يرجى اختيار باقة' : 'Please select a plan')
            return
        }

        const input: AdminManageSubscriptionInput = {
            tenantId:    tenant.id,
            status,
            planId:      selectedPlanId,
            billingCycle,
            periodEnd:   periodEnd || undefined,
            overrideType,
            discountType,
            discountValue:               parseFloat(discountValue) || 0,
            discountAppliesToNextOnly:   discountNextOnly,
            adminNote:   adminNote || null,
        }

        try {
            await manageSubscription.mutateAsync(input)
            toast.success(isRTL ? 'تم تحديث الاشتراك بنجاح' : 'Subscription updated successfully')
            onClose()
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            toast.error(isRTL ? `فشل التحديث: ${msg}` : `Update failed: ${msg}`)
        }
    }

    const days = existing ? daysFromNow(existing.current_period_end) : null
    const selectedPlan = plans.find(p => p.id === selectedPlanId)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-xl border shadow-xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-card z-10">
                    <h3 className="font-bold font-cairo text-lg flex items-center gap-2">
                        <Crown className="w-5 h-5 text-warning" />
                        {isRTL ? 'إدارة اشتراك المنشأة' : 'Manage Tenant Subscription'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-muted/10 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-5">

                    {/* Tenant Info */}
                    <div className="flex items-center gap-3 p-3 bg-muted/10 rounded-lg border">
                        <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                            <Building2 className="w-5 h-5 text-secondary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold font-cairo truncate">{isRTL ? tenant.name_ar || tenant.name : tenant.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{tenant.slug}</p>
                        </div>
                        {existing && (
                            <div className={cn('px-3 py-1 rounded-full border text-xs font-bold', STATUS_META[existing.status]?.bg, STATUS_META[existing.status]?.color)}>
                                {isRTL ? STATUS_META[existing.status]?.labelAr : STATUS_META[existing.status]?.label}
                            </div>
                        )}
                    </div>

                    {/* Current Subscription Summary */}
                    {subLoading ? (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : existing ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <SummaryItem
                                icon={<Clock className="w-4 h-4" />}
                                label={isRTL ? 'الحالة' : 'Status'}
                                value={isRTL ? STATUS_META[existing.status]?.labelAr : STATUS_META[existing.status]?.label}
                            />
                            <SummaryItem
                                icon={<Crown className="w-4 h-4" />}
                                label={isRTL ? 'الباقة' : 'Plan'}
                                value={isRTL ? existing.plan?.name_ar || existing.plan?.name || '—' : existing.plan?.name || '—'}
                            />
                            <SummaryItem
                                icon={<Calendar className="w-4 h-4" />}
                                label={isRTL ? 'ينتهي' : 'Ends'}
                                value={formatDate(existing.current_period_end)}
                            />
                            <SummaryItem
                                icon={<Clock className="w-4 h-4" />}
                                label={isRTL ? 'متبقي' : 'Days Left'}
                                value={days !== null ? (days > 0 ? `${days} ${isRTL ? 'يوم' : 'days'}` : (isRTL ? 'منتهي' : 'Expired')) : '—'}
                                highlight={days !== null && days <= 7 && days > 0}
                            />
                        </div>
                    ) : (
                        <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg text-sm font-cairo text-warning-foreground flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                            {isRTL ? 'لا يوجد اشتراك مسجل لهذه المنشأة' : 'No subscription record found for this tenant'}
                        </div>
                    )}

                    <hr />

                    {/* Section: Status & Plan */}
                    <SectionTitle icon={<Crown className="w-4 h-4" />} title={isRTL ? 'الحالة والباقة' : 'Status & Plan'} />

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium font-cairo mb-1.5 text-muted-foreground">
                                {isRTL ? 'حالة الاشتراك' : 'Subscription Status'}
                            </label>
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value as SubscriptionStatus)}
                                className="w-full py-2 px-3 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                            >
                                <option value="trial">{isRTL ? 'تجريبي' : 'Trial'}</option>
                                <option value="active">{isRTL ? 'نشط (مدفوع)' : 'Active (Paid)'}</option>
                                <option value="suspended">{isRTL ? 'معلق' : 'Suspended'}</option>
                                <option value="expired">{isRTL ? 'منتهي' : 'Expired'}</option>
                                <option value="cancelled">{isRTL ? 'ملغي' : 'Cancelled'}</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium font-cairo mb-1.5 text-muted-foreground">
                                {isRTL ? 'دورة الفوترة' : 'Billing Cycle'}
                            </label>
                            <select
                                value={billingCycle}
                                onChange={e => setBillingCycle(e.target.value as 'monthly' | 'yearly')}
                                className="w-full py-2 px-3 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                            >
                                <option value="yearly">{isRTL ? 'سنوي' : 'Yearly'}</option>
                                <option value="monthly">{isRTL ? 'شهري' : 'Monthly'}</option>
                            </select>
                        </div>
                    </div>

                    {/* Plan Selector */}
                    <div>
                        <label className="block text-xs font-medium font-cairo mb-1.5 text-muted-foreground">
                            {isRTL ? 'الباقة' : 'Plan'}
                        </label>
                        <div className="grid gap-2">
                            {plans.map(plan => (
                                <button
                                    key={plan.id}
                                    type="button"
                                    onClick={() => setSelectedPlanId(plan.id)}
                                    className={cn(
                                        'w-full text-start border rounded-lg p-3 transition-all hover:border-secondary/50',
                                        selectedPlanId === plan.id
                                            ? 'border-secondary bg-secondary/5 ring-1 ring-secondary'
                                            : 'bg-background',
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <div className={cn(
                                                'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                                                selectedPlanId === plan.id ? 'border-secondary' : 'border-muted',
                                            )}>
                                                {selectedPlanId === plan.id && <div className="w-1.5 h-1.5 rounded-full bg-secondary" />}
                                            </div>
                                            <span className="font-medium font-cairo text-sm">{isRTL ? plan.name_ar || plan.name : plan.name}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly} {plan.currency}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Section: Period End */}
                    <SectionTitle icon={<Calendar className="w-4 h-4" />} title={isRTL ? 'تاريخ الانتهاء' : 'Period End Date'} />

                    <div>
                        <label className="block text-xs font-medium font-cairo mb-1.5 text-muted-foreground">
                            {isRTL
                                ? 'حدد تاريخ انتهاء الاشتراك (اتركه فارغاً للحساب التلقائي)'
                                : 'Set subscription end date (leave blank to auto-calculate)'}
                        </label>
                        <input
                            type="date"
                            value={periodEnd}
                            onChange={e => setPeriodEnd(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            className="w-full py-2 px-3 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-secondary/20 outline-none"
                        />
                        {status === 'trial' && (
                            <p className="text-xs text-muted-foreground mt-1 font-cairo">
                                {isRTL
                                    ? 'للتجربة المجانية: تاريخ الانتهاء يحدد طول فترة التجربة. عدّله لتمديد أو تقصير التجربة.'
                                    : 'For trial: this date sets the trial length. Edit to extend or shorten the trial.'}
                            </p>
                        )}
                    </div>

                    {/* Quick-set trial shortcuts */}
                    {status === 'trial' && (
                        <div className="flex flex-wrap gap-2">
                            {[7, 14, 30, 60].map(days => (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => {
                                        const d = new Date()
                                        d.setDate(d.getDate() + days)
                                        setPeriodEnd(d.toISOString().slice(0, 10))
                                    }}
                                    className="px-3 py-1.5 text-xs bg-muted/10 hover:bg-secondary/10 hover:text-secondary border rounded-lg transition-colors font-cairo"
                                >
                                    {days} {isRTL ? 'يوم' : 'days'}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Section: Override / Special Treatment */}
                    <SectionTitle icon={<Gift className="w-4 h-4" />} title={isRTL ? 'نوع الاستثناء الإداري' : 'Admin Override Type'} />

                    <div>
                        <label className="block text-xs font-medium font-cairo mb-1.5 text-muted-foreground">
                            {isRTL ? 'نوع الاستثناء (داخلي فقط، لا يظهر للعامة)' : 'Override type (internal only, not visible publicly)'}
                        </label>
                        <select
                            value={overrideType}
                            onChange={e => handleOverrideTypeChange(e.target.value as OverrideType)}
                            className="w-full py-2 px-3 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                        >
                            {(Object.entries(OVERRIDE_META) as [OverrideType, typeof OVERRIDE_META[OverrideType]][]).map(([val, meta]) => (
                                <option key={val} value={val}>{isRTL ? meta.labelAr : meta.label}</option>
                            ))}
                        </select>

                        {overrideType === 'complimentary' && (
                            <p className="mt-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2 font-cairo flex items-center gap-2">
                                <Gift className="w-3.5 h-3.5 shrink-0" />
                                {isRTL
                                    ? 'مجاني مؤقت: سيُضبط تلقائياً للحالة النشطة مع تاريخ انتهاء بعيد. يمكنك تغيير التاريخ.'
                                    : 'Complimentary: auto-sets to active with a far future end date. You can adjust the date.'}
                            </p>
                        )}
                        {overrideType === 'free_forever' && (
                            <p className="mt-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg p-2 font-cairo flex items-center gap-2">
                                <Infinity className="w-3.5 h-3.5 shrink-0" />
                                {isRTL
                                    ? 'مجاني للأبد: اشتراك نشط دائم. لا توجد رسوم. يظهر للمنشأة كـ "مجاني".'
                                    : 'Free Forever: permanently active, no charges. Shown to the tenant as "Free".'}
                            </p>
                        )}
                    </div>

                    {/* Discount Section – only for one_time_discount */}
                    {overrideType === 'one_time_discount' && (
                        <>
                            <SectionTitle icon={<Tag className="w-4 h-4" />} title={isRTL ? 'تفاصيل الخصم' : 'Discount Details'} />

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium font-cairo mb-1.5 text-muted-foreground">
                                        {isRTL ? 'نوع الخصم' : 'Discount Type'}
                                    </label>
                                    <select
                                        value={discountType}
                                        onChange={e => setDiscountType(e.target.value as DiscountType)}
                                        className="w-full py-2 px-3 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                    >
                                        <option value="none">{isRTL ? 'بدون خصم' : 'No Discount'}</option>
                                        <option value="percentage">{isRTL ? 'نسبة مئوية %' : 'Percentage %'}</option>
                                        <option value="fixed_amount">{isRTL ? 'مبلغ ثابت SAR' : 'Fixed Amount SAR'}</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium font-cairo mb-1.5 text-muted-foreground">
                                        {isRTL ? 'قيمة الخصم' : 'Discount Value'}
                                        {discountType === 'percentage' && ' (%)'}
                                        {discountType === 'fixed_amount' && ' (SAR)'}
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max={discountType === 'percentage' ? 100 : undefined}
                                        value={discountValue}
                                        onChange={e => setDiscountValue(e.target.value)}
                                        disabled={discountType === 'none'}
                                        className="w-full py-2 px-3 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-secondary/20 outline-none disabled:opacity-40"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <input
                                    id="next-only"
                                    type="checkbox"
                                    checked={discountNextOnly}
                                    onChange={e => setDiscountNextOnly(e.target.checked)}
                                    className="w-4 h-4 accent-secondary rounded"
                                />
                                <label htmlFor="next-only" className="text-sm font-cairo cursor-pointer select-none">
                                    {isRTL
                                        ? 'يسري على الاشتراك القادم فقط (لا يُطبَّق على الفترة الحالية)'
                                        : 'Applies to next renewal only (not the current period)'}
                                </label>
                            </div>

                            {selectedPlan && discountType !== 'none' && parseFloat(discountValue) > 0 && (
                                <div className="p-3 bg-info/5 border border-info/20 rounded-lg text-sm font-cairo">
                                    {(() => {
                                        const base = billingCycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly
                                        const val = parseFloat(discountValue)
                                        const discounted = discountType === 'percentage'
                                            ? base * (1 - val / 100)
                                            : Math.max(0, base - val)
                                        return (
                                            <span>
                                                {isRTL ? 'السعر بعد الخصم:' : 'Price after discount:'}{' '}
                                                <strong>{discounted.toFixed(2)} SAR</strong>
                                                {' '}{isRTL ? `(بدلاً من ${base} SAR)` : `(instead of ${base} SAR)`}
                                            </span>
                                        )
                                    })()}
                                </div>
                            )}
                        </>
                    )}

                    {/* Section: Admin Note */}
                    <SectionTitle icon={<FileText className="w-4 h-4" />} title={isRTL ? 'ملاحظة داخلية' : 'Internal Admin Note'} />

                    <div>
                        <textarea
                            value={adminNote}
                            onChange={e => setAdminNote(e.target.value)}
                            rows={3}
                            placeholder={isRTL
                                ? 'سبب التعديل أو أي معلومات داخلية مفيدة...'
                                : 'Reason for change or any useful internal context...'}
                            className="w-full py-2 px-3 bg-background border rounded-lg text-sm focus:ring-2 focus:ring-secondary/20 outline-none resize-none font-cairo"
                        />
                        <p className="text-xs text-muted-foreground mt-1 font-cairo">
                            {isRTL
                                ? 'هذه الملاحظة داخلية ولا تظهر للمنشأة.'
                                : 'This note is internal and not visible to the tenant.'}
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 p-5 border-t bg-muted/5 sticky bottom-0">
                    <p className="text-xs text-muted-foreground font-cairo">
                        {isRTL
                            ? 'التجديد يدوي — لا يوجد تجديد تلقائي في النظام الحالي'
                            : 'Renewal is manual — no auto-renewal in the current system'}
                    </p>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg border bg-background hover:bg-muted/10 font-cairo transition-colors text-sm"
                        >
                            {isRTL ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!selectedPlanId || manageSubscription.isPending}
                            className="px-5 py-2 bg-secondary text-white rounded-lg font-cairo hover:bg-secondary/90 disabled:opacity-50 flex items-center gap-2 text-sm"
                        >
                            {manageSubscription.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isRTL ? 'حفظ وتطبيق' : 'Save & Apply'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Shared Sub-components ───────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground font-cairo">
            {icon}
            <span>{title}</span>
            <div className="flex-1 h-px bg-border" />
        </div>
    )
}

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
            <p className={cn('text-sm font-bold font-cairo truncate', highlight ? 'text-red-600' : 'text-primary')}>
                {value}
            </p>
        </div>
    )
}
