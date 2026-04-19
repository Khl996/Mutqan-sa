import type {
    ChecklistItemLegacy,
    ChecklistTemplateItem,
    MaintenancePlanStatus,
    MaintenanceTask,
    MaintenanceTaskCheck,
    MaintenanceTaskStatus,
    MaintenanceFrequencyType,
    PmPriority,
} from '@/types/maintenance'

export const PM_PLAN_STATUSES: MaintenancePlanStatus[] = ['draft', 'active', 'paused', 'completed', 'archived']
export const PM_TASK_STATUSES: MaintenanceTaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled']
export const PM_PRIORITIES: PmPriority[] = ['low', 'medium', 'high', 'critical']
export const PM_FREQUENCY_TYPES: MaintenanceFrequencyType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'custom']

export function getPlanStatusClass(status: MaintenancePlanStatus) {
    switch (status) {
        case 'active':
            return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20'
        case 'paused':
            return 'bg-amber-500/15 text-amber-700 border-amber-500/20'
        case 'completed':
            return 'bg-sky-500/15 text-sky-700 border-sky-500/20'
        case 'archived':
            return 'bg-slate-500/10 text-slate-600 border-slate-500/20'
        case 'draft':
        default:
            return 'bg-slate-200/70 text-slate-700 border-slate-300'
    }
}

export function getTaskStatusClass(status: MaintenanceTaskStatus) {
    switch (status) {
        case 'in_progress':
            return 'bg-amber-500/15 text-amber-700 border-amber-500/20'
        case 'completed':
            return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20'
        case 'cancelled':
            return 'bg-rose-500/15 text-rose-700 border-rose-500/20'
        case 'pending':
        default:
            return 'bg-slate-200/70 text-slate-700 border-slate-300'
    }
}

export function getPriorityClass(priority: string) {
    switch (priority) {
        case 'critical':
            return 'bg-rose-500/15 text-rose-700 border-rose-500/20'
        case 'high':
            return 'bg-orange-500/15 text-orange-700 border-orange-500/20'
        case 'medium':
            return 'bg-amber-500/15 text-amber-700 border-amber-500/20'
        case 'low':
        default:
            return 'bg-sky-500/15 text-sky-700 border-sky-500/20'
    }
}

export function formatDurationMinutes(minutes: number | null | undefined) {
    if (minutes === null || minutes === undefined || Number.isNaN(minutes)) {
        return null
    }

    if (minutes < 60) {
        return `${minutes}m`
    }

    const hours = Math.floor(minutes / 60)
    const remaining = minutes % 60
    return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
}

export function isTaskOverdue(task: Pick<MaintenanceTask, 'due_date' | 'status'>) {
    if (!task.due_date || task.status === 'completed' || task.status === 'cancelled') {
        return false
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const dueDate = new Date(task.due_date)
    dueDate.setHours(0, 0, 0, 0)

    return dueDate < today
}

export function isLegacyChecklistComplete(items: ChecklistItemLegacy[] | null | undefined) {
    if (!Array.isArray(items) || items.length === 0) {
        return true
    }

    return items.every((item) => item.checked)
}

export function isTaskCheckAnswered(check: MaintenanceTaskCheck, item: ChecklistTemplateItem) {
    switch (item.item_type) {
        case 'yes_no':
            return check.value_bool !== null || check.status === 'na'
        case 'numeric':
        case 'reading':
            return check.value_numeric !== null
        case 'text':
        case 'select':
            return Boolean(check.value_text?.trim())
        case 'photo':
            return Boolean(check.value_photo_url?.trim())
        case 'signature':
            return Boolean(check.value_signature_url?.trim())
        default:
            return false
    }
}

export function getCompletedChecksCount(checks: MaintenanceTaskCheck[]) {
    return checks.filter((check) => {
        const item = check.template_item
        return item ? isTaskCheckAnswered(check, item) : false
    }).length
}

export function getNextPlanStatuses(status: MaintenancePlanStatus) {
    switch (status) {
        case 'draft':
            return ['activate', 'delete'] as const
        case 'active':
            return ['pause', 'complete'] as const
        case 'paused':
            return ['resume', 'archive'] as const
        case 'completed':
            return ['archive'] as const
        case 'archived':
        default:
            return [] as const
    }
}
