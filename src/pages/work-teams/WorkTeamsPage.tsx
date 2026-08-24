import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
    useWorkTeams,
    useCreateWorkTeam,
    useDeleteWorkTeam,
    useTeamMembers,
    useAddTeamMember,
    useRemoveTeamMember,
    WorkTeam,
    TEAM_SPECIALIZATIONS,
    TeamSpecialization,
    getTeamPrimarySpecialization
} from '@/hooks/useWorkTeams'
import { useTeamMembers as useEmployees } from '@/hooks/useTeams'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { usePermission } from '@/hooks/usePermission'
import { useTenantModules } from '@/hooks/useTenantModules'
import { isModuleEnabled } from '@/config/modules'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { PageHeader } from '@/components/ui/page-header'
import {
    Users2,
    Plus,
    Search,
    Wrench,
    HardHat,
    Settings2,
    HeadphonesIcon,
    MoreVertical,
    Trash2,
    UserPlus,
    UserMinus,
    ChevronDown,
    X,
    Shield,
    AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'

// Specialization Icons
const specIcons: Record<string, React.ElementType> = {
    electrical: Wrench,
    mechanical: Wrench,
    plumbing: Wrench,
    hvac: HardHat,
    civil: HardHat,
    medical_equipment: HeadphonesIcon,
    it: Settings2,
    cleaning: Users2,
    safety: Shield,
    general: Wrench,
}

// Specialization Colors
const specColors: Record<string, string> = {
    electrical: 'bg-warning/10 text-warning border-warning/20',
    mechanical: 'bg-info/10 text-info border-info/20',
    plumbing: 'bg-secondary/10 text-secondary border-secondary/20',
    hvac: 'bg-success/10 text-success border-success/20',
    civil: 'bg-muted/10 text-muted-foreground border-muted/20',
    medical_equipment: 'bg-destructive/10 text-destructive border-destructive/20',
    it: 'bg-primary/10 text-primary border-primary/20',
    cleaning: 'bg-secondary/10 text-secondary border-secondary/20',
    safety: 'bg-destructive/10 text-destructive border-destructive/20',
    general: 'bg-muted/10 text-muted-foreground border-muted/20',
}

export default function WorkTeamsPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    // Check Module Features
    const { data: tenantModules } = useTenantModules()
    const isModuleActive = isModuleEnabled(tenantModules, 'work_teams')
    const isCreateTeamEnabled = useFeatureEnabled('work_teams', 'team_creation')
    const isMembersEnabled = useFeatureEnabled('work_teams', 'member_assignment')

    // Permissions
    const { can } = usePermission()
    const canManage = can('work_teams.manage')

    const [searchQuery, setSearchQuery] = useState('')
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [selectedTeam, setSelectedTeam] = useState<WorkTeam | null>(null)
    const [teamPendingDelete, setTeamPendingDelete] = useState<WorkTeam | null>(null)
    const [showMembersModal, setShowMembersModal] = useState(false)

    // Fetch data
    const { data: teams, isLoading } = useWorkTeams()
    const createTeam = useCreateWorkTeam()
    const deleteTeam = useDeleteWorkTeam()

    const [newTeam, setNewTeam] = useState({
        code: '',
        name: '',
        name_ar: '',
        description: '',
        specialization: 'electrical' as TeamSpecialization
    })

    // Filter teams
    const filteredTeams = teams?.filter(team =>
        team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        team.name_ar?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        team.code.toLowerCase().includes(searchQuery.toLowerCase())
    ) || []

    // Create Team
    const handleCreateTeam = async () => {
        if (!newTeam.code || !newTeam.name) {
            toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields')
            return
        }

        try {
            await createTeam.mutateAsync({
                code: newTeam.code,
                name: newTeam.name,
                name_ar: newTeam.name_ar,
                description: newTeam.description,
                type: 'maintenance',
                specializations: [newTeam.specialization],
            })
            toast.success(isRTL ? 'تم إنشاء الفريق بنجاح' : 'Team created successfully')
            setShowCreateModal(false)
            setNewTeam({ code: '', name: '', name_ar: '', description: '', specialization: 'electrical' })
        } catch (error: any) {
            toast.error(isRTL ? `فشل إنشاء الفريق: ${error.message}` : `Failed to create team: ${error.message}`)
        }
    }

    // Delete Team
    const handleDeleteTeam = (team: WorkTeam) => {
        setTeamPendingDelete(team)
    }

    const confirmDeleteTeam = async () => {
        if (!teamPendingDelete) return

        try {
            await deleteTeam.mutateAsync(teamPendingDelete.id)
            toast.success(isRTL ? 'تم حذف الفريق' : 'Team deleted')
            setTeamPendingDelete(null)
        } catch (error: any) {
            toast.error(isRTL ? 'فشل حذف الفريق' : 'Failed to delete team')
        }
    }

    // Open Members Modal
    const openMembersModal = (team: WorkTeam) => {
        setSelectedTeam(team)
        setShowMembersModal(true)
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

    // If module is disabled, show warning
    if (!isModuleActive) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="p-4 bg-muted rounded-full">
                    <AlertCircle className="w-12 h-12 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold font-cairo text-muted-foreground">
                    {isRTL ? 'إدارة فرق العمل غير مفعلة' : 'Work Teams Disabled'}
                </h2>
                <p className="text-muted-foreground font-cairo max-w-md text-center">
                    {isRTL
                        ? 'تم تعطيل هذا القسم من إعدادات النظام. يرجى مراجعة مدير النظام.'
                        : 'This module has been disabled in system settings. Please contact your administrator.'}
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<Users2 className="h-5 w-5" />}
                title={isRTL ? 'فرق العمل' : 'Work Teams'}
                description={isRTL ? 'إدارة فرق العمل المتخصصة وتوزيع الموظفين حسب نوع الصيانة والمسؤولية.' : 'Manage specialized work teams and employee assignments by maintenance responsibility.'}
                actions={isCreateTeamEnabled && canManage ? (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg font-cairo hover:bg-secondary/90 transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        {isRTL ? 'إنشاء فريق' : 'Create Team'}
                    </button>
                ) : null}
            />

            {/* Feature Warning - if creation disabled */}
            {!isCreateTeamEnabled && (
                <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/20 rounded-xl text-warning">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="font-cairo text-sm">
                        {isRTL
                            ? 'تم تعطيل إنشاء فرق عمل جديدة. يرجى مراجعة مدير النظام.'
                            : 'Creating new work teams is disabled. Please contact admin.'}
                    </p>
                </div>
            )}

            {/* Search */}
            <div className="relative max-w-md">
                <Search className={cn(
                    'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-muted',
                    isRTL ? 'right-4' : 'left-4'
                )} />
                <input
                    type="text"
                    placeholder={isRTL ? 'البحث عن فريق...' : 'Search teams...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={cn(
                        'w-full py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none font-cairo',
                        isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'
                    )}
                />
            </div>

            {/* Teams Grid */}
            {filteredTeams.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Users2 className="w-16 h-16 text-muted/30 mb-4" />
                    <h3 className="text-lg font-bold text-primary font-cairo mb-2">
                        {isRTL ? 'لا توجد فرق عمل' : 'No Work Teams'}
                    </h3>
                    <p className="text-muted font-cairo mb-4">
                        {isRTL ? 'قم بإنشاء فريق عمل جديد للبدء' : 'Create a new work team to get started'}
                    </p>
                    {isCreateTeamEnabled && canManage && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl font-cairo"
                        >
                            <Plus className="w-5 h-5" />
                            {isRTL ? 'إنشاء فريق' : 'Create Team'}
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTeams.map(team => (
                        <TeamCard
                            key={team.id}
                            team={team}
                            isRTL={isRTL}
                            onManageMembers={() => openMembersModal(team)}

                            onDelete={() => handleDeleteTeam(team)}
                            canManage={canManage}
                        />
                    ))}
                </div>
            )}

            {/* Create Team Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-card rounded-xl border shadow-xl w-full max-w-lg">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h3 className="font-bold font-cairo text-lg">
                                {isRTL ? 'إنشاء فريق جديد' : 'Create New Team'}
                            </h3>
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-muted/10 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                        {isRTL ? 'الكود' : 'Code'} *
                                    </label>
                                    <input
                                        type="text"
                                        value={newTeam.code}
                                        onChange={(e) => setNewTeam({ ...newTeam, code: e.target.value.toUpperCase() })}
                                        placeholder="E.g. MAINT-01"
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                        {isRTL ? 'التخصص' : 'Specialization'} *
                                    </label>
                                    <select
                                        value={newTeam.specialization}
                                        onChange={(e) => setNewTeam({ ...newTeam, specialization: e.target.value as TeamSpecialization })}
                                        className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                    >
                                        {TEAM_SPECIALIZATIONS.map(spec => (
                                            <option key={spec.value} value={spec.value}>
                                                {isRTL ? spec.label_ar : spec.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                    {isRTL ? 'اسم الفريق (إنجليزي)' : 'Team Name (English)'} *
                                </label>
                                <input
                                    type="text"
                                    value={newTeam.name}
                                    onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                                    className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                    {isRTL ? 'اسم الفريق (عربي)' : 'Team Name (Arabic)'}
                                </label>
                                <input
                                    type="text"
                                    value={newTeam.name_ar}
                                    onChange={(e) => setNewTeam({ ...newTeam, name_ar: e.target.value })}
                                    className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo"
                                    dir="rtl"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-muted-foreground font-cairo mb-1 block">
                                    {isRTL ? 'الوصف' : 'Description'}
                                </label>
                                <textarea
                                    value={newTeam.description}
                                    onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                                    rows={3}
                                    className="w-full py-2 px-3 bg-background border rounded-lg focus:ring-2 focus:ring-secondary/20 outline-none font-cairo resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-4 border-t">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 rounded-lg border hover:bg-muted/10 font-cairo"
                            >
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleCreateTeam}
                                disabled={createTeam.isPending || !newTeam.code || !newTeam.name}
                                className="px-4 py-2 bg-secondary text-white rounded-lg font-cairo hover:bg-secondary/90 disabled:opacity-50 flex items-center gap-2"
                            >
                                {createTeam.isPending && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {isRTL ? 'إنشاء' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmActionDialog
                open={!!teamPendingDelete}
                onOpenChange={(open) => !open && setTeamPendingDelete(null)}
                title={isRTL ? 'تأكيد حذف الفريق' : 'Delete Team'}
                description={isRTL
                    ? `هل أنت متأكد من حذف فريق "${teamPendingDelete?.name_ar || teamPendingDelete?.name || ''}"؟`
                    : `Are you sure you want to delete "${teamPendingDelete?.name || ''}"?`}
                confirmLabel={isRTL ? 'حذف' : 'Delete'}
                cancelLabel={isRTL ? 'إلغاء' : 'Cancel'}
                onConfirm={confirmDeleteTeam}
            />

            {/* Team Members Modal */}
            {showMembersModal && selectedTeam && (
                <TeamMembersModal
                    team={selectedTeam}
                    isRTL={isRTL}
                    onClose={() => {
                        setShowMembersModal(false)
                        setShowMembersModal(false)
                        setSelectedTeam(null)
                    }}
                    canManage={canManage}
                />
            )}
        </div>
    )
}

// Team Card Component
function TeamCard({
    team,
    isRTL,
    onManageMembers,
    onDelete,
    canManage
}: {
    team: WorkTeam
    isRTL: boolean
    onManageMembers: () => void
    onDelete: () => void
    canManage: boolean
}) {
    const [showMenu, setShowMenu] = useState(false)
    const primarySpecialization = getTeamPrimarySpecialization(team)
    const SpecIcon = specIcons[primarySpecialization] || Users2
    const specConfig = TEAM_SPECIALIZATIONS.find(s => s.value === primarySpecialization)

    return (
        <div className="bg-card rounded-xl border shadow-card overflow-hidden hover:border-primary/30 transition-colors">
            {/* Header */}
            <div className={cn("p-4 flex items-start justify-between", specColors[primarySpecialization] || specColors.general)}>
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white/50">
                        <SpecIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold font-cairo">{isRTL ? (team.name_ar || team.name) : team.name}</h3>
                        <p className="text-xs opacity-70 font-mono">{team.code}</p>
                    </div>
                </div>

                <div className="relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className="p-1.5 rounded-lg hover:bg-white/30"
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>
                    {showMenu && (
                        <div className="absolute top-full end-0 mt-1 bg-card border rounded-lg shadow-lg py-1 min-w-[120px] z-10">
                            <button
                                onClick={() => { onManageMembers(); setShowMenu(false) }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/10 font-cairo"
                            >
                                <UserPlus className="w-4 h-4" />
                                {isRTL ? 'الأعضاء' : 'Members'}
                            </button>

                            {canManage && (
                                <button
                                    onClick={() => { onDelete(); setShowMenu(false) }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 font-cairo"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {isRTL ? 'حذف' : 'Delete'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs border", specColors[primarySpecialization] || specColors.general)}>
                        {isRTL ? specConfig?.label_ar : specConfig?.label}
                    </span>
                    <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs",
                        team.status === 'active' ? "bg-success/10 text-success" : "bg-muted/10 text-muted-foreground"
                    )}>
                        {team.status === 'active' ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
                    </span>
                </div>

                {team.description && (
                    <p className="text-sm text-muted-foreground font-cairo line-clamp-2 mb-3">
                        {team.description}
                    </p>
                )}

                <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users2 className="w-4 h-4" />
                        <span className="font-cairo">
                            {team.member_count || 0} {isRTL ? 'عضو' : 'members'}
                        </span>
                    </div>
                    <button
                        onClick={onManageMembers}
                        className="text-sm text-secondary hover:underline font-cairo"
                    >
                        {isRTL ? 'إدارة' : 'Manage'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// Team Members Modal
function TeamMembersModal({
    team,
    isRTL,
    onClose,
    canManage
}: {
    team: WorkTeam
    isRTL: boolean
    onClose: () => void
    canManage: boolean
}) {
    const { data: members, isLoading } = useTeamMembers(team.id)
    const { data: allEmployees } = useEmployees()
    const addMember = useAddTeamMember()
    const removeMember = useRemoveTeamMember()
    const isMembersEnabled = useFeatureEnabled('work_teams', 'member_assignment')

    const [showAddDropdown, setShowAddDropdown] = useState(false)

    // Get employees not in this team
    const availableEmployees = allEmployees?.filter(emp =>
        !members?.some(m => m.user_id === emp.id)
    ) || []

    const handleAddMember = async (userId: string) => {
        try {
            await addMember.mutateAsync({ team_id: team.id, user_id: userId })
            toast.success(isRTL ? 'تم إضافة العضو' : 'Member added')
            setShowAddDropdown(false)
        } catch (error: any) {
            toast.error(isRTL ? 'فشل إضافة العضو' : 'Failed to add member')
        }
    }

    const handleRemoveMember = async (memberId: string) => {
        try {
            await removeMember.mutateAsync({ teamId: team.id, memberId })
            toast.success(isRTL ? 'تم إزالة العضو' : 'Member removed')
        } catch (error: any) {
            toast.error(isRTL ? 'فشل إزالة العضو' : 'Failed to remove member')
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card rounded-xl border shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h3 className="font-bold font-cairo text-lg">
                            {isRTL ? 'أعضاء الفريق' : 'Team Members'}
                        </h3>
                        <p className="text-sm text-muted-foreground font-cairo">
                            {isRTL ? (team.name_ar || team.name) : team.name}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted/10 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Feature Warning - if assign disabled */}
                {!isMembersEnabled && (
                    <div className="p-4 bg-warning/10 border-b border-warning/20 text-warning flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <p className="font-cairo text-xs">
                            {isRTL
                                ? 'تم تعطيل تعديل الأعضاء.'
                                : 'Member modification is disabled.'}
                        </p>
                    </div>
                )}

                {/* Add Member - Only if enabled and authorized */}
                {isMembersEnabled && canManage && (
                    <div className="p-4 border-b">
                        <div className="relative">
                            <button
                                onClick={() => setShowAddDropdown(!showAddDropdown)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-secondary/10 text-secondary rounded-lg hover:bg-secondary/20 font-cairo"
                            >
                                <UserPlus className="w-4 h-4" />
                                {isRTL ? 'إضافة عضو' : 'Add Member'}
                                <ChevronDown className="w-4 h-4" />
                            </button>

                            {showAddDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg max-h-[200px] overflow-y-auto z-10">
                                    {availableEmployees.length === 0 ? (
                                        <p className="p-4 text-center text-muted-foreground text-sm font-cairo">
                                            {isRTL ? 'لا يوجد موظفين متاحين' : 'No available employees'}
                                        </p>
                                    ) : (
                                        availableEmployees.map(emp => (
                                            <button
                                                key={emp.id}
                                                onClick={() => handleAddMember(emp.id)}
                                                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-muted/10 text-start"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                                    {(isRTL ? emp.full_name_ar : emp.full_name)?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <p className="font-cairo text-sm">{isRTL ? (emp.full_name_ar || emp.full_name) : emp.full_name}</p>
                                                    <p className="text-xs text-muted-foreground">{emp.email}</p>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Members List */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-8 h-8 border-3 border-secondary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : members?.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground font-cairo">
                            <Users2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            {isRTL ? 'لا يوجد أعضاء في هذا الفريق' : 'No members in this team'}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {members?.map(member => (
                                <div
                                    key={member.id}
                                    className="flex items-center justify-between p-3 bg-muted/5 rounded-lg hover:bg-muted/10"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                            {(isRTL ? member.user?.full_name_ar : member.user?.full_name)?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                            <p className="font-cairo font-medium">
                                                {isRTL ? (member.user?.full_name_ar || member.user?.full_name) : member.user?.full_name}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>{member.user?.email}</span>
                                                {member.role === 'leader' && (
                                                    <span className="flex items-center gap-1 text-warning">
                                                        <Shield className="w-3 h-3" />
                                                        {isRTL ? 'قائد' : 'Leader'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {isMembersEnabled && canManage && (
                                        <button
                                            onClick={() => handleRemoveMember(member.id)}
                                            className="p-2 text-destructive hover:bg-destructive/10 rounded-lg"
                                            title={isRTL ? 'إزالة' : 'Remove'}
                                        >
                                            <UserMinus className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 bg-muted/10 hover:bg-muted/20 rounded-lg font-cairo"
                    >
                        {isRTL ? 'إغلاق' : 'Close'}
                    </button>
                </div>
            </div>
        </div>
    )
}
