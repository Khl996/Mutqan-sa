import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowLeft, Printer, Share2 } from 'lucide-react'
import { WorkOrder } from '@/hooks/useWorkOrders'
import { cn } from '@/lib/utils'

interface WorkOrderHeaderProps {
    workOrder: WorkOrder
    isRTL: boolean
    onPrint?: () => void
}

// Helper for labels and colors
const getStatusConfig = (status: string) => {
    switch (status) {
        case 'pending': return { label: 'pending', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
        case 'assigned': return { label: 'assigned', color: 'bg-blue-100 text-blue-700 border-blue-200' }
        case 'in_progress': return { label: 'inProgress', color: 'bg-purple-100 text-purple-700 border-purple-200' }

        case 'pending_supervisor_approval': return { label: 'pendingApproval', color: 'bg-purple-50 text-purple-700 border-purple-200' }
        case 'pending_engineer_review': return { label: 'pendingReview', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
        case 'pending_reporter_closure': return { label: 'pendingClosure', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' }

        case 'completed': return { label: 'completed', color: 'bg-green-100 text-green-700 border-green-200' }
        case 'auto_closed': return { label: 'autoClosed', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' }

        case 'rejected_by_technician': return { label: 'rejected', color: 'bg-red-100 text-red-700 border-red-200' }
        case 'cancelled': return { label: 'cancelled', color: 'bg-gray-100 text-gray-700 border-gray-200' }
        case 'on_hold': return { label: 'onHold', color: 'bg-orange-100 text-orange-700 border-orange-200' }

        default: return { label: status, color: 'bg-gray-100 text-gray-700' }
    }
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
    const statusConfig = getStatusConfig(workOrder.status)
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
                        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border font-cairo", statusConfig.color)}>
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
