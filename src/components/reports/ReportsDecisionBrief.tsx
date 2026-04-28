import {
    AlertTriangle,
    ClipboardCheck,
    MapPinned,
    Package,
    Repeat2,
    Wrench,
    type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { InventoryReport, ReportDemandSignal, ReportingFoundationMetrics, WorkOrderReport } from '@/hooks/useReports'
import { cn, formatNumber } from '@/lib/utils'

type DecisionPriority = 'urgent' | 'medium' | 'monitor'

type DecisionItem = {
    key: string
    icon: LucideIcon
    title: string
    value: string
    action: string
    priority: DecisionPriority
}

type ReportsDecisionBriefProps = {
    metrics: ReportingFoundationMetrics
    workOrderReport?: WorkOrderReport
    inventoryReport?: InventoryReport
    pmCompliance: number | null
    locale: string
    isRTL: boolean
}

const priorityClasses: Record<DecisionPriority, string> = {
    urgent: 'border-destructive/30 bg-destructive/10 text-destructive',
    medium: 'border-warning/30 bg-warning/10 text-warning',
    monitor: 'border-info/30 bg-info/10 text-info',
}

const cardToneClasses: Record<DecisionPriority, string> = {
    urgent: 'border-destructive/30 bg-destructive/[0.03]',
    medium: 'border-warning/30 bg-warning/[0.04]',
    monitor: 'border-info/30 bg-info/[0.03]',
}

function safeNumber(value: number | null | undefined) {
    return Number.isFinite(Number(value)) ? Number(value) : 0
}

function signalName(signal: ReportDemandSignal, isRTL: boolean) {
    return isRTL ? (signal.name_ar || signal.name) : signal.name
}

function workOrderCount(count: number, locale: string, isRTL: boolean) {
    return isRTL
        ? `${formatNumber(count, locale)} أمر عمل`
        : `${formatNumber(count, locale)} work orders`
}

function buildDecisionItems({
    metrics,
    workOrderReport,
    inventoryReport,
    pmCompliance,
    locale,
    isRTL,
}: ReportsDecisionBriefProps): DecisionItem[] {
    const items: DecisionItem[] = []
    const overdueOpen = safeNumber(metrics.work_orders.overdue_open)
    const openWorkOrders = safeNumber(metrics.work_orders.open)
    const stockRisk = safeNumber(metrics.inventory.low_stock_items) + safeNumber(metrics.inventory.out_of_stock_items)
    const lowStockItem = inventoryReport?.lowStockItems[0]

    if (overdueOpen > 0) {
        items.push({
            key: 'overdue-work',
            icon: AlertTriangle,
            title: isRTL ? 'أعمال متأخرة' : 'Overdue Work',
            value: isRTL
                ? `${formatNumber(overdueOpen, locale)} أمر عمل مفتوح متأخر`
                : `${formatNumber(overdueOpen, locale)} open late work orders`,
            action: isRTL ? 'صعّد الأعمال المتأخرة وحدد مالك الإغلاق اليوم.' : 'Escalate overdue work and assign an owner for closure today.',
            priority: 'urgent',
        })
    }

    const repeatedAsset = workOrderReport?.topAssetDemand
    const repeatedIssue = workOrderReport?.topIssueType
    const repeatedSignal = repeatedAsset && repeatedAsset.count >= 2
        ? { type: 'asset' as const, signal: repeatedAsset }
        : repeatedIssue && repeatedIssue.count >= 2
            ? { type: 'issue' as const, signal: repeatedIssue }
            : null

    if (repeatedSignal) {
        const name = signalName(repeatedSignal.signal, isRTL)
        const code = repeatedSignal.signal.code ? ` (${repeatedSignal.signal.code})` : ''
        items.push({
            key: 'repeated-issue',
            icon: Repeat2,
            title: repeatedSignal.type === 'asset'
                ? (isRTL ? 'تكرار على أصل' : 'Repeated Asset Issue')
                : (isRTL ? 'تكرار حسب الفئة' : 'Repeated Issue Category'),
            value: `${name}${code} - ${workOrderCount(repeatedSignal.signal.count, locale, isRTL)}`,
            action: isRTL ? 'حقق في العطل المتكرر وعدّل خطة الصيانة الوقائية عند الحاجة.' : 'Investigate the recurring failure and tune the PM plan if needed.',
            priority: repeatedSignal.signal.count >= 4 ? 'urgent' : 'medium',
        })
    }

    if (pmCompliance !== null) {
        const activeSchedules = safeNumber(metrics.pm.schedules_active)
        const overdueSchedules = safeNumber(metrics.pm.schedules_overdue)
        items.push({
            key: 'pm-compliance',
            icon: Wrench,
            title: isRTL ? 'التزام الصيانة الوقائية' : 'PM Compliance',
            value: isRTL
                ? `${formatNumber(pmCompliance, locale)}% - ${formatNumber(activeSchedules, locale)} نشط / ${formatNumber(overdueSchedules, locale)} متأخر`
                : `${formatNumber(pmCompliance, locale)}% - ${formatNumber(activeSchedules, locale)} active / ${formatNumber(overdueSchedules, locale)} overdue`,
            action: pmCompliance < 80
                ? (isRTL ? 'عدّل خطة الصيانة الوقائية وارفع متابعة الجداول المتأخرة.' : 'Adjust the PM plan and follow up overdue schedules.')
                : (isRTL ? 'راقب الالتزام وحافظ على إيقاع الصيانة الوقائية الحالي.' : 'Monitor compliance and keep the current PM rhythm visible.'),
            priority: pmCompliance < 70 ? 'urgent' : pmCompliance < 90 ? 'medium' : 'monitor',
        })
    }

    if (lowStockItem || stockRisk > 0) {
        const quantityLabel = lowStockItem
            ? `${formatNumber(lowStockItem.quantity, locale)} / ${formatNumber(lowStockItem.min_quantity, locale)} ${lowStockItem.unit_of_measure || ''}`.trim()
            : null
        items.push({
            key: 'inventory-risk',
            icon: Package,
            title: isRTL ? 'مخاطر المخزون' : 'Inventory Risk',
            value: lowStockItem
                ? `${isRTL ? (lowStockItem.name_ar || lowStockItem.name) : lowStockItem.name} - ${quantityLabel}`
                : (isRTL
                    ? `${formatNumber(stockRisk, locale)} صنف منخفض أو منتهي`
                    : `${formatNumber(stockRisk, locale)} low or out-of-stock items`),
            action: isRTL ? 'أعد تزويد الصنف الحرج قبل أن يؤخر الإغلاق.' : 'Restock the critical item before it delays closure.',
            priority: safeNumber(metrics.inventory.out_of_stock_items) > 0 ? 'urgent' : 'medium',
        })
    }

    const locationPressure = workOrderReport?.topLocationPressure
    if (locationPressure && locationPressure.count >= 2) {
        items.push({
            key: 'location-pressure',
            icon: MapPinned,
            title: isRTL ? 'ضغط على موقع' : 'Location Pressure',
            value: `${signalName(locationPressure, isRTL)} - ${workOrderCount(locationPressure.count, locale, isRTL)}`,
            action: isRTL ? 'أعد توزيع الحمل أو خصص فريقاً للموقع الأكثر ضغطاً.' : 'Rebalance workload or dedicate a team to the pressured location.',
            priority: locationPressure.count >= 4 ? 'medium' : 'monitor',
        })
    } else if (openWorkOrders >= 5) {
        items.push({
            key: 'workload-pressure',
            icon: MapPinned,
            title: isRTL ? 'ضغط العمل' : 'Workload Pressure',
            value: isRTL
                ? `${formatNumber(openWorkOrders, locale)} أمر عمل مفتوح`
                : `${formatNumber(openWorkOrders, locale)} open work orders`,
            action: isRTL ? 'وازن الحمل بين الفريق قبل تراكم الأعمال.' : 'Rebalance workload before the backlog grows.',
            priority: 'medium',
        })
    }

    return items.slice(0, 5)
}

export function ReportsDecisionBrief(props: ReportsDecisionBriefProps) {
    const { isRTL } = props
    const items = buildDecisionItems(props)
    const gridColumns = items.length >= 5 ? 'xl:grid-cols-5' : items.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'

    return (
        <section className="space-y-3" aria-label={isRTL ? 'ملخص القرار' : 'Decision Brief'}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="font-cairo text-xl font-bold text-primary">
                        {isRTL ? 'ملخص القرار' : 'Decision Brief'}
                    </h2>
                    <p className="font-cairo text-sm text-muted-foreground">
                        {isRTL ? 'إشارات تشغيلية مختصرة مع إجراء إداري مقترح.' : 'Short operational signals with suggested management actions.'}
                    </p>
                </div>
            </div>

            {items.length > 0 ? (
                <div className={cn('grid gap-4 md:grid-cols-2', gridColumns)}>
                    {items.map((item) => (
                        <DecisionBriefCard key={item.key} item={item} isRTL={isRTL} />
                    ))}
                </div>
            ) : (
                <Card className="border-success/30 bg-success/[0.03]">
                    <CardContent className="flex items-center gap-4 p-5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-success/20 bg-success/10 text-success">
                            <ClipboardCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="font-cairo text-sm font-semibold text-primary">
                                {isRTL ? 'لا توجد مخاطر تشغيلية عالية حالياً' : 'No high operational risks detected'}
                            </p>
                            <p className="font-cairo text-xs text-muted-foreground">
                                {isRTL ? 'استمر في متابعة المؤشرات التفصيلية أدناه.' : 'Keep monitoring the detailed metrics below.'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </section>
    )
}

function DecisionBriefCard({ item, isRTL }: { item: DecisionItem; isRTL: boolean }) {
    const Icon = item.icon
    const priorityLabel = {
        urgent: isRTL ? 'عاجل' : 'Urgent',
        medium: isRTL ? 'متوسط' : 'Medium',
        monitor: isRTL ? 'متابعة' : 'Monitor',
    }[item.priority]

    return (
        <Card className={cn('h-full overflow-hidden', cardToneClasses[item.priority])}>
            <CardContent className="flex h-full flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background/80 text-secondary">
                        <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className={cn('shrink-0', priorityClasses[item.priority])}>
                        {priorityLabel}
                    </Badge>
                </div>
                <div className="space-y-1.5">
                    <p className="font-cairo text-sm font-semibold text-primary">{item.title}</p>
                    <p className="text-lg font-bold leading-snug text-primary">{item.value}</p>
                </div>
                <p className="mt-auto font-cairo text-xs leading-5 text-muted-foreground">{item.action}</p>
            </CardContent>
        </Card>
    )
}
