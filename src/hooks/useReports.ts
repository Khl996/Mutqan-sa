import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Types
export interface WorkOrderReport {
    total: number
    byStatus: Record<string, number>
    byPriority: Record<string, number>
    byType: Record<string, number>
    avgCompletionTime: number | null // in hours
    completedThisMonth: number
    openCount: number
    overdueCount: number
}

export interface MaintenanceReport {
    totalScheduled: number
    completedOnTime: number
    overdue: number
    upcomingThisWeek: number
    completionRate: number // percentage
}

export interface InventoryReport {
    totalItems: number
    totalValue: number
    lowStockCount: number
    outOfStockCount: number
    topUsedItems: { name: string, name_ar: string | null, usage: number }[]
}

export interface TeamPerformanceReport {
    technicians: {
        id: string
        name: string
        name_ar: string | null
        completedOrders: number
        avgTime: number | null
    }[]
}

// Query Keys
export const reportKeys = {
    all: ['reports'] as const,
    workOrders: () => [...reportKeys.all, 'work-orders'] as const,
    maintenance: () => [...reportKeys.all, 'maintenance'] as const,
    inventory: () => [...reportKeys.all, 'inventory'] as const,
    teamPerformance: () => [...reportKeys.all, 'team-performance'] as const,
}

// Work Orders Report
export function useWorkOrdersReport() {
    return useQuery({
        queryKey: reportKeys.workOrders(),
        queryFn: async () => {
            // Fetch work orders with issue_type relation
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await supabase
                .from('work_orders')
                .select(`
                    *,
                    issue_type_rel:issue_types(id, name, name_ar)
                `) as any

            if (error) throw error

            const report: WorkOrderReport = {
                total: data?.length || 0,
                byStatus: {},
                byPriority: {},
                byType: {},
                avgCompletionTime: null,
                completedThisMonth: 0,
                openCount: 0,
                overdueCount: 0,
            }

            const now = new Date()
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
            let totalCompletionTime = 0
            let completedCount = 0

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?.forEach((wo: any) => {
                // By Status
                report.byStatus[wo.status] = (report.byStatus[wo.status] || 0) + 1

                // By Priority
                if (wo.priority) {
                    report.byPriority[wo.priority] = (report.byPriority[wo.priority] || 0) + 1
                }

                // By Type - use issue_type_rel if available, else fallback to issue_type field
                const typeName = wo.issue_type_rel?.name || wo.issue_type || 'unclassified'
                report.byType[typeName] = (report.byType[typeName] || 0) + 1

                // Open & Overdue Count
                const isCompleted = ['completed', 'cancelled', 'auto_closed', 'rejected_by_technician'].includes(wo.status)

                if (!isCompleted) {
                    report.openCount++

                    if (wo.due_date && new Date(wo.due_date) < now) {
                        report.overdueCount++
                    }
                }

                // Completed this month
                if ((wo.status === 'completed' || wo.status === 'auto_closed') && wo.completed_at && new Date(wo.completed_at) >= monthStart) {
                    report.completedThisMonth++
                }

                // Avg completion time
                if ((wo.status === 'completed' || wo.status === 'auto_closed') && wo.completed_at && wo.created_at) {
                    const created = new Date(wo.created_at).getTime()
                    const completed = new Date(wo.completed_at).getTime()
                    const diffHours = (completed - created) / (1000 * 60 * 60)
                    if (diffHours >= 0) { // sanity check
                        totalCompletionTime += diffHours
                        completedCount++
                    }
                }
            })

            if (completedCount > 0) {
                report.avgCompletionTime = Math.round(totalCompletionTime / completedCount)
            }

            return report
        },
    })
}

// Maintenance Report
export function useMaintenanceReport() {
    return useQuery({
        queryKey: reportKeys.maintenance(),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await supabase
                .from('assets')
                .select('next_maintenance_date, last_maintenance_date') as any

            if (error) throw error

            const report: MaintenanceReport = {
                totalScheduled: 0,
                completedOnTime: 0,
                overdue: 0,
                upcomingThisWeek: 0,
                completionRate: 0,
            }

            const now = new Date()
            const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?.forEach((asset: any) => {
                if (asset.next_maintenance_date) {
                    report.totalScheduled++
                    const nextDate = new Date(asset.next_maintenance_date)

                    if (nextDate < now) {
                        report.overdue++
                    } else if (nextDate <= weekFromNow) {
                        report.upcomingThisWeek++
                    }
                }

                if (asset.last_maintenance_date) {
                    report.completedOnTime++
                }
            })

            if (report.totalScheduled > 0) {
                report.completionRate = Math.round((report.completedOnTime / report.totalScheduled) * 100)
            }

            return report
        },
    })
}

// Inventory Report
export function useInventoryReport() {
    return useQuery({
        queryKey: reportKeys.inventory(),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: items, error: itemsError } = await supabase
                .from('inventory_items')
                .select('name, name_ar, quantity, min_quantity, unit_cost') as any

            if (itemsError) throw itemsError

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: transactions, error: txError } = await supabase
                .from('inventory_transactions')
                .select('item_id, quantity, type')
                .eq('type', 'OUT') as any

            if (txError) throw txError

            const report: InventoryReport = {
                totalItems: items?.length || 0,
                totalValue: 0,
                lowStockCount: 0,
                outOfStockCount: 0,
                topUsedItems: [],
            }

            // Calculate stats
            const usageMap = new Map<string, number>()

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            items?.forEach((item: any) => {
                report.totalValue += (item.quantity || 0) * (item.unit_cost || 0)

                if (item.quantity <= 0) {
                    report.outOfStockCount++
                } else if (item.quantity <= (item.min_quantity || 0)) {
                    report.lowStockCount++
                }
            })

            // Track usage
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            transactions?.forEach((tx: any) => {
                usageMap.set(tx.item_id, (usageMap.get(tx.item_id) || 0) + Math.abs(tx.quantity))
            })

            // Top used items
            const sortedUsage = Array.from(usageMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            report.topUsedItems = sortedUsage.map(([itemId, usage]) => {
                const item = items?.find((i: any) => i.id === itemId)
                return {
                    name: item?.name || 'Unknown',
                    name_ar: item?.name_ar || null,
                    usage,
                }
            })

            return report
        },
    })
}

// Team Performance Report
export function useTeamPerformanceReport() {
    return useQuery({
        queryKey: reportKeys.teamPerformance(),
        queryFn: async () => {
            // Get technicians
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: technicians, error: techError } = await supabase
                .from('profiles')
                .select('id, full_name, full_name_ar')
                .in('role', ['technician', 'supervisor', 'engineer']) as any

            if (techError) throw techError

            // Get completed work orders
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: workOrders, error: woError } = await supabase
                .from('work_orders')
                .select('assigned_to, created_at, completed_at, status')
                .eq('status', 'completed') as any

            if (woError) throw woError

            const report: TeamPerformanceReport = {
                technicians: [],
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            technicians?.forEach((tech: any) => {
                const orders = workOrders?.filter((wo: any) => wo.assigned_to === tech.id) || []
                let totalTime = 0
                let countWithTime = 0

                orders.forEach((wo: any) => {
                    if (wo.created_at && wo.completed_at) {
                        const created = new Date(wo.created_at).getTime()
                        const completed = new Date(wo.completed_at).getTime()
                        totalTime += (completed - created) / (1000 * 60 * 60) // hours
                        countWithTime++
                    }
                })

                report.technicians.push({
                    id: tech.id,
                    name: tech.full_name || 'Unknown',
                    name_ar: tech.full_name_ar,
                    completedOrders: orders.length,
                    avgTime: countWithTime > 0 ? Math.round(totalTime / countWithTime) : null,
                })
            })

            // Sort by completed orders descending
            report.technicians.sort((a, b) => b.completedOrders - a.completedOrders)

            return report
        },
    })
}
