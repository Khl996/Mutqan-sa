import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'
import type {
    CreateFrequencyBundleInput,
    CreatePlanTargetInput,
    MaintenanceFrequencyBundle,
    MaintenancePlanTarget,
    UpdateFrequencyBundleInput,
    UpdatePlanTargetInput,
} from '@/types/maintenance'

export const maintenanceProgramKeys = {
    all: ['maintenance-program'] as const,
    targets: (tenantId: string | null, planId?: string | null) =>
        [...maintenanceProgramKeys.all, 'targets', tenantId, planId ?? 'all'] as const,
    bundles: (tenantId: string | null, planId?: string | null) =>
        [...maintenanceProgramKeys.all, 'bundles', tenantId, planId ?? 'all'] as const,
}

function normalizeOptionalUuid(value: string | null | undefined) {
    const normalized = value?.trim()
    return normalized ? normalized : null
}

function buildTargetPayload(tenantId: string, input: CreatePlanTargetInput) {
    return {
        tenant_id: tenantId,
        plan_id: input.plan_id,
        target_type: input.target_type,
        asset_id: input.target_type === 'asset' ? normalizeOptionalUuid(input.asset_id) : null,
        building_id: input.target_type === 'building' ? normalizeOptionalUuid(input.building_id) : null,
        asset_group_id: input.target_type === 'asset_group' ? normalizeOptionalUuid(input.asset_group_id) : null,
        is_primary: input.is_primary ?? false,
        role: input.role?.trim() || null,
        notes: input.notes?.trim() || null,
        label_snapshot: input.label_snapshot ?? {},
    }
}

export function useMaintenanceProgram(planId?: string | null) {
    const tenantId = useCurrentTenantId()
    const { user } = useAuth()
    const queryClient = useQueryClient()

    const targetsQuery = useQuery({
        queryKey: maintenanceProgramKeys.targets(tenantId, planId),
        enabled: !!tenantId && !!planId,
        queryFn: async () => {
            if (!tenantId || !planId) return []

            const { data, error } = await (supabase.from('maintenance_plan_targets') as any)
                .select(`
                    *,
                    asset:assets!asset_id(id, code, name, name_ar, building_id),
                    building:buildings!building_id(id, name, name_ar),
                    assetGroup:asset_groups!asset_group_id(id, code, name, name_ar, building_id)
                `)
                .eq('tenant_id', tenantId)
                .eq('plan_id', planId)
                .order('is_primary', { ascending: false })
                .order('created_at', { ascending: true })

            if (error) throw error
            return (data ?? []) as MaintenancePlanTarget[]
        },
    })

    const bundlesQuery = useQuery({
        queryKey: maintenanceProgramKeys.bundles(tenantId, planId),
        enabled: !!tenantId && !!planId,
        queryFn: async () => {
            if (!tenantId || !planId) return []

            const { data, error } = await (supabase.from('maintenance_frequency_bundles') as any)
                .select(`
                    *,
                    checklistTemplate:checklist_templates!checklist_template_id(id, name, name_ar, category, asset_type, total_items),
                    defaultAssignee:profiles!default_assigned_to(id, full_name, full_name_ar, role),
                    defaultTeam:teams!default_assigned_team_id(id, code, name, name_ar, type)
                `)
                .eq('tenant_id', tenantId)
                .eq('plan_id', planId)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true })

            if (error) throw error
            return (data ?? []) as MaintenanceFrequencyBundle[]
        },
    })

    const invalidateProgram = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: maintenanceProgramKeys.all }),
            queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] }),
            queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] }),
        ])
    }

    const createTargetMutation = useMutation({
        mutationFn: async (input: CreatePlanTargetInput) => {
            if (!tenantId) throw new Error('Tenant not found')

            const { data, error } = await (supabase.from('maintenance_plan_targets') as any)
                .insert(buildTargetPayload(tenantId, input))
                .select(`
                    *,
                    asset:assets!asset_id(id, code, name, name_ar, building_id),
                    building:buildings!building_id(id, name, name_ar),
                    assetGroup:asset_groups!asset_group_id(id, code, name, name_ar, building_id)
                `)
                .single()

            if (error) throw error
            return data as MaintenancePlanTarget
        },
        onSuccess: invalidateProgram,
    })

    const updateTargetMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdatePlanTargetInput }) => {
            const payload: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
            }

            if ('is_primary' in data) payload.is_primary = data.is_primary ?? false
            if ('role' in data) payload.role = data.role?.trim() || null
            if ('notes' in data) payload.notes = data.notes?.trim() || null

            const { data: updated, error } = await (supabase.from('maintenance_plan_targets') as any)
                .update(payload)
                .eq('id', id)
                .select('*')
                .single()

            if (error) throw error
            return updated as MaintenancePlanTarget
        },
        onSuccess: invalidateProgram,
    })

    const deleteTargetMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase.from('maintenance_plan_targets') as any)
                .delete()
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: invalidateProgram,
    })

    const createBundleMutation = useMutation({
        mutationFn: async (input: CreateFrequencyBundleInput) => {
            if (!tenantId) throw new Error('Tenant not found')

            const { data, error } = await (supabase.from('maintenance_frequency_bundles') as any)
                .insert({
                    tenant_id: tenantId,
                    plan_id: input.plan_id,
                    code: input.code?.trim() || null,
                    name: input.name.trim(),
                    name_ar: input.name_ar?.trim() || null,
                    frequency_type: input.frequency_type,
                    interval_count: input.interval_count ?? 1,
                    checklist_template_id: normalizeOptionalUuid(input.checklist_template_id),
                    default_assigned_to: normalizeOptionalUuid(input.default_assigned_to),
                    default_assigned_team_id: normalizeOptionalUuid(input.default_assigned_team_id),
                    estimated_duration_minutes: input.estimated_duration_minutes ?? null,
                    is_active: input.is_active ?? true,
                    sort_order: input.sort_order ?? 0,
                    instructions: input.instructions?.trim() || null,
                    created_by: user?.id ?? null,
                })
                .select('*')
                .single()

            if (error) throw error
            return data as MaintenanceFrequencyBundle
        },
        onSuccess: invalidateProgram,
    })

    const updateBundleMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateFrequencyBundleInput }) => {
            const payload: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
            }

            if ('code' in data) payload.code = data.code?.trim() || null
            if ('name' in data) payload.name = data.name?.trim()
            if ('name_ar' in data) payload.name_ar = data.name_ar?.trim() || null
            if ('frequency_type' in data) payload.frequency_type = data.frequency_type
            if ('interval_count' in data) payload.interval_count = data.interval_count ?? 1
            if ('checklist_template_id' in data) payload.checklist_template_id = normalizeOptionalUuid(data.checklist_template_id)
            if ('default_assigned_to' in data) payload.default_assigned_to = normalizeOptionalUuid(data.default_assigned_to)
            if ('default_assigned_team_id' in data) payload.default_assigned_team_id = normalizeOptionalUuid(data.default_assigned_team_id)
            if ('estimated_duration_minutes' in data) payload.estimated_duration_minutes = data.estimated_duration_minutes ?? null
            if ('is_active' in data) payload.is_active = data.is_active ?? true
            if ('sort_order' in data) payload.sort_order = data.sort_order ?? 0
            if ('instructions' in data) payload.instructions = data.instructions?.trim() || null

            const { data: updated, error } = await (supabase.from('maintenance_frequency_bundles') as any)
                .update(payload)
                .eq('id', id)
                .select('*')
                .single()

            if (error) throw error
            return updated as MaintenanceFrequencyBundle
        },
        onSuccess: invalidateProgram,
    })

    const deleteBundleMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase.from('maintenance_frequency_bundles') as any)
                .delete()
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: invalidateProgram,
    })

    return {
        targets: targetsQuery.data ?? [],
        bundles: bundlesQuery.data ?? [],
        isLoading: targetsQuery.isLoading || bundlesQuery.isLoading,
        error: targetsQuery.error instanceof Error
            ? targetsQuery.error.message
            : bundlesQuery.error instanceof Error
                ? bundlesQuery.error.message
                : null,
        createTarget: (data: CreatePlanTargetInput) => createTargetMutation.mutateAsync(data),
        updateTarget: (id: string, data: UpdatePlanTargetInput) => updateTargetMutation.mutateAsync({ id, data }),
        deleteTarget: (id: string) => deleteTargetMutation.mutateAsync(id),
        createBundle: (data: CreateFrequencyBundleInput) => createBundleMutation.mutateAsync(data),
        updateBundle: (id: string, data: UpdateFrequencyBundleInput) => updateBundleMutation.mutateAsync({ id, data }),
        deleteBundle: (id: string) => deleteBundleMutation.mutateAsync(id),
    }
}
