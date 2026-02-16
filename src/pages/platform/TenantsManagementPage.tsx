import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useTenant } from '@/contexts/TenantContext'
import {
    useTenants,
    useTenantStats,
    useCreateTenant,
    useUpdateTenant,
    useToggleTenantStatus,
    Tenant,
    CreateTenantInput
} from '@/hooks/useTenants'
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans'
import { useUpdateSubscription } from '@/hooks/useSubscription'
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
    CreditCard
} from 'lucide-react'

export default function TenantsManagementPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { switchTenant } = useTenant()

    const { data: tenants, isLoading } = useTenants()
    const { data: stats } = useTenantStats()
    const createTenant = useCreateTenant()
    const updateTenant = useUpdateTenant()
    const toggleStatus = useToggleTenantStatus()

    // Enter tenant dashboard
    const handleEnterTenant = async (tenant: Tenant) => {
        await switchTenant(tenant.id)
        window.location.href = '/dashboard'
    }

    const [search, setSearch] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)

    // Form state
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

    // Filter tenants
    const filteredTenants = tenants?.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.slug.toLowerCase().includes(search.toLowerCase()) ||
        t.email?.toLowerCase().includes(search.toLowerCase())
    )

    // Handle form submit
    const handleSubmit = async () => {
        console.log('📝 Starting tenant creation/update...', formData)
        try {
            if (editingTenant) {
                console.log('📝 Updating tenant:', editingTenant.id)
                await updateTenant.mutateAsync({ id: editingTenant.id, ...formData })
                toast.success(isRTL ? 'تم تحديث المنشأة بنجاح' : 'Tenant updated successfully')
            } else {
                console.log('📝 Creating new tenant...')
                const result = await createTenant.mutateAsync(formData)
                console.log('✅ Tenant created:', result)
                toast.success(isRTL ? 'تم إنشاء المنشأة بنجاح' : 'Tenant created successfully')
            }
            setShowModal(false)
            resetForm()
        } catch (error: unknown) {
            console.error('❌ Tenant operation failed:', error)
            const err = error as Error & { message?: string; details?: string }
            const errorMsg = err?.message || err?.details || 'Unknown error'
            toast.error(isRTL ? `حدث خطأ: ${errorMsg}` : `Error: ${errorMsg}`)
        }
    }

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

    const openEditModal = (tenant: Tenant) => {
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

    const handleToggleStatus = async (tenant: Tenant) => {
        try {
            await toggleStatus.mutateAsync({ id: tenant.id, is_active: !tenant.is_active })
            toast.success(
                tenant.is_active
                    ? (isRTL ? 'تم تعطيل المنشأة' : 'Tenant disabled')
                    : (isRTL ? 'تم تفعيل المنشأة' : 'Tenant enabled')
            )
        } catch (error) {
            toast.error(isRTL ? 'حدث خطأ' : 'An error occurred')
        }
    }

    // Show loading while data is fetching
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

    // Note: Access control is handled by PlatformLayout

    return (
        <div className="space-y-8 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo flex items-center gap-3">
                        <Building2 className="w-7 h-7 text-secondary" />
                        {isRTL ? 'إدارة المنشآت' : 'Tenants Management'}
                    </h1>
                    <p className="text-muted font-cairo">
                        {isRTL ? 'إدارة وتنظيم المنشآت المشتركة في المنصة' : 'Manage platform tenants and organizations'}
                    </p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowModal(true) }}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl font-cairo hover:bg-secondary/90 transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    {isRTL ? 'إضافة منشأة' : 'Add Tenant'}
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    title={isRTL ? 'إجمالي المنشآت' : 'Total Tenants'}
                    value={stats?.total || 0}
                    icon={Building2}
                    color="info"
                />
                <StatCard
                    title={isRTL ? 'نشطة' : 'Active'}
                    value={stats?.active || 0}
                    icon={CheckCircle2}
                    color="success"
                />
                <StatCard
                    title={isRTL ? 'معطلة' : 'Inactive'}
                    value={stats?.inactive || 0}
                    icon={XCircle}
                    color="destructive"
                />
                <StatCard
                    title={isRTL ? 'مؤسسية' : 'Enterprise'}
                    value={stats?.byTier?.enterprise || 0}
                    icon={Crown}
                    color="warning"
                />
            </div>

            {/* Search */}
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

            {/* Tenants Table */}
            <div className="bg-card rounded-xl border shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-muted/5 border-b">
                            <tr>
                                <th className="px-4 py-3 text-start font-cairo font-medium text-muted-foreground">
                                    {isRTL ? 'المنشأة' : 'Tenant'}
                                </th>
                                <th className="px-4 py-3 text-start font-cairo font-medium text-muted-foreground hidden md:table-cell">
                                    {isRTL ? 'التواصل' : 'Contact'}
                                </th>
                                <th className="px-4 py-3 text-start font-cairo font-medium text-muted-foreground hidden lg:table-cell">
                                    {isRTL ? 'الموقع' : 'Location'}
                                </th>
                                <th className="px-4 py-3 text-center font-cairo font-medium text-muted-foreground">
                                    {isRTL ? 'الباقة' : 'Tier'}
                                </th>
                                <th className="px-4 py-3 text-center font-cairo font-medium text-muted-foreground">
                                    {isRTL ? 'الحالة' : 'Status'}
                                </th>
                                <th className="px-4 py-3 text-center font-cairo font-medium text-muted-foreground">
                                    {isRTL ? 'إجراءات' : 'Actions'}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTenants?.map((tenant) => (
                                <TenantRow
                                    key={tenant.id}
                                    tenant={tenant}
                                    isRTL={isRTL}
                                    onEdit={() => openEditModal(tenant)}
                                    onToggleStatus={() => handleToggleStatus(tenant)}
                                    onEnter={() => handleEnterTenant(tenant)}
                                    onManageSubscription={() => {
                                        setEditingTenant(tenant)
                                        setShowSubscriptionModal(true)
                                    }}
                                />
                            ))}
                            {filteredTenants?.length === 0 && (
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

            {/* Manage Subscription Modal */}
            {showSubscriptionModal && editingTenant && (
                <ManageSubscriptionModal
                    tenant={editingTenant}
                    isRTL={isRTL}
                    onClose={() => {
                        setShowSubscriptionModal(false)
                        setEditingTenant(null)
                    }}
                />
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-card rounded-xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="font-bold font-cairo text-lg">
                                {editingTenant
                                    ? (isRTL ? 'تعديل المنشأة' : 'Edit Tenant')
                                    : (isRTL ? 'إضافة منشأة جديدة' : 'Add New Tenant')
                                }
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-muted/10 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                        {isRTL ? 'المعرف الفريد' : 'Slug'} *
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.slug}
                                        onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-mono"
                                        placeholder="tenant-name"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                        {isRTL ? 'الحالة' : 'Status'}
                                    </label>
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
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                    {isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'} *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                    {isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}
                                </label>
                                <input
                                    type="text"
                                    value={formData.name_ar || ''}
                                    onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                                    className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                    dir="rtl"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                        {isRTL ? 'البريد' : 'Email'}
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email || ''}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                        {isRTL ? 'الهاتف' : 'Phone'}
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.phone || ''}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                    {isRTL ? 'العنوان' : 'Address'}
                                </label>
                                <input
                                    className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                />
                            </div>

                            {/* Admin User Section - Only for new tenants */}
                            {!editingTenant && (
                                <div className="p-4 bg-muted/5 rounded-lg border space-y-4">
                                    <h4 className="font-bold flex items-center gap-2 font-cairo text-sm text-primary">
                                        <Crown className="w-4 h-4 text-secondary" />
                                        {isRTL ? 'بيانات مدير المنشأة' : 'Tenant Admin Details'}
                                    </h4>

                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                            {isRTL ? 'اسم المدير' : 'Admin Name'}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.admin_name || ''}
                                            onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
                                            className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                            placeholder={isRTL ? 'الاسم الكامل' : 'Full Name'}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                                {isRTL ? 'بريد المدير' : 'Admin Email'}
                                            </label>
                                            <input
                                                type="email"
                                                value={formData.admin_email || ''}
                                                onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                                                className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                                placeholder="admin@company.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                                {isRTL ? 'كلمة المرور' : 'Password'}
                                            </label>
                                            <input
                                                type="password"
                                                value={formData.admin_password || ''}
                                                onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
                                                className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                                placeholder="******"
                                            />
                                        </div>
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
                                    : (isRTL ? 'إضافة' : 'Add')
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// Stat Card Component
function StatCard({ title, value, icon: Icon, color }: {
    title: string
    value: number
    icon: React.ElementType
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
                <div className={cn("p-3 rounded-lg", colorClasses[color])}>
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

// TenantRow Component
function TenantRow({
    tenant,
    isRTL,
    onEdit,
    onToggleStatus,
    onEnter,
    onManageSubscription
}: {
    tenant: Tenant
    isRTL: boolean
    onEdit: () => void
    onToggleStatus: () => void
    onEnter: () => void
    onManageSubscription: () => void
}) {
    // Map subscription_status to display info
    const statusInfo: Record<string, { label: string, labelAr: string, color: string }> = {
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
                        <p className="font-medium font-cairo">
                            {isRTL ? (tenant.name_ar || tenant.name) : tenant.name}
                        </p>
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
                <span className={cn("px-2 py-1 rounded-full text-xs font-medium", status.color, "text-white")}>
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
                    {/* Enter Tenant Button */}
                    <button
                        onClick={onEnter}
                        className="p-2 hover:bg-secondary/10 rounded-lg transition-colors"
                        title={isRTL ? 'الدخول للمنشأة' : 'Enter Tenant'}
                    >
                        <ExternalLink className="w-4 h-4 text-secondary" />
                    </button>
                    {/* Manage Subscription Button */}
                    <button
                        onClick={onManageSubscription}
                        className="p-2 hover:bg-warning/10 rounded-lg transition-colors"
                        title={isRTL ? 'إدارة الاشتراك' : 'Manage Subscription'}
                    >
                        <CreditCard className="w-4 h-4 text-warning" />
                    </button>
                    <button
                        onClick={onEdit}
                        className="p-2 hover:bg-muted/10 rounded-lg transition-colors"
                        title={isRTL ? 'تعديل' : 'Edit'}
                    >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                    </button>
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
                </div>
            </td>
        </tr>
    )
}

// Manage Subscription Modal
function ManageSubscriptionModal({
    tenant,
    isRTL,
    onClose
}: {
    tenant: Tenant
    isRTL: boolean
    onClose: () => void
}) {
    const { data: plans } = useSubscriptionPlans()
    const updateSubscription = useUpdateSubscription()

    // State
    const [selectedPlanId, setSelectedPlanId] = useState<string>('')
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

    const handleSave = async () => {
        if (!selectedPlanId) return

        try {
            await updateSubscription.mutateAsync({
                tenantId: tenant.id,
                planId: selectedPlanId,
                billingCycle
            })
            toast.success(isRTL ? 'تم تحديث الاشتراك بنجاح' : 'Subscription updated successfully')
            onClose()
        } catch (error: any) {
            toast.error(error.message || (isRTL ? 'فشل تحديث الاشتراك' : 'Failed to update subscription'))
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-xl border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b">
                    <h3 className="font-bold font-cairo text-lg flex items-center gap-2">
                        <Crown className="w-5 h-5 text-warning" />
                        {isRTL ? 'إدارة اشتراك المنشأة' : 'Manage Tenant Subscription'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-muted/10 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Tenant Info */}
                    <div className="bg-muted/10 p-4 rounded-lg flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-secondary" />
                        </div>
                        <div>
                            <p className="font-bold font-cairo">{isRTL ? tenant.name_ar || tenant.name : tenant.name}</p>
                            <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                        </div>
                    </div>

                    {/* Plan Selection */}
                    <div>
                        <label className="block text-sm font-medium font-cairo mb-2">
                            {isRTL ? 'اختر الباقة' : 'Select Plan'}
                        </label>
                        <div className="grid gap-3">
                            {plans?.map(plan => (
                                <div
                                    key={plan.id}
                                    onClick={() => setSelectedPlanId(plan.id)}
                                    className={cn(
                                        "cursor-pointer border rounded-xl p-4 transition-all hover:border-secondary/50",
                                        selectedPlanId === plan.id ? "border-secondary bg-secondary/5 ring-1 ring-secondary" : "bg-card"
                                    )}
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-4 h-4 rounded-full border flex items-center justify-center",
                                                selectedPlanId === plan.id ? "border-secondary" : "border-muted"
                                            )}>
                                                {selectedPlanId === plan.id && <div className="w-2 h-2 rounded-full bg-secondary" />}
                                            </div>
                                            <div>
                                                <p className="font-bold font-cairo">{isRTL ? plan.name_ar : plan.name}</p>
                                                <p className="text-xs text-muted-foreground font-cairo">{isRTL ? plan.description_ar : plan.description}</p>
                                            </div>
                                        </div>
                                        <div className="text-end">
                                            <p className="font-bold">
                                                {billingCycle === 'monthly' ? plan.price_monthly : plan.price_yearly}
                                                <span className="text-xs font-normal text-muted-foreground"> {plan.currency}</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Billing Cycle */}
                    <div>
                        <label className="block text-sm font-medium font-cairo mb-2">
                            {isRTL ? 'دورة الفوترة' : 'Billing Cycle'}
                        </label>
                        <div className="flex p-1 bg-muted/10 rounded-lg border">
                            <button
                                onClick={() => setBillingCycle('monthly')}
                                className={cn(
                                    "flex-1 py-1.5 text-sm font-medium rounded-md transition-all font-cairo",
                                    billingCycle === 'monthly' ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-primary"
                                )}
                            >
                                {isRTL ? 'شهري' : 'Monthly'}
                            </button>
                            <button
                                onClick={() => setBillingCycle('yearly')}
                                className={cn(
                                    "flex-1 py-1.5 text-sm font-medium rounded-md transition-all font-cairo",
                                    billingCycle === 'yearly' ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-primary"
                                )}
                            >
                                {isRTL ? 'سنوي (خصم)' : 'Yearly'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 p-6 border-t bg-muted/5">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border bg-background hover:bg-muted/10 font-cairo transition-colors"
                    >
                        {isRTL ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!selectedPlanId || updateSubscription.isPending}
                        className="px-6 py-2 bg-secondary text-white rounded-lg font-cairo hover:bg-secondary/90 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isRTL ? 'حفظ وتحديث' : 'Save & Update'}
                    </button>
                </div>
            </div>
        </div>
    )
}
