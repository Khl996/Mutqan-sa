import { useTranslation } from 'react-i18next'
import { cn, formatRelativeTime, getWorkOrderDateLocale } from '@/lib/utils'
import { CheckCircle2, Circle, Clock, User } from 'lucide-react'

// Define interface locally or import shared type
export interface OperationLog {
    id: string
    type: string
    description: string
    reason?: string | null
    timestamp: string
    technician_name?: string | null
    performed_by?: string | null
    // Add other fields as needed
}

interface WorkOrderOperationsLogProps {
    logs: OperationLog[]
    isRTL: boolean
}

export default function WorkOrderOperationsLog({ logs, isRTL }: WorkOrderOperationsLogProps) {
    const { t } = useTranslation()
    const dateLocale = getWorkOrderDateLocale(isRTL)

    if (!logs || logs.length === 0) {
        return (
            <div className="bg-card border rounded-xl p-6 shadow-sm text-center py-12">
                <div className="w-12 h-12 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-muted-foreground font-cairo text-sm font-medium">
                    {isRTL ? 'لا توجد سجلات نشاط' : 'No activity logs yet'}
                </h3>
            </div>
        )
    }

    return (
        <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
            <h3 className="font-bold text-lg font-cairo flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                {isRTL ? 'سجل النشاطات' : 'Activity Log'}
            </h3>

            <div className="relative space-y-8 pl-6 rtl:pl-0 rtl:pr-6 before:absolute before:left-2 rtl:before:left-auto rtl:before:right-2 before:top-2 before:h-[calc(100%-20px)] before:w-0.5 before:bg-muted/30">
                {logs.map((log, index) => {
                    const isLatest = index === 0
                    return (
                        <div key={log.id} className="relative">
                            {/* Dot */}
                            <div className={cn(
                                "absolute -left-6 rtl:-right-6 rtl:left-auto p-1 rounded-full border-4 border-background z-10",
                                isLatest ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            )}>
                                {isLatest ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                            </div>

                            {/* Content */}
                            <div className={cn(
                                "space-y-1 p-3 rounded-lg transition-colors",
                                isLatest ? "bg-primary/5 border border-primary/10" : "hover:bg-muted/30"
                            )}>
                                <div className="flex justify-between items-start gap-4">
                                    <span className="font-bold text-sm text-primary font-cairo">
                                        {t(`workOrders.proof.operationTypes.${log.type}`, {
                                            defaultValue: t('workOrders.proof.operationTypes.other'),
                                        })}
                                    </span>
                                    <span className="text-xs text-muted font-mono whitespace-nowrap">
                                        {formatRelativeTime(log.timestamp, dateLocale)}
                                    </span>
                                </div>

                                <p className="text-sm text-foreground/80 font-cairo leading-relaxed">
                                    {log.description}
                                </p>

                                {log.reason && (
                                    <p className="text-xs text-muted-foreground bg-muted/20 p-2 rounded italic">
                                        "{log.reason}"
                                    </p>
                                )}

                                <div className="flex items-center gap-2 pt-2 mt-1 border-t border-dashed border-muted/50 text-xs text-muted">
                                    <User className="w-3 h-3" />
                                    <span>
                                        {log.technician_name || (isRTL ? 'مستخدم النظام' : 'System User')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
