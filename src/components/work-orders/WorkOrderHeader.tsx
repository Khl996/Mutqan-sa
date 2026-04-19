import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowLeft, Printer, Share2 } from 'lucide-react'
import { WorkOrder } from '@/hooks/useWorkOrders'
import { cn } from '@/lib/utils'
import { STATUS_DISPLAY } from '@/config/workOrderStatus'

interface WorkOrderHeaderProps {
    workOrder: WorkOrder
    isRTL: boolean
    onPrint?: () => void
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

export default function WorkOrderHeader({ workOrder, isRTL, onPrint }: WorkOrderHeaderProps) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const statusConfig = STATUS_DISPLAY[workOrder.status] || STATUS_DISPLAY.pending
    const priorityConfig = getPriorityConfig(workOrder.priority)

    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-card p-6 rounded-xl border shadow-sm">
            <div className="flex items-start gap-4">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-muted rounded-full transition-colors mt-1"
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

                    <div className="flex items-center gap-2 text-sm">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border font-cairo", statusConfig.bg, statusConfig.color, statusConfig.borderColor)}>
                            {t(`workOrders.${statusConfig.label}`)}
                        </span>
                        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium font-cairo", priorityConfig.color)}>
                            {t(`workOrders.${priorityConfig.label}`)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-center">
                <button
                    onClick={onPrint}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors font-cairo"
                >
                    <Printer className="w-4 h-4" />
                    <span className="hidden sm:inline">{isRTL ? 'طباعة' : 'Print'}</span>
                </button>
                <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors font-cairo">
                    <Share2 className="w-4 h-4" />
                    <span className="hidden sm:inline">{isRTL ? 'مشاركة' : 'Share'}</span>
                </button>
            </div>
        </div>
    )
}
