import { useTranslation } from 'react-i18next'
import { usePMWorkOrderDetail, PMWorkOrder } from '@/hooks/usePMFoundation'
import { cn } from '@/lib/utils'
import {
    CalendarClock,
    ClipboardCheck,
    Loader2,
    ExternalLink,
    CheckCircle2,
    Clock,
    XCircle,
    Minus,
} from 'lucide-react'

interface WorkOrderPMContextProps {
    workOrderId: string
    isRTL: boolean
    onOpenExecution?: (workOrder: PMWorkOrder) => void
}

const checkStatusConfig = {
    pending: { Icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted/10' },
    pass:    { Icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
    fail:    { Icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/5' },
    na:      { Icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted/5' },
} as const

export default function WorkOrderPMContext({ workOrderId, isRTL, onOpenExecution }: WorkOrderPMContextProps) {
    const { data: detail, isLoading, isError } = usePMWorkOrderDetail(workOrderId)
    const { i18n } = useTranslation()
    const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-US'

    if (isLoading) {
        return (
            <div className="bg-card border rounded-xl p-5 shadow-sm flex items-center gap-3 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                <span className="font-cairo text-sm">
                    {isRTL ? 'جاري تحميل سياق الصيانة الوقائية...' : 'Loading PM context...'}
                </span>
            </div>
        )
    }

    if (isError || !detail) return null

    const checks = detail.work_order_checks ?? []
    const totalChecks = checks.length
    const doneChecks = checks.filter(c => c.status !== 'pending').length
    const requiredOpenChecks = checks.filter(
        c => c.item_snapshot?.is_required && c.status === 'pending'
    ).length

    const scheduleName = isRTL
        ? detail.source_schedule?.name_ar || detail.source_schedule?.name
        : detail.source_schedule?.name

    const jobPlanName = isRTL
        ? detail.job_plan?.name_ar || detail.job_plan?.name
        : detail.job_plan?.name

    return (
        <div className="bg-card border border-info/20 rounded-xl p-6 shadow-sm space-y-5">
            {/* Section header */}
            <div className="flex items-center justify-between gap-3 border-b border-info/20 pb-3">
                <div className="flex items-center gap-2 text-info font-bold font-cairo">
                    <CalendarClock className="w-5 h-5 flex-shrink-0" />
                    <h3 className="text-base">
                        {isRTL ? 'سياق الصيانة الوقائية' : 'Preventive Maintenance Context'}
                    </h3>
                </div>
                {onOpenExecution && (
                    <button
                        onClick={() => onOpenExecution(detail)}
                        className="flex items-center gap-1.5 text-xs font-cairo font-medium text-secondary hover:text-secondary/80 px-3 py-1.5 rounded-lg border border-secondary/20 hover:bg-secondary/5 transition-colors flex-shrink-0"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {isRTL ? 'فتح تنفيذ الصيانة' : 'Open PM Execution'}
                    </button>
                )}
            </div>

            {/* PM metadata grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {scheduleName && (
                    <div className="bg-muted/5 rounded-lg p-3 space-y-0.5">
                        <p className="text-xs text-muted-foreground font-cairo uppercase tracking-wide">
                            {isRTL ? 'جدول الصيانة' : 'PM Schedule'}
                        </p>
                        <p className="font-medium font-cairo text-foreground">{scheduleName}</p>
                        {detail.source_schedule?.code && (
                            <p className="text-xs text-muted-foreground font-mono">{detail.source_schedule.code}</p>
                        )}
                    </div>
                )}

                {jobPlanName && (
                    <div className="bg-muted/5 rounded-lg p-3 space-y-0.5">
                        <p className="text-xs text-muted-foreground font-cairo uppercase tracking-wide">
                            {isRTL ? 'خطة العمل' : 'Job Plan'}
                        </p>
                        <p className="font-medium font-cairo text-foreground">{jobPlanName}</p>
                        {detail.job_plan?.code && (
                            <p className="text-xs text-muted-foreground font-mono">{detail.job_plan.code}</p>
                        )}
                    </div>
                )}

                {detail.scheduled_date && (
                    <div className="bg-muted/5 rounded-lg p-3 space-y-0.5">
                        <p className="text-xs text-muted-foreground font-cairo uppercase tracking-wide">
                            {isRTL ? 'التاريخ المجدول' : 'Scheduled Date'}
                        </p>
                        <p className="font-medium font-inter">
                            {new Date(detail.scheduled_date).toLocaleDateString(locale)}
                        </p>
                    </div>
                )}

                {detail.compliance_deadline && (
                    <div className="bg-muted/5 rounded-lg p-3 space-y-0.5">
                        <p className="text-xs text-muted-foreground font-cairo uppercase tracking-wide">
                            {isRTL ? 'الموعد النهائي للامتثال' : 'Compliance Deadline'}
                        </p>
                        <p className="font-medium font-inter text-warning">
                            {new Date(detail.compliance_deadline).toLocaleDateString(locale)}
                        </p>
                    </div>
                )}
            </div>

            {/* Checklist section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium font-cairo text-muted-foreground">
                        <ClipboardCheck className="w-4 h-4" />
                        <span>{isRTL ? 'بنود الفحص' : 'Checklist'}</span>
                    </div>
                    {totalChecks > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-cairo text-muted-foreground">
                                {isRTL
                                    ? `${doneChecks} من ${totalChecks} مكتمل`
                                    : `${doneChecks} of ${totalChecks} completed`}
                            </span>
                            {requiredOpenChecks > 0 && (
                                <span className="text-xs font-cairo text-destructive">
                                    {isRTL
                                        ? `(${requiredOpenChecks} إلزامي معلق)`
                                        : `(${requiredOpenChecks} required pending)`}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Progress bar */}
                {totalChecks > 0 && (
                    <div className="w-full bg-muted/20 rounded-full h-1.5">
                        <div
                            className="bg-info h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${(doneChecks / totalChecks) * 100}%` }}
                        />
                    </div>
                )}

                {/* Check rows */}
                {totalChecks === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground font-cairo border border-dashed border-border rounded-lg">
                        {isRTL
                            ? 'لا توجد بنود فحص مرتبطة بهذا الأمر.'
                            : 'No checklist items are linked to this work order.'}
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {checks.map((check) => {
                            const conf = checkStatusConfig[check.status] ?? checkStatusConfig.pending
                            const { Icon } = conf
                            const label = isRTL
                                ? check.item_snapshot?.label_ar || check.item_snapshot?.label || '—'
                                : check.item_snapshot?.label || '—'

                            let valueDisplay: string | null = null
                            if (check.status !== 'pending') {
                                if (check.value_bool !== null) {
                                    valueDisplay = check.value_bool
                                        ? (isRTL ? 'نعم / اجتاز' : 'Yes / Pass')
                                        : (isRTL ? 'لا / فشل' : 'No / Fail')
                                } else if (check.value_numeric !== null) {
                                    const unit = check.item_snapshot?.unit
                                    valueDisplay = unit
                                        ? `${check.value_numeric} ${unit}`
                                        : String(check.value_numeric)
                                } else if (check.value_text) {
                                    valueDisplay = check.value_text
                                }
                            }

                            return (
                                <div
                                    key={check.id}
                                    className={cn(
                                        'flex items-start gap-3 p-2.5 rounded-lg text-sm',
                                        conf.bg
                                    )}
                                >
                                    <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', conf.color)} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={cn(
                                                'font-cairo',
                                                check.status === 'pending'
                                                    ? 'text-foreground/80'
                                                    : 'text-foreground font-medium'
                                            )}>
                                                {label}
                                            </span>
                                            {check.item_snapshot?.is_required && (
                                                <span className="text-[10px] font-cairo text-destructive font-medium px-1.5 py-0.5 bg-destructive/10 rounded">
                                                    {isRTL ? 'إلزامي' : 'Required'}
                                                </span>
                                            )}
                                            {check.item_snapshot?.is_critical && !check.item_snapshot?.is_required && (
                                                <span className="text-[10px] font-cairo text-warning font-medium px-1.5 py-0.5 bg-warning/10 rounded">
                                                    {isRTL ? 'حرج' : 'Critical'}
                                                </span>
                                            )}
                                        </div>
                                        {valueDisplay && (
                                            <p className="text-xs text-muted-foreground font-cairo mt-0.5">
                                                {valueDisplay}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
