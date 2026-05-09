import { Compass, Eye, Lightbulb, Target } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { InventoryReport, ReportingFoundationMetrics, WorkOrderReport } from '@/hooks/useReports'
import { formatNumber } from '@/lib/utils'

type OperationalDecisionBriefProps = {
    metrics: ReportingFoundationMetrics
    workOrderReport?: WorkOrderReport
    inventoryReport?: InventoryReport
    pmCompliance: number | null
    locale: string
    isRTL: boolean
}

function safeNumber(value: number | null | undefined) {
    return Number.isFinite(Number(value)) ? Number(value) : 0
}

function nameOf(signal: { name: string; name_ar: string | null } | null | undefined, isRTL: boolean) {
    if (!signal) return ''
    return isRTL ? signal.name_ar || signal.name : signal.name
}

type BriefBody = {
    attention: string
    pressure: string
    cause: string
    decision: string
}

function buildBrief({
    metrics,
    workOrderReport,
    inventoryReport,
    pmCompliance,
    locale,
    isRTL,
}: OperationalDecisionBriefProps): BriefBody {
    const overdue = safeNumber(metrics.work_orders.overdue_open)
    const open = safeNumber(metrics.work_orders.open)
    const outOfStock = safeNumber(metrics.inventory.out_of_stock_items)
    const lowStock = safeNumber(metrics.inventory.low_stock_items)
    const stockRisk = outOfStock + lowStock
    const lowStockItem = inventoryReport?.lowStockItems[0]
    const topLocation = workOrderReport?.topLocationPressure
    const topAsset = workOrderReport?.topAssetDemand
    const topIssue = workOrderReport?.topIssueType

    // 1. What needs attention?
    const attentionBits: string[] = []
    if (overdue > 0) {
        attentionBits.push(
            isRTL
                ? `${formatNumber(overdue, locale)} أمر عمل متأخر`
                : `${formatNumber(overdue, locale)} overdue work orders`
        )
    }
    if (outOfStock > 0) {
        attentionBits.push(
            isRTL
                ? `${formatNumber(outOfStock, locale)} صنف مخزون منتهي`
                : `${formatNumber(outOfStock, locale)} out-of-stock items`
        )
    } else if (lowStock > 0) {
        attentionBits.push(
            isRTL
                ? `${formatNumber(lowStock, locale)} صنف اقترب من الحد الأدنى`
                : `${formatNumber(lowStock, locale)} items near reorder threshold`
        )
    }
    if (pmCompliance !== null && pmCompliance < 70) {
        attentionBits.push(
            isRTL
                ? `التزام الصيانة الوقائية ${pmCompliance}%`
                : `PM compliance at ${pmCompliance}%`
        )
    }
    const attention = attentionBits.length > 0
        ? (isRTL ? attentionBits.join('، ') + '.' : attentionBits.join(', ') + '.')
        : (isRTL
            ? 'لا توجد مخاطر تشغيلية عاجلة حالياً.'
            : 'No urgent operational risks at the moment.')

    // 2. Where is pressure concentrated?
    const pressureBits: string[] = []
    if (topLocation && topLocation.count >= 2) {
        pressureBits.push(
            isRTL
                ? `${nameOf(topLocation, isRTL)}: ${formatNumber(topLocation.count, locale)} أمر عمل`
                : `${nameOf(topLocation, isRTL)}: ${formatNumber(topLocation.count, locale)} work orders`
        )
    }
    if (topAsset && topAsset.count >= 2) {
        pressureBits.push(
            isRTL
                ? `${nameOf(topAsset, isRTL)}: ${formatNumber(topAsset.count, locale)} حالة`
                : `${nameOf(topAsset, isRTL)}: ${formatNumber(topAsset.count, locale)} instances`
        )
    }
    let pressure: string
    if (pressureBits.length > 0) {
        pressure = pressureBits.join(isRTL ? '. ' : '. ') + '.'
    } else if (open >= 5) {
        pressure = isRTL
            ? `${formatNumber(open, locale)} أمر عمل مفتوح موزّع بدون بؤرة واضحة.`
            : `${formatNumber(open, locale)} open work orders spread without a clear hotspot.`
    } else {
        pressure = isRTL
            ? 'الحمل التشغيلي موزّع، لا توجد بؤرة ضغط واضحة.'
            : 'Workload is currently balanced — no clear pressure point.'
    }

    // 3. What is the likely cause?
    let cause: string
    if (topIssue && topIssue.count >= 2) {
        cause = isRTL
            ? `تكرار العطل من فئة "${nameOf(topIssue, isRTL)}" خلال ${formatNumber(topIssue.count, locale)} حالة.`
            : `Recurring issue category "${nameOf(topIssue, isRTL)}" across ${formatNumber(topIssue.count, locale)} cases.`
    } else if (topAsset && topAsset.count >= 3) {
        cause = isRTL
            ? `أصل يستدعي فحصاً: ${nameOf(topAsset, isRTL)} (${formatNumber(topAsset.count, locale)} طلب).`
            : `Asset showing repeat demand: ${nameOf(topAsset, isRTL)} (${formatNumber(topAsset.count, locale)} requests).`
    } else if (lowStockItem) {
        const itemName = isRTL ? (lowStockItem.name_ar || lowStockItem.name) : lowStockItem.name
        cause = isRTL
            ? `قطع حرجة منخفضة قد تعطل الإغلاق، مثل "${itemName}".`
            : `Critical parts running low could delay closure, e.g. "${itemName}".`
    } else if (pmCompliance !== null && pmCompliance < 80) {
        cause = isRTL
            ? 'فجوة في تنفيذ الصيانة الوقائية تظهر بصورة متراكمة.'
            : 'Gap in preventive maintenance execution is accumulating.'
    } else {
        cause = isRTL
            ? 'لا يظهر نمط سبب واضح من البيانات الحالية.'
            : 'No clear cause pattern from the current data.'
    }

    // 4. Recommended decision?
    let decision: string
    if (overdue > 0) {
        decision = isRTL
            ? 'صعّد الأعمال المتأخرة وحدّد مالك إغلاق اليوم لكل بند.'
            : 'Escalate overdue work and assign a closure owner today for each item.'
    } else if (pmCompliance !== null && pmCompliance < 70) {
        decision = isRTL
            ? 'راجع خطة الصيانة الوقائية وعالج الجداول المتأخرة قبل توليد الجولة القادمة.'
            : 'Review the PM plan and clear overdue schedules before the next generation cycle.'
    } else if (outOfStock > 0) {
        decision = isRTL
            ? 'أعد تزويد الأصناف المنتهية فوراً قبل أن تؤخر إغلاق أوامر العمل.'
            : 'Restock out-of-stock items immediately before they delay work order closure.'
    } else if (topLocation && topLocation.count >= 4) {
        decision = isRTL
            ? 'وازن الحمل أو خصص فريقاً للموقع الأكثر ضغطاً هذا الأسبوع.'
            : 'Rebalance workload or dedicate a team to the most pressured location this week.'
    } else if (topIssue && topIssue.count >= 3) {
        decision = isRTL
            ? 'حقّق في فئة العطل المتكررة وعدّل قالب الصيانة الوقائية المرتبط.'
            : 'Investigate the recurring issue category and tune the linked PM job plan.'
    } else if (stockRisk > 0) {
        decision = isRTL
            ? 'تابع تزويد الأصناف المنخفضة قبل وصولها إلى نقطة الانتهاء.'
            : 'Plan replenishment for low items before they reach zero.'
    } else {
        decision = isRTL
            ? 'استمر بمراقبة المؤشرات الحالية والحفاظ على إيقاع الصيانة.'
            : 'Continue monitoring current indicators and keep the current maintenance rhythm.'
    }

    return { attention, pressure, cause, decision }
}

export function OperationalDecisionBrief(props: OperationalDecisionBriefProps) {
    const { metrics, isRTL } = props
    const totalActivity =
        safeNumber(metrics.work_orders.total) +
        safeNumber(metrics.assets.total) +
        safeNumber(metrics.pm.schedules_active)
    const hasEnoughData = totalActivity > 0

    const heading = isRTL ? 'موجز القرار التشغيلي' : 'Operational Decision Brief'
    const subhead = isRTL
        ? 'قراءة موجزة للحالة التشغيلية مع توجيه عملي مقترح.'
        : 'A short read of the operational picture with a suggested next move.'

    if (!hasEnoughData) {
        return (
            <section aria-label={heading}>
                <Card>
                    <CardContent className="space-y-3 p-6">
                        <div>
                            <h2 className="font-cairo text-xl font-bold text-primary">{heading}</h2>
                            <p className="font-cairo text-sm text-muted-foreground">{subhead}</p>
                        </div>
                        <p className="font-cairo text-sm leading-7 text-foreground/80">
                            {isRTL
                                ? 'لا توجد بيانات تشغيلية كافية لإصدار موجز قرار دقيق بعد. ابدأ بتسجيل أوامر العمل وربطها بالأصول والمواقع، وسيحوّل متقن النشاط اليومي إلى موجزات قرار قابلة للمتابعة.'
                                : 'There is not enough operational data yet to generate a reliable decision brief. Start by recording work orders and linking them to assets and locations, and Mutqan will turn daily activity into decision-ready briefs.'}
                        </p>
                    </CardContent>
                </Card>
            </section>
        )
    }

    const brief = buildBrief(props)

    const sections: Array<{ key: keyof BriefBody; icon: typeof Eye; titleAr: string; titleEn: string }> = [
        { key: 'attention', icon: Eye, titleAr: 'ما الذي يستدعي الانتباه؟', titleEn: 'What needs attention?' },
        { key: 'pressure', icon: Compass, titleAr: 'أين يتركز الضغط؟', titleEn: 'Where is the pressure concentrated?' },
        { key: 'cause', icon: Lightbulb, titleAr: 'ما السبب المحتمل؟', titleEn: 'What is the likely cause?' },
        { key: 'decision', icon: Target, titleAr: 'ما القرار المقترح؟', titleEn: 'Recommended decision' },
    ]

    return (
        <section aria-label={heading}>
            <Card>
                <CardContent className="space-y-5 p-6">
                    <div>
                        <h2 className="font-cairo text-xl font-bold text-primary">{heading}</h2>
                        <p className="font-cairo text-sm text-muted-foreground">{subhead}</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {sections.map(({ key, icon: Icon, titleAr, titleEn }) => (
                            <div
                                key={key}
                                className="rounded-lg border bg-muted/5 p-4"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-secondary">
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <p className="font-cairo text-sm font-semibold text-primary">
                                        {isRTL ? titleAr : titleEn}
                                    </p>
                                </div>
                                <p className="mt-3 font-cairo text-sm leading-7 text-foreground/85">
                                    {brief[key]}
                                </p>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </section>
    )
}
