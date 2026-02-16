import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface MaintenanceStat {
    total_assets: number
    maintained_this_month: number
    upcoming_maintenance: number
    overdue_maintenance: number
}

export interface UpcomingMaintenanceAsset {
    id: string
    code: string
    name: string
    name_ar: string | null
    next_maintenance_date: string
    maintenance_frequency_days: number
    category: { name: string; name_ar: string | null }
    building: { name: string; name_ar: string | null }
}

export const maintenanceKeys = {
    all: ['maintenance'] as const,
    stats: () => [...maintenanceKeys.all, 'stats'] as const,
    upcoming: () => [...maintenanceKeys.all, 'upcoming'] as const,
}

// Get Maintenance Stats
export function useMaintenanceStats() {
    return useQuery({
        queryKey: maintenanceKeys.stats(),
        queryFn: async () => {
            // This is a simplified implementation. In a real app, you might want a dedicated RPC or more complex query.
            const today = new Date().toISOString().split('T')[0]
            const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

            // 1. Total Assets that require maintenance
            const { count: totalAssets } = await supabase
                .from('assets')
                .select('*', { count: 'exact', head: true })
                .not('maintenance_frequency_days', 'is', null)

            // 2. Maintained this month (Work orders completed this month with type repair/maintenance)
            const { count: maintainedThisMonth } = await supabase
                .from('work_orders')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'completed')
                .gte('completed_at', firstDayOfMonth)

            // 3. Upcoming Maintenance (Next 30 days)
            const thirtyDaysFromNow = new Date()
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

            const { count: upcoming } = await supabase
                .from('assets')
                .select('*', { count: 'exact', head: true })
                .gte('next_maintenance_date', today)
                .lte('next_maintenance_date', thirtyDaysFromNow.toISOString().split('T')[0])

            // 4. Overdue Maintenance
            const { count: overdue } = await supabase
                .from('assets')
                .select('*', { count: 'exact', head: true })
                .lt('next_maintenance_date', today)

            return {
                total_assets: totalAssets || 0,
                maintained_this_month: maintainedThisMonth || 0,
                upcoming_maintenance: upcoming || 0,
                overdue_maintenance: overdue || 0,
            } as MaintenanceStat
        },
    })
}

// Get Upcoming Maintenance Assets
export function useUpcomingMaintenance() {
    return useQuery({
        queryKey: maintenanceKeys.upcoming(),
        queryFn: async () => {
            const today = new Date().toISOString().split('T')[0]

            const { data, error } = await supabase
                .from('assets')
                .select(`
                    id,
                    code,
                    name,
                    name_ar,
                    next_maintenance_date,
                    maintenance_frequency_days,
                    category:asset_categories(name, name_ar),
                    building:buildings(name, name_ar)
                `)
                .not('next_maintenance_date', 'is', null)
                .order('next_maintenance_date', { ascending: true })
                .limit(10)

            if (error) throw error
            return data as unknown as UpcomingMaintenanceAsset[]
        },
    })
}

// Mark Maintenance as Completed (Updates next_maintenance_date)
export function useCompleteMaintenance() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ assetId, completionDate }: { assetId: string; completionDate: string }) => {
            // First get the asset to know frequency
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: asset } = await supabase
                .from('assets')
                .select('maintenance_frequency_days')
                .eq('id', assetId)
                .single() as { data: { maintenance_frequency_days: number } | null, error: any }

            if (!asset || !asset.maintenance_frequency_days) return

            // Calculate next date
            const completed = new Date(completionDate)
            const nextDate = new Date(completed)
            nextDate.setDate(nextDate.getDate() + asset.maintenance_frequency_days)

            // Update asset
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase
                .from('assets')
                .update({
                    last_maintenance_date: completionDate,
                    next_maintenance_date: nextDate.toISOString().split('T')[0]
                } as any)
                .eq('id', assetId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: maintenanceKeys.all })
        },
    })
}
