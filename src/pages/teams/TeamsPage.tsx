import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
    useTeamMembers,
    useTeamStats,
    useUpdateTeamMember,
    useCreateTeamMember,
    TeamMember,
    AVAILABLE_ROLES,
    TENANT_ROLES
} from '@/hooks/useTeams'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { useTenantSubscription, useTenantUsage } from '@/hooks/useSubscription'
import { usePermission } from '@/hooks/usePermission'
import { useAuth } from '@/contexts/AuthContext'
import {
    Users,
    UserCheck,
    UserX,
    Search,
    Shield,
    Wrench,
    HardHat,
    Building2,
    Mail,
    ChevronDown,
    Check,
    MoreVertical,
    UserCog,
    AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'

// Role Icons Map
const roleIcons: Record<string, React.ElementType> = {
    platform_owner: Shield,
    platform_admin: Shield,
    tenant_admin: Building2,
    facility_manager: Building2,
    maintenance_manager: Wrench,
    engineer: HardHat,
    supervisor: UserCog,
    technician: Wrench,
    reporter: Users,
}

// Role Colors
const roleColors: Record<string, string> = {
    platform_owner: 'bg-destructive/10 text-destructive border-destructive/20',
    platform_admin: 'bg-destructive/10 text-destructive border-destructive/20',
    tenant_admin: 'bg-warning/10 text-warning border-warning/20',
    facility_manager: 'bg-warning/10 text-warning border-warning/20',
    maintenance_manager: 'bg-info/10 text-info border-info/20',
    engineer: 'bg-info/10 text-info border-info/20',
    supervisor: 'bg-success/10 text-success border-success/20',
    technician: 'bg-success/10 text-success border-success/20',
    reporter: 'bg-muted/10 text-muted-foreground border-muted/20',
}

export default function TeamsPage() {
    const { t, i18n } = useTranslation()
    const { user } = useAuth()
    const isRTL = i18n.language === 'ar'

    // Feature Flags
    const { can } = usePermission()
    const canManage = can('users.manage')
    const isUserManagementEnabled = useFeatureEnabled('employees', 'user_management')
    const isRoleAssignmentEnabled = useFeatureEnabled('employees', 'role_assignment')

    const [searchQuery, setSearchQuery] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('all')

    // Fetch data
    const { data: members, isLoading } = useTeamMembers()
    const { data: stats } = useTeamStats()
    const updateMember = useUpdateTeamMember()

    // Filter members
    const filteredMembers = members?.filter(member => {
        const matchesSearch =
            member.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            member.full_name_ar?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            member.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            member.employee_number?.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesRole = roleFilter === 'all' || member.role === roleFilter

        return matchesSearch && matchesRole
    }) || []

    // Handle Role Change
    const handleRoleChange = async (memberId: string, newRole: string) => {
        try {
            await updateMember.mutateAsync({ id: memberId, role: newRole })
            toast.success(isRTL ? 'تم تحديث الدور بنجاح' : 'Role updated successfully')
        } catch (error) {
            toast.error(isRTL ? 'فشل تحديث الدور' : 'Failed to update role')
        }
    }

    // Handle Status Toggle
    const handleStatusToggle = async (memberId: string, currentStatus: boolean) => {
        try {
            await updateMember.mutateAsync({ id: memberId, is_active: !currentStatus })
            toast.success(isRTL ? 'تم تحديث الحالة' : 'Status updated')
        } catch (error) {
            toast.error(isRTL ? 'فشل تحديث الحالة' : 'Failed to update status')
        }
    }

    const [showAddModal, setShowAddModal] = useState(false)
    const [newMemberData, setNewMemberData] = useState({
        email: '',
        full_name: '',
        role: 'technician',
        password: '',
        department: '',
        job_title: ''
    })

    const createMember = useCreateTeamMember()
    const { data: subscription } = useTenantSubscription(user?.user_metadata?.tenant_id || '')
    const { data: usage } = useTenantUsage(user?.user_metadata?.tenant_id || '')

    const handleCreateMember = async () => {
        // Check Subscription Limits
        if (subscription?.plan && usage) {
            const maxUsers = subscription.plan.max_users
            if (maxUsers !== -1 && usage.users_count >= maxUsers) {
                toast.error(isRTL
                    ? `عذراً، لقد استهلكت حد المستخدمين المسموح به في باقتك (${maxUsers})`
                    : `Sorry, you have reached the user limit for your plan (${maxUsers})`
                )
                return
            }
        }

        try {
            await createMember.mutateAsync(newMemberData)
            toast.success(isRTL ? 'تم إضافة الموظف بنجاح' : 'Employee added successfully')
            setShowAddModal(false)
            setNewMemberData({
                email: '',
                full_name: '',
                role: 'technician',
                password: '',
                department: '',
                job_title: ''
            })
        } catch (error: any) {
            toast.error(isRTL ? `فشل إضافة الموظف: ${error.message}` : `Failed to add employee: ${error.message}`)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted">{t('common.loading')}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo">
                        {isRTL ? 'إدارة الموظفين' : 'Employee Management'}
                    </h1>
                    <p className="text-muted font-cairo">
                        {isRTL
                            ? 'إدارة حسابات الموظفين والأدوار والصلاحيات'
                            : 'Manage employee accounts, roles and permissions'
                        }
                    </p>
                </div>
                {/* Add Employee Button */}
                {isUserManagementEnabled && canManage && (
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl font-cairo hover:bg-secondary/90 transition-colors"
                    >
                        <Users className="w-5 h-5" />
                        {isRTL ? 'إضافة موظف' : 'Add Employee'}
                    </button>
                )}
            </div>

            {/* Feature Warnings */}
            {(!isUserManagementEnabled || !isRoleAssignmentEnabled) && (
                <div className="grid gap-2">
                    {!isUserManagementEnabled && (
                        <div className="flex items-center gap-3 p-3 bg-warning/10 border border-warning/20 rounded-lg text-warning">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <p className="font-cairo text-sm">
                                {isRTL
                                    ? 'تم تعطيل إدارة المستخدمين (إضافة/حذف).'
                                    : 'User management (add/remove) is disabled.'}
                            </p>
                        </div>
                    )}
                    {!isRoleAssignmentEnabled && (
                        <div className="flex items-center gap-3 p-3 bg-warning/10 border border-warning/20 rounded-lg text-warning">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <p className="font-cairo text-sm">
                                {isRTL
                                    ? 'تم تعطيل تعيين الأدوار.'
                                    : 'Role assignment is disabled.'}
                            </p>
                        </div>
                    )}
                </div>
            )
            }

            {/* Stats Cards */}
            {
                stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <StatCard
                            title={isRTL ? 'إجمالي الموظفين' : 'Total Employees'}
                            value={stats.total}
                            icon={Users}
                            color="secondary"
                        />
                        <StatCard
                            title={isRTL ? 'نشط' : 'Active'}
                            value={stats.active}
                            icon={UserCheck}
                            color="success"
                        />
                        <StatCard
                            title={isRTL ? 'الفنيين' : 'Technicians'}
                            value={stats.byRole['technician'] || 0}
                            icon={Wrench}
                            color="info"
                        />
                        <StatCard
                            title={isRTL ? 'المشرفين' : 'Supervisors'}
                            value={stats.byRole['supervisor'] || 0}
                            icon={UserCog}
                            color="warning"
                        />
                    </div>
                )
            }

            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className={cn(
                        'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-muted',
                        isRTL ? 'right-4' : 'left-4'
                    )} />
                    <input
                        type="text"
                        placeholder={isRTL ? 'البحث عن موظف...' : 'Search employees...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={cn(
                            'w-full py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none font-cairo',
                            isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'
                        )}
                    />
                </div>

                {/* Role Filter */}
                <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="px-4 py-3 bg-card border border-border rounded-xl font-cairo text-sm focus:ring-2 focus:ring-secondary/20"
                >
                    <option value="all">{isRTL ? 'جميع الأدوار' : 'All Roles'}</option>
                    {AVAILABLE_ROLES.map(role => (
                        <option key={role.value} value={role.value}>
                            {isRTL ? role.label_ar : role.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Members Table */}
            <div className="bg-card rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-muted/5 border-b">
                            <tr>
                                <th className="text-start p-4 font-cairo font-medium text-sm text-muted-foreground">
                                    {isRTL ? 'الموظف' : 'Employee'}
                                </th>
                                <th className="text-start p-4 font-cairo font-medium text-sm text-muted-foreground">
                                    {isRTL ? 'الدور' : 'Role'}
                                </th>
                                <th className="text-start p-4 font-cairo font-medium text-sm text-muted-foreground">
                                    {isRTL ? 'القسم' : 'Department'}
                                </th>
                                <th className="text-start p-4 font-cairo font-medium text-sm text-muted-foreground">
                                    {isRTL ? 'الحالة' : 'Status'}
                                </th>
                                <th className="text-start p-4 font-cairo font-medium text-sm text-muted-foreground">
                                    {isRTL ? 'الإجراءات' : 'Actions'}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredMembers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-muted font-cairo">
                                        {isRTL ? 'لا يوجد موظفين' : 'No employees found'}
                                    </td>
                                </tr>
                            ) : (
                                filteredMembers.map(member => (
                                    <MemberRow
                                        key={member.id}
                                        member={member}
                                        isRTL={isRTL}
                                        onRoleChange={handleRoleChange}
                                        onStatusToggle={handleStatusToggle}
                                        isUpdating={updateMember.isPending}
                                        canManage={canManage}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Member Modal */}
            {
                showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-card rounded-xl border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between p-4 border-b">
                                <h3 className="font-bold font-cairo text-lg">
                                    {isRTL ? 'إضافة موظف جديد' : 'Add New Employee'}
                                </h3>
                                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-muted/10 rounded-lg">
                                    <UserX className="w-5 h-5" /> {/* Using UserX as close icon temporarily if X not imported */}
                                </button>
                            </div>

                            <div className="p-4 space-y-4">
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                        {isRTL ? 'الاسم الكامل' : 'Full Name'} *
                                    </label>
                                    <input
                                        type="text"
                                        value={newMemberData.full_name}
                                        onChange={(e) => setNewMemberData({ ...newMemberData, full_name: e.target.value })}
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                            {isRTL ? 'البريد الإلكتروني' : 'Email'} *
                                        </label>
                                        <input
                                            type="email"
                                            value={newMemberData.email}
                                            onChange={(e) => setNewMemberData({ ...newMemberData, email: e.target.value })}
                                            className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                            {isRTL ? 'كلمة المرور' : 'Password'} *
                                        </label>
                                        <input
                                            type="password"
                                            value={newMemberData.password}
                                            onChange={(e) => setNewMemberData({ ...newMemberData, password: e.target.value })}
                                            placeholder="Min 6 chars"
                                            className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                        {isRTL ? 'الدور الوظيفي' : 'Role'} *
                                    </label>
                                    <select
                                        value={newMemberData.role}
                                        onChange={(e) => setNewMemberData({ ...newMemberData, role: e.target.value })}
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                    >
                                        {TENANT_ROLES.map(role => (
                                            <option key={role.value} value={role.value}>
                                                {isRTL ? role.label_ar : role.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                            {isRTL ? 'القسم' : 'Department'}
                                        </label>
                                        <input
                                            type="text"
                                            value={newMemberData.department}
                                            onChange={(e) => setNewMemberData({ ...newMemberData, department: e.target.value })}
                                            className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                            {isRTL ? 'المسمى الوظيفي' : 'Job Title'}
                                        </label>
                                        <input
                                            type="text"
                                            value={newMemberData.job_title}
                                            onChange={(e) => setNewMemberData({ ...newMemberData, job_title: e.target.value })}
                                            className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 p-4 border-t">
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 rounded-lg border hover:bg-muted/10 font-cairo"
                                >
                                    {isRTL ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    onClick={handleCreateMember}
                                    disabled={createMember.isPending || !newMemberData.email || !newMemberData.full_name || !newMemberData.password}
                                    className="px-4 py-2 bg-secondary text-white rounded-lg font-cairo hover:bg-secondary/90 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {createMember.isPending && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    {isRTL ? 'إضافة' : 'Add'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}

// Member Row Component
function MemberRow({
    member,
    isRTL,
    onRoleChange,
    onStatusToggle,
    isUpdating,
    canManage
}: {
    member: TeamMember
    isRTL: boolean
    onRoleChange: (id: string, role: string) => void
    onStatusToggle: (id: string, current: boolean) => void
    isUpdating: boolean
    canManage: boolean
}) {
    const [showRoleDropdown, setShowRoleDropdown] = useState(false)

    // Feature Checks
    const isUserManagementEnabled = useFeatureEnabled('employees', 'user_management')
    const isRoleAssignmentEnabled = useFeatureEnabled('employees', 'role_assignment')

    const displayName = isRTL ? (member.full_name_ar || member.full_name) : member.full_name
    const roleConfig = AVAILABLE_ROLES.find(r => r.value === member.role)
    const RoleIcon = roleIcons[member.role] || Users

    return (
        <tr className="hover:bg-muted/5 transition-colors">
            {/* Member Info */}
            <td className="p-4">
                <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {displayName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                        <p className="font-medium text-primary font-cairo">{displayName || '-'}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Mail className="w-3 h-3" />
                            <span className="font-inter">{member.email || '-'}</span>
                        </div>
                    </div>
                </div>
            </td>

            {/* Role */}
            <td className="p-4">
                <div className="relative">
                    <button
                        onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                        disabled={isUpdating || !isRoleAssignmentEnabled || !canManage}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-cairo transition-colors",
                            roleColors[member.role] || 'bg-muted/10',
                            (isUpdating || !isRoleAssignmentEnabled || !canManage) ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"
                        )}
                        title={(!isRoleAssignmentEnabled || !canManage) ? (isRTL ? "تم تعطيل تعيين الأدوار" : "Role assignment disabled") : ""}
                    >
                        <RoleIcon className="w-4 h-4" />
                        <span>{isRTL ? roleConfig?.label_ar : roleConfig?.label}</span>
                        {isRoleAssignmentEnabled && canManage && <ChevronDown className="w-3 h-3" />}
                    </button>

                    {/* Role Dropdown */}
                    {showRoleDropdown && isRoleAssignmentEnabled && canManage && (
                        <div className="absolute top-full mt-1 z-50 bg-card border rounded-lg shadow-lg min-w-[180px] py-1">
                            {AVAILABLE_ROLES.map(role => (
                                <button
                                    key={role.value}
                                    onClick={() => {
                                        onRoleChange(member.id, role.value)
                                        setShowRoleDropdown(false)
                                    }}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/10 font-cairo",
                                        member.role === role.value && "bg-primary/5"
                                    )}
                                >
                                    {member.role === role.value && <Check className="w-4 h-4 text-success" />}
                                    <span className={member.role === role.value ? "font-bold" : ""}>
                                        {isRTL ? role.label_ar : role.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </td>

            {/* Department */}
            <td className="p-4">
                <span className="text-sm font-cairo text-muted-foreground">
                    {member.department || (isRTL ? 'غير محدد' : 'Not set')}
                </span>
            </td>

            {/* Status */}
            <td className="p-4">
                <button
                    onClick={() => onStatusToggle(member.id, member.is_active)}
                    disabled={isUpdating || !isUserManagementEnabled || !canManage}
                    className={cn(
                        "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors",
                        member.is_active
                            ? "bg-success/10 text-success"
                            : "bg-destructive/10 text-destructive",
                        (!isUserManagementEnabled || !canManage) ? "opacity-50 cursor-not-allowed" : "hover:bg-opacity-20"
                    )}
                    title={(!isUserManagementEnabled || !canManage) ? (isRTL ? "تم تعطيل التعديل" : "Modification disabled") : ""}
                >
                    {member.is_active ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                    {member.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
                </button>
            </td>

            {/* Actions */}
            <td className="p-4">
                {isUserManagementEnabled && canManage && (
                    <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </button>
                )}
            </td>
        </tr>
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
        secondary: 'bg-secondary/10 text-secondary',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        info: 'bg-info/10 text-info',
        destructive: 'bg-destructive/10 text-destructive',
    }

    return (
        <div className="bg-card rounded-xl p-4 shadow-card border">
            <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', colorClasses[color])}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-primary font-inter">{value}</p>
                    <p className="text-xs text-muted font-cairo">{title}</p>
                </div>
            </div>
        </div>
    )
}
