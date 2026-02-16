import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'

export interface MaintenancePlan {
    id: string
    code: string
    name: string
    name_ar: string | null
    year: number
    status: 'draft' | 'active' | 'completed' | 'archived'
    description: string | null
    budget: number
    start_date: string | null
    end_date: string | null
    completion_rate?: number
}

export function useMaintenancePlans() {
    const tenantId = useCurrentTenantId()
    const queryClient = useQueryClient()

    const plansQuery = useQuery({
        queryKey: ['maintenance-plans', tenantId],
        queryFn: async () => {
            if (!tenantId) return []

            // Fetch plans
            const { data: plans, error } = await supabase
                .from('maintenance_plans')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('year', { ascending: false })

            if (error) throw error

            // Calculate completion rate for each plan based on maintenance tasks
            const plansWithRates = await Promise.all(plans.map(async (plan) => {
                const { count: totalTasks } = await supabase
                    .from('maintenance_tasks')
                    .select('*', { count: 'exact', head: true })
                    .eq('maintenance_plan_id', plan.id)

                const { count: completedTasks } = await supabase
                    .from('maintenance_tasks')
                    .select('*', { count: 'exact', head: true })
                    .eq('maintenance_plan_id', plan.id)
                    .eq('status', 'completed')

                const rate = totalTasks && totalTasks > 0
                    ? Math.round((completedTasks || 0) / totalTasks * 100)
                    : 0

                return { ...plan, completion_rate: rate }
            }))

            return plansWithRates as MaintenancePlan[]
        },
        enabled: !!tenantId
    })

    const createPlan = useMutation({
        mutationFn: async (newPlan: Omit<MaintenancePlan, 'id' | 'completion_rate'>) => {
            const { data, error } = await supabase
                .from('maintenance_plans')
                .insert([{ ...newPlan, tenant_id: tenantId }])
                .select()
                .single()
            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] })
        }
    })

    return {
        plans: plansQuery.data || [],
        isLoading: plansQuery.isLoading,
        isError: plansQuery.isError,
        error: plansQuery.error,
        createPlan
    }
}
