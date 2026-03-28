import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
    usePlatformStaff,
    usePlatformStaffStats,
    PlatformStaff
} from '@/hooks/usePlatformManagement'
import { revokeManagedUser, upsertManagedUser, type ManagedUserRole } from '@/lib/adminUserApi'
import { usePermission } from '@/hooks/usePermission'
import {
    Users, UserPlus, Search, Shield, Edit2, Trash2, Key, Building2,
    CheckCircle2, XCircle, Clock, ArrowUpDown, Settings2, Loader2, X, AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'

const roleConfig = {
    platform_owner: { label: { ar: 'مالك المنصة', en: 'Platform Owner' }, color: 'bg-destructive/10 text-destructive', icon: Shield },
    platform_admin: { label: { ar: 'مدير المنصة', en: 'Platform Admin' }, color: 'bg-primary/10 text-primary', icon: Settings2 },
    platform_support: { label: { ar: 'الدعم الفني', en: 'Technical Support' }, color: 'bg-info/10 text-info', icon: Users },
    platform_finance: { label: { ar: 'المالية', en: 'Finance' }, color: 'bg-success/10 text-success', icon: Building2 },
    platform_hr: { label: { ar: 'الموارد البشرية', en: 'HR' }, color: 'bg-warning/10 text-warning', icon: Users },
}

export default function PlatformStaffPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { role: currentRole } = usePermission()
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedRole, setSelectedRole] = useState<string>('all')
    const [selectedStatus, setSelectedStatus] = useState<string>('all')

    // Modals state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [editingStaff, setEditingStaff] = useState<PlatformStaff | null>(null)
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [staffToDelete, setStaffToDelete] = useState<PlatformStaff | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    // Form state for add/edit
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        role: 'platform_support' as PlatformStaff['role'],
        status: 'active' as 'active' | 'inactive'
    })
    const [isSearchingUser, setIsSearchingUser] = useState(false)

    const assignableRoles = Object.entries(roleConfig).filter(([key]) => {
        if (key === 'platform_owner') {
            return false
        }

        if (currentRole === 'platform_hr') {
            return ['platform_support', 'platform_finance', 'platform_hr'].includes(key)
        }

        return true
    })

    // Hooks
    const { data: staff, isLoading, refetch: refetchStaff } = usePlatformStaff()
    const { data: stats, refetch: refetchStats } = usePlatformStaffStats()

    // Handlers
    const handleEdit = (staffMember: PlatformStaff) => {
        if (staffMember.role === 'platform_owner') {
            toast.error(isRTL ? 'لا يمكن تعديل مالك المنصة من هذه الشاشة' : 'Platform owner cannot be edited from this screen')
            return
        }

        setEditingStaff(staffMember)
        setFormData({
            email: staffMember.profile?.email || '',
            password: '',
            role: staffMember.role,
            status: staffMember.status as 'active' | 'inactive'
        })
    }

    const handleDeleteClick = (staffMember: PlatformStaff) => {
        if (staffMember.role === 'platform_owner') {
            toast.error(isRTL ? 'لا يمكن تعديل مالك المنصة من هذه الشاشة' : 'Platform owner cannot be modified from this screen')
            return
        }

        setStaffToDelete(staffMember)
        setIsDeleteModalOpen(true)
    }

    const handleConfirmDelete = async () => {
        if (!staffToDelete) return

        try {
            setIsDeleting(true)

            await revokeManagedUser({
                userId: staffToDelete.id,
                email: staffToDelete.profile?.email || undefined,
            })
            toast.success(isRTL ? 'تمت إزالة صلاحيات الموظف بنجاح' : 'Staff permissions removed successfully')
            setIsDeleteModalOpen(false)
            setStaffToDelete(null)
            refetchStaff()
            refetchStats()
        } catch (error) {
            console.error('Delete error:', error)
            toast.error(isRTL ? 'حدث خطأ أثناء إزالة الموظف' : 'Error removing staff')
        } finally {
            setIsDeleting(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSearchingUser(true)

        try {
            const cleanEmail = formData.email.trim().toLowerCase()
            const resolvedRole = formData.role as ManagedUserRole

            if (editingStaff) {
                await upsertManagedUser({
                    email: editingStaff.profile?.email || cleanEmail,
                    fullName: editingStaff.profile?.full_name || cleanEmail.split('@')[0],
                    role: resolvedRole,
                    status: formData.status,
                })

                toast.success(isRTL ? 'تم تحديث بيانات الموظف بنجاح' : 'Staff updated successfully')
                setEditingStaff(null)
                await Promise.all([refetchStaff(), refetchStats()])
                return
            }

            if (!formData.password) {
                toast.error(isRTL ? 'يرجى إدخال كلمة مرور للمستخدم الجديد' : 'Please enter a password for the new user')
                return
            }

            if (formData.password.length < 10) {
                toast.error(isRTL ? 'يجب أن تكون كلمة المرور 10 أحرف على الأقل' : 'Password must be at least 10 characters')
                return
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailRegex.test(cleanEmail)) {
                toast.error(isRTL ? 'صيغة البريد الإلكتروني غير صحيحة' : 'Invalid email format')
                return
            }

            await upsertManagedUser({
                email: cleanEmail,
                password: formData.password,
                fullName: cleanEmail.split('@')[0],
                role: resolvedRole,
                status: formData.status,
            })

            toast.success(isRTL ? 'تمت إضافة الموظف بنجاح' : 'Staff added successfully')
            setIsAddModalOpen(false)
            setFormData({ email: '', password: '', role: 'platform_support', status: 'active' })
            await Promise.all([refetchStaff(), refetchStats()])
        } catch (error) {
            console.error('Submit error:', error)
            toast.error(isRTL ? 'حدث خطأ أثناء حفظ بيانات الموظف' : 'Error saving staff data')
        } finally {
            setIsSearchingUser(false)
        }
    }
    // Filter staff
    const filteredStaff = (staff || []).filter((s) => {
        const name = s.profile?.full_name || ''
        const email = s.profile?.email || ''
        const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) || email.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesRole = selectedRole === 'all' || s.role === selectedRole
        const matchesStatus = selectedStatus === 'all' || s.status === selectedStatus
        return matchesSearch && matchesRole && matchesStatus
    })

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-secondary" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center shadow-lg shadow-secondary/20">
                        <Users className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-primary font-cairo">{isRTL ? 'فريق المنصة' : 'Platform Staff'}</h1>
                        <p className="text-muted-foreground font-cairo">{isRTL ? 'إدارة فريق المنصة وصلاحياته' : 'Manage platform team and permissions'}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => { refetchStaff(); refetchStats(); toast.success(isRTL ? 'تم تحديث القائمة' : 'List refreshed') }}
                        className="p-2.5 bg-card border hover:bg-muted/10 rounded-xl transition-all"
                        title={isRTL ? 'تحديث' : 'Refresh'}
                    >
                        <Clock className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <button
                        onClick={() => {
                            setFormData({ email: '', password: '', role: 'platform_support', status: 'active' })
                            setIsAddModalOpen(true)
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-white rounded-xl hover:bg-secondary/90 transition-all font-cairo"
                    >
                        <UserPlus className="w-5 h-5" />
                        {isRTL ? 'إضافة موظف' : 'Add Staff'}
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatsCard title={isRTL ? 'إجمالي الموظفين' : 'Total Staff'} value={stats?.total || 0} icon={Users} color="info" />
                <StatsCard title={isRTL ? 'نشط' : 'Active'} value={stats?.active || 0} icon={CheckCircle2} color="success" />
                <StatsCard title={isRTL ? 'غير نشط' : 'Inactive'} value={stats?.inactive || 0} icon={XCircle} color="destructive" />
                <StatsCard title={isRTL ? 'الأدوار' : 'Roles'} value={Object.keys(stats?.byRole || {}).length} icon={Key} color="warning" />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input type="text" placeholder={isRTL ? 'ابحث بالاسم أو البريد الإلكتروني...' : 'Search by name or email...'} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full ps-10 pe-4 py-2.5 bg-card border rounded-xl placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo" />
                </div>
                <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="px-4 py-2.5 bg-card border rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo">
                    <option value="all">{isRTL ? 'كل الأدوار' : 'All Roles'}</option>
                    {Object.entries(roleConfig).map(([key, config]) => (
                        <option key={key} value={key}>{isRTL ? config.label.ar : config.label.en}</option>
                    ))}
                </select>
                <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="px-4 py-2.5 bg-card border rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo">
                    <option value="all">{isRTL ? 'كل الحالات' : 'All Status'}</option>
                    <option value="active">{isRTL ? 'نشط' : 'Active'}</option>
                    <option value="inactive">{isRTL ? 'غير نشط' : 'Inactive'}</option>
                </select>
            </div>

            {/* Staff Table */}
            <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b bg-muted/5">
                                <th className="text-start p-4 text-muted-foreground font-medium font-cairo"><div className="flex items-center gap-2">{isRTL ? 'الموظف' : 'Staff'}<ArrowUpDown className="w-4 h-4" /></div></th>
                                <th className="text-start p-4 text-muted-foreground font-medium font-cairo">{isRTL ? 'الدور' : 'Role'}</th>
                                <th className="text-start p-4 text-muted-foreground font-medium font-cairo">{isRTL ? 'وصول المنشآت' : 'Tenants Access'}</th>
                                <th className="text-start p-4 text-muted-foreground font-medium font-cairo">{isRTL ? 'الحالة' : 'Status'}</th>
                                <th className="text-start p-4 text-muted-foreground font-medium font-cairo">{isRTL ? 'آخر نشاط' : 'Last Activity'}</th>
                                <th className="text-start p-4 text-muted-foreground font-medium font-cairo">{isRTL ? 'الإجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStaff.map((member) => {
                                const role = roleConfig[member.role as keyof typeof roleConfig]
                                const RoleIcon = role?.icon || Users
                                return (
                                    <tr key={member.id} className="border-b last:border-0 hover:bg-muted/5 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold">
                                                    {(member.profile?.full_name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium font-cairo">{member.profile?.full_name || 'Unknown'}</p>
                                                    <p className="text-muted-foreground text-sm">{member.profile?.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-cairo', role?.color)}>
                                                <RoleIcon className="w-4 h-4" />
                                                {isRTL ? role?.label.ar : role?.label.en}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2 text-muted-foreground font-cairo">
                                                <Building2 className="w-4 h-4" />
                                                {member.tenants_access === 'all' ? (
                                                    <span className="text-success">{isRTL ? 'جميع المنشآت' : 'All Tenants'}</span>
                                                ) : (
                                                    <span>{member.assigned_tenants?.length || 0} {isRTL ? 'منشآت' : 'tenants'}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                                                member.status === 'active' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
                                                {member.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                                {member.status === 'active' ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                                <Clock className="w-4 h-4" />
                                                {member.profile?.last_activity_at ? new Date(member.profile.last_activity_at).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US') : '-'}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleEdit(member)}
                                                    disabled={member.role === 'platform_owner'}
                                                    className={cn(
                                                        'p-2 rounded-lg transition-colors',
                                                        member.role === 'platform_owner'
                                                            ? 'cursor-not-allowed opacity-40 text-muted-foreground'
                                                            : 'hover:bg-muted/10 text-muted-foreground hover:text-primary'
                                                    )}
                                                    title={isRTL ? 'تعديل' : 'Edit'}
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(member)}
                                                    disabled={member.role === 'platform_owner'}
                                                    className={cn(
                                                        'p-2 rounded-lg transition-colors',
                                                        member.role === 'platform_owner'
                                                            ? 'cursor-not-allowed opacity-40 text-muted-foreground'
                                                            : 'hover:bg-destructive/10 text-destructive'
                                                    )}
                                                    title={isRTL ? 'حذف' : 'Delete'}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredStaff.length === 0 && (
                    <div className="p-12 text-center">
                        <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                        <p className="text-muted-foreground font-cairo">{isRTL ? 'لا يوجد موظفون' : 'No staff members found'}</p>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {(isAddModalOpen || editingStaff) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-card border rounded-2xl w-full max-w-md shadow-xl animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h2 className="text-xl font-bold font-cairo">
                                {editingStaff
                                    ? (isRTL ? 'تعديل موظف' : 'Edit Staff')
                                    : (isRTL ? 'إضافة موظف جديد' : 'Add New Staff')
                                }
                            </h2>
                            <button
                                onClick={() => { setIsAddModalOpen(false); setEditingStaff(null); }}
                                className="text-muted-foreground hover:text-primary transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {!editingStaff && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium font-cairo">
                                            {isRTL ? 'البريد الإلكتروني' : 'Email Address'}
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            placeholder="name@example.com"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary/20"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium font-cairo">
                                            {isRTL ? 'كلمة المرور (للمستخدمين الجدد)' : 'Password (for new users)'}
                                        </label>
                                        <input
                                            type="password"
                                            placeholder="********"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary/20"
                                        />
                                        <p className="text-xs text-muted-foreground font-cairo">
                                            {isRTL
                                                ? 'اتركها فارغة إذا كان المستخدم مسجلًا بالفعل'
                                                : 'Leave empty if the user is already registered'
                                            }
                                        </p>
                                    </div>
                                </>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium font-cairo">
                                    {isRTL ? 'الدور' : 'Role'}
                                </label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                                    className="w-full px-4 py-2.5 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo"
                                >
                                    {assignableRoles.map(([key, config]) => (
                                        <option key={key} value={key}>
                                            {isRTL ? config.label.ar : config.label.en}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium font-cairo">
                                    {isRTL ? 'الحالة' : 'Status'}
                                </label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                    className="w-full px-4 py-2.5 bg-background border rounded-xl focus:outline-none focus:ring-2 focus:ring-secondary/20 font-cairo"
                                >
                                    <option value="active">{isRTL ? 'نشط' : 'Active'}</option>
                                    <option value="inactive">{isRTL ? 'غير نشط' : 'Inactive'}</option>
                                </select>
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setIsAddModalOpen(false); setEditingStaff(null); }}
                                    className="px-4 py-2 bg-muted/10 rounded-xl hover:bg-muted/20 transition-colors font-cairo"
                                >
                                    {isRTL ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSearchingUser}
                                    className="px-6 py-2 bg-secondary text-white rounded-xl hover:bg-secondary/90 transition-all font-cairo disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSearchingUser && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isRTL ? 'حفظ التغييرات' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-card border rounded-2xl w-full max-w-sm shadow-xl animate-in fade-in zoom-in-95">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                                <AlertTriangle className="w-6 h-6 text-destructive" />
                            </div>
                            <h3 className="text-lg font-bold font-cairo">
                                {isRTL ? 'هل أنت متأكد؟' : 'Are you sure?'}
                            </h3>
                            <p className="text-muted-foreground font-cairo">
                                {isRTL
                                    ? 'سيتم إزالة صلاحيات هذا الموظف من المنصة. لا يمكن التراجع عن هذا الإجراء.'
                                    : 'This will remove the staff permissions from the platform. This action cannot be undone.'
                                }
                            </p>
                            <div className="flex gap-3 justify-center pt-2">
                                <button
                                    onClick={() => { setIsDeleteModalOpen(false); setStaffToDelete(null); }}
                                    className="px-4 py-2 bg-muted/10 rounded-xl hover:bg-muted/20 transition-colors font-cairo"
                                >
                                    {isRTL ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    onClick={handleConfirmDelete}
                                    disabled={isDeleting}
                                    className="px-4 py-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl hover:bg-destructive/20 transition-colors font-cairo flex items-center gap-2"
                                >
                                    {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isRTL ? 'تأكيد الحذف' : 'Confirm Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Roles Overview */}
            <div className="bg-card border rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-primary font-cairo mb-4 flex items-center gap-2">
                    <Key className="w-5 h-5 text-secondary" />
                    {isRTL ? 'نظرة عامة على الأدوار' : 'Roles Overview'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Object.entries(roleConfig).map(([key, config]) => {
                        const count = stats?.byRole?.[key] || 0
                        const RoleIcon = config.icon
                        return (
                            <div key={key} className={cn('p-4 rounded-xl border bg-card', config.color.replace('text-', 'border-').split(' ')[2] || 'border-border')}>
                                <div className="flex items-center gap-3">
                                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', config.color.split(' ')[0])}>
                                        <RoleIcon className={cn('w-5 h-5', config.color.split(' ')[1])} />
                                    </div>
                                    <div>
                                        <p className="font-medium font-cairo">{isRTL ? config.label.ar : config.label.en}</p>
                                        <p className="text-muted-foreground text-sm">{count} {isRTL ? 'موظف' : 'staff'}</p>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

function StatsCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: React.ElementType; color: 'info' | 'success' | 'destructive' | 'warning' | 'blue' | 'green' | 'red' | 'purple' }) {
    // Map legacy colors to new semantic colors if needed
    const mapColor = (c: string) => {
        if (c === 'blue') return 'info';
        if (c === 'green') return 'success';
        if (c === 'red') return 'destructive';
        if (c === 'purple') return 'warning';
        return c;
    }

    const finalColor = mapColor(color);

    const colorClasses: Record<string, string> = {
        info: 'bg-info/10 text-info',
        success: 'bg-success/10 text-success',
        destructive: 'bg-destructive/10 text-destructive',
        warning: 'bg-warning/10 text-warning',
    }

    return (
        <div className="bg-card rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-3">
                <div className={cn("p-3 rounded-lg", colorClasses[finalColor] || colorClasses.info)}>
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
