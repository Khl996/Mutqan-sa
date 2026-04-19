/**
 * CANONICAL Work Order Status Model
 *
 * Keep this list aligned with the work_orders.status SQL CHECK constraint.
 * "overdue" is intentionally not a persisted status; it is derived from due_date.
 */

export const WORK_ORDER_STATUSES = [
    'pending',
    'assigned',
    'in_progress',
    'pending_supervisor_approval',
    'pending_engineer_review',
    'pending_reporter_closure',
    'completed',
    'auto_closed',
    'rejected_by_technician',
    'cancelled',
    'on_hold',
    'archived',
] as const

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number]

export const STATUS_GROUPS = {
    open: ['pending', 'assigned'] as WorkOrderStatus[],
    inProgress: ['in_progress'] as WorkOrderStatus[],
    waiting: ['on_hold'] as WorkOrderStatus[],
    approval: [
        'pending_supervisor_approval',
        'pending_engineer_review',
        'pending_reporter_closure',
    ] as WorkOrderStatus[],
    closed: ['completed', 'auto_closed', 'archived'] as WorkOrderStatus[],
    cancelled: ['cancelled', 'rejected_by_technician'] as WorkOrderStatus[],
}

export const REJECTABLE_STATUSES: WorkOrderStatus[] = [
    'pending_supervisor_approval',
    'pending_engineer_review',
    'pending_reporter_closure',
]

export const REJECT_TARGET_STATUS: WorkOrderStatus = 'in_progress'

export interface StatusDisplayConfig {
    label: string
    labelAr: string
    color: string
    bg: string
    borderColor: string
}

export const STATUS_DISPLAY: Record<WorkOrderStatus, StatusDisplayConfig> = {
    pending: {
        label: 'pending',
        labelAr: 'قيد الانتظار',
        color: 'text-warning',
        bg: 'bg-warning/10',
        borderColor: 'border-warning/20',
    },
    assigned: {
        label: 'assigned',
        labelAr: 'تم التعيين',
        color: 'text-info',
        bg: 'bg-info/10',
        borderColor: 'border-info/20',
    },
    in_progress: {
        label: 'inProgress',
        labelAr: 'قيد التنفيذ',
        color: 'text-secondary',
        bg: 'bg-secondary/10',
        borderColor: 'border-secondary/20',
    },
    pending_supervisor_approval: {
        label: 'pendingApproval',
        labelAr: 'بانتظار موافقة المشرف',
        color: 'text-purple-500',
        bg: 'bg-purple-500/10',
        borderColor: 'border-purple-500/20',
    },
    pending_engineer_review: {
        label: 'pendingReview',
        labelAr: 'بانتظار مراجعة المهندس',
        color: 'text-indigo-500',
        bg: 'bg-indigo-500/10',
        borderColor: 'border-indigo-500/20',
    },
    pending_reporter_closure: {
        label: 'pendingClosure',
        labelAr: 'بانتظار إغلاق المبلغ',
        color: 'text-cyan-500',
        bg: 'bg-cyan-500/10',
        borderColor: 'border-cyan-500/20',
    },
    completed: {
        label: 'completed',
        labelAr: 'مكتمل',
        color: 'text-success',
        bg: 'bg-success/10',
        borderColor: 'border-success/20',
    },
    auto_closed: {
        label: 'autoClosed',
        labelAr: 'مغلق تلقائيًا',
        color: 'text-success',
        bg: 'bg-success/10',
        borderColor: 'border-success/20',
    },
    rejected_by_technician: {
        label: 'rejected',
        labelAr: 'مرفوض',
        color: 'text-destructive',
        bg: 'bg-destructive/10',
        borderColor: 'border-destructive/20',
    },
    cancelled: {
        label: 'cancelled',
        labelAr: 'ملغي',
        color: 'text-muted',
        bg: 'bg-muted/10',
        borderColor: 'border-muted/20',
    },
    on_hold: {
        label: 'onHold',
        labelAr: 'معلق',
        color: 'text-orange-500',
        bg: 'bg-orange-500/10',
        borderColor: 'border-orange-500/20',
    },
    archived: {
        label: 'archived',
        labelAr: 'مؤرشف',
        color: 'text-muted',
        bg: 'bg-muted/10',
        borderColor: 'border-muted/20',
    },
}

export type WorkOrderFilterKey =
    | 'all'
    | 'open'
    | 'in_progress'
    | 'waiting'
    | 'approval'
    | 'overdue'
    | 'closed'
    | 'cancelled'

export interface WorkOrderFilterConfig {
    key: WorkOrderFilterKey
    label: string
    labelAr: string
    statuses?: WorkOrderStatus[]
    derived?: 'overdue'
}

export const WORK_ORDER_FILTERS: WorkOrderFilterConfig[] = [
    { key: 'all', label: 'All', labelAr: 'الكل' },
    { key: 'open', label: 'Open', labelAr: 'مفتوحة', statuses: STATUS_GROUPS.open },
    { key: 'in_progress', label: 'In Progress', labelAr: 'قيد التنفيذ', statuses: STATUS_GROUPS.inProgress },
    { key: 'waiting', label: 'Waiting', labelAr: 'بانتظار إجراء', statuses: STATUS_GROUPS.waiting },
    { key: 'approval', label: 'Approval', labelAr: 'اعتمادات', statuses: STATUS_GROUPS.approval },
    { key: 'overdue', label: 'Overdue', labelAr: 'متأخرة', derived: 'overdue' },
    { key: 'closed', label: 'Closed', labelAr: 'مغلقة', statuses: STATUS_GROUPS.closed },
    { key: 'cancelled', label: 'Cancelled', labelAr: 'ملغاة/مرفوضة', statuses: STATUS_GROUPS.cancelled },
]

export function isClosedWorkOrderStatus(status: string) {
    return [...STATUS_GROUPS.closed, ...STATUS_GROUPS.cancelled].includes(status as WorkOrderStatus)
}

export function isOverdueWorkOrder(dueDate: string | null | undefined, status: string) {
    if (!dueDate || isClosedWorkOrderStatus(status)) return false
    return new Date(dueDate) < new Date()
}
