import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
    AlertTriangle,
    Camera,
    CheckCircle2,
    ClipboardCheck,
    FileDown,
    FileSignature,
    ImagePlus,
    Loader2,
    Paperclip,
    PlayCircle,
    Plus,
    ShieldCheck,
    Timer,
    Upload,
    Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { usePermission } from '@/hooks/usePermission'
import { useCreateWorkOrder } from '@/hooks/useWorkOrders'
import { useMaintenanceTasks } from '@/hooks/useMaintenanceTasks'
import { supabase } from '@/lib/supabase'
import {
    formatDurationMinutes,
    getCompletedChecksCount,
    getPriorityClass,
    getTaskStatusClass,
    isLegacyChecklistComplete,
    isTaskCheckAnswered,
} from '@/lib/pm'
import { cn } from '@/lib/utils'
import { generatePmExecutionPdf } from '@/utils/pmExecutionPdf'
import type {
    ChecklistTemplateItem,
    ChecklistTemplateSection,
    MaintenanceTask,
    MaintenanceTaskAttachment,
    MaintenanceTaskAttachmentType,
    MaintenanceTaskCheck,
    TaskCheckStatus,
    UpdateCheckInput,
} from '@/types/maintenance'

// Legacy PM execution modal. Active execution uses generated work orders,
// work_order_checks, and work_order_attachments.
// See docs/maintenance/pm-legacy-deprecation.md.
interface TaskExecutionModalProps {
    task: MaintenanceTask | null
    isOpen: boolean
    onClose: () => void
    onTaskChanged?: () => void
}

async function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
    })
}

function formatElapsed(startedAt: string | null, now: number) {
    if (!startedAt) return '--:--:--'

    const diff = Math.max(0, now - new Date(startedAt).getTime())
    const totalSeconds = Math.floor(diff / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':')
}

export default function TaskExecutionModal({
    task,
    isOpen,
    onClose,
    onTaskChanged,
}: TaskExecutionModalProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { user } = useAuth()
    const { currentTenant } = useTenant()
    const { can } = usePermission()
    const createWorkOrderMutation = useCreateWorkOrder()
    const {
        getTaskChecks,
        getTaskAttachments,
        addTaskAttachment,
        updateTask,
        updateTaskCheck,
        startTask,
        completeTask,
        cancelTask,
        reviewTask,
        recordPdfExport,
    } = useMaintenanceTasks()

    const [taskSnapshot, setTaskSnapshot] = useState<MaintenanceTask | null>(task)
    const [checks, setChecks] = useState<MaintenanceTaskCheck[]>([])
    const [attachments, setAttachments] = useState<MaintenanceTaskAttachment[]>([])
    const [completionNotes, setCompletionNotes] = useState('')
    const [reviewNotes, setReviewNotes] = useState('')
    const [reviewerSignatureUrl, setReviewerSignatureUrl] = useState<string | null>(null)
    const [isBusy, setIsBusy] = useState(false)
    const [isLoadingChecks, setIsLoadingChecks] = useState(false)
    const [isLoadingAttachments, setIsLoadingAttachments] = useState(false)
    const [isExportingPdf, setIsExportingPdf] = useState(false)
    const [now, setNow] = useState(Date.now())
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
    const [cancelReason, setCancelReason] = useState('')
    const autosaveToastRef = useRef<number | string | null>(null)

    const teamMembershipQuery = useQuery({
        queryKey: ['pm-task-team-membership', taskSnapshot?.assigned_team_id, user?.id],
        enabled: isOpen && !!taskSnapshot?.assigned_team_id && !!user?.id,
        queryFn: async () => {
            const { data, error } = await (supabase.from('team_members') as any)
                .select('id')
                .eq('team_id', taskSnapshot?.assigned_team_id)
                .eq('user_id', user?.id)
                .eq('is_active', true)
                .maybeSingle()

            if (error) throw error
            return Boolean(data?.id)
        },
    })

    useEffect(() => {
        if (!task || !isOpen) return

        setTaskSnapshot(task)
        setCompletionNotes(task.completion_notes ?? '')
        setReviewNotes(task.review_notes ?? '')
        setReviewerSignatureUrl(task.reviewer_signature_url ?? null)
        setCancelReason('')

        if (task.checklist_template_id) {
            setIsLoadingChecks(true)
            void getTaskChecks(task.id)
                .then(setChecks)
                .finally(() => setIsLoadingChecks(false))
        } else {
            setChecks([])
        }

        setIsLoadingAttachments(true)
        void getTaskAttachments(task.id)
            .then(setAttachments)
            .finally(() => setIsLoadingAttachments(false))
    }, [getTaskAttachments, getTaskChecks, isOpen, task])

    useEffect(() => {
        if (!isOpen || taskSnapshot?.status !== 'in_progress') return
        const interval = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(interval)
    }, [isOpen, taskSnapshot?.status])

    // Must be above the early return — hooks cannot be called conditionally
    const checksForDisplay = useMemo(() => {
        const snapshotItems = taskSnapshot?.execution_snapshot?.items ?? []
        const snapshotItemsById = new Map(snapshotItems.map((item) => [item.id, item]))

        return checks.map((check) => ({
            ...check,
            template_item: snapshotItemsById.get(check.template_item_id) ?? check.template_item,
        }))
    }, [checks, taskSnapshot?.execution_snapshot])

    const sectionsForDisplay = useMemo(() => {
        const snapshotSections = taskSnapshot?.execution_snapshot?.sections ?? []
        if (snapshotSections.length > 0) return snapshotSections

        const sectionMap = new Map<string, ChecklistTemplateSection>()
        checksForDisplay.forEach((check) => {
            const section = check.template_item?.section
            if (section?.id) sectionMap.set(section.id, section)
        })

        return Array.from(sectionMap.values()).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }, [checksForDisplay, taskSnapshot?.execution_snapshot])

    const checksBySection = useMemo(() => {
        const map = new Map<string, MaintenanceTaskCheck[]>()
        checksForDisplay.forEach((check) => {
            const sectionId = check.template_item?.section_id ?? 'general'
            const current = map.get(sectionId) ?? []
            current.push(check)
            map.set(sectionId, current)
        })
        return map
    }, [checksForDisplay])

    const validationSummary = useMemo(() => {
        const requiredIncomplete = checksForDisplay.filter((check) => {
            const item = check.template_item
            return item?.is_required ? !isTaskCheckAnswered(check, item) : false
        })

        const hasPhoto =
            attachments.some((attachment) => ['before_photo', 'after_photo', 'check_photo'].includes(attachment.attachment_type) && Boolean(attachment.file_url)) ||
            checksForDisplay.some((check) => check.template_item?.item_type === 'photo' && Boolean(check.value_photo_url))
        const hasSignature =
            Boolean(taskSnapshot?.executor_signature_url) ||
            checksForDisplay.some((check) => check.template_item?.item_type === 'signature' && Boolean(check.value_signature_url))

        return {
            missingRequired: requiredIncomplete.length,
            hasPhoto,
            hasSignature,
        }
    }, [attachments, checksForDisplay, taskSnapshot?.executor_signature_url])

    if (!taskSnapshot || !task || !isOpen) return null

    const canManage = can('maintenance.manage')
    const canExecuteTask = canManage || taskSnapshot.assigned_to === user?.id || Boolean(teamMembershipQuery.data)
    const canReviewTask = canManage && taskSnapshot.status === 'completed'
    const canExportPdf = taskSnapshot.status !== 'pending'
    const isReadOnly = !canExecuteTask || taskSnapshot.status === 'completed' || taskSnapshot.status === 'cancelled'
    const isLegacyChecklist = !taskSnapshot.checklist_template_id && Array.isArray(taskSnapshot.checklist) && taskSnapshot.checklist.length > 0
    const completedChecks = getCompletedChecksCount(checksForDisplay)
    const totalChecks = checksForDisplay.length
    const requiredChecksCount = checksForDisplay.filter((c) => c.template_item?.is_required).length
    const completedRequiredCount = requiredChecksCount - validationSummary.missingRequired
    const elapsedTime = formatElapsed(taskSnapshot.started_at, now)
    const snapshotBundle = taskSnapshot.execution_snapshot?.frequency_bundle as Record<string, unknown> | undefined
    const snapshotTemplate = taskSnapshot.execution_snapshot?.template as Record<string, unknown> | undefined

    const completeBlocked =
        taskSnapshot.status !== 'in_progress' ||
        (taskSnapshot.checklist_template_id
            ? validationSummary.missingRequired > 0 ||
            (taskSnapshot.requires_photo && !validationSummary.hasPhoto) ||
            (taskSnapshot.requires_signature && !validationSummary.hasSignature)
            : !isLegacyChecklistComplete(taskSnapshot.checklist))

    const handleAutosaveToast = () => {
        autosaveToastRef.current = toast.success(t('pm.checks.auto_saved'), {
            id: autosaveToastRef.current ?? undefined,
            duration: 1200,
        })
    }

    const refreshTaskChecks = async () => {
        if (!taskSnapshot.checklist_template_id) return
        const data = await getTaskChecks(taskSnapshot.id)
        setChecks(data)
    }

    const refreshAttachments = async () => {
        const data = await getTaskAttachments(taskSnapshot.id)
        setAttachments(data)
    }

    const pickFile = async (accept = '*/*') => {
        return new Promise<File | null>((resolve) => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = accept
            input.onchange = () => resolve(input.files?.[0] ?? null)
            input.click()
        })
    }

    const saveTaskAttachment = async (
        file: File,
        attachmentType: MaintenanceTaskAttachmentType,
        notes?: string,
        checkId?: string | null
    ) => {
        const dataUrl = await fileToDataUrl(file)
        const attachment = await addTaskAttachment({
            task_id: taskSnapshot.id,
            check_id: checkId ?? null,
            attachment_type: attachmentType,
            file_name: file.name,
            file_url: dataUrl,
            mime_type: file.type || null,
            file_size: file.size,
            notes: notes ?? null,
            metadata: { source: 'pm_execution_modal' },
        })
        setAttachments((current) => [attachment, ...current])
        return attachment
    }

    const handleStartTask = async () => {
        try {
            setIsBusy(true)
            await startTask(taskSnapshot.id)
            const startedAt = new Date().toISOString()
            const { data: snapshot } = await (supabase as any).rpc('pm_build_task_execution_snapshot', {
                p_task_id: taskSnapshot.id,
            })
            setTaskSnapshot((current) => current ? {
                ...current,
                status: 'in_progress',
                execution_status: 'in_progress',
                started_at: current.started_at ?? startedAt,
                execution_snapshot: current.execution_snapshot ?? snapshot ?? null,
            } : current)
            await refreshTaskChecks()
            toast.success(t('pm.success.task_started'))
            onTaskChanged?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.task_update_failed'))
        } finally {
            setIsBusy(false)
        }
    }

    const handleCompleteTask = async () => {
        if (completeBlocked) {
            if (validationSummary.missingRequired > 0) {
                toast.error(t('pm.tasks.required_incomplete'))
            } else if (taskSnapshot.requires_photo && !validationSummary.hasPhoto) {
                toast.error(t('pm.tasks.photo_required'))
            } else if (taskSnapshot.requires_signature && !validationSummary.hasSignature) {
                toast.error(t('pm.tasks.signature_required'))
            } else {
                toast.error(t('pm.error.checks_incomplete'))
            }
            return
        }

        try {
            setIsBusy(true)
            await completeTask(taskSnapshot.id, completionNotes)
            const completedAt = new Date().toISOString()
            setTaskSnapshot((current) => current ? {
                ...current,
                status: 'completed',
                execution_status: 'completed',
                review_status: 'pending',
                completed_at: completedAt,
                execution_completed_at: completedAt,
                execution_completed_by: user?.id ?? current.execution_completed_by,
                completion_notes: completionNotes || current.completion_notes,
            } : current)
            toast.success(t('pm.success.task_completed'))
            onTaskChanged?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.task_update_failed'))
        } finally {
            setIsBusy(false)
        }
    }

    const handleCancelTask = async () => {
        if (!cancelReason.trim()) {
            toast.error(t('pm.tasks.cancel_reason'))
            return
        }

        try {
            setIsBusy(true)
            await cancelTask(taskSnapshot.id, cancelReason.trim())
            setTaskSnapshot((current) => current ? { ...current, status: 'cancelled', completion_notes: cancelReason.trim() } : current)
            setCancelDialogOpen(false)
            toast.success(t('pm.success.task_cancelled'))
            onTaskChanged?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.task_update_failed'))
        } finally {
            setIsBusy(false)
        }
    }

    const handleLegacyChecklistToggle = async (itemId: string) => {
        if (isReadOnly) return
        const nextChecklist = (taskSnapshot.checklist ?? []).map((item) => item.id === itemId ? { ...item, checked: !item.checked } : item)
        setTaskSnapshot((current) => current ? { ...current, checklist: nextChecklist } : current)

        try {
            await updateTask(taskSnapshot.id, { checklist: nextChecklist })
            handleAutosaveToast()
            onTaskChanged?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.task_update_failed'))
        }
    }

    const handleCheckUpdate = async (check: MaintenanceTaskCheck, data: UpdateCheckInput) => {
        if (isReadOnly) return
        const previousChecks = checks
        const nextChecks = checks.map((current) => current.id === check.id ? { ...current, ...data } : current)
        setChecks(nextChecks)

        try {
            await updateTaskCheck(check.id, data)
            handleAutosaveToast()
            onTaskChanged?.()
        } catch (error) {
            setChecks(previousChecks)
            toast.error(error instanceof Error ? error.message : t('pm.error.task_update_failed'))
        }
    }

    const handleFileUpload = async (
        check: MaintenanceTaskCheck,
        field: 'value_photo_url' | 'value_signature_url',
        status: TaskCheckStatus
    ) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return

            try {
                const dataUrl = await fileToDataUrl(file)
                await handleCheckUpdate(check, { [field]: dataUrl, status } as UpdateCheckInput)
                await addTaskAttachment({
                    task_id: taskSnapshot.id,
                    check_id: check.id,
                    attachment_type: field === 'value_signature_url' ? 'signature' : 'check_photo',
                    file_name: file.name,
                    file_url: dataUrl,
                    mime_type: file.type || null,
                    file_size: file.size,
                    metadata: { checklist_check_id: check.id, field },
                })
                await refreshAttachments()
            } catch (error) {
                toast.error(error instanceof Error ? error.message : t('pm.error.file_upload_failed'))
            }
        }
        input.click()
    }

    const handleAttachmentUpload = async (attachmentType: MaintenanceTaskAttachmentType) => {
        if (isReadOnly) return
        const accept = attachmentType.includes('photo') ? 'image/*' : '*/*'
        const file = await pickFile(accept)
        if (!file) return

        try {
            setIsBusy(true)
            await saveTaskAttachment(file, attachmentType)
            toast.success(t('pm.success.attachment_uploaded'))
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.file_upload_failed'))
        } finally {
            setIsBusy(false)
        }
    }

    const handleExecutorSignatureUpload = async () => {
        if (isReadOnly) return
        const file = await pickFile('image/*')
        if (!file) return

        try {
            setIsBusy(true)
            const attachment = await saveTaskAttachment(file, 'signature', t('pm.execution.executor_signature'))
            await updateTask(taskSnapshot.id, { executor_signature_url: attachment.file_url })
            setTaskSnapshot((current) => current ? { ...current, executor_signature_url: attachment.file_url } : current)
            toast.success(t('pm.success.signature_saved'))
            onTaskChanged?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.file_upload_failed'))
        } finally {
            setIsBusy(false)
        }
    }

    const handleReviewerSignatureUpload = async () => {
        if (!canReviewTask) return
        const file = await pickFile('image/*')
        if (!file) return

        try {
            setIsBusy(true)
            const attachment = await saveTaskAttachment(file, 'review_signature', t('pm.execution.reviewer_signature'))
            setReviewerSignatureUrl(attachment.file_url)
            toast.success(t('pm.success.signature_saved'))
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.file_upload_failed'))
        } finally {
            setIsBusy(false)
        }
    }

    const handleReviewTask = async (reviewStatus: 'approved' | 'needs_rework') => {
        if (!canReviewTask) return

        try {
            setIsBusy(true)
            await reviewTask(taskSnapshot.id, {
                review_status: reviewStatus,
                review_notes: reviewNotes.trim() || null,
                reviewer_signature_url: reviewerSignatureUrl,
            })
            const reviewedAt = new Date().toISOString()
            setTaskSnapshot((current) => current ? {
                ...current,
                status: reviewStatus === 'needs_rework' ? 'in_progress' : current.status,
                review_status: reviewStatus,
                execution_status: reviewStatus === 'approved' ? 'approved' : 'needs_rework',
                completed_at: reviewStatus === 'needs_rework' ? null : current.completed_at,
                execution_completed_at: reviewStatus === 'needs_rework' ? null : current.execution_completed_at,
                review_notes: reviewNotes.trim() || null,
                reviewer_signature_url: reviewerSignatureUrl,
                reviewed_by: user?.id ?? current.reviewed_by,
                reviewed_at: reviewedAt,
            } : current)
            toast.success(reviewStatus === 'approved' ? t('pm.success.task_approved') : t('pm.success.task_rework_requested'))
            onTaskChanged?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.review_failed'))
        } finally {
            setIsBusy(false)
        }
    }

    const handleExportPdf = async () => {
        if (!canExportPdf) return

        try {
            setIsExportingPdf(true)
            const result = await generatePmExecutionPdf({
                task: taskSnapshot,
                checks: checksForDisplay,
                sections: sectionsForDisplay,
                attachments,
                tenantName: currentTenant ? (isRTL ? currentTenant.name_ar || currentTenant.name : currentTenant.name) : 'Mutqan',
                isRTL,
                labels: {
                    title: t('pm.execution.pdf_title'),
                    reference: t('pm.execution.reference'),
                    plan: t('pm.plans.title'),
                    bundle: t('pm.bundles.title'),
                    asset: t('pm.tasks.asset'),
                    building: t('pm.tasks.building'),
                    dueDate: t('pm.tasks.due_date'),
                    executionDate: t('pm.execution.execution_date'),
                    technician: t('pm.tasks.technician'),
                    reviewer: t('pm.execution.reviewer'),
                    reviewStatus: t('pm.execution.review_status'),
                    duration: t('pm.tasks.actual_duration'),
                    section: t('pm.templates.sections'),
                    item: t('pm.templates.items'),
                    result: t('pm.execution.result'),
                    status: t('common.status'),
                    notes: t('pm.tasks.completion_notes'),
                    attachments: t('pm.execution.attachments'),
                    signatures: t('pm.execution.signatures'),
                    workOrder: t('workOrders.title'),
                    notAvailable: t('common.none'),
                },
            })

            await recordPdfExport({
                task_id: taskSnapshot.id,
                file_name: result.fileName,
                rendered_snapshot: result.renderedSnapshot,
                results_snapshot: result.resultsSnapshot,
                metadata: {
                    generated_at: result.generatedAt,
                    source: 'pm_execution_modal',
                    attachment_count: attachments.length,
                    check_count: checksForDisplay.length,
                },
            })

            setTaskSnapshot((current) => current ? {
                ...current,
                pdf_export_count: (current.pdf_export_count ?? 0) + 1,
                latest_pdf_exported_at: result.generatedAt,
            } : current)
            toast.success(t('pm.success.pdf_exported'))
            onTaskChanged?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.pdf_export_failed'))
        } finally {
            setIsExportingPdf(false)
        }
    }

    const handleCreateWorkOrder = async () => {
        if (!currentTenant?.id || !user?.id) {
            toast.error(t('pm.error.task_update_failed'))
            return
        }

        try {
            setIsBusy(true)
            const workOrder = await createWorkOrderMutation.mutateAsync({
                tenant_id: currentTenant.id,
                code: `WO-${Date.now().toString().slice(-8)}`,
                title: taskSnapshot.title,
                description: taskSnapshot.description ?? null,
                status: taskSnapshot.assigned_to || taskSnapshot.assigned_team_id ? 'assigned' : 'pending',
                priority: taskSnapshot.priority === 'critical' ? 'high' : (taskSnapshot.priority as 'low' | 'medium' | 'high'),
                reported_by: user.id,
                assigned_to: taskSnapshot.assigned_to ?? null,
                assigned_team: taskSnapshot.assigned_team_id ?? null,
                building_id: taskSnapshot.building_id ?? null,
                asset_id: taskSnapshot.asset_id ?? null,
                due_date: taskSnapshot.due_date ?? null,
            })

            await updateTask(taskSnapshot.id, { related_work_order_id: workOrder.id })
            setTaskSnapshot((current) => current ? { ...current, related_work_order_id: workOrder.id } : current)
            toast.success(t('pm.success.work_order_created'))
            onTaskChanged?.()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.work_order_create_failed'))
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl">
                    <DialogHeader>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge className={cn('border', getTaskStatusClass(taskSnapshot.status))}>
                                {t(`pm.tasks.status.${taskSnapshot.status}`)}
                            </Badge>
                            <Badge className={cn('border', getPriorityClass(taskSnapshot.priority))}>
                                {t(`pm.plans.priority.${taskSnapshot.priority === 'critical' ? 'critical' : taskSnapshot.priority}`)}
                            </Badge>
                            <Badge variant="outline">
                                {t(`pm.execution.review_status_options.${taskSnapshot.review_status ?? 'not_required'}`)}
                            </Badge>
                        </div>
                        <DialogTitle className="font-cairo">{taskSnapshot.title}</DialogTitle>
                        <DialogDescription className="font-cairo">
                            {taskSnapshot.description || t('common.noData')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6">
                        <section className="rounded-2xl border p-4">
                            <div className="mb-4 flex items-center gap-2">
                                <ClipboardCheck className="h-5 w-5 text-primary" />
                                <h3 className="font-semibold font-cairo">{t('pm.execution.sheet_title')}</h3>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <InfoTile
                                    label={t('pm.execution.reference')}
                                    value={taskSnapshot.execution_reference || `PM-${taskSnapshot.id.replace(/-/g, '').toUpperCase()}`}
                                    dir="ltr"
                                />
                                <InfoTile
                                    label={t('pm.tasks.asset')}
                                    value={taskSnapshot.asset ? `${taskSnapshot.asset.code} - ${isRTL ? taskSnapshot.asset.name_ar || taskSnapshot.asset.name : taskSnapshot.asset.name}` : t('common.none')}
                                />
                                <InfoTile
                                    label={t('pm.tasks.building')}
                                    value={taskSnapshot.building ? (isRTL ? taskSnapshot.building.name_ar || taskSnapshot.building.name : taskSnapshot.building.name) : t('common.none')}
                                />
                                <InfoTile
                                    label={t('pm.plans.title')}
                                    value={taskSnapshot.plan ? (isRTL ? taskSnapshot.plan.name_ar || taskSnapshot.plan.name : taskSnapshot.plan.name) : t('common.none')}
                                />
                                <InfoTile
                                    label={t('pm.bundles.title')}
                                    value={
                                        snapshotBundle
                                            ? String((isRTL ? snapshotBundle.name_ar || snapshotBundle.name : snapshotBundle.name) || t('common.none'))
                                            : taskSnapshot.frequencyBundle
                                                ? (isRTL ? taskSnapshot.frequencyBundle.name_ar || taskSnapshot.frequencyBundle.name : taskSnapshot.frequencyBundle.name)
                                                : t('common.none')
                                    }
                                />
                                <InfoTile
                                    label={t('pm.tasks.estimated_duration')}
                                    value={formatDurationMinutes(taskSnapshot.estimated_duration_minutes) ?? t('common.none')}
                                    dir="ltr"
                                />
                                <InfoTile
                                    label={t('pm.execution.review_status')}
                                    value={t(`pm.execution.review_status_options.${taskSnapshot.review_status ?? 'not_required'}`)}
                                />
                            </div>

                            {taskSnapshot.asset_id ? (
                                <div className="mt-4">
                                    <Link className="text-sm text-primary hover:underline" to={`/assets/${taskSnapshot.asset_id}`}>
                                        {t('assets.title')}
                                    </Link>
                                </div>
                            ) : null}

                            {taskSnapshot.status === 'in_progress' ? (
                                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                                    <Timer className="h-4 w-4" />
                                    <span className="font-mono" dir="ltr">{elapsedTime}</span>
                                    <span className="font-cairo">{t('pm.tasks.elapsed_time')}</span>
                                </div>
                            ) : null}
                        </section>

                        {taskSnapshot.status === 'pending' ? (
                            <section className="rounded-2xl border p-4">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="space-y-1">
                                        <h3 className="font-semibold font-cairo">{t('pm.tasks.start')}</h3>
                                        <p className="text-sm text-muted-foreground font-cairo">
                                            {t('pm.tasks.pending_hint')}
                                        </p>
                                    </div>
                                    {canExecuteTask ? (
                                        <Button onClick={handleStartTask} disabled={isBusy}>
                                            {isBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <PlayCircle className="me-2 h-4 w-4" />}
                                            {t('pm.tasks.start')}
                                        </Button>
                                    ) : (
                                        <Badge variant="outline">{t('pm.tasks.read_only')}</Badge>
                                    )}
                                </div>
                            </section>
                        ) : null}

                        {taskSnapshot.review_status === 'needs_rework' && taskSnapshot.status === 'in_progress' ? (
                            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                                    <div className="space-y-1">
                                        <h3 className="font-semibold font-cairo">{t('pm.execution.request_rework')}</h3>
                                        <p className="text-sm font-cairo">{taskSnapshot.review_notes || t('pm.execution.review_notes')}</p>
                                    </div>
                                </div>
                            </section>
                        ) : null}

                        {taskSnapshot.checklist_template_id ? (
                            <section className="rounded-2xl border p-4">
                                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h3 className="font-semibold font-cairo">{t('pm.templates.title')}</h3>
                                        <p className="text-sm text-muted-foreground font-cairo">
                                            {snapshotTemplate
                                                ? String((isRTL ? snapshotTemplate.name_ar || snapshotTemplate.name : snapshotTemplate.name) || t('common.noData'))
                                                : taskSnapshot.checklistTemplate
                                                    ? (isRTL ? taskSnapshot.checklistTemplate.name_ar || taskSnapshot.checklistTemplate.name : taskSnapshot.checklistTemplate.name)
                                                    : t('common.noData')}
                                        </p>
                                    </div>
                                    <Badge variant="secondary">
                                        {t('pm.checks.progress', { completed: completedChecks, total: totalChecks })}
                                    </Badge>
                                </div>

                                {totalChecks > 0 && taskSnapshot.status !== 'pending' ? (
                                    <div className="mb-4 space-y-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between text-xs text-muted-foreground font-cairo">
                                                <span>{t('pm.checks.progress', { completed: completedChecks, total: totalChecks })}</span>
                                                <span>{totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0}%</span>
                                            </div>
                                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full bg-primary transition-all"
                                                    style={{ width: `${totalChecks > 0 ? (completedChecks / totalChecks) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                        {requiredChecksCount > 0 ? (
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between text-xs text-muted-foreground font-cairo">
                                                    <span>{t('pm.checks.required_progress', { completed: completedRequiredCount, total: requiredChecksCount })}</span>
                                                    <span>{Math.round((completedRequiredCount / requiredChecksCount) * 100)}%</span>
                                                </div>
                                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className={cn('h-full rounded-full transition-all', completedRequiredCount === requiredChecksCount ? 'bg-green-500' : 'bg-amber-500')}
                                                        style={{ width: `${(completedRequiredCount / requiredChecksCount) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}

                                {isLoadingChecks ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                    </div>
                                ) : checksForDisplay.length === 0 ? (
                                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground font-cairo">
                                        {t('pm.templates.empty')}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {(sectionsForDisplay.length > 0 ? sectionsForDisplay : [null]).map((section) => {
                                            const sectionChecks = section
                                                ? checksBySection.get(section.id) ?? []
                                                : checksForDisplay
                                            if (sectionChecks.length === 0) return null

                                            return (
                                                <div key={section?.id ?? 'general'} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                                                    {section ? (
                                                        <div className="border-b bg-slate-900 px-4 py-3 text-white">
                                                            <div className="flex flex-col gap-1">
                                                                <h4 className="font-semibold font-cairo">
                                                                    {isRTL ? section.title_ar || section.title : section.title}
                                                                </h4>
                                                                {(isRTL ? section.description_ar || section.description : section.description) ? (
                                                                    <p className="text-sm text-white/70 font-cairo">
                                                                        {isRTL ? section.description_ar || section.description : section.description}
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                    <div className="space-y-3 p-4">
                                                        {sectionChecks.map((check) => (
                                                            <CheckCard
                                                                key={check.id}
                                                                check={check}
                                                                isReadOnly={isReadOnly}
                                                                onUpdate={handleCheckUpdate}
                                                                onUpload={handleFileUpload}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {validationSummary.missingRequired > 0 ? (
                                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-700">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                                        <p className="text-sm font-cairo">{t('pm.tasks.required_incomplete')}</p>
                                    </div>
                                ) : null}
                            </section>
                        ) : null}

                        {isLegacyChecklist ? (
                            <section className="rounded-2xl border p-4">
                                <div className="mb-4 flex items-center gap-2">
                                    <Wrench className="h-5 w-5 text-primary" />
                                    <h3 className="font-semibold font-cairo">{t('pm.tasks.legacy_checklist')}</h3>
                                </div>
                                <div className="space-y-2">
                                    {taskSnapshot.checklist.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            disabled={isReadOnly}
                                            onClick={() => void handleLegacyChecklistToggle(item.id)}
                                            className={cn(
                                                'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-start',
                                                item.checked ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-background'
                                            )}
                                        >
                                            <span className="font-cairo">
                                                {isRTL ? item.text_ar || item.text : item.text}
                                            </span>
                                            {item.checked ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        <section className="rounded-2xl border bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                    <Paperclip className="h-5 w-5 text-primary" />
                                    <h3 className="font-semibold font-cairo">{t('pm.execution.attachments')}</h3>
                                </div>
                                {!isReadOnly ? (
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={() => void handleAttachmentUpload('before_photo')}>
                                            <Upload className="me-2 h-4 w-4" />
                                            {t('pm.execution.before_photo')}
                                        </Button>
                                        <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={() => void handleAttachmentUpload('after_photo')}>
                                            <Upload className="me-2 h-4 w-4" />
                                            {t('pm.execution.after_photo')}
                                        </Button>
                                        <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={() => void handleAttachmentUpload('general')}>
                                            <Paperclip className="me-2 h-4 w-4" />
                                            {t('pm.execution.add_attachment')}
                                        </Button>
                                    </div>
                                ) : null}
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                                <div>
                                    {isLoadingAttachments ? (
                                        <div className="flex items-center justify-center rounded-xl border border-dashed py-10">
                                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                        </div>
                                    ) : attachments.length === 0 ? (
                                        <div className="rounded-xl border border-dashed bg-white/70 px-4 py-10 text-center text-sm text-muted-foreground font-cairo">
                                            {t('pm.execution.no_attachments')}
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {attachments.map((attachment) => (
                                                <AttachmentCard key={attachment.id} attachment={attachment} />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                                    <div className="mb-3 flex items-center gap-2">
                                        <FileSignature className="h-5 w-5 text-primary" />
                                        <h4 className="font-semibold font-cairo">{t('pm.execution.executor_signature')}</h4>
                                    </div>
                                    {taskSnapshot.executor_signature_url ? (
                                        <img src={taskSnapshot.executor_signature_url} alt={t('pm.execution.executor_signature')} className="mb-3 h-28 w-full rounded-xl border object-contain" />
                                    ) : (
                                        <div className="mb-3 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground font-cairo">
                                            {t('pm.execution.no_signature')}
                                        </div>
                                    )}
                                    {!isReadOnly ? (
                                        <Button type="button" variant="outline" className="w-full" disabled={isBusy} onClick={() => void handleExecutorSignatureUpload()}>
                                            <Upload className="me-2 h-4 w-4" />
                                            {t('pm.execution.upload_signature')}
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        </section>

                        <section className="rounded-2xl border p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <FileSignature className="h-5 w-5 text-primary" />
                                <h3 className="font-semibold font-cairo">{t('pm.tasks.completion_notes')}</h3>
                            </div>
                            <Textarea
                                rows={4}
                                value={completionNotes}
                                onChange={(event) => setCompletionNotes(event.target.value)}
                                placeholder={t('pm.tasks.completion_notes')}
                                readOnly={isReadOnly}
                            />
                            {taskSnapshot.status === 'completed' && taskSnapshot.actual_duration_minutes ? (
                                <div className="mt-3 text-sm text-muted-foreground">
                                    {t('pm.tasks.actual_duration')}: <span dir="ltr">{formatDurationMinutes(taskSnapshot.actual_duration_minutes)}</span>
                                </div>
                            ) : null}
                        </section>

                        {taskSnapshot.status === 'completed' ? (
                            <section className="rounded-2xl border bg-emerald-50/40 p-4 shadow-sm">
                                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-5 w-5 text-emerald-700" />
                                        <h3 className="font-semibold font-cairo">{t('pm.execution.review')}</h3>
                                    </div>
                                    <Badge variant="outline">
                                        {t(`pm.execution.review_status_options.${taskSnapshot.review_status ?? 'not_required'}`)}
                                    </Badge>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                                    <div className="space-y-3">
                                        <Textarea
                                            rows={4}
                                            value={reviewNotes}
                                            onChange={(event) => setReviewNotes(event.target.value)}
                                            placeholder={t('pm.execution.review_notes')}
                                            readOnly={!canReviewTask}
                                        />
                                        {taskSnapshot.reviewed_at ? (
                                            <p className="text-sm text-muted-foreground" dir="ltr">
                                                {t('pm.execution.reviewed_at')}: {new Date(taskSnapshot.reviewed_at).toLocaleString()}
                                            </p>
                                        ) : null}
                                        {canReviewTask ? (
                                            <div className="flex flex-wrap gap-2">
                                                <Button type="button" onClick={() => void handleReviewTask('approved')} disabled={isBusy}>
                                                    {isBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="me-2 h-4 w-4" />}
                                                    {t('pm.execution.approve')}
                                                </Button>
                                                <Button type="button" variant="outline" onClick={() => void handleReviewTask('needs_rework')} disabled={isBusy}>
                                                    {t('pm.execution.request_rework')}
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="rounded-2xl border bg-white p-4 shadow-sm">
                                        <div className="mb-3 flex items-center gap-2">
                                            <FileSignature className="h-5 w-5 text-primary" />
                                            <h4 className="font-semibold font-cairo">{t('pm.execution.reviewer_signature')}</h4>
                                        </div>
                                        {reviewerSignatureUrl ? (
                                            <img src={reviewerSignatureUrl} alt={t('pm.execution.reviewer_signature')} className="mb-3 h-28 w-full rounded-xl border object-contain" />
                                        ) : (
                                            <div className="mb-3 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground font-cairo">
                                                {t('pm.execution.no_signature')}
                                            </div>
                                        )}
                                        {canReviewTask ? (
                                            <Button type="button" variant="outline" className="w-full" disabled={isBusy} onClick={() => void handleReviewerSignatureUpload()}>
                                                <Upload className="me-2 h-4 w-4" />
                                                {t('pm.execution.upload_signature')}
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            </section>
                        ) : null}
                    </div>

                    <DialogFooter className="gap-2 border-t pt-4">
                        {canExportPdf ? (
                            <Button variant="outline" onClick={() => void handleExportPdf()} disabled={isExportingPdf}>
                                {isExportingPdf ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <FileDown className="me-2 h-4 w-4" />}
                                {t('pm.execution.export_pdf')}
                            </Button>
                        ) : null}

                        {taskSnapshot.related_work_order_id ? (
                            <Button variant="outline" asChild>
                                <Link to={`/work-orders/${taskSnapshot.related_work_order_id}`}>
                                    {t('workOrders.title')}
                                </Link>
                            </Button>
                        ) : can('work_orders.create') ? (
                            <Button variant="outline" onClick={handleCreateWorkOrder} disabled={isBusy}>
                                {isBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                                {t('workOrders.createWorkOrder')}
                            </Button>
                        ) : null}

                        {taskSnapshot.status === 'in_progress' && canExecuteTask ? (
                            <Button variant="destructive" onClick={() => setCancelDialogOpen(true)} disabled={isBusy}>
                                {t('pm.tasks.cancel')}
                            </Button>
                        ) : null}

                        {taskSnapshot.status === 'in_progress' && canExecuteTask ? (
                            <Button onClick={handleCompleteTask} disabled={isBusy || completeBlocked}>
                                {isBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="me-2 h-4 w-4" />}
                                {t('pm.tasks.complete')}
                            </Button>
                        ) : null}

                        {taskSnapshot.status === 'pending' && canExecuteTask ? (
                            <Button onClick={handleStartTask} disabled={isBusy}>
                                {isBusy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <PlayCircle className="me-2 h-4 w-4" />}
                                {t('pm.tasks.start')}
                            </Button>
                        ) : null}

                        <Button variant="outline" onClick={onClose}>
                            {t('common.close')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-cairo">{t('pm.tasks.cancel')}</AlertDialogTitle>
                        <AlertDialogDescription className="font-cairo">
                            {t('pm.confirm.cancel_task')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Textarea
                        rows={3}
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        placeholder={t('pm.tasks.cancel_reason')}
                    />
                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancelTask}>
                            {t('pm.tasks.cancel')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

function InfoTile({
    label,
    value,
    dir,
}: {
    label: string
    value: string
    dir?: 'ltr' | 'rtl'
}) {
    return (
        <div className="rounded-xl bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground font-cairo">{label}</p>
            <p className="mt-1 font-medium" dir={dir}>{value}</p>
        </div>
    )
}

function AttachmentCard({ attachment }: { attachment: MaintenanceTaskAttachment }) {
    const { t } = useTranslation()
    const isImage = attachment.file_url.startsWith('data:image/') || attachment.mime_type?.startsWith('image/')

    return (
        <a
            href={attachment.file_url}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:border-primary/30 hover:shadow-md"
        >
            {isImage ? (
                <img src={attachment.file_url} alt={attachment.file_name} className="h-32 w-full object-cover" />
            ) : (
                <div className="flex h-32 items-center justify-center bg-slate-100 text-slate-500">
                    <Paperclip className="h-8 w-8" />
                </div>
            )}
            <div className="space-y-1 p-3">
                <Badge variant="outline">{t(`pm.execution.attachment_type.${attachment.attachment_type}`)}</Badge>
                <p className="truncate text-sm font-medium">{attachment.file_name}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                    {new Date(attachment.uploaded_at).toLocaleString()}
                </p>
            </div>
        </a>
    )
}

function CheckCard({
    check,
    isReadOnly,
    onUpdate,
    onUpload,
}: {
    check: MaintenanceTaskCheck
    isReadOnly: boolean
    onUpdate: (check: MaintenanceTaskCheck, data: UpdateCheckInput) => Promise<void>
    onUpload: (
        check: MaintenanceTaskCheck,
        field: 'value_photo_url' | 'value_signature_url',
        status: TaskCheckStatus
    ) => Promise<void>
}) {
    const { t } = useTranslation()
    const item = check.template_item as ChecklistTemplateItem | undefined

    if (!item) return null

    const numericOptions =
        item.options && !Array.isArray(item.options) && typeof item.options === 'object'
            ? item.options as Record<string, number | string>
            : null
    const unit = item.unit ?? (numericOptions?.unit ? String(numericOptions.unit) : null)
    const warningMin = item.warning_min_value ?? (typeof numericOptions?.warning_min === 'number' ? numericOptions.warning_min : null)
    const warningMax = item.warning_max_value ?? (typeof numericOptions?.warning_max === 'number' ? numericOptions.warning_max : null)
    const minValue = item.min_value ?? (typeof numericOptions?.min === 'number' ? numericOptions.min : null)
    const maxValue = item.max_value ?? (typeof numericOptions?.max === 'number' ? numericOptions.max : null)

    const outOfRange =
        (item.item_type === 'numeric' || item.item_type === 'reading') &&
        typeof check.value_numeric === 'number' &&
        (
            (typeof warningMin === 'number' && check.value_numeric < warningMin) ||
            (typeof warningMax === 'number' && check.value_numeric > warningMax) ||
            (typeof minValue === 'number' && check.value_numeric < minValue) ||
            (typeof maxValue === 'number' && check.value_numeric > maxValue)
        )

    return (
        <div className="rounded-xl border bg-background p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium font-cairo">
                            {item.label}
                            {item.is_required ? <span className="text-destructive"> *</span> : null}
                        </p>
                        {item.is_critical ? (
                            <Badge variant="destructive">
                                <AlertTriangle className="me-1 h-3 w-3" />
                                {t('pm.templates.critical')}
                            </Badge>
                        ) : null}
                    </div>
                    {item.label_ar ? <p className="text-sm text-muted-foreground font-cairo">{item.label_ar}</p> : null}
                    {item.help_text || item.help_text_ar ? (
                        <p className="text-xs text-muted-foreground font-cairo">
                            {item.help_text_ar || item.help_text}
                        </p>
                    ) : null}
                </div>
                <Badge variant="outline">{t(`pm.templates.item_type.${item.item_type}`)}</Badge>
            </div>

            {item.item_type === 'yes_no' ? (
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant={check.status === 'pass' ? 'default' : 'outline'} disabled={isReadOnly} onClick={() => void onUpdate(check, { value_bool: true, status: 'pass' })}>
                        {t('common.yes')}
                    </Button>
                    <Button type="button" variant={check.status === 'fail' ? 'destructive' : 'outline'} disabled={isReadOnly} onClick={() => void onUpdate(check, { value_bool: false, status: 'fail' })}>
                        {t('common.no')}
                    </Button>
                    <Button type="button" variant={check.status === 'na' ? 'secondary' : 'outline'} disabled={isReadOnly} onClick={() => void onUpdate(check, { value_bool: false, status: 'na' })}>
                        {t('pm.checks.na')}
                    </Button>
                </div>
            ) : null}

            {(item.item_type === 'numeric' || item.item_type === 'reading') ? (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            value={check.value_numeric ?? ''}
                            onChange={(event) => void onUpdate(check, {
                                value_numeric: event.target.value ? Number(event.target.value) : null,
                                status: 'pass',
                            })}
                            placeholder={item.placeholder ?? undefined}
                            readOnly={isReadOnly}
                            dir="ltr"
                        />
                        {unit ? <Badge variant="outline">{unit}</Badge> : null}
                    </div>
                    {(minValue !== null || maxValue !== null || warningMin !== null || warningMax !== null) ? (
                        <p className="text-xs text-muted-foreground" dir="ltr">
                            {t('pm.templates.expected_range')}: {minValue ?? '-'} - {maxValue ?? '-'} · {t('pm.templates.warning_range')}: {warningMin ?? '-'} - {warningMax ?? '-'}
                        </p>
                    ) : null}
                    {outOfRange ? (
                        <div className="text-sm text-amber-600">{t('pm.checks.value_out_of_range')}</div>
                    ) : null}
                </div>
            ) : null}

            {item.item_type === 'text' ? (
                <Textarea
                    rows={3}
                    value={check.value_text ?? ''}
                    onChange={(event) => void onUpdate(check, { value_text: event.target.value, status: 'pass' })}
                    placeholder={item.placeholder ?? undefined}
                    readOnly={isReadOnly}
                />
            ) : null}

            {item.item_type === 'select' ? (
                <div className="flex flex-wrap gap-2">
                    {(Array.isArray(item.options) ? item.options : []).map((option) => (
                        <Button
                            key={String(option)}
                            type="button"
                            variant={check.value_text === String(option) ? 'default' : 'outline'}
                            disabled={isReadOnly}
                            onClick={() => void onUpdate(check, { value_text: String(option), status: 'pass' })}
                        >
                            {String(option)}
                        </Button>
                    ))}
                </div>
            ) : null}

            {item.item_type === 'photo' ? (
                <div className="space-y-3">
                    <Button type="button" variant="outline" disabled={isReadOnly} onClick={() => void onUpload(check, 'value_photo_url', 'pass')}>
                        <ImagePlus className="me-2 h-4 w-4" />
                        {t('pm.templates.item_type.photo')}
                    </Button>
                    {check.value_photo_url ? (
                        <img src={check.value_photo_url} alt={item.label} className="h-36 w-full rounded-xl object-cover" />
                    ) : null}
                </div>
            ) : null}

            {item.item_type === 'signature' ? (
                <div className="space-y-3">
                    <Button type="button" variant="outline" disabled={isReadOnly} onClick={() => void onUpload(check, 'value_signature_url', 'pass')}>
                        <Camera className="me-2 h-4 w-4" />
                        {t('pm.templates.item_type.signature')}
                    </Button>
                    {check.value_signature_url ? (
                        <img src={check.value_signature_url} alt={item.label} className="h-32 w-full rounded-xl object-contain" />
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}
