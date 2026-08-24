import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'
import type { WorkOrderStatus } from '@/config/workOrderStatus'

// Types
export interface WorkOrder {
    id: string
    tenant_id: string
    code: string
    title: string
    description: string | null
    issue_type_id: string | null
    issue_type: string | null
    status: WorkOrderStatus
    priority: 'low' | 'medium' | 'high' | 'urgent'
    reported_by: string | null
    reporter_name?: string | null
    reporter_phone?: string | null
    assigned_to: string | null
    assigned_team: string | null
    building_id: string | null
    floor_id: string | null
    department_id: string | null
    room_id: string | null
    asset_id: string | null
    reported_at: string
    start_time: string | null
    end_time: string | null
    completed_at: string | null
    cancelled_at?: string | null
    cancellation_reason?: string | null
    due_date: string | null
    estimated_cost: number | null
    actual_cost: number | null
    tags?: string[] | null
    custom_fields?: Record<string, unknown> | null
    attachments: unknown[] | null
    before_images: unknown[] | null
    after_images: unknown[] | null
    created_at: string
    updated_at: string

    // Joined data
    reporter?: { id: string; full_name: string; full_name_ar: string | null }
    assignee?: { id: string; full_name: string; full_name_ar: string | null }
    assignedTeam?: { id: string; code: string; name: string; name_ar: string | null }
    building?: { id: string; name: string; name_ar: string | null }
    floor?: { id: string; name: string; name_ar: string | null }
    department?: { id: string; name: string; name_ar: string | null }
    room?: { id: string; name: string; name_ar: string | null }
    asset?: {
        id: string
        name: string
        name_ar: string | null
        code: string
        building?: { id: string; name: string; name_ar: string | null }
        floor?: { id: string; name: string; name_ar: string | null }
        room?: { id: string; name: string; name_ar: string | null }
    }

    // PM provenance fields
    work_type?: 'corrective' | 'preventive' | string | null
    source_schedule_id?: string | null

    // Workflow tracking fields
    technician_notes?: string | null
    supervisor_notes?: string | null
    engineer_notes?: string | null
    reporter_notes?: string | null

    technician_completed_at?: string | null
    supervisor_approved_by?: string | null
    supervisor_approved_at?: string | null
    engineer_approved_by?: string | null
    engineer_approved_at?: string | null
    maintenance_manager_approved_by?: string | null
    maintenance_manager_approved_at?: string | null

    // PDF generation fields (Phase 6)
    pdf_snapshot?: WorkOrderPdfSnapshot | null
    pdf_generated_at?: string | null
    pdf_version?: number | null
    pdf_file_url?: string | null
}

export interface WorkOrderPdfSnapshot {
    code: string
    description: string | null
    priority: string
    created_at: string
    closed_at: string
    reporter_notes: string | null
    reporter_image_url: string | null
    before_images: unknown[]
    after_images: unknown[]
    issue_type: { id: string; name: string; name_ar: string | null } | null
    building: { id: string; name: string; name_ar: string | null } | null
    floor: { id: string; name: string; name_ar: string | null } | null
    room: { id: string; name: string; name_ar: string | null } | null
    assigned_team: { id: string; name: string; name_ar: string | null } | null
    assignee: { id: string; full_name: string } | null
    reporter: { id: string; full_name: string } | null
    closed_by: { id: string; full_name: string }
}

export function isPreventiveWorkOrder(wo: Pick<WorkOrder, 'work_type' | 'source_schedule_id'>): boolean {
    return wo.work_type === 'preventive' || !!wo.source_schedule_id
}

export interface IssueType {
    id: string
    tenant_id: string | null
    code: string
    name: string
    name_ar: string | null
    description: string | null
    default_priority: string
    icon: string | null
    color: string | null
    is_active: boolean
    display_order: number
}

export interface CreateWorkOrderInput {
    code?: string | null
    title: string
    description?: string | null
    issue_type_id?: string | null
    issue_type?: string | null
    priority?: WorkOrder['priority']
    reported_by?: string | null
    assigned_team?: string | null
    building_id?: string | null
    floor_id?: string | null
    department_id?: string | null
    room_id?: string | null
    asset_id?: string | null
    due_date?: string | null
    reporter_name?: string | null
    reporter_phone?: string | null
}

const WORK_ORDER_METADATA_UPDATE_FIELDS = [
    'title',
    'description',
    'issue_type_id',
    'issue_type',
    'priority',
    'due_date',
    'building_id',
    'floor_id',
    'department_id',
    'room_id',
    'asset_id',
    'estimated_cost',
    'tags',
    'custom_fields',
] as const

type WorkOrderMetadataUpdateField = typeof WORK_ORDER_METADATA_UPDATE_FIELDS[number]

export type UpdateWorkOrderMetadataInput = {
    id: string
} & Partial<Pick<WorkOrder, WorkOrderMetadataUpdateField>>

type WorkOrderMetadataUpdatePayload = Partial<Pick<WorkOrder, WorkOrderMetadataUpdateField>>

const CREATE_WORK_ORDER_FIELDS = [
    'code',
    'title',
    'description',
    'issue_type_id',
    'issue_type',
    'priority',
    'reported_by',
    'assigned_team',
    'building_id',
    'floor_id',
    'department_id',
    'room_id',
    'asset_id',
    'due_date',
    'reporter_name',
    'reporter_phone',
] as const

function sanitizeWorkOrderMetadataUpdates(input: WorkOrderMetadataUpdatePayload): WorkOrderMetadataUpdatePayload {
    const sanitized: Record<string, unknown> = {}

    for (const field of WORK_ORDER_METADATA_UPDATE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(input, field) && input[field] !== undefined) {
            sanitized[field] = input[field]
        }
    }

    if (Object.keys(sanitized).length === 0) {
        throw new Error('No safe work order metadata fields provided for update.')
    }

    return sanitized as WorkOrderMetadataUpdatePayload
}

function sanitizeCreateWorkOrderInput(input: CreateWorkOrderInput): CreateWorkOrderInput {
    const sanitized: Record<string, unknown> = {}

    for (const field of CREATE_WORK_ORDER_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(input, field) && input[field] !== undefined) {
            sanitized[field] = input[field]
        }
    }

    if (!sanitized.title || typeof sanitized.title !== 'string' || sanitized.title.trim() === '') {
        throw new Error('Work order title is required.')
    }

    return sanitized as CreateWorkOrderInput
}

export interface OperationLog {
    id: string
    tenant_id: string
    code: string
    type: 'maintenance' | 'repair' | 'inspection' | 'emergency' | 'routine' | 'installation' | 'calibration' | 'status_change' | 'comment' | 'assignment' | 'create' | 'update' | 'cancellation' | 'other'
    asset_id: string | null
    work_order_id: string | null
    description: string
    reason: string | null
    performed_by: string | null
    technician_name: string | null
    timestamp: string
    status: string
    created_at: string
    // Joined
    performer?: { id: string; full_name: string; full_name_ar: string | null }
}

// Query Keys
export const workOrdersKeys = {
    all: ['workOrders'] as const,
    list: () => [...workOrdersKeys.all, 'list'] as const,
    workOrder: (id: string) => [...workOrdersKeys.all, id] as const,
    issueTypes: () => [...workOrdersKeys.all, 'issueTypes'] as const,
    stats: () => [...workOrdersKeys.all, 'stats'] as const,
}

// Fetch Work Orders with related data (Any cast to avoid TS errors with un-typed Supabase)
export function useWorkOrders() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...workOrdersKeys.list(), tenantId],
        queryFn: async () => {
            let query = (supabase.from('work_orders') as any)
                .select(`
                    *,
                    reporter:reported_by(id, full_name, full_name_ar),
                    assignee:assigned_to(id, full_name, full_name_ar),
                    assignedTeam:teams!work_orders_assigned_team_fkey(id, code, name, name_ar),
                    building:buildings(id, name, name_ar),
                    floor:floors(id, name, name_ar),
                    department:departments(id, name, name_ar),
                    room:rooms(id, name, name_ar),
                    asset:assets(
                        id,
                        name,
                        name_ar,
                        code,
                        building:buildings(id, name, name_ar),
                        floor:floors(id, name, name_ar),
                        room:rooms(id, name, name_ar)
                    )
                `)

            if (tenantId) {
                query = query.eq('tenant_id', tenantId)
            }

            const { data, error } = await query.order('created_at', { ascending: false })

            if (error) throw error
            return data as WorkOrder[]
        },
    })
}

// Fetch Single Work Order
export function useWorkOrder(id: string) {
    return useQuery({
        queryKey: workOrdersKeys.workOrder(id),
        queryFn: async () => {
            const { data, error } = await (supabase.from('work_orders') as any)
                .select(`
                    *,
                    reporter:reported_by(id, full_name, full_name_ar),
                    assignee:assigned_to(id, full_name, full_name_ar),
                    assignedTeam:teams!work_orders_assigned_team_fkey(id, code, name, name_ar),
                    building:buildings(id, name, name_ar),
                    floor:floors(id, name, name_ar),
                    department:departments(id, name, name_ar),
                    room:rooms(id, name, name_ar),
                    asset:assets(
                        id,
                        name,
                        name_ar,
                        code,
                        building:buildings(id, name, name_ar),
                        floor:floors(id, name, name_ar),
                        room:rooms(id, name, name_ar)
                    )
                `)
                .eq('id', id)
                .single()

            if (error) throw error
            return data as WorkOrder
        },
        enabled: !!id,
    })
}

// Fetch Issue Types
export function useIssueTypes() {
    return useQuery({
        queryKey: workOrdersKeys.issueTypes(),
        queryFn: async () => {
            const { data, error } = await supabase
                .from('issue_types')
                .select('*')
                .order('display_order', { ascending: true })

            if (error) throw error
            return data as IssueType[]
        },
    })
}

// Get Work Order Stats
export function useWorkOrderStats() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...workOrdersKeys.stats(), tenantId],
        queryFn: async () => {
            let query = (supabase.from('work_orders') as any)
                .select('status, priority')

            if (tenantId) {
                query = query.eq('tenant_id', tenantId)
            }

            const { data, error } = await query

            if (error) throw error

            const stats = {
                total: data?.length || 0,
                byStatus: {
                    pending: 0,
                    assigned: 0,
                    in_progress: 0,
                    pending_supervisor_approval: 0,
                    pending_engineer_review: 0,
                    pending_reporter_closure: 0,
                    completed: 0,
                    auto_closed: 0,
                    rejected_by_technician: 0,
                    cancelled: 0,
                    on_hold: 0,
                    archived: 0,
                },
                byPriority: {
                    low: 0,
                    medium: 0,
                    high: 0,
                    urgent: 0,
                },
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?.forEach((wo: any) => {
                if (wo.status && stats.byStatus[wo.status as keyof typeof stats.byStatus] !== undefined) {
                    stats.byStatus[wo.status as keyof typeof stats.byStatus]++
                }
                if (wo.priority) stats.byPriority[wo.priority as keyof typeof stats.byPriority]++
            })

            return stats
        },
    })
}

// Create Work Order
export function useCreateWorkOrder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (workOrder: CreateWorkOrderInput) => {
            const payload = sanitizeCreateWorkOrderInput(workOrder)
            const { data, error } = await (supabase as any).rpc('create_work_order', {
                p_work_order: payload,
            })

            if (error) {
                throw new Error(error.message || 'Failed to create work order through the audited creation RPC.')
            }
            return data as WorkOrder
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.list() })
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.stats() })
        },
    })
}

// Phase 1 safety pass: direct work-order table writes may update metadata only.
// Lifecycle-sensitive fields such as status, assignment, approvals, completion,
// closure, evidence, and deletion must use workflow RPCs. This client allowlist
// is temporary protection; database-level sensitive-field guards are still
// required in a future task.
export function useUpdateWorkOrder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...updates }: UpdateWorkOrderMetadataInput) => {
            const sanitizedUpdates = sanitizeWorkOrderMetadataUpdates(updates)
            const { data, error } = await (supabase.from('work_orders') as any)
                .update(sanitizedUpdates)
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.list() })
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.workOrder(variables.id) })
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.stats() })
        },
    })
}

// Direct status mutation is disabled for Pilot v1. Use useWorkOrderWorkflow RPCs.
export function useUpdateWorkOrderStatus() {
    return useMutation<never, Error, { id: string; status: WorkOrder['status'] }>({
        mutationFn: async () => {
            throw new Error('Direct work order status updates are disabled. Use workflow RPC actions instead.')
        },
    })
}

// Direct hard deletion is disabled for Pilot v1 to preserve operational memory.
export function useDeleteWorkOrder() {
    return useMutation<never, Error, string>({
        mutationFn: async () => {
            throw new Error('Direct work order deletion is disabled for operational memory protection. Use the audited cancel workflow.')
        },
    })
}

// Fetch Work Order Logs
export function useWorkOrderLogs(workOrderId: string) {
    return useQuery({
        queryKey: [...workOrdersKeys.workOrder(workOrderId), 'logs'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('operation_logs')
                .select(`
                    *,
                    performer:performed_by(id, full_name, full_name_ar)
                `)
                .eq('work_order_id', workOrderId)
                .order('timestamp', { ascending: false })

            if (error) throw error

            // Map performer name to technician_name if not present or just for display
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return data.map((log: any) => ({
                ...log,
                technician_name: log.technician_name || log.performer?.full_name || log.performer?.full_name_ar
            })) as OperationLog[]
        },
        enabled: !!workOrderId
    })
}
