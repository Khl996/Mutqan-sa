import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'
import { workOrdersKeys } from './useWorkOrders'

export interface ChecklistItem {
    id: string
    text: string
    text_ar: string
    checked: boolean
}

export interface MaintenanceTask {
    id: string
    title: string
    description: string | null
    assigned_to: string | null
    assignee?: {
        full_name: string
        full_name_ar: string
    }
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
    priority: string
    due_date: string | null
    related_work_order_id: string | null
    maintenance_plan_id: string | null
    recurrence_type: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom'
    recurrence_interval: number
    checklist: ChecklistItem[]
    completion_notes: string | null
}

export function useMaintenanceTasks() {
    const tenantId = useCurrentTenantId()
    const queryClient = useQueryClient()

    // Query Tasks
    const tasksQuery = useQuery({
        queryKey: ['maintenance-tasks', tenantId],
        queryFn: async () => {
            if (!tenantId) return []

            const { data, error } = await supabase
                .from('maintenance_tasks')
                .select(`
                    *,
                    assignee:profiles!assigned_to(full_name, full_name_ar)
                `)
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })

            if (error) throw error
            return data as MaintenanceTask[]
        },
        enabled: !!tenantId
    })

    // Query Technicians
    const techniciansQuery = useQuery({
        queryKey: ['technicians-list', tenantId],
        queryFn: async () => {
            if (!tenantId) return []
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, full_name_ar')
                .eq('tenant_id', tenantId)
                .in('role', ['technician', 'supervisor'])

            if (error) throw error
            return data
        },
        enabled: !!tenantId
    })

    // Create Task Mutation
    const createTask = useMutation({
        mutationFn: async (newTask: any) => {
            const { shouldCreateWorkOrder, ...taskData } = newTask

            // Normalize assigned_to: empty string must become null (FK cannot be empty string)
            const assignedTo = taskData.assigned_to || null

            let workOrderId = null

            // 1. Create Work Order if requested
            if (shouldCreateWorkOrder) {
                const { data: { user } } = await supabase.auth.getUser()
                const reportedBy = user?.id || null
                const code = `WO-${Date.now().toString().slice(-6)}`

                const { data: wo, error: woError } = await supabase
                    .from('work_orders')
                    .insert({
                        tenant_id: tenantId,
                        code,
                        title: taskData.title,
                        description: taskData.description,
                        assigned_to: assignedTo,
                        reported_by: reportedBy,
                        status: assignedTo ? 'assigned' : 'pending',
                        priority: taskData.priority || 'medium',
                        maintenance_plan_id: taskData.maintenance_plan_id,
                        source: 'preventive_maintenance'
                    })
                    .select()
                    .single()

                if (woError) throw woError
                workOrderId = wo.id
            }

            // 2. Create Task
            const { data, error } = await supabase
                .from('maintenance_tasks')
                .insert({
                    ...taskData,
                    assigned_to: assignedTo,
                    tenant_id: tenantId,
                    related_work_order_id: workOrderId
                })
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.all })
        }
    })

    // Update Task Status + optional completion notes
    const updateTask = useMutation({
        mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
            const updates: Record<string, unknown> = {
                status,
                updated_at: new Date().toISOString()
            }

            if (notes !== undefined) {
                updates.completion_notes = notes || null
            }

            const { data, error } = await supabase
                .from('maintenance_tasks')
                .update(updates)
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
            queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] })
            queryClient.invalidateQueries({ queryKey: ['plan-tasks'] })
        }
    })

    // Update Checklist (called on every checkbox toggle)
    const updateChecklist = useMutation({
        mutationFn: async ({ id, checklist }: { id: string; checklist: ChecklistItem[] }) => {
            const { data, error } = await supabase
                .from('maintenance_tasks')
                .update({ checklist, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
            queryClient.invalidateQueries({ queryKey: ['plan-tasks'] })
        }
    })

    return {
        tasks: tasksQuery.data || [],
        isLoading: tasksQuery.isLoading,
        isError: tasksQuery.isError,
        error: tasksQuery.error,
        technicians: techniciansQuery.data || [],
        createTask,
        updateTask,
        updateChecklist
    }
}
