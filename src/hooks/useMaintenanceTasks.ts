import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'
import { workOrdersKeys } from './useWorkOrders'

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

    // Query Technicians (Simple fetch for dropdown)
    const techniciansQuery = useQuery({
        queryKey: ['technicians-list', tenantId],
        queryFn: async () => {
            if (!tenantId) return []
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, full_name_ar')
                .eq('tenant_id', tenantId)
                .in('role', ['technician', 'supervisor']) // Filter for roles capable of tasks

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
                // Get the current user id for reported_by so WO has a valid reporter
                const { data: { user } } = await supabase.auth.getUser()
                const reportedBy = user?.id || null

                // Generate a simple code
                const code = `WO-${Date.now().toString().slice(-6)}`

                const { data: wo, error: woError } = await supabase
                    .from('work_orders')
                    .insert({
                        tenant_id: tenantId,
                        code: code,
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

    // Update Task Mutation
    const updateTask = useMutation({
        mutationFn: async ({ id, status, notes }: { id: string, status: string, notes?: string }) => {
            const updates: any = {
                status,
                updated_at: new Date().toISOString()
            }
            // If completing, maybe save the note somewhere? assuming description extension or new column. 
            // For now let's just update status. If we want notes, we might need a 'completion_notes' column in DB or append to description.
            // Let's assume we append to description for simplicity in this iteration or just update status.

            if (notes) {
                // Determine if we append to description or use a dedicated field (if added later).
                // For now, let's just keep it simple status update. 
                // Creating a completion log or comment would be better, but let's stick to status first.
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

    return {
        tasks: tasksQuery.data || [],
        isLoading: tasksQuery.isLoading,
        isError: tasksQuery.isError,
        error: tasksQuery.error,
        technicians: techniciansQuery.data || [],
        createTask,
        updateTask
    }
}
