import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'
import type {
    AssetGroup,
    CreateAssetGroupInput,
    UpdateAssetGroupInput,
} from '@/types/maintenance'

export const assetGroupKeys = {
    all: ['asset-groups'] as const,
    list: (tenantId: string | null) => [...assetGroupKeys.all, tenantId] as const,
}

function normalizeOptionalUuid(value: string | null | undefined) {
    const normalized = value?.trim()
    return normalized ? normalized : null
}

export function useAssetGroups() {
    const tenantId = useCurrentTenantId()
    const { user } = useAuth()
    const queryClient = useQueryClient()

    const groupsQuery = useQuery({
        queryKey: assetGroupKeys.list(tenantId),
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return []

            const { data, error } = await (supabase.from('asset_groups') as any)
                .select(`
                    *,
                    building:buildings!building_id(id, name, name_ar),
                    items:asset_group_items(
                        *,
                        asset:assets!asset_id(id, code, name, name_ar, building_id)
                    )
                `)
                .eq('tenant_id', tenantId)
                .order('name', { ascending: true })

            if (error) throw error
            return (data ?? []) as AssetGroup[]
        },
    })

    const invalidateGroups = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: assetGroupKeys.all }),
            queryClient.invalidateQueries({ queryKey: ['maintenance-program'] }),
            queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] }),
        ])
    }

    const createGroupMutation = useMutation({
        mutationFn: async (input: CreateAssetGroupInput) => {
            if (!tenantId) throw new Error('Tenant not found')

            const { data: group, error } = await (supabase.from('asset_groups') as any)
                .insert({
                    tenant_id: tenantId,
                    code: input.code?.trim() || null,
                    name: input.name.trim(),
                    name_ar: input.name_ar?.trim() || null,
                    description: input.description?.trim() || null,
                    building_id: normalizeOptionalUuid(input.building_id),
                    created_by: user?.id ?? null,
                })
                .select('*')
                .single()

            if (error) throw error

            const assetIds = input.asset_ids?.filter(Boolean) ?? []
            if (assetIds.length > 0) {
                const { error: itemError } = await (supabase.from('asset_group_items') as any)
                    .insert(assetIds.map((assetId, index) => ({
                        asset_group_id: group.id,
                        asset_id: assetId,
                        sort_order: index,
                    })))

                if (itemError) throw itemError
            }

            return group as AssetGroup
        },
        onSuccess: invalidateGroups,
    })

    const updateGroupMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateAssetGroupInput }) => {
            const payload: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
            }

            if ('code' in data) payload.code = data.code?.trim() || null
            if ('name' in data) payload.name = data.name?.trim()
            if ('name_ar' in data) payload.name_ar = data.name_ar?.trim() || null
            if ('description' in data) payload.description = data.description?.trim() || null
            if ('building_id' in data) payload.building_id = normalizeOptionalUuid(data.building_id)
            if ('is_active' in data) payload.is_active = data.is_active ?? true

            const { data: group, error } = await (supabase.from('asset_groups') as any)
                .update(payload)
                .eq('id', id)
                .select('*')
                .single()

            if (error) throw error

            if ('asset_ids' in data) {
                const { error: deleteError } = await (supabase.from('asset_group_items') as any)
                    .delete()
                    .eq('asset_group_id', id)

                if (deleteError) throw deleteError

                const assetIds = data.asset_ids?.filter(Boolean) ?? []
                if (assetIds.length > 0) {
                    const { error: itemError } = await (supabase.from('asset_group_items') as any)
                        .insert(assetIds.map((assetId, index) => ({
                            asset_group_id: id,
                            asset_id: assetId,
                            sort_order: index,
                        })))

                    if (itemError) throw itemError
                }
            }

            return group as AssetGroup
        },
        onSuccess: invalidateGroups,
    })

    const deleteGroupMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase.from('asset_groups') as any)
                .delete()
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: invalidateGroups,
    })

    return {
        groups: groupsQuery.data ?? [],
        isLoading: groupsQuery.isLoading,
        error: groupsQuery.error instanceof Error ? groupsQuery.error.message : null,
        createGroup: (data: CreateAssetGroupInput) => createGroupMutation.mutateAsync(data),
        updateGroup: (id: string, data: UpdateAssetGroupInput) => updateGroupMutation.mutateAsync({ id, data }),
        deleteGroup: (id: string) => deleteGroupMutation.mutateAsync(id),
    }
}
