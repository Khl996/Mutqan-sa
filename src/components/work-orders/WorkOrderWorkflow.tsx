import { useTranslation } from 'react-i18next'
import { WorkOrder } from '@/hooks/useWorkOrders'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_DISPLAY } from '@/config/workOrderStatus'

interface WorkOrderWorkflowProps {
    workOrder: WorkOrder
    isRTL: boolean
}

const steps = [
    'pending',
    'assigned',
    'in_progress',
    'technical_review', // Generalized key
    'completed'
]

// Map various statuses to the main 5 steps for visualization
const getStepIndex = (status: string) => {
    switch (status) {
        case 'pending': return 0
        case 'assigned': return 1
        case 'in_progress':
        case 'on_hold':
            return 2
        case 'pending_supervisor_approval':
        case 'pending_engineer_review':
        case 'pending_reporter_closure':
            return 3
        case 'completed':
        case 'auto_closed':
            return 4
        default: return 0
    }
}

export default function WorkOrderWorkflow({ workOrder, isRTL }: WorkOrderWorkflowProps) {
    const { t } = useTranslation()
    const currentStepIndex = getStepIndex(workOrder.status)
    const statusTranslationKey = STATUS_DISPLAY[workOrder.status].label

    const stepLabels = [
        isRTL ? 'انتظار' : 'Pending',
        isRTL ? 'تم التعيين' : 'Assigned',
        isRTL ? 'قيد العمل' : 'In Progress',
        isRTL ? 'المراجعة' : 'Review',
        isRTL ? 'مكتمل' : 'Completed'
    ]

    return (
        <div className="bg-card border rounded-xl p-6 shadow-sm overflow-x-auto">
            <h3 className="font-bold text-lg font-cairo text-primary mb-6">
                {isRTL ? 'مراحل العمل' : 'Workflow Progress'}
            </h3>

            <div className="flex items-center min-w-[500px] justify-between relative z-0">
                {/* Connector Line Background */}
                <div className="absolute top-4 left-0 w-full h-1 bg-muted -z-10" />

                {/* Active Connector Line */}
                <div
                    className="absolute top-4 left-0 h-1 bg-primary -z-10 transition-all duration-500 ease-in-out"
                    style={{
                        width: `${(currentStepIndex / (steps.length - 1)) * 100}%`,
                        direction: 'ltr' // Always draw line from left to right in CSS visual logic, handled by parent direction for RTL
                    }}
                />

                {steps.map((step, idx) => {
                    const isCompleted = idx <= currentStepIndex
                    const isCurrent = idx === currentStepIndex

                    return (
                        <div key={idx} className="flex flex-col items-center gap-2 bg-card px-2">
                            <div className={cn(
                                "flex items-center justify-center w-9 h-9 rounded-full border-4 transition-all duration-300",
                                isCompleted
                                    ? "bg-primary border-primary text-primary-foreground"
                                    : "bg-background border-muted text-muted-foreground",
                                isCurrent && "ring-4 ring-primary/20 scale-110"
                            )}>
                                {idx < currentStepIndex ? (
                                    <CheckCircle2 className="w-5 h-5" />
                                ) : (
                                    <span className="text-sm font-bold">{idx + 1}</span>
                                )}
                            </div>
                            <span className={cn(
                                "text-xs font-bold font-cairo whitespace-nowrap transition-colors",
                                isCompleted ? "text-primary" : "text-muted-foreground"
                            )}>
                                {stepLabels[idx]}
                            </span>
                        </div>
                    )
                })}
            </div>

            {/* Current Status Message */}
            <div className="mt-6 p-3 bg-secondary/5 border border-secondary/10 rounded-lg text-center text-sm text-secondary font-cairo">
                {isRTL ? 'الحالة الحالية: ' : 'Current Status: '}
                <span className="font-bold">{t(`workOrders.${statusTranslationKey}`)}</span>
            </div>
        </div>
    )
}
