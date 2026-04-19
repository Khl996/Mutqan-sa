import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'
import type {
    CreatePlanInput,
    MaintenancePlan,
    MaintenancePlanStatus,
    UpdatePlanInput,
} from '@/types/maintenance'

// Legacy PM hook. Do not use for new PM work; use usePMFoundation with
// job_plans / pm_schedules instead. See docs/maintenance/pm-legacy-deprecation.md.
interface MaintenancePlanFilters {
    status?: string
    building_id?: string
}

const maintenancePlanKeys = {
    all: ['maintenance-plans'] as const,
    list: (tenantId: string | null, filters?: MaintenancePlanFilters) =>
        [...maintenancePlanKeys.all, tenantId, filters ?? {}] as const,
}

async function callPlanStatusRpc(id: string, status: MaintenancePlanStatus, note?: string | null) {
    const { error } = await (supabase as any).rpc('pm_update_plan_status', {
        p_plan_id: id,
        p_new_status: status,
        p_note: note ?? null,
    })

    if (error) throw error
}

export function useMaintenancePlans(filters?: MaintenancePlanFilters) {
    const tenantId = useCurrentTenantId()
    const queryClient = useQueryClient()

    const plansQuery = useQuery({
        queryKey: maintenancePlanKeys.list(tenantId, filters),
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return []

            let query = (supabase.from('maintenance_plans') as any)
                .select(`
                    *,
                    building:buildings(id, name, name_ar),
                    targets:maintenance_plan_targets(
                        *,
                        asset:assets!asset_id(id, code, name, name_ar, building_id),
                        building:buildings!building_id(id, name, name_ar),
                        assetGroup:asset_groups!asset_group_id(id, code, name, name_ar, building_id)
                    ),
                    frequency_bundles:maintenance_frequency_bundles(
                        *,
                        checklistTemplate:checklist_templates!checklist_template_id(id, name, name_ar, category, asset_type, total_items),
                        defaultAssignee:profiles!default_assigned_to(id, full_name, full_name_ar, role),
                        defaultTeam:teams!default_assigned_team_id(id, code, name, name_ar, type)
                    )
                `)
                .eq('tenant_id', tenantId)

            if (filters?.status && filters.status !== 'all') {
                query = query.eq('status', filters.status)
            }

            if (filters?.building_id && filters.building_id !== 'all') {
                query = query.eq('building_id', filters.building_id)
            }

            const { data, error } = await query.order('updated_at', { ascending: false })

            if (error) throw error
            return (data ?? []) as MaintenancePlan[]
        },
    })

    const invalidatePlans = async () => {
        await queryClient.invalidateQueries({ queryKey: maintenancePlanKeys.all })
        await queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] })
    }

    const createPlanMutation = useMutation({
        mutationFn: async (input: CreatePlanInput) => {
            if (!tenantId) throw new Error('Tenant not found')

            const payload = {
                tenant_id: tenantId,
                code: input.code?.trim() || null,
                name: input.name.trim(),
                name_ar: input.name_ar?.trim() || null,
                year: input.year,
                status: 'draft',
                priority: input.priority ?? 'medium',
                building_id: input.building_id ?? null,
                budget: input.budget ?? 0,
                start_date: input.start_date ?? null,
                end_date: input.end_date ?? null,
                description: input.description?.trim() || null,
                notes: input.notes?.trim() || null,
            }

            const { data, error } = await (supabase.from('maintenance_plans') as any)
                .insert(payload)
                .select(`
                    *,
                    building:buildings(id, name, name_ar),
                    targets:maintenance_plan_targets(*),
                    frequency_bundles:maintenance_frequency_bundles(*)
                `)
                .single()

            if (error) throw error
            return data as MaintenancePlan
        },
        onSuccess: invalidatePlans,
    })

    const updatePlanMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdatePlanInput }) => {
            const payload: Record<string, unknown> = {}

            if ('code' in data) payload.code = data.code?.trim() || null
            if ('name' in data) payload.name = data.name?.trim()
            if ('name_ar' in data) payload.name_ar = data.name_ar?.trim() || null
            if ('year' in data) payload.year = data.year
            if ('priority' in data) payload.priority = data.priority
            if ('building_id' in data) payload.building_id = data.building_id ?? null
            if ('budget' in data) payload.budget = data.budget ?? null
            if ('start_date' in data) payload.start_date = data.start_date ?? null
            if ('end_date' in data) payload.end_date = data.end_date ?? null
            if ('description' in data) payload.description = data.description?.trim() || null
            if ('notes' in data) payload.notes = data.notes?.trim() || null

            const { data: updated, error } = await (supabase.from('maintenance_plans') as any)
                .update(payload)
                .eq('id', id)
                .select(`
                    *,
                    building:buildings(id, name, name_ar),
                    targets:maintenance_plan_targets(*),
                    frequency_bundles:maintenance_frequency_bundles(*)
                `)
                .single()

            if (error) throw error
            return updated as MaintenancePlan
        },
        onSuccess: invalidatePlans,
    })

    const deletePlanMutation = useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await (supabase.from('maintenance_plans') as any)
                .delete()
                .eq('id', id)
                .eq('status', 'draft')
                .select('id')

            if (error) throw error
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('Only draft plans can be deleted')
            }
        },
        onSuccess: invalidatePlans,
    })

    const planStatusMutation = useMutation({
        mutationFn: async ({
            id,
            status,
            note,
        }: {
            id: string
            status: MaintenancePlanStatus
            note?: string | null
        }) => {
            await callPlanStatusRpc(id, status, note)
        },
        onSuccess: invalidatePlans,
    })

    return {
        plans: plansQuery.data ?? [],
        isLoading: plansQuery.isLoading,
        error: plansQuery.error instanceof Error ? plansQuery.error.message : null,
        createPlan: (data: CreatePlanInput) => createPlanMutation.mutateAsync(data),
        updatePlan: (id: string, data: UpdatePlanInput) => updatePlanMutation.mutateAsync({ id, data }),
        deletePlan: (id: string) => deletePlanMutation.mutateAsync(id),
        activatePlan: (id: string) => planStatusMutation.mutateAsync({ id, status: 'active' }),
        pausePlan: (id: string) => planStatusMutation.mutateAsync({ id, status: 'paused' }),
        resumePlan: (id: string) => planStatusMutation.mutateAsync({ id, status: 'active' }),
        completePlan: (id: string) => planStatusMutation.mutateAsync({ id, status: 'completed' }),
        archivePlan: (id: string) => planStatusMutation.mutateAsync({ id, status: 'archived' }),
    }
}

export type { MaintenancePlan, CreatePlanInput, UpdatePlanInput }
