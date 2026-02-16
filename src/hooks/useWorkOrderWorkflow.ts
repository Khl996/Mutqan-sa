import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const useWorkOrderWorkflow = () => {
    const queryClient = useQueryClient()

    // 1. Start Work (Technician)
    const startWork = useMutation({
        mutationFn: async ({ workOrderId, userId }: { workOrderId: string, userId: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.rpc('start_work_order', {
                p_work_order_id: workOrderId,
                p_user_id: userId
            } as any)
            if (error) throw error
        },
        onSuccess: () => {
            // Invalidate list and details
            queryClient.invalidateQueries({ queryKey: ['work-orders'] })
        }
    })

    // 2. Complete Work (Technician) - with Parts
    const completeWorkTechnician = useMutation({
        mutationFn: async ({
            workOrderId,
            userId, // kept for consistency, though RPC uses auth.uid() now
            notes,
            parts = []
        }: {
            workOrderId: string,
            userId: string,
            notes: string,
            parts?: { part_id: string, quantity: number }[]
        }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('complete_work_order_technician', {
                p_work_order_id: workOrderId,
                p_technician_notes: notes,
                p_parts: parts
            })
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['work-orders'] })
            queryClient.invalidateQueries({ queryKey: ['inventory'] }) // Update inventory stock
        }
    })

    // 3. Supervisor Approve
    const approveSupervisor = useMutation({
        mutationFn: async ({ workOrderId, userId, notes }: { workOrderId: string, userId: string, notes: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.rpc('approve_work_order_supervisor', {
                p_work_order_id: workOrderId,
                p_user_id: userId,
                p_notes: notes
            } as any)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['work-orders'] })
        }
    })

    // 4. Engineer Approve
    const approveEngineer = useMutation({
        mutationFn: async ({ workOrderId, userId, notes }: { workOrderId: string, userId: string, notes: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.rpc('approve_work_order_engineer', {
                p_work_order_id: workOrderId,
                p_user_id: userId,
                p_notes: notes
            } as any)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['work-orders'] })
        }
    })

    // 5. Final Close (Reporter)
    const closeWorkOrder = useMutation({
        mutationFn: async ({ workOrderId, userId, notes }: { workOrderId: string, userId: string, notes: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.rpc('close_work_order', {
                p_work_order_id: workOrderId,
                p_user_id: userId,
                p_notes: notes
            } as any)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['work-orders'] })
        }
    })

    // 6. Reject Work (Generic)
    const rejectWork = useMutation({
        mutationFn: async ({ workOrderId, userId, reason }: { workOrderId: string, userId: string, reason: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.rpc('reject_work_order', {
                p_work_order_id: workOrderId,
                p_user_id: userId,
                p_reason: reason
            } as any)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['work-orders'] })
        }
    })

    return {
        startWork,
        completeWorkTechnician,
        approveSupervisor,
        approveEngineer,
        closeWorkOrder,
        rejectWork
    }
}
