import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Boxes,
    Building2,
    CheckCircle2,
    ClipboardList,
    FileSpreadsheet,
    Gauge,
    PackageSearch,
    Route,
    ShieldCheck,
    Timer,
    TrendingUp,
    Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { usePermission } from '@/hooks/usePermission'
import { useReportingFoundation, type ReportingFoundationMetrics } from '@/hooks/useReports'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'

function pct(value: number | null | undefined) {
    return value === null || value === undefined ? 'N/A' : `${Math.round(value)}%`
}

function safeNumber(value: number | null | undefined) {
    return Number.isFinite(Number(value)) ? Number(value) : 0
}

function calculatePmCompliance(metrics: ReportingFoundationMetrics | undefined) {
    const active = safeNumber(metrics?.pm.schedules_active)
    const overdue = safeNumber(metrics?.pm.schedules_overdue)
    if (active <= 0) return null
    return Math.max(0, Math.round(((active - overdue) / active) * 100))
}

function calculateSlaMetRate(metrics: ReportingFoundationMetrics | undefined) {
    const met = safeNumber(metrics?.sla.met)
    const breached = safeNumber(metrics?.sla.breached)
    const total = met + breached
    if (total <= 0) return null
    return Math.round((met / total) * 100)
}

function actualCost(metrics: ReportingFoundationMetrics | undefined) {
    const directActual = safeNumber(metrics?.cost.work_order_actual_total)
    const lineActual = safeNumber(metrics?.cost.work_order_line_cost_total)
    return directActual > 0 ? directActual : lineActual
}

function varianceLabel(metrics: ReportingFoundationMetrics | undefined, locale: string) {
    const estimated = safeNumber(metrics?.cost.work_order_estimated_total)
    const actual = actualCost(metrics)
    if (estimated <= 0 && actual <= 0) return 'N/A'
    return formatCurrency(actual - estimated, 'SAR', locale)
}

export default function ReportsPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const locale = isRTL ? 'ar-SA' : 'en-US'
    const { can } = usePermission()
    const isOperationalReportsEnabled = useFeatureEnabled('reports', 'operational_reports')
    const isExportEnabled = useFeatureEnabled('reports', 'export')
    const { data: metrics, isLoading, error } = useReportingFoundation()

    const pmCompliance = calculatePmCompliance(metrics)
    const slaMetRate = calculateSlaMetRate(metrics)
    const canExport = isExportEnabled && can('reports.export') && !!metrics
    const preventiveRatio = metrics?.pm.preventive_ratio
    const stockRisk = safeNumber(metrics?.inventory.low_stock_items) + safeNumber(metrics?.inventory.out_of_stock_items)

    const handleExport = () => {
        if (!metrics) return

        try {
            const rows = [
                ['Metric', 'Value'],
                ['Open work orders', metrics.work_orders.open],
                ['Overdue work orders', metrics.work_orders.overdue_open],
                ['PM compliance', pmCompliance ?? 'N/A'],
                ['SLA met rate', slaMetRate ?? 'N/A'],
                ['Preventive ratio', preventiveRatio ?? 'N/A'],
                ['Estimated cost', metrics.cost.work_order_estimated_total],
                ['Actual cost', actualCost(metrics)],
                ['Inventory consumed value 30d', metrics.inventory.consumed_value_30d],
                ['Stock risk items', stockRisk],
            ]

            const csv = `\uFEFF${rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')}`
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `mutqan-executive-overview-${new Date().toISOString().slice(0, 10)}.csv`
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
            toast.success(isRTL ? 'تم تصدير الملخص التنفيذي' : 'Executive summary exported')
        } catch (exportError) {
            console.error('Error exporting executive report:', exportError)
            toast.error(isRTL ? 'تعذر تصدير الملخص' : 'Failed to export summary')
        }
    }

    if (isLoading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="h-12 w-12 rounded-full border-4 border-secondary border-t-transparent animate-spin" />
                    <p className="font-cairo text-muted-foreground">
                        {isRTL ? 'جار تحميل مؤشرات التشغيل...' : 'Loading operational metrics...'}
                    </p>
                </div>
            </div>
        )
    }

    if (!isOperationalReportsEnabled) {
        return (
            <EmptyState
                icon={ShieldCheck}
                title={isRTL ? 'التقارير التشغيلية غير مفعلة' : 'Operational Reports Disabled'}
                description={isRTL
                    ? 'هذه الواجهة مرتبطة باستحقاقات الخطة. فعّل التقارير من الباقة أو راجع مدير النظام.'
                    : 'This surface follows plan entitlements. Enable reports in the subscription or contact an admin.'}
            />
        )
    }

    if (error || !metrics) {
        return (
            <EmptyState
                icon={AlertTriangle}
                title={isRTL ? 'تعذر تحميل مؤشرات الديمو' : 'Demo Metrics Unavailable'}
                description={isRTL
                    ? 'تأكد من تطبيق migration 114 وتشغيل الدالة get_tenant_reporting_foundation على قاعدة staging.'
                    : 'Apply migration 114 and verify get_tenant_reporting_foundation on staging.'}
            />
        )
    }

    return (
        <div className="space-y-8 pb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl space-y-2">
                    <Badge variant="outline" className="w-fit gap-2 border-secondary/30 bg-secondary/5 text-secondary">
                        <Gauge className="h-3.5 w-3.5" />
                        {isRTL ? 'سطح ديمو تنفيذي' : 'Executive Demo Surface'}
                    </Badge>
                    <h1 className="font-cairo text-2xl font-bold text-primary md:text-3xl">
                        {isRTL ? 'نظرة تنفيذية على التشغيل والعائد' : 'Executive Operations and ROI Overview'}
                    </h1>
                    <p className="font-cairo text-muted-foreground">
                        {isRTL
                            ? 'ملخص صغير ومباشر يربط العمل الميداني بالأثر المالي والتشغيلي. صُمم ليكون نهاية قوية لعرض العميل.'
                            : 'A compact view that connects field work to operational and financial impact. Built as the close for the customer demo.'}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    {canExport ? (
                        <Button variant="outline" onClick={handleExport} className="gap-2">
                            <FileSpreadsheet className="h-4 w-4" />
                            {isRTL ? 'تصدير الملخص' : 'Export Summary'}
                        </Button>
                    ) : null}
                    <Button asChild className="gap-2">
                        <Link to="/maintenance">
                            {isRTL ? 'عرض مسار الديمو' : 'Open Demo Flow'}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </div>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    icon={ClipboardList}
                    label={isRTL ? 'أوامر العمل المفتوحة' : 'Open Work Orders'}
                    value={formatNumber(metrics.work_orders.open, locale)}
                    tone={metrics.work_orders.open > 0 ? 'info' : 'success'}
                />
                <MetricCard
                    icon={AlertTriangle}
                    label={isRTL ? 'الأعمال المتأخرة' : 'Overdue Work'}
                    value={formatNumber(metrics.work_orders.overdue_open, locale)}
                    tone={metrics.work_orders.overdue_open > 0 ? 'danger' : 'success'}
                />
                <MetricCard
                    icon={Wrench}
                    label={isRTL ? 'التزام الصيانة الوقائية' : 'PM Compliance'}
                    value={pct(pmCompliance)}
                    tone={pmCompliance !== null && pmCompliance >= 80 ? 'success' : 'warning'}
                />
                <MetricCard
                    icon={Timer}
                    label={isRTL ? 'التزام SLA' : 'SLA Met Rate'}
                    value={pct(slaMetRate)}
                    tone={slaMetRate !== null && slaMetRate >= 85 ? 'success' : 'warning'}
                />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 font-cairo text-xl">
                            <Activity className="h-5 w-5 text-secondary" />
                            {isRTL ? 'Executive Operations Overview' : 'Executive Operations Overview'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <RatioRow
                            label={isRTL ? 'الوقائي مقابل التصحيحي' : 'Preventive vs Corrective'}
                            value={pct(preventiveRatio)}
                            hint={`${formatNumber(metrics.work_orders.preventive, locale)} PM / ${formatNumber(metrics.work_orders.corrective, locale)} corrective`}
                            progress={safeNumber(preventiveRatio)}
                        />
                        <RatioRow
                            label={isRTL ? 'SLA met vs breached' : 'SLA Met vs Breached'}
                            value={pct(slaMetRate)}
                            hint={`${formatNumber(metrics.sla.met, locale)} met / ${formatNumber(metrics.sla.breached, locale)} breached`}
                            progress={safeNumber(slaMetRate)}
                        />
                        <div className="grid gap-3 md:grid-cols-3">
                            <SmallStat label={isRTL ? 'الأصول' : 'Assets'} value={formatNumber(metrics.assets.total, locale)} icon={Building2} />
                            <SmallStat label={isRTL ? 'خارج الخدمة' : 'Out of Service'} value={formatNumber(metrics.assets.out_of_service, locale)} icon={AlertTriangle} />
                            <SmallStat label={isRTL ? 'حرجة' : 'Critical'} value={formatNumber(metrics.assets.critical, locale)} icon={ShieldCheck} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 font-cairo text-xl">
                            <TrendingUp className="h-5 w-5 text-secondary" />
                            {isRTL ? 'Maintenance ROI / SLA Summary' : 'Maintenance ROI / SLA Summary'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <ValuePair
                            label={isRTL ? 'التكلفة المقدرة' : 'Estimated Cost'}
                            value={formatCurrency(metrics.cost.work_order_estimated_total, 'SAR', locale)}
                        />
                        <ValuePair
                            label={isRTL ? 'التكلفة الفعلية' : 'Actual Cost'}
                            value={formatCurrency(actualCost(metrics), 'SAR', locale)}
                        />
                        <ValuePair
                            label={isRTL ? 'فرق التكلفة' : 'Cost Variance'}
                            value={varianceLabel(metrics, locale)}
                        />
                        <div className="rounded-lg border bg-muted/5 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="font-cairo text-sm font-medium">{isRTL ? 'مخاطر المخزون' : 'Stock Risk'}</p>
                                    <p className="font-cairo text-xs text-muted-foreground">
                                        {isRTL ? 'قطع منخفضة أو منتهية تؤثر على الإغلاق' : 'Low or empty stock that can delay closure'}
                                    </p>
                                </div>
                                <div className={cn('text-2xl font-bold', stockRisk > 0 ? 'text-warning' : 'text-success')}>
                                    {formatNumber(stockRisk, locale)}
                                </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                                <span>{isRTL ? 'استهلاك 30 يوم' : '30d consumed'}</span>
                                <span>{formatCurrency(metrics.inventory.consumed_value_30d, 'SAR', locale)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>

            <Card className="border-secondary/20 bg-secondary/5">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 font-cairo text-xl">
                        <Route className="h-5 w-5 text-secondary" />
                        {isRTL ? 'مسار الديمو التجاري الموصى به' : 'Recommended Sales Demo Flow'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-7">
                        <DemoStep to="/facilities" icon={Building2} label={isRTL ? 'الموقع' : 'Site'} />
                        <DemoStep to="/assets" icon={Boxes} label={isRTL ? 'الأصل' : 'Asset'} />
                        <DemoStep to="/maintenance" icon={Wrench} label={isRTL ? 'PM Schedule' : 'PM Schedule'} />
                        <DemoStep to="/work-orders" icon={ClipboardList} label={isRTL ? 'أمر العمل' : 'Generated WO'} />
                        <DemoStep to="/work-orders" icon={CheckCircle2} label={isRTL ? 'تنفيذ الفني' : 'Execution'} />
                        <DemoStep to="/inventory" icon={PackageSearch} label={isRTL ? 'قطع الغيار' : 'Parts'} />
                        <DemoStep to="/reports" icon={BarChart3} label={isRTL ? 'الأثر' : 'ROI Result'} active />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
    return (
        <div className="flex min-h-[55vh] items-center justify-center">
            <div className="max-w-xl text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
                    <Icon className="h-7 w-7" />
                </div>
                <h2 className="font-cairo text-xl font-bold text-primary">{title}</h2>
                <p className="mt-2 font-cairo text-muted-foreground">{description}</p>
            </div>
        </div>
    )
}

function MetricCard({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: React.ElementType
    label: string
    value: string
    tone: 'success' | 'warning' | 'danger' | 'info'
}) {
    const toneClasses = {
        success: 'border-success/20 bg-success/5 text-success',
        warning: 'border-warning/20 bg-warning/5 text-warning',
        danger: 'border-destructive/20 bg-destructive/5 text-destructive',
        info: 'border-info/20 bg-info/5 text-info',
    }

    return (
        <Card className="overflow-hidden">
            <CardContent className="flex items-center gap-4 p-5">
                <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border', toneClasses[tone])}>
                    <Icon className="h-6 w-6" />
                </div>
                <div>
                    <p className="font-cairo text-sm text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold text-primary">{value}</p>
                </div>
            </CardContent>
        </Card>
    )
}

function RatioRow({ label, value, hint, progress }: { label: string; value: string; hint: string; progress: number }) {
    const clamped = Math.max(0, Math.min(progress, 100))
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="font-cairo text-sm font-medium text-primary">{label}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <span className="text-lg font-bold text-secondary">{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-secondary" style={{ width: `${clamped}%` }} />
            </div>
        </div>
    )
}

function SmallStat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
    return (
        <div className="rounded-lg border bg-muted/5 p-4">
            <Icon className="mb-3 h-5 w-5 text-secondary" />
            <p className="text-xl font-bold text-primary">{value}</p>
            <p className="font-cairo text-xs text-muted-foreground">{label}</p>
        </div>
    )
}

function ValuePair({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border bg-background p-4">
            <span className="font-cairo text-sm text-muted-foreground">{label}</span>
            <span className="font-bold text-primary">{value}</span>
        </div>
    )
}

function DemoStep({
    to,
    icon: Icon,
    label,
    active = false,
}: {
    to: string
    icon: React.ElementType
    label: string
    active?: boolean
}) {
    return (
        <Link
            to={to}
            className={cn(
                'flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border bg-background p-3 text-center transition hover:border-secondary hover:bg-secondary/5',
                active && 'border-secondary bg-secondary/10 text-secondary'
            )}
        >
            <Icon className="h-5 w-5" />
            <span className="font-cairo text-xs font-semibold">{label}</span>
        </Link>
    )
}
