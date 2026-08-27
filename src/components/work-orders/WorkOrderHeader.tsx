import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowLeft, Printer } from 'lucide-react'
import { WorkOrder, isPreventiveWorkOrder } from '@/hooks/useWorkOrders'
import { cn } from '@/lib/utils'
import { STATUS_DISPLAY } from '@/config/workOrderStatus'

interface WorkOrderHeaderProps {
    workOrder: WorkOrder
    isRTL: boolean
    onPrint?: () => void
    proofOfWorkEnabled?: boolean
}

const getPriorityConfig = (priority: string) => {
    switch (priority) {
        case 'high': return { label: 'high', color: 'text-red-600 bg-red-50' }
        case 'medium': return { label: 'medium', color: 'text-orange-600 bg-orange-50' }
        case 'low': return { label: 'low', color: 'text-green-600 bg-green-50' }
        case 'urgent': return { label: 'urgent', color: 'text-red-700 bg-red-100 font-bold' }
        default: return { label: priority, color: 'text-gray-600' }
    }
}

export default function WorkOrderHeader({
    workOrder,
    isRTL,
    onPrint,
    proofOfWorkEnabled = false,
}: WorkOrderHeaderProps) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const statusConfig = STATUS_DISPLAY[workOrder.status] || STATUS_DISPLAY.pending
    const priorityConfig = getPriorityConfig(workOrder.priority)
    const preventive = isPreventiveWorkOrder(workOrder)
    const printLabel = proofOfWorkEnabled
        ? t('workOrders.proof.print')
        : (isRTL ? 'طباعة' : 'Print')

    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-card p-6 rounded-xl border shadow-sm">
            <div className="flex items-start gap-4">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    aria-label={isRTL ? 'العودة' : 'Go back'}
                    className="mt-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    {isRTL ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
                </button>

                <div className="space-y-1">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-2xl font-bold font-cairo">{workOrder.title}</h1>
                        <span className="text-sm text-muted font-mono bg-muted/20 px-2 py-0.5 rounded">
                            #{workOrder.code}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm flex-wrap">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border font-cairo", statusConfig.bg, statusConfig.color, statusConfig.borderColor)}>
                            {t(`workOrders.${statusConfig.label}`)}
                        </span>
                        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium font-cairo", priorityConfig.color)}>
                            {t(`workOrders.${priorityConfig.label}`)}
                        </span>
                        <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-xs font-medium font-cairo border",
                            preventive
                                ? 'text-info bg-info/10 border-info/20'
                                : 'text-muted-foreground bg-muted/10 border-muted/20'
                        )}>
                            {preventive ? t('workOrders.preventive') : t('workOrders.corrective')}
                        </span>
                    </div>
                </div>
            </div>

            {onPrint && (!proofOfWorkEnabled || workOrder.status === 'completed') && (
                <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                        type="button"
                        onClick={onPrint}
                        aria-label={printLabel}
                        className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-cairo"
                    >
                        <Printer className="h-4 w-4 text-primary" aria-hidden="true" />
                        <span>{printLabel}</span>
                    </button>
                </div>
            )}
        </div>
    )
}
