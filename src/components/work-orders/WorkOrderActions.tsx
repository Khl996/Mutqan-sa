import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isPreventiveWorkOrder, WorkOrder, useIssueTypes } from '@/hooks/useWorkOrders'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantSettings } from '@/hooks/useTenantSettings'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { PlayCircle, CheckCircle2, AlertOctagon, ShieldCheck, Copy, MessageSquare, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkOrderWorkflow } from '@/hooks/useWorkOrderWorkflow'
import { usePermission } from '@/hooks/usePermission'
import InventorySelector, { SelectedPart } from './InventorySelector'
import { buildWhatsAppMessage } from '@/lib/whatsapp'
import { useWorkTeams } from '@/hooks/useWorkTeams'
import { useTeamMembers } from '@/hooks/useTeams'
import {
    resolveStandardGovernanceGate,
    useWorkOrderGovernance,
} from '@/hooks/useWorkOrderGovernance'
import {
    canShowStartWorkOrderAction,
    isAssignableWorkOrderMember,
} from './workOrderActionsPolicy'

interface WorkOrderActionsProps {
    workOrder: WorkOrder
    isRTL: boolean
    onActionCompleted: () => void
}

const PLATFORM_WORKFLOW_ROLES = new Set(['platform_owner', 'platform_admin'])
const START_AND_COMPLETE_ROLES = new Set(['tenant_admin', 'maintenance_manager', 'engineer', 'technician'])
const SUPERVISOR_APPROVER_ROLES = new Set(['tenant_admin', 'maintenance_manager', 'supervisor'])
const ENGINEER_APPROVER_ROLES = new Set(['tenant_admin', 'maintenance_manager', 'engineer'])
const CLOSURE_ROLES = new Set(['tenant_admin', 'maintenance_manager'])

const GOVERNANCE_ROLE_LABELS: Record<string, { ar: string; en: string }> = {
    supervisor: { ar: 'المشرف', en: 'Supervisor' },
    engineer: { ar: 'المهندس', en: 'Engineer' },
    facility_manager: { ar: 'مدير المرافق', en: 'Facility Manager' },
    maintenance_manager: { ar: 'مدير الصيانة', en: 'Maintenance Manager' },
    tenant_admin: { ar: 'مدير المستأجر', en: 'Tenant Admin' },
}

export default function WorkOrderActions({ workOrder, isRTL, onActionCompleted }: WorkOrderActionsProps) {
    useTranslation()
    const { user } = useAuth()
    const { role, can } = usePermission()
    const workflow = useWorkOrderWorkflow()
    const requiresStandardGovernance = (workOrder.status === 'pending' || workOrder.status === 'assigned')
        && !isPreventiveWorkOrder(workOrder)
    const governance = useWorkOrderGovernance(workOrder.id, requiresStandardGovernance)

    const { data: tenantSettings } = useTenantSettings()
    const requireSupervisorApproval = tenantSettings?.work_orders?.require_supervisor_approval ?? true
    const requireEngineerReview = tenantSettings?.work_orders?.require_engineer_review ?? true
    const allowTechnicianReject = tenantSettings?.work_orders?.allow_technician_reject ?? true

    const isWorkflowEnabled = useFeatureEnabled('work_orders', 'workflow')
    const isPartsTrackingEnabled = useFeatureEnabled('work_orders', 'parts_tracking')
    const isTeamsEnabled = useFeatureEnabled('work_teams', 'team_creation')
    const { data: workTeams = [] } = useWorkTeams()
    const { data: teamMembers = [] } = useTeamMembers()

    const [notes, setNotes] = useState('')
    const [selectedParts, setSelectedParts] = useState<SelectedPart[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showAssignPanel, setShowAssignPanel] = useState(false)
    const [assignTeamId, setAssignTeamId] = useState('')
    const [assignUserId, setAssignUserId] = useState('')

    const myUserId = user?.id ?? null
    const actorRole = role ?? ''
    const isPlatformWorkflowRole = PLATFORM_WORKFLOW_ROLES.has(actorRole)
    const isAssignedTechnician = workOrder.assigned_to === myUserId
    const isReporter = workOrder.reported_by === myUserId

    const canStartOrCompleteByRole = START_AND_COMPLETE_ROLES.has(actorRole) || isPlatformWorkflowRole
    const canTakeSupervisorAction = SUPERVISOR_APPROVER_ROLES.has(actorRole) || isPlatformWorkflowRole
    const canTakeEngineerAction = ENGINEER_APPROVER_ROLES.has(actorRole) || isPlatformWorkflowRole
    const canTakeReporterAction = CLOSURE_ROLES.has(actorRole) || isPlatformWorkflowRole || isReporter
    const governanceGate = resolveStandardGovernanceGate({
        requiresStandardGovernance,
        routeType: governance.state?.route_type ?? null,
        governanceState: governance.state?.governance_state ?? null,
        isLoading: governance.isLoading,
        hasError: governance.hasError,
        canEvaluate: can('work_orders.approve'),
        canDecide: governance.canCurrentActorDecide,
    })

    const canStartWork = useMemo(() => canShowStartWorkOrderAction({
        actorRole,
        actorId: myUserId,
        assignedTo: workOrder.assigned_to,
        status: workOrder.status,
        hasUpdatePermission: can('work_orders.update'),
    }), [actorRole, can, myUserId, workOrder.assigned_to, workOrder.status])

    const canCompleteWork = useMemo(() => {
        if (!can('work_orders.update') || !canStartOrCompleteByRole) {
            return false
        }

        if (isPlatformWorkflowRole || actorRole === 'tenant_admin' || actorRole === 'maintenance_manager') {
            return true
        }

        return isAssignedTechnician
    }, [actorRole, can, canStartOrCompleteByRole, isAssignedTechnician, isPlatformWorkflowRole])

    const assignableMembers = useMemo(
        () => teamMembers.filter(isAssignableWorkOrderMember),
        [teamMembers]
    )

    // WhatsApp copy: visible to non-technicians when order is in assigned status
    const showWhatsApp = workOrder.status === 'assigned' && actorRole !== 'technician'

    const { data: issueTypes } = useIssueTypes()
    const matchedIssueType = issueTypes?.find(it => it.id === workOrder.issue_type_id)

    const assigneeName = workOrder.assignee
        ? (isRTL
            ? (workOrder.assignee.full_name_ar ?? workOrder.assignee.full_name)
            : workOrder.assignee.full_name)
        : null

    const whatsAppMessage = showWhatsApp
        ? buildWhatsAppMessage({
            workOrder,
            assigneeName,
            issueTypeAr: matchedIssueType?.name_ar ?? workOrder.issue_type,
            issueTypeEn: matchedIssueType?.name,
            baseUrl: window.location.origin,
        })
        : ''

    const handleAction = async (actionFn: () => Promise<unknown>) => {
        try {
            setIsSubmitting(true)
            await actionFn()
            setNotes('')
            setSelectedParts([])
            onActionCompleted()
        } catch (error) {
            console.error(error)
            toast.error(isRTL ? 'تعذر تنفيذ الإجراء' : 'Action could not be completed')
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAssign = async () => {
        if (!assignTeamId && !assignUserId) {
            toast.error(isRTL ? 'اختر فريقاً أو مكلَّفاً على الأقل' : 'Select a team or assignee')
            return
        }
        try {
            setIsSubmitting(true)
            await workflow.assignWorkOrder.mutateAsync({
                workOrderId: workOrder.id,
                assignedTo: assignUserId || null,
                assignedTeam: assignTeamId || null,
            })
            setShowAssignPanel(false)
            setAssignTeamId('')
            setAssignUserId('')
            onActionCompleted()
        } catch (error) {
            console.error(error)
            toast.error(isRTL ? 'تعذر التعيين' : 'Assignment failed')
        } finally {
            setIsSubmitting(false)
        }
    }

    const whatsAppCard = showWhatsApp ? (
        <div className="bg-card border rounded-xl p-5 shadow-sm space-y-3 border-l-4 border-l-green-600">
            <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-600" />
                <h3 className="font-bold text-base font-cairo">
                    {isRTL ? 'إشعار واتساب' : 'WhatsApp Notification'}
                </h3>
            </div>

            <pre className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-3 whitespace-pre-wrap font-cairo leading-relaxed overflow-x-auto">
                {whatsAppMessage}
            </pre>

            <button
                onClick={() => {
                    navigator.clipboard.writeText(whatsAppMessage)
                    toast.success(isRTL ? 'تم نسخ الرسالة' : 'Message copied')
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 border rounded-lg text-sm font-bold font-cairo hover:bg-muted/30 transition-colors"
            >
                <Copy className="w-4 h-4" />
                {isRTL ? 'نسخ رسالة واتساب' : 'Copy WhatsApp Message'}
            </button>
        </div>
    ) : null

    const canAssignByRole = CLOSURE_ROLES.has(actorRole) || isPlatformWorkflowRole

    const requiredGovernanceRole = governance.state?.required_approver_role
    const requiredGovernanceRoleLabel = requiredGovernanceRole
        ? (GOVERNANCE_ROLE_LABELS[requiredGovernanceRole]?.[isRTL ? 'ar' : 'en'] ?? requiredGovernanceRole)
        : (isRTL ? 'المعتمد المخوّل' : 'an authorized approver')

    const governanceCopy = (() => {
        switch (governanceGate) {
            case 'loading':
                return {
                    title: isRTL ? 'التحقق من حوكمة التنفيذ' : 'Checking execution governance',
                    description: isRTL ? 'يتم الآن التحقق من قرار ما قبل التنفيذ.' : 'The pre-execution decision is being checked.',
                }
            case 'unavailable':
                return {
                    title: isRTL ? 'تعذر التحقق من الحوكمة' : 'Governance check unavailable',
                    description: isRTL ? 'تم إيقاف البدء احترازيًا. أعد المحاولة بعد استعادة التحقق.' : 'Start is fail-closed. Retry after governance verification is restored.',
                }
            case 'evaluation_available':
                return {
                    title: isRTL ? 'تقييم ما قبل التنفيذ' : 'Pre-execution evaluation',
                    description: isRTL ? 'قيّم أولوية الأصل والتكلفة والمخاطر قبل إتاحة بدء العمل.' : 'Evaluate asset criticality, cost, and risk before Start becomes available.',
                }
            case 'waiting_for_evaluation':
                return {
                    title: isRTL ? 'بانتظار تقييم ما قبل التنفيذ' : 'Awaiting pre-execution evaluation',
                    description: isRTL ? 'يجب على مستخدم مخوّل تقييم أمر العمل قبل أن يبدأ المنفذ.' : 'An authorized user must evaluate this work order before the assignee can start.',
                }
            case 'approval_available':
                return {
                    title: isRTL ? 'قرار الحوكمة مطلوب' : 'Governance decision required',
                    description: isRTL ? `أنت مخوّل بالاعتماد بصفة ${requiredGovernanceRoleLabel}.` : `You are authorized to decide as ${requiredGovernanceRoleLabel}.`,
                }
            case 'waiting_for_approval':
                return {
                    title: isRTL ? 'بانتظار قرار الحوكمة' : 'Awaiting governance decision',
                    description: isRTL ? `الاعتماد مطلوب من ${requiredGovernanceRoleLabel} قبل بدء العمل.` : `Approval from ${requiredGovernanceRoleLabel} is required before work starts.`,
                }
            case 'approved':
                return {
                    title: isRTL ? 'تم اعتماد التنفيذ' : 'Execution approved',
                    description: isRTL ? 'اكتمل قرار الحوكمة. ينتظر الأمر منفذًا مخولًا للبدء.' : 'Governance is complete. The work order is waiting for an authorized assignee to start.',
                }
            case 'rejected':
                return {
                    title: isRTL ? 'تم رفض اعتماد التنفيذ' : 'Execution approval rejected',
                    description: isRTL ? 'راجع بيانات المخاطر ثم أعد التقييم من خلال المسار المعتمد.' : 'Review the risk inputs, then re-evaluate through the governed path.',
                }
            default:
                return {
                    title: isRTL ? 'مسار الحوكمة غير جاهز' : 'Governance path not ready',
                    description: isRTL ? 'لا يمكن بدء العمل من حالة الحوكمة الحالية.' : 'Work cannot start from the current governance state.',
                }
        }
    })()

    const shouldShowGovernanceGate = requiresStandardGovernance
        && (governanceGate !== 'approved' || !canStartWork)

    if (shouldShowGovernanceGate) {
        const isApproved = governanceGate === 'approved'
        const isRejected = governanceGate === 'rejected'

        return (
            <div className={`bg-card border rounded-xl p-5 shadow-sm space-y-4 border-l-4 ${isApproved ? 'border-l-green-600' : isRejected ? 'border-l-destructive' : 'border-l-amber-500'}`}>
                <div className="flex items-center gap-2">
                    {isRejected ? (
                        <AlertOctagon className="w-5 h-5 text-destructive" />
                    ) : (
                        <ShieldCheck className={`w-5 h-5 ${isApproved ? 'text-green-600' : 'text-amber-600'}`} />
                    )}
                    <h3 className="font-bold text-lg font-cairo">{governanceCopy.title}</h3>
                </div>

                <p className="text-sm text-muted-foreground font-cairo">{governanceCopy.description}</p>

                {governanceGate === 'approval_available' && (
                    <textarea
                        className="w-full p-3 border rounded-lg bg-background text-sm font-cairo outline-none"
                        rows={2}
                        placeholder={isRTL ? 'ملاحظات الاعتماد (اختياري)...' : 'Approval notes (optional)...'}
                        value={notes}
                        onChange={event => setNotes(event.target.value)}
                    />
                )}

                {(governanceGate === 'evaluation_available' || governanceGate === 'rejected')
                    && can('work_orders.approve') && (
                        <button
                            onClick={() => handleAction(() => governance.evaluate.mutateAsync())}
                            disabled={isSubmitting || governance.evaluate.isPending}
                            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold shadow hover:shadow-lg transition-all font-cairo flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <ShieldCheck className="w-5 h-5" />
                            {isRTL
                                ? (governanceGate === 'rejected' ? 'إعادة تقييم الحوكمة' : 'تقييم الحوكمة')
                                : (governanceGate === 'rejected' ? 'Re-evaluate Governance' : 'Evaluate Governance')}
                        </button>
                    )}

                {governanceGate === 'approval_available' && (
                    <button
                        onClick={() => handleAction(() => governance.approve.mutateAsync(notes))}
                        disabled={isSubmitting || governance.approve.isPending}
                        className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow transition-all font-cairo flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <ShieldCheck className="w-5 h-5" />
                        {isRTL ? 'اعتماد بدء التنفيذ' : 'Approve Execution'}
                    </button>
                )}
            </div>
        )
    }

    const canStart = canStartWork
        && (governanceGate === 'approved' || governanceGate === 'not_required')
    if (canStart) {
        return (
            <div className="space-y-4">
                <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 border-l-4 border-l-primary">
                    <h3 className="font-bold text-lg font-cairo">{isRTL ? 'الإجراءات المتاحة' : 'Available Actions'}</h3>
                    <button
                        onClick={() => handleAction(() => workflow.startWork.mutateAsync({ workOrderId: workOrder.id }))}
                        disabled={isSubmitting}
                        className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-bold shadow hover:shadow-lg transition-all font-cairo flex items-center justify-center gap-2"
                    >
                        <PlayCircle className="w-5 h-5" />
                        {isRTL ? 'بدء العمل' : 'Start Work'}
                    </button>

                    {allowTechnicianReject && workOrder.status === 'assigned' && canStartWork && (
                        <div className="pt-2 border-t">
                            <textarea
                                className="w-full p-3 border rounded-lg bg-background text-sm font-cairo outline-none mb-2"
                                rows={2}
                                placeholder={isRTL ? 'سبب الرفض (إجباري)...' : 'Rejection reason (required)...'}
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                            />
                            <button
                                onClick={() => {
                                    if (!notes.trim()) {
                                        toast.error(isRTL ? 'يرجى كتابة سبب الرفض' : 'Please provide a rejection reason')
                                        return
                                    }
                                    handleAction(() => workflow.rejectWork.mutateAsync({ workOrderId: workOrder.id, reason: notes }))
                                }}
                                disabled={isSubmitting}
                                className="w-full py-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg font-bold font-cairo flex items-center justify-center gap-2 hover:bg-destructive/20 transition-colors"
                            >
                                <AlertOctagon className="w-4 h-4" />
                                {isRTL ? 'رفض أمر العمل' : 'Reject Work Order'}
                            </button>
                        </div>
                    )}

                    {workOrder.status === 'pending' && canAssignByRole && (
                        <div className="pt-2 border-t">
                            {showAssignPanel ? (
                                <div className="space-y-3">
                                    {isTeamsEnabled && workTeams.length > 0 && (
                                        <div>
                                            <label className="text-xs font-bold text-muted-foreground mb-1 block font-cairo">
                                                {isRTL ? 'الفريق' : 'Team'}
                                            </label>
                                            <select
                                                value={assignTeamId}
                                                onChange={e => setAssignTeamId(e.target.value)}
                                                className="w-full p-2.5 border rounded-lg bg-background text-sm font-cairo"
                                            >
                                                <option value="">{isRTL ? '— بدون فريق —' : '— No team —'}</option>
                                                {workTeams.map(t => (
                                                    <option key={t.id} value={t.id}>
                                                        {isRTL ? (t.name_ar || t.name) : t.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-xs font-bold text-muted-foreground mb-1 block font-cairo">
                                            {isRTL ? 'المكلَّف' : 'Assignee'}
                                        </label>
                                        <select
                                            value={assignUserId}
                                            onChange={e => setAssignUserId(e.target.value)}
                                            className="w-full p-2.5 border rounded-lg bg-background text-sm font-cairo"
                                        >
                                            <option value="">{isRTL ? '— بدون تعيين —' : '— Unassigned —'}</option>
                                            {assignableMembers.map(m => (
                                                <option key={m.id} value={m.id}>
                                                    {isRTL ? (m.full_name_ar || m.full_name || m.email) : (m.full_name || m.email)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={handleAssign}
                                            disabled={isSubmitting}
                                            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg font-bold font-cairo text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            <UserCog className="w-4 h-4" />
                                            {isRTL ? 'تعيين' : 'Assign'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowAssignPanel(false); setAssignTeamId(''); setAssignUserId('') }}
                                            className="px-4 py-2.5 border rounded-lg text-sm font-cairo hover:bg-muted/30 transition-colors"
                                        >
                                            {isRTL ? 'إلغاء' : 'Cancel'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowAssignPanel(true)}
                                    className="w-full flex items-center justify-center gap-2 py-2 border border-dashed rounded-lg text-sm font-bold font-cairo hover:bg-muted/30 transition-colors text-muted-foreground"
                                >
                                    <UserCog className="w-4 h-4" />
                                    {isRTL ? 'تعيين لفريق / شخص' : 'Assign to Team / Person'}
                                </button>
                            )}
                        </div>
                    )}

                    {workOrder.status === 'pending' && !canAssignByRole && (
                        <p className="text-xs text-muted text-center font-cairo">
                            {isRTL ? 'سيتم إسناد البلاغ إليك تلقائيًا عند البدء' : 'Ticket will be assigned to you automatically'}
                        </p>
                    )}
                </div>
                {whatsAppCard}
            </div>
        )
    }

    const canComplete = workOrder.status === 'in_progress' && canCompleteWork
    if (canComplete) {
        return (
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 border-l-4 border-l-green-500">
                <h3 className="font-bold text-lg font-cairo">{isRTL ? 'إنجاز العمل' : 'Complete Work'}</h3>

                <textarea
                    className="w-full p-3 border rounded-lg bg-background text-sm font-cairo focus:ring-2 focus:ring-primary/20 outline-none"
                    rows={3}
                    placeholder={isRTL ? 'ملاحظات الإنجاز...' : 'Completion notes...'}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                />

                {isPartsTrackingEnabled && (
                    <InventorySelector
                        parts={selectedParts}
                        onChange={setSelectedParts}
                        isRTL={isRTL}
                    />
                )}

                <button
                    onClick={() => {
                        if (!notes.trim()) {
                            toast.error(isRTL ? 'يرجى كتابة ملاحظات الإنجاز' : 'Please enter completion notes')
                            return
                        }

                        const partsPayload = selectedParts.map(p => ({
                            part_id: p.part_id,
                            quantity: p.quantity,
                        }))

                        handleAction(() => workflow.completeWorkTechnician.mutateAsync({
                            workOrderId: workOrder.id,
                            notes,
                            parts: partsPayload,
                        }))
                    }}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow transition-all font-cairo flex items-center justify-center gap-2"
                >
                    <CheckCircle2 className="w-5 h-5" />
                    {isRTL ? 'إتمام العمل' : 'Complete Work'}
                </button>
            </div>
        )
    }

    const isSupervisorStep = workOrder.status === 'pending_supervisor_approval' && canTakeSupervisorAction && requireSupervisorApproval && can('work_orders.approve')
    const isEngineerStep = workOrder.status === 'pending_engineer_review' && canTakeEngineerAction && requireEngineerReview && can('work_orders.approve')

    if (!isWorkflowEnabled && (workOrder.status === 'pending_supervisor_approval' || workOrder.status === 'pending_engineer_review')) {
        return (
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 border-l-4 border-l-info">
                <h3 className="font-bold text-lg font-cairo text-info">
                    {isRTL ? 'ميزة سير العمل معطلة' : 'Workflow Feature Disabled'}
                </h3>
                <p className="text-sm text-muted font-cairo">
                    {isRTL ? 'تم تعطيل ميزة سير العمل والاعتمادات لهذه المنشأة.'
                        : 'Workflow approvals feature is disabled for this organization.'}
                </p>
            </div>
        )
    }

    if (workOrder.status === 'pending_supervisor_approval' && !requireSupervisorApproval) {
        return (
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 border-l-4 border-l-info">
                <h3 className="font-bold text-lg font-cairo text-info">
                    {isRTL ? 'تخطي مرحلة اعتماد المشرف' : 'Supervisor Approval Skipped'}
                </h3>
                <p className="text-sm text-muted font-cairo">
                    {isRTL ? 'هذه المرحلة معطلة في إعدادات المنشأة. سيتم الانتقال للمرحلة التالية تلقائيًا.'
                        : 'This step is disabled in tenant settings. Moving to next step automatically.'}
                </p>
            </div>
        )
    }

    if (workOrder.status === 'pending_engineer_review' && !requireEngineerReview) {
        return (
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 border-l-4 border-l-info">
                <h3 className="font-bold text-lg font-cairo text-info">
                    {isRTL ? 'تخطي مرحلة مراجعة المهندس' : 'Engineer Review Skipped'}
                </h3>
                <p className="text-sm text-muted font-cairo">
                    {isRTL ? 'هذه المرحلة معطلة في إعدادات المنشأة. سيتم الانتقال للمرحلة التالية تلقائيًا.'
                        : 'This step is disabled in tenant settings. Moving to next step automatically.'}
                </p>
            </div>
        )
    }

    if (isSupervisorStep || isEngineerStep) {
        return (
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 border-l-4 border-l-orange-500">
                <h3 className="font-bold text-lg font-cairo">
                    {isRTL ? (isSupervisorStep ? 'موافقة المشرف' : 'اعتماد المهندس') : 'Review & Approval'}
                </h3>

                <div className="bg-muted/10 p-3 rounded text-sm mb-2">
                    <p className="font-bold text-xs text-muted-foreground mb-1 uppercase">
                        {isRTL ? 'ملاحظات سابقة:' : 'Previous Notes:'}
                    </p>
                    <p className="text-foreground/80 font-cairo">{workOrder.technician_notes || workOrder.supervisor_notes || '-'}</p>
                </div>

                <textarea
                    className="w-full p-3 border rounded-lg bg-background text-sm font-cairo outline-none"
                    rows={2}
                    placeholder={isRTL ? 'ملاحظاتك...' : 'Your notes...'}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                />

                <div className="flex gap-3">
                    <button
                        onClick={() => handleAction(() =>
                            isSupervisorStep
                                ? workflow.approveSupervisor.mutateAsync({ workOrderId: workOrder.id, notes })
                                : workflow.approveEngineer.mutateAsync({ workOrderId: workOrder.id, notes })
                        )}
                        disabled={isSubmitting}
                        className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold font-cairo flex items-center justify-center gap-2"
                    >
                        <ShieldCheck className="w-4 h-4" />
                        {isRTL ? 'موافقة' : 'Approve'}
                    </button>

                    <button
                        onClick={() => {
                            if (!notes.trim()) {
                                toast.error(isRTL ? 'يرجى كتابة سبب الرفض' : 'Please provide a reason for rejection')
                                return
                            }
                            handleAction(() => workflow.rejectWork.mutateAsync({ workOrderId: workOrder.id, reason: notes }))
                        }}
                        disabled={isSubmitting}
                        className="flex-1 py-2.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg font-bold font-cairo flex items-center justify-center gap-2"
                    >
                        <AlertOctagon className="w-4 h-4" />
                        {isRTL ? 'رفض وإعادة' : 'Reject'}
                    </button>
                </div>
            </div>
        )
    }

    if (workOrder.status === 'pending_reporter_closure' && canTakeReporterAction) {
        return (
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 border-l-4 border-l-blue-500">
                <h3 className="font-bold text-lg font-cairo">{isRTL ? 'الإغلاق النهائي' : 'Final Closure'}</h3>
                <p className="text-sm text-muted font-cairo">
                    {isRTL ? 'تمت الموافقة على العمل. هل تود إغلاق البلاغ نهائيًا؟' : 'Work approved. Close ticket?'}
                </p>
                <button
                    onClick={() => handleAction(() => workflow.closeWorkOrder.mutateAsync({ workOrderId: workOrder.id, notes: '' }))}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow transition-all font-cairo flex items-center justify-center gap-2"
                >
                    <CheckCircle2 className="w-5 h-5" />
                    {isRTL ? 'إغلاق البلاغ' : 'Close Ticket'}
                </button>
            </div>
        )
    }

    // No workflow action, but show copy button for non-technicians viewing assigned orders
    if (whatsAppCard) return whatsAppCard

    return null
}
