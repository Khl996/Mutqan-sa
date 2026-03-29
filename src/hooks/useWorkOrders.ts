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
    due_date: string | null
    estimated_cost: number | null
    actual_cost: number | null
    attachments: unknown[] | null
    before_images: unknown[] | null
    after_images: unknown[] | null
    created_at: string
    updated_at: string

    // Joined data
    reporter?: { id: string; full_name: string; full_name_ar: string | null }
    assignee?: { id: string; full_name: string; full_name_ar: string | null }
    building?: { id: string; name: string; name_ar: string | null }
    floor?: { id: string; name: string; name_ar: string | null }
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
    tenant_id: string
    code: string
    title: string
    description?: string | null
    issue_type_id?: string | null
    issue_type?: string | null
    status?: WorkOrder['status']
    priority?: WorkOrder['priority']
    reported_by?: string | null
    assigned_team?: string | null
    building_id?: string | null
    floor_id?: string | null
    department_id?: string | null
    room_id?: string | null
    asset_id?: string | null
    due_date?: string | null
}

export interface OperationLog {
    id: string
    tenant_id: string
    code: string
    type: 'maintenance' | 'repair' | 'inspection' | 'emergency' | 'routine' | 'installation' | 'calibration' | 'status_change' | 'comment' | 'other'
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
                    building:buildings(id, name, name_ar),
                    floor:floors(id, name, name_ar),
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
                    building:buildings(id, name, name_ar),
                    floor:floors(id, name, name_ar),
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
                    rejected_by_technician: 0,
                    cancelled: 0,
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
            const { data, error } = await (supabase.from('work_orders') as any)
                .insert(workOrder)
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.list() })
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.stats() })
        },
    })
}

// Update Work Order
export function useUpdateWorkOrder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<WorkOrder> & { id: string }) => {
            const { data, error } = await (supabase.from('work_orders') as any)
                .update(updates)
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

// Update Work Order Status
export function useUpdateWorkOrderStatus() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, status }: { id: string; status: WorkOrder['status'] }) => {
            const { data, error } = await (supabase.from('work_orders') as any)
                .update({ status, updated_at: new Date().toISOString() })
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

// Delete Work Order
export function useDeleteWorkOrder() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase.from('work_orders') as any)
                .delete()
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.list() })
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.stats() })
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
