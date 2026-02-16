import { useTranslation } from 'react-i18next'
import { WorkOrder } from '@/hooks/useWorkOrders'
import { FileText, Calendar, Wallet, User } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'

interface WorkOrderInfoProps {
    workOrder: WorkOrder
    isRTL: boolean
}

export default function WorkOrderInfo({ workOrder, isRTL }: WorkOrderInfoProps) {
    const { t } = useTranslation()

    return (
        <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
            {/* Description Section */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold font-cairo border-b pb-2">
                    <FileText className="w-5 h-5" />
                    <h3>{isRTL ? 'تفاصيل البلاغ' : 'Description'}</h3>
                </div>
                <div className="bg-muted/10 rounded-lg p-4">
                    <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed font-cairo">
                        {workOrder.description || (isRTL ? 'لا يوجد وصف' : 'No description provided')}
                    </p>
                </div>
            </div>

            {/* Additional Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Dates */}
                <div className="space-y-3">
                    <h4 className="font-bold text-sm text-muted font-cairo mb-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {isRTL ? 'التواريخ' : 'Key Dates'}
                    </h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between p-2 rounded bg-muted/5">
                            <span className="text-muted-foreground font-cairo">{isRTL ? 'تاريخ البلاغ' : 'Reported At'}</span>
                            <span className="font-medium">{formatRelativeTime(workOrder.reported_at)}</span>
                        </div>
                        {workOrder.due_date && (
                            <div className="flex justify-between p-2 rounded bg-muted/5">
                                <span className="text-muted-foreground font-cairo">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</span>
                                <span className="font-medium text-red-500">{new Date(workOrder.due_date).toLocaleDateString()}</span>
                            </div>
                        )}
                        {workOrder.completed_at && (
                            <div className="flex justify-between p-2 rounded bg-muted/5">
                                <span className="text-muted-foreground font-cairo">{isRTL ? 'تاريخ الإنجاز' : 'Completed At'}</span>
                                <span className="font-medium text-green-600">{new Date(workOrder.completed_at).toLocaleDateString()}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Costs if available (for managers) */}
                {(workOrder.estimated_cost || workOrder.actual_cost) && (
                    <div className="space-y-3">
                        <h4 className="font-bold text-sm text-muted font-cairo mb-2 flex items-center gap-2">
                            <Wallet className="w-4 h-4" />
                            {isRTL ? 'التكاليف' : 'Financials'}
                        </h4>
                        <div className="space-y-2 text-sm">
                            {workOrder.estimated_cost && (
                                <div className="flex justify-between p-2 rounded bg-muted/5">
                                    <span className="text-muted-foreground font-cairo">{isRTL ? 'التكلفة التقديرية' : 'Estimated Cost'}</span>
                                    <span className="font-medium">{workOrder.estimated_cost} SAR</span>
                                </div>
                            )}
                            {workOrder.actual_cost && (
                                <div className="flex justify-between p-2 rounded bg-muted/5">
                                    <span className="text-muted-foreground font-cairo">{isRTL ? 'التكلفة الفعلية' : 'Actual Cost'}</span>
                                    <span className="font-bold text-primary">{workOrder.actual_cost} SAR</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Reporter Info (If Public Report) */}
                {(workOrder.reporter_name) && (
                    <div className="space-y-3">
                        <h4 className="font-bold text-sm text-muted font-cairo mb-2 flex items-center gap-2">
                            <User className="w-4 h-4" />
                            {isRTL ? 'بيانات المبلغ (خارجي)' : 'Reporter (Guest)'}
                        </h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between p-2 rounded bg-muted/5">
                                <span className="text-muted-foreground font-cairo">{isRTL ? 'الاسم' : 'Name'}</span>
                                <span className="font-medium">{workOrder.reporter_name}</span>
                            </div>
                            {workOrder.reporter_phone && (
                                <div className="flex justify-between p-2 rounded bg-muted/5">
                                    <span className="text-muted-foreground font-cairo">{isRTL ? 'الجوال' : 'Phone'}</span>
                                    <a href={`tel:${workOrder.reporter_phone}`} className="font-medium text-primary hover:underline" dir="ltr">
                                        {workOrder.reporter_phone}
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
