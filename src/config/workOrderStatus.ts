/**
 * ============================================
 * CANONICAL Work Order Status Model
 * ============================================
 * Single source of truth for work order statuses.
 * Must match the SQL CHECK constraint on work_orders.status
 *
 * Flow:
 *   pending → assigned → in_progress
 *     → pending_supervisor_approval → pending_engineer_review → pending_reporter_closure → completed
 *     ↑ (reject returns to in_progress from any pending_* state)
 *
 * Terminal statuses: completed, cancelled, archived
 * ============================================
 */

export const WORK_ORDER_STATUSES = [
    'pending',
    'assigned',
    'in_progress',
    'pending_supervisor_approval',
    'pending_engineer_review',
    'pending_reporter_closure',
    'completed',
    'rejected_by_technician',
    'cancelled',
    'archived',
] as const

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number]

/**
 * Status groups for filtering and display
 */
export const STATUS_GROUPS = {
    /** Open/active statuses — work is ongoing */
    active: ['pending', 'assigned', 'in_progress'] as WorkOrderStatus[],
    /** Awaiting approval/review */
    approval: ['pending_supervisor_approval', 'pending_engineer_review', 'pending_reporter_closure'] as WorkOrderStatus[],
    /** Terminal statuses — work is done */
    closed: ['completed', 'cancelled', 'archived', 'rejected_by_technician'] as WorkOrderStatus[],
}

/**
 * Reject behavior for early launch:
 * - reject_work_order always returns the WO to 'in_progress'
 * - It can be called from any pending_* status
 */
export const REJECTABLE_STATUSES: WorkOrderStatus[] = [
    'pending_supervisor_approval',
    'pending_engineer_review',
    'pending_reporter_closure',
]

export const REJECT_TARGET_STATUS: WorkOrderStatus = 'in_progress'

/**
 * Status display configuration
 * Used by WorkOrdersPage, WorkOrderHeader, etc.
 */
export interface StatusDisplayConfig {
    label: string       // i18n key suffix (e.g. 'pending' → t('workOrders.pending'))
    labelAr: string     // Arabic label for direct display
    color: string       // Tailwind text color class
    bg: string          // Tailwind bg color class
    borderColor: string // Tailwind border color class
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
        color: 'text-purple-500',
        bg: 'bg-purple-500/10',
        borderColor: 'border-purple-500/20',
    },
    pending_reporter_closure: {
        label: 'pendingClosure',
        labelAr: 'بانتظار إغلاق المُبلّغ',
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
    archived: {
        label: 'archived',
        labelAr: 'مؤرشف',
        color: 'text-muted',
        bg: 'bg-muted/10',
        borderColor: 'border-muted/20',
    },
}
