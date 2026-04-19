import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from '@/hooks/useTenantQuery'

export interface WorkOrderReport {
    total: number
    byStatus: Record<string, number>
    byPriority: Record<string, number>
    byType: Record<string, number>
    avgCompletionTime: number | null
    completedThisMonth: number
    openCount: number
    overdueCount: number
}

export interface MaintenanceReport {
    totalScheduled: number
    completedOnTime: number
    overdue: number
    upcomingThisWeek: number
    completionRate: number
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

export interface ReportingFoundationMetrics {
    tenant_id: string
    generated_at: string
    work_orders: {
        total: number
        open: number
        closed: number
        overdue_open: number
        preventive: number
        corrective: number
        avg_completion_hours: number | null
    }
    sla: {
        met: number
        breached: number
        completed_late: number
        breach_rate: number | null
    }
    pm: {
        schedules_total: number
        schedules_active: number
        schedules_overdue: number
        schedules_due_7d: number
        preventive_ratio: number | null
    }
    assets: {
        total: number
        operational: number
        under_maintenance: number
        out_of_service: number
        critical: number
    }
    inventory: {
        total_items: number
        low_stock_items: number
        out_of_stock_items: number
        stock_value: number
        consumed_quantity_30d: number
        consumed_value_30d: number
    }
    cost: {
        work_order_estimated_total: number
        work_order_actual_total: number
        work_order_line_cost_total: number
    }
}

export const reportKeys = {
    all: ['reports'] as const,
    foundation: (tenantId: string | null) => [...reportKeys.all, 'foundation', tenantId] as const,
    workOrders: (tenantId: string | null) => [...reportKeys.all, 'work-orders', tenantId] as const,
    maintenance: (tenantId: string | null) => [...reportKeys.all, 'maintenance', tenantId] as const,
    inventory: (tenantId: string | null) => [...reportKeys.all, 'inventory', tenantId] as const,
    teamPerformance: (tenantId: string | null) => [...reportKeys.all, 'team-performance', tenantId] as const,
}

export function useReportingFoundation() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: reportKeys.foundation(tenantId),
        queryFn: async () => {
            if (!tenantId) throw new Error('No tenant selected')

            const { data, error } = await supabase.rpc('get_tenant_reporting_foundation', {
                p_tenant_id: tenantId,
            })

            if (error) throw error
            return data as ReportingFoundationMetrics
        },
        enabled: !!tenantId,
    })
}

export function useWorkOrdersReport() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: reportKeys.workOrders(tenantId),
        queryFn: async () => {
            if (!tenantId) throw new Error('No tenant selected')

            const { data, error } = await supabase
                .from('work_orders')
                .select(`
                    *,
                    issue_type_rel:issue_types(id, name, name_ar)
                `)
                .eq('tenant_id', tenantId) as any

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

            data?.forEach((wo: any) => {
                report.byStatus[wo.status] = (report.byStatus[wo.status] || 0) + 1

                if (wo.priority) {
                    report.byPriority[wo.priority] = (report.byPriority[wo.priority] || 0) + 1
                }

                const typeName = wo.issue_type_rel?.name || wo.issue_type || 'unclassified'
                report.byType[typeName] = (report.byType[typeName] || 0) + 1

                const isCompleted = ['completed', 'cancelled', 'auto_closed', 'rejected_by_technician'].includes(wo.status)
                if (!isCompleted) {
                    report.openCount++
                    if (wo.due_date && new Date(wo.due_date) < now) {
                        report.overdueCount++
                    }
                }

                if ((wo.status === 'completed' || wo.status === 'auto_closed') && wo.completed_at && new Date(wo.completed_at) >= monthStart) {
                    report.completedThisMonth++
                }

                if ((wo.status === 'completed' || wo.status === 'auto_closed') && wo.completed_at && wo.created_at) {
                    const created = new Date(wo.created_at).getTime()
                    const completed = new Date(wo.completed_at).getTime()
                    const diffHours = (completed - created) / (1000 * 60 * 60)

                    if (diffHours >= 0) {
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
        enabled: !!tenantId,
    })
}

export function useMaintenanceReport() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: reportKeys.maintenance(tenantId),
        queryFn: async () => {
            if (!tenantId) throw new Error('No tenant selected')

            const { data, error } = await supabase
                .from('assets')
                .select('next_maintenance_date, last_maintenance_date')
                .eq('tenant_id', tenantId) as any

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
        enabled: !!tenantId,
    })
}

export function useInventoryReport() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: reportKeys.inventory(tenantId),
        queryFn: async () => {
            if (!tenantId) throw new Error('No tenant selected')

            const { data: items, error: itemsError } = await supabase
                .from('inventory_items')
                .select('id, name, name_ar, quantity, min_quantity, unit_cost')
                .eq('tenant_id', tenantId) as any

            if (itemsError) throw itemsError

            const { data: transactions, error: txError } = await supabase
                .from('inventory_transactions')
                .select('item_id, quantity, transaction_type')
                .eq('tenant_id', tenantId)
                .in('transaction_type', ['out', 'usage']) as any

            if (txError) throw txError

            const report: InventoryReport = {
                totalItems: items?.length || 0,
                totalValue: 0,
                lowStockCount: 0,
                outOfStockCount: 0,
                topUsedItems: [],
            }

            const usageMap = new Map<string, number>()

            items?.forEach((item: any) => {
                report.totalValue += (item.quantity || 0) * (item.unit_cost || 0)

                if (item.quantity <= 0) {
                    report.outOfStockCount++
                } else if (item.quantity <= (item.min_quantity || 0)) {
                    report.lowStockCount++
                }
            })

            transactions?.forEach((tx: any) => {
                usageMap.set(tx.item_id, (usageMap.get(tx.item_id) || 0) + Math.abs(tx.quantity))
            })

            const sortedUsage = Array.from(usageMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)

            report.topUsedItems = sortedUsage.map(([itemId, usage]) => {
                const item = items?.find((inventoryItem: any) => inventoryItem.id === itemId)
                return {
                    name: item?.name || 'Unknown',
                    name_ar: item?.name_ar || null,
                    usage,
                }
            })

            return report
        },
        enabled: !!tenantId,
    })
}

export function useTeamPerformanceReport() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: reportKeys.teamPerformance(tenantId),
        queryFn: async () => {
            if (!tenantId) throw new Error('No tenant selected')

            const { data: technicians, error: techError } = await supabase
                .from('profiles')
                .select('id, full_name, full_name_ar')
                .eq('tenant_id', tenantId)
                .in('role', ['technician', 'supervisor', 'engineer']) as any

            if (techError) throw techError

            const { data: workOrders, error: woError } = await supabase
                .from('work_orders')
                .select('assigned_to, created_at, completed_at, status')
                .eq('tenant_id', tenantId)
                .eq('status', 'completed') as any

            if (woError) throw woError

            const report: TeamPerformanceReport = {
                technicians: [],
            }

            technicians?.forEach((tech: any) => {
                const orders = workOrders?.filter((wo: any) => wo.assigned_to === tech.id) || []
                let totalTime = 0
                let countWithTime = 0

                orders.forEach((wo: any) => {
                    if (wo.created_at && wo.completed_at) {
                        const created = new Date(wo.created_at).getTime()
                        const completed = new Date(wo.completed_at).getTime()
                        totalTime += (completed - created) / (1000 * 60 * 60)
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

            report.technicians.sort((a, b) => b.completedOrders - a.completedOrders)
            return report
        },
        enabled: !!tenantId,
    })
}
