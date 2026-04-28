import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { workOrdersKeys } from './useWorkOrders'

export const useWorkOrderWorkflow = () => {
    const queryClient = useQueryClient()

    const invalidateAll = (workOrderId?: string) => {
        queryClient.invalidateQueries({ queryKey: workOrdersKeys.all })
        queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
        queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] })
        queryClient.invalidateQueries({ queryKey: ['plan-tasks'] })
        if (workOrderId) {
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.workOrder(workOrderId) })
        }
    }

    const startWork = useMutation({
        mutationFn: async ({ workOrderId }: { workOrderId: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('start_work_order', {
                p_work_order_id: workOrderId,
            })
            if (error) throw error
        },
        onSuccess: (_, variables) => {
            invalidateAll(variables.workOrderId)
        },
    })

    const completeWorkTechnician = useMutation({
        mutationFn: async ({
            workOrderId,
            notes,
            parts = [],
        }: {
            workOrderId: string
            notes: string
            parts?: { part_id: string, quantity: number }[]
        }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('complete_work_order_technician', {
                p_work_order_id: workOrderId,
                p_technician_notes: notes,
                p_parts: parts,
            })
            if (error) throw error
        },
        onSuccess: (_, variables) => {
            invalidateAll(variables.workOrderId)
            queryClient.invalidateQueries({ queryKey: ['inventory'] })
        },
    })

    const approveSupervisor = useMutation({
        mutationFn: async ({ workOrderId, notes }: { workOrderId: string, notes: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('approve_work_order_supervisor', {
                p_work_order_id: workOrderId,
                p_notes: notes,
            })
            if (error) throw error
        },
        onSuccess: (_, variables) => {
            invalidateAll(variables.workOrderId)
        },
    })

    const approveEngineer = useMutation({
        mutationFn: async ({ workOrderId, notes }: { workOrderId: string, notes: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('approve_work_order_engineer', {
                p_work_order_id: workOrderId,
                p_notes: notes,
            })
            if (error) throw error
        },
        onSuccess: (_, variables) => {
            invalidateAll(variables.workOrderId)
        },
    })

    const closeWorkOrder = useMutation({
        mutationFn: async ({ workOrderId, notes }: { workOrderId: string, notes: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('close_work_order', {
                p_work_order_id: workOrderId,
                p_notes: notes,
            })
            if (error) throw error
        },
        onSuccess: (_, variables) => {
            invalidateAll(variables.workOrderId)
        },
    })

    const rejectWork = useMutation({
        mutationFn: async ({ workOrderId, reason }: { workOrderId: string, reason: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('reject_work_order', {
                p_work_order_id: workOrderId,
                p_reason: reason,
            })
            if (error) throw error
        },
        onSuccess: (_, variables) => {
            invalidateAll(variables.workOrderId)
        },
    })

    const assignWorkOrder = useMutation({
        mutationFn: async ({
            workOrderId,
            assignedTo = null,
            assignedTeam = null,
            reason = null,
        }: {
            workOrderId: string
            assignedTo?: string | null
            assignedTeam?: string | null
            reason?: string | null
        }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('assign_work_order', {
                p_work_order_id: workOrderId,
                p_assigned_to: assignedTo,
                p_assigned_team: assignedTeam,
                p_reason: reason,
            })
            if (error) throw error
            return data as {
                success: boolean
                work_order_id: string
                assigned_to: string | null
                assigned_team: string | null
                status: string
            }
        },
        onSuccess: (_, variables) => {
            invalidateAll(variables.workOrderId)
        },
    })

    const cancelWorkOrder = useMutation({
        mutationFn: async ({ workOrderId, reason }: { workOrderId: string; reason: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('cancel_work_order', {
                p_work_order_id: workOrderId,
                p_reason: reason,
            })
            if (error) throw error
            return data as {
                success: boolean
                work_order_id: string
                status: string
                reason: string
            }
        },
        onSuccess: (_, variables) => {
            invalidateAll(variables.workOrderId)
        },
    })

    return {
        startWork,
        completeWorkTechnician,
        approveSupervisor,
        approveEngineer,
        closeWorkOrder,
        rejectWork,
        assignWorkOrder,
        cancelWorkOrder,
    }
}
