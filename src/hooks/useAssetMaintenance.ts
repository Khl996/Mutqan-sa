import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AssetMaintenanceRecord } from '@/types/maintenance'

export function useAssetMaintenance(assetId: string) {
    const historyQuery = useQuery({
        queryKey: ['asset-maintenance', assetId],
        enabled: !!assetId,
        queryFn: async () => {
            const { data, error } = await (supabase.from('asset_maintenance_history') as any)
                .select('*')
                .eq('asset_id', assetId)
                .order('created_at', { ascending: false })

            if (error) throw error
            return (data ?? []) as AssetMaintenanceRecord[]
        },
    })

    const stats = useMemo(() => {
        const history = historyQuery.data ?? []
        const completedTasks = history.filter((record) => record.task_status === 'completed').length
        const openRecords = history.filter((record) => !['completed', 'cancelled'].includes(record.task_status))

        const lastMaintenance = history
            .filter((record) => record.completed_at)
            .sort((a, b) => new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime())[0]?.completed_at ?? null

        const nextDue = openRecords
            .filter((record) => record.due_date)
            .sort((a, b) => new Date(a.due_date ?? 0).getTime() - new Date(b.due_date ?? 0).getTime())[0]?.due_date ?? null

        return {
            total_tasks: history.length,
            completed_tasks: completedTasks,
            last_maintenance: lastMaintenance ? new Date(lastMaintenance) : null,
            next_due: nextDue ? new Date(nextDue) : null,
            open_tasks: openRecords.length,
        }
    }, [historyQuery.data])

    return {
        history: historyQuery.data ?? [],
        isLoading: historyQuery.isLoading,
        stats,
    }
}
