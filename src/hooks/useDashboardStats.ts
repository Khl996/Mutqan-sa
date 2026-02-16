import { useQuery } from '@tanstack/react-query'
import { useCurrentTenantId } from './useTenantQuery'

// Helper to get token
const getAccessToken = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
    const storedSession = localStorage.getItem(storageKey)
    if (storedSession) {
        try {
            return JSON.parse(storedSession).access_token
        } catch { return null }
    }
    return null
}

export interface DashboardStats {
    workOrders: {
        total: number
        open: number
        completedToday: number
        pending: number
        overdue: number
    }
    assets: {
        total: number
        active: number
        underMaintenance: number
        outOfService: number
    }
    recentActivities: Array<{
        id: string
        type: 'work_order' | 'asset' | 'other'
        title: string
        description: string
        time: string
        status: string
    }>
    chartData: Array<{
        date: string
        created: number
        completed: number
    }>
}

export function useDashboardStats() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: ['dashboard', 'stats', tenantId],
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const todayStart = new Date().toISOString().split('T')[0]

            // 1. Fetch Work Orders Stats
            let woQuery = `${supabaseUrl}/rest/v1/work_orders?select=id,status,priority,created_at,due_date,completed_at,title,description`
            if (tenantId) woQuery += `&tenant_id=eq.${tenantId}`

            const woResponse = await fetch(woQuery, { headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${accessToken}` } })
            const workOrders = woResponse.ok ? await woResponse.json() : []

            // 2. Fetch Assets Stats
            let assetQuery = `${supabaseUrl}/rest/v1/assets?select=id,status`
            if (tenantId) assetQuery += `&tenant_id=eq.${tenantId}`

            const assetResponse = await fetch(assetQuery, { headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${accessToken}` } })
            const assets = assetResponse.ok ? await assetResponse.json() : []

            // Calculate WO Stats
            const woStats = {
                total: workOrders.length,
                open: 0,
                completedToday: 0,
                pending: 0,
                overdue: 0
            }

            const now = new Date()

            workOrders.forEach((wo: any) => {
                const isCompleted = wo.status === 'completed'
                const isPending = wo.status === 'pending' || wo.status === 'in_progress' || wo.status === 'assigned'

                if (isPending) woStats.open++
                if (isPending) woStats.pending++

                if (isCompleted && wo.completed_at) {
                    const completedDate = new Date(wo.completed_at).toISOString().split('T')[0]
                    if (completedDate === todayStart) woStats.completedToday++
                }

                if (wo.due_date && new Date(wo.due_date) < now && !isCompleted && wo.status !== 'cancelled') {
                    woStats.overdue++
                }
            })

            // Calculate Chart Data (Last 7 Days)
            const chartData = []
            for (let i = 6; i >= 0; i--) {
                const d = new Date()
                d.setDate(d.getDate() - i)
                const dateStr = d.toISOString().split('T')[0] // YYYY-MM-DD
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }) // Mon, Tue...

                let createdCount = 0
                let completedCount = 0

                workOrders.forEach((wo: any) => {
                    const createdDate = new Date(wo.created_at).toISOString().split('T')[0]
                    if (createdDate === dateStr) createdCount++

                    if (wo.completed_at) {
                        const completedDate = new Date(wo.completed_at).toISOString().split('T')[0]
                        if (completedDate === dateStr) completedCount++
                    }
                })

                chartData.push({
                    date: dayName,
                    created: createdCount,
                    completed: completedCount
                })
            }

            // Calculate Asset Stats
            const assetStats = {
                total: assets.length,
                active: 0,
                underMaintenance: 0,
                outOfService: 0
            }

            assets.forEach((asset: any) => {
                if (asset.status === 'active' || asset.status === 'operational') assetStats.active++
                else if (asset.status === 'maintenance' || asset.status === 'under_maintenance') assetStats.underMaintenance++
                else if (asset.status === 'broken' || asset.status === 'out_of_service') assetStats.outOfService++
                else assetStats.active++
            })

            // Prepare Recent Activities (Last 5 Work Orders)
            const recentWOs = [...workOrders].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)

            const recentActivities = recentWOs.map((wo: any) => ({
                id: wo.id,
                type: 'work_order',
                title: wo.title,
                description: wo.description || 'No description',
                time: wo.created_at,
                status: wo.status
            }))

            return {
                workOrders: woStats,
                assets: assetStats,
                recentActivities,
                chartData
            } as DashboardStats
        },
        // Refetch every 30 seconds to keep dashboard alive
        refetchInterval: 30000
    })
}
