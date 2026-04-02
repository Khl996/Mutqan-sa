import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useWorkOrdersReport } from '@/hooks/useReports'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { usePermission } from '@/hooks/usePermission'
import {
    ClipboardList,
    CheckCircle2,
    AlertTriangle,
    BarChart3,
    Timer,
    Activity,
    Target,
    FileSpreadsheet,
    AlertCircle,
} from 'lucide-react'

function escapeCsvValue(value: string | number) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export default function ReportsPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    const { can } = usePermission()
    const isOperationalReportsEnabled = useFeatureEnabled('reports', 'operational_reports')
    const isExportEnabled = useFeatureEnabled('reports', 'export')

    const { data: woReport, isLoading: woLoading } = useWorkOrdersReport()
    const maintReport = null
    const showMaintenanceCompliance = false

    const isLoading = woLoading
    const closedCount = (woReport?.byStatus.completed || 0) + (woReport?.byStatus.auto_closed || 0)
    const canExport = isExportEnabled && can('reports.export') && !!woReport

    const handleExport = () => {
        if (!woReport) return

        try {
            const rows: Array<Array<string | number>> = [
                [isRTL ? 'المؤشر' : 'Metric', isRTL ? 'القيمة' : 'Value'],
                [isRTL ? 'إجمالي البلاغات' : 'Total Work Orders', woReport.total],
                [isRTL ? 'المفتوحة' : 'Open', woReport.openCount],
                [isRTL ? 'المغلقة' : 'Closed', closedCount],
                [isRTL ? 'المتأخرة' : 'Overdue', woReport.overdueCount],
                [isRTL ? 'المكتمل هذا الشهر' : 'Completed This Month', woReport.completedThisMonth],
                [isRTL ? 'متوسط زمن الإغلاق (ساعة)' : 'Avg Closing Time (Hours)', woReport.avgCompletionTime || 0],
                [],
                [isRTL ? 'الحالة' : 'Status', isRTL ? 'العدد' : 'Count'],
                ...Object.entries(woReport.byStatus).map(([status, count]) => [status, count]),
                [],
                [isRTL ? 'النوع' : 'Type', isRTL ? 'العدد' : 'Count'],
                ...Object.entries(woReport.byType).map(([type, count]) => [type, count]),
            ]

            const csv = `\uFEFF${rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')}`
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')

            link.href = url
            link.download = `operational-report-${new Date().toISOString().slice(0, 10)}.csv`
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)

            toast.success(isRTL ? 'تم تصدير التقرير بنجاح' : 'Report exported successfully')
        } catch (error) {
            console.error('Error exporting report:', error)
            toast.error(isRTL ? 'تعذر تصدير التقرير' : 'Failed to export report')
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted font-cairo">{isRTL ? 'جارٍ تحميل التقرير...' : 'Loading report...'}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo flex items-center gap-3">
                        <Activity className="w-7 h-7 text-secondary" />
                        {isRTL ? 'تقرير الأداء التشغيلي' : 'Operational Performance Report'}
                    </h1>
                    <p className="text-muted font-cairo">
                        {isRTL ? 'ملخص شامل لمؤشرات الأداء الرئيسية والعمليات' : 'Comprehensive summary of KPIs and operations'}
                    </p>
                </div>

                {canExport && (
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-xl font-cairo hover:bg-secondary/90 transition-colors"
                    >
                        <FileSpreadsheet className="w-5 h-5" />
                        {isRTL ? 'تصدير التقرير' : 'Export Report'}
                    </button>
                )}
            </div>

            {!isOperationalReportsEnabled ? (
                <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4">
                    <div className="p-4 bg-muted rounded-full">
                        <AlertCircle className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-bold font-cairo text-muted-foreground">
                        {isRTL ? 'التقارير التشغيلية معطلة' : 'Operational Reports Disabled'}
                    </h2>
                    <p className="text-muted-foreground font-cairo text-center">
                        {isRTL
                            ? 'تم تعطيل عرض التقارير التشغيلية. يرجى مراجعة مدير النظام.'
                            : 'Operational reports viewing is disabled. Please contact admin.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ReportCard title={isRTL ? 'حالة البلاغات' : 'Work Orders Status'} icon={ClipboardList}>
                        <div className="grid grid-cols-3 gap-4">
                            <MetricBox
                                label={isRTL ? 'مفتوحة' : 'Open'}
                                value={woReport?.openCount || 0}
                                icon={ClipboardList}
                                color="info"
                            />
                            <MetricBox
                                label={isRTL ? 'مغلقة' : 'Closed'}
                                value={closedCount}
                                icon={CheckCircle2}
                                color="success"
                            />
                            <MetricBox
                                label={isRTL ? 'متأخرة' : 'Overdue'}
                                value={woReport?.overdueCount || 0}
                                icon={AlertTriangle}
                                color="destructive"
                            />
                        </div>
                    </ReportCard>

                    <ReportCard title={isRTL ? 'كفاءة الإنجاز' : 'Efficiency'} icon={Timer}>
                        <div className="flex flex-col items-center justify-center py-6">
                            <div className="relative flex items-center justify-center w-36 h-36 mb-6">
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <Timer className="w-12 h-12 text-secondary" />
                                </div>

                                <svg className="w-full h-full transform -rotate-90 drop-shadow-sm" viewBox="0 0 100 100">
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="40"
                                        stroke="currentColor"
                                        strokeWidth="8"
                                        fill="transparent"
                                        className="text-secondary/10"
                                    />
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="40"
                                        stroke="currentColor"
                                        strokeWidth="8"
                                        fill="transparent"
                                        className="text-secondary"
                                        strokeDasharray="251.2"
                                        strokeDashoffset={251.2 * (1 - Math.min((woReport?.avgCompletionTime || 0) / 48, 1))}
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </div>
                            <div className="text-center">
                                <h3 className="text-3xl font-bold text-primary font-inter">
                                    {woReport?.avgCompletionTime || 0}
                                </h3>
                                <p className="text-muted-foreground font-cairo">
                                    {isRTL ? 'متوسط زمن الإغلاق (ساعة)' : 'Avg Closing Time (Hours)'}
                                </p>
                            </div>
                        </div>
                    </ReportCard>

                    <div className="md:col-span-1">
                        <ReportCard title={isRTL ? 'توزيع البلاغات حسب النوع' : 'Distribution by Type'} icon={BarChart3}>
                            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                                {Object.entries(woReport?.byType || {}).length > 0 ? (
                                    Object.entries(woReport?.byType || {})
                                        .sort(([, a], [, b]) => b - a)
                                        .map(([type, count]) => {
                                            const total = woReport?.total || 1
                                            const percentage = Math.round((count / total) * 100)

                                            return (
                                                <div key={type} className="group">
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="font-cairo capitalize flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full bg-primary/50"></span>
                                                            {type.replace(/_/g, ' ')}
                                                        </span>
                                                        <span className="font-mono text-muted-foreground">{count} ({percentage}%)</span>
                                                    </div>
                                                    <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary/80 rounded-full transition-all group-hover:bg-primary"
                                                            style={{ width: `${percentage}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )
                                        })
                                ) : (
                                    <p className="text-center text-muted-foreground py-8 font-cairo">
                                        {isRTL ? 'لا توجد بيانات متاحة' : 'No data available'}
                                    </p>
                                )}
                            </div>
                        </ReportCard>
                    </div>

                    {showMaintenanceCompliance ? (
                        <div className="md:col-span-1">
                            <ReportCard title={isRTL ? 'الالتزام بخطط الصيانة' : 'Maintenance Compliance'} icon={Target}>
                                <div className="flex flex-col items-center justify-center py-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h3 className={cn(
                                            'text-5xl font-bold',
                                            (maintReport?.completionRate || 0) >= 80 ? 'text-success' :
                                                (maintReport?.completionRate || 0) >= 50 ? 'text-warning' : 'text-destructive'
                                        )}>
                                            {maintReport?.completionRate || 0}%
                                        </h3>
                                    </div>
                                    <p className="text-muted-foreground font-cairo mb-6 text-center">
                                        {isRTL ? 'نسبة إنجاز الصيانة الوقائية في موعدها' : 'Preventive maintenance completed on time'}
                                    </p>

                                    <div className="w-full space-y-3">
                                        <div className="flex justify-between items-center p-3 bg-muted/5 rounded-lg">
                                            <span className="text-sm font-cairo">{isRTL ? 'إجمالي المجدول' : 'Total Scheduled'}</span>
                                            <span className="font-bold">{maintReport?.totalScheduled || 0}</span>
                                        </div>
                                        <div className="flex justify-between items-center p-3 bg-success/10 rounded-lg text-success">
                                            <span className="text-sm font-cairo">{isRTL ? 'تم الإنجاز' : 'Completed'}</span>
                                            <span className="font-bold">{maintReport?.completedOnTime || 0}</span>
                                        </div>
                                        <div className="flex justify-between items-center p-3 bg-destructive/10 rounded-lg text-destructive">
                                            <span className="text-sm font-cairo">{isRTL ? 'غير منجز / متأخر' : 'Missed / Overdue'}</span>
                                            <span className="font-bold">{maintReport?.overdue || 0}</span>
                                        </div>
                                    </div>
                                </div>
                            </ReportCard>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    )
}

function ReportCard({ title, icon: Icon, children }: { title: string, icon: React.ElementType, children: React.ReactNode }) {
    return (
        <div className="bg-card rounded-xl border shadow-card overflow-hidden h-full">
            <div className="flex items-center gap-3 p-4 border-b bg-muted/5">
                <Icon className="w-5 h-5 text-secondary" />
                <h3 className="font-bold font-cairo text-lg">{title}</h3>
            </div>
            <div className="p-6 h-full flex flex-col justify-center">
                {children}
            </div>
        </div>
    )
}

function MetricBox({ label, value, icon: Icon, color = 'default' }: { label: string, value: number | string, icon: React.ElementType, color?: string }) {
    const colorClasses: Record<string, string> = {
        default: 'text-primary bg-primary/5',
        success: 'text-success bg-success/5',
        warning: 'text-warning bg-warning/5',
        destructive: 'text-destructive bg-destructive/5',
        info: 'text-info bg-info/5',
    }

    return (
        <div className={cn('p-4 rounded-xl flex flex-col items-center justify-center text-center gap-2', colorClasses[color])}>
            <Icon className="w-6 h-6 opacity-80" />
            <span className="text-2xl font-bold">{value}</span>
            <span className="text-xs font-cairo opacity-70">{label}</span>
        </div>
    )
}
