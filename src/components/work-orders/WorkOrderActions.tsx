import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WorkOrder } from '@/hooks/useWorkOrders'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantSettings } from '@/hooks/useTenantSettings'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { PlayCircle, CheckCircle2, AlertOctagon, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkOrderWorkflow } from '@/hooks/useWorkOrderWorkflow'
import { usePermission } from '@/hooks/usePermission'
import InventorySelector, { SelectedPart } from './InventorySelector'

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

export default function WorkOrderActions({ workOrder, isRTL, onActionCompleted }: WorkOrderActionsProps) {
    useTranslation()
    const { user } = useAuth()
    const { role, can } = usePermission()
    const workflow = useWorkOrderWorkflow()

    const { data: tenantSettings } = useTenantSettings()
    const requireSupervisorApproval = tenantSettings?.work_orders?.require_supervisor_approval ?? true
    const requireEngineerReview = tenantSettings?.work_orders?.require_engineer_review ?? true
    const allowTechnicianReject = tenantSettings?.work_orders?.allow_technician_reject ?? true

    const isWorkflowEnabled = useFeatureEnabled('work_orders', 'workflow')
    const isPartsTrackingEnabled = useFeatureEnabled('work_orders', 'parts_tracking')

    const [notes, setNotes] = useState('')
    const [selectedParts, setSelectedParts] = useState<SelectedPart[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)

    const myUserId = user?.id ?? null
    const actorRole = role ?? ''
    const isPlatformWorkflowRole = PLATFORM_WORKFLOW_ROLES.has(actorRole)
    const isAssignedTechnician = workOrder.assigned_to === myUserId
    const isReporter = workOrder.reported_by === myUserId

    const canStartOrCompleteByRole = START_AND_COMPLETE_ROLES.has(actorRole) || isPlatformWorkflowRole
    const canTakeSupervisorAction = SUPERVISOR_APPROVER_ROLES.has(actorRole) || isPlatformWorkflowRole
    const canTakeEngineerAction = ENGINEER_APPROVER_ROLES.has(actorRole) || isPlatformWorkflowRole
    const canTakeReporterAction = CLOSURE_ROLES.has(actorRole) || isPlatformWorkflowRole || isReporter

    const canStartWork = useMemo(() => {
        if (!can('work_orders.update') || !canStartOrCompleteByRole) {
            return false
        }

        if (isPlatformWorkflowRole || actorRole === 'tenant_admin' || actorRole === 'maintenance_manager') {
            return true
        }

        return workOrder.status === 'pending' || isAssignedTechnician
    }, [actorRole, can, canStartOrCompleteByRole, isAssignedTechnician, isPlatformWorkflowRole, workOrder.status])

    const canCompleteWork = useMemo(() => {
        if (!can('work_orders.update') || !canStartOrCompleteByRole) {
            return false
        }

        if (isPlatformWorkflowRole || actorRole === 'tenant_admin' || actorRole === 'maintenance_manager') {
            return true
        }

        return isAssignedTechnician
    }, [actorRole, can, canStartOrCompleteByRole, isAssignedTechnician, isPlatformWorkflowRole])

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

    const canStart = (workOrder.status === 'assigned' || workOrder.status === 'pending') && canStartWork
    if (canStart) {
        return (
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

                {workOrder.status === 'pending' && (
                    <p className="text-xs text-muted text-center font-cairo">
                        {isRTL ? 'سيتم إسناد البلاغ إليك تلقائيًا عند البدء' : 'Ticket will be assigned to you automatically'}
                    </p>
                )}
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
                    onClick={() => handleAction(() => workflow.closeWorkOrder.mutateAsync({ workOrderId: workOrder.id, notes: 'Closed via workflow action' }))}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow transition-all font-cairo flex items-center justify-center gap-2"
                >
                    <CheckCircle2 className="w-5 h-5" />
                    {isRTL ? 'إغلاق البلاغ' : 'Close Ticket'}
                </button>
            </div>
        )
    }

    return null
}
