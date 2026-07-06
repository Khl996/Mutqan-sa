import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useWorkOrder, useWorkOrderLogs, isPreventiveWorkOrder } from '@/hooks/useWorkOrders'
import { useIntakeDraftForWorkOrder } from '@/hooks/useIntake'
import { useRoundObservationForWorkOrder } from '@/hooks/useRounds'
import type { PMWorkOrder } from '@/hooks/usePMFoundation'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorBoundary } from '@/components/ErrorBoundary' // Assuming we have one or will create simple wrapper
import { toast } from 'sonner'

// Import Components
import WorkOrderHeader from '@/components/work-orders/WorkOrderHeader'
import WorkOrderWorkflow from '@/components/work-orders/WorkOrderWorkflow'
import WorkOrderInfo from '@/components/work-orders/WorkOrderInfo'
import WorkOrderPMContext from '@/components/work-orders/WorkOrderPMContext'
import WorkOrderOperationsLog from '@/components/work-orders/WorkOrderOperationsLog'
import WorkOrderQuickInfo from '@/components/work-orders/WorkOrderQuickInfo'
import WorkOrderAssetLocation from '@/components/work-orders/WorkOrderAssetLocation'
import WorkOrderActions from '@/components/work-orders/WorkOrderActions'
import WorkOrderPrintView from '@/components/work-orders/WorkOrderPrintView'
import WorkOrderPdfButton from '@/components/work-orders/WorkOrderPdfButton'
import ExecutionDialog from '@/components/maintenance/ExecutionDialog'
import { en as pmEn, ar as pmAr } from '@/components/maintenance/foundationPmUtils'
import { AlertTriangle, ClipboardCheck, Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'

// Simple Skeleton Loader
const WorkOrderDetailsSkeleton = () => (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-8 animate-pulse">
        <div className="h-24 bg-muted/20 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <div className="h-40 bg-muted/20 rounded-xl" />
                <div className="h-64 bg-muted/20 rounded-xl" />
                <div className="h-96 bg-muted/20 rounded-xl" />
            </div>
            <div className="space-y-6">
                <div className="h-40 bg-muted/20 rounded-xl" />
                <div className="h-40 bg-muted/20 rounded-xl" />
            </div>
        </div>
    </div>
)

export default function WorkOrderDetailsPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const locale = isRTL ? 'ar-SA' : 'en-US'
    const pmCopy = isRTL ? pmAr : pmEn
    const queryClient = useQueryClient()

    // PM execution dialog state
    const [pmExecutionWorkOrder, setPmExecutionWorkOrder] = useState<PMWorkOrder | null>(null)

    // 1. Fetch Work Order Data
    const { data: workOrder, isLoading: wLoading, error: wError, refetch: refetchWO } = useWorkOrder(id!)

    // 2. Fetch Logs
    const { data: logs, isLoading: lLoading, refetch: refetchLogs } = useWorkOrderLogs(id!)

    // Intake provenance: set when this work order was approved/merged from an
    // intake draft (وارد واتساب). work_orders carries no intake column — the
    // link lives on intake_drafts.created_work_order_id.
    const { data: intakeDraft } = useIntakeDraftForWorkOrder(id)

    // Rounds provenance: set when a supervisor round observation was converted
    // into this work order. The link lives on round_observations.
    const { data: roundObservation } = useRoundObservationForWorkOrder(id)

    // 3. Real-time Subscription
    useEffect(() => {
        if (!id) return

        const channel = supabase
            .channel(`work-order-${id}`)
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to all events (INSERT, UPDATE)
                    schema: 'public',
                    table: 'work_orders',
                    filter: `id=eq.${id}`
                },
                (payload) => {
                    void payload
                    toast.info(isRTL ? 'تم تحديث حالة أمر العمل' : 'Work Order updated')
                    refetchWO()
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'operation_logs',
                    filter: `work_order_id=eq.${id}`
                },
                () => {
                    refetchLogs()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [id, refetchWO, refetchLogs, isRTL])

    // Print logic
    const componentRef = useRef<HTMLDivElement>(null)
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: `WorkOrder-${workOrder?.code || 'Draft'}`,
    })

    // Loading State
    if (wLoading || lLoading) return <WorkOrderDetailsSkeleton />

    // Error State
    if (wError || !workOrder) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
                <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold font-cairo mb-2">{isRTL ? 'لم يتم العثور على البلاغ' : 'Work Order Not Found'}</h2>
                <p className="text-muted mb-6 font-cairo">
                    {isRTL ? 'قد يكون تم حذف البلاغ أو ليس لديك صلاحية للوصول إليه.' : 'The work order may have been deleted or you do not have permission.'}
                </p>
                <button
                    onClick={() => navigate('/work-orders')}
                    className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold font-cairo hover:bg-primary/90"
                >
                    {isRTL ? 'العودة للقائمة' : 'Back to List'}
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto pb-20 space-y-6">
            <WorkOrderHeader workOrder={workOrder} isRTL={isRTL} onPrint={handlePrint} />

            {/* Intake source banner (وارد واتساب) */}
            {intakeDraft && (
                <div className="flex items-center justify-between gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl font-cairo flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-emerald-800">
                        <Inbox className="w-4 h-4 shrink-0" />
                        <span>
                            {isRTL ? 'المصدر: وارد واتساب' : 'Source: WhatsApp intake'}
                            {intakeDraft.message?.sender_name && (
                                <> — {isRTL ? 'المرسل' : 'Sender'}: {intakeDraft.message.sender_name}</>
                            )}
                            {intakeDraft.message?.group_name && (
                                <> ({intakeDraft.message.group_name})</>
                            )}
                        </span>
                    </div>
                    <Link to="/intake" className="text-sm text-emerald-700 font-bold hover:underline shrink-0">
                        {isRTL ? 'عرض الرسالة الأصلية' : 'View original message'}
                    </Link>
                </div>
            )}

            {roundObservation && (
                <div className="flex items-center justify-between gap-3 p-3 bg-cyan-50 border border-cyan-200 rounded-xl font-cairo flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-cyan-800">
                        <ClipboardCheck className="w-4 h-4 shrink-0" />
                        <span>
                            {isRTL ? 'المصدر: جولة مشرف' : 'Source: Supervisor round'}
                            {roundObservation.round?.supervisor && (
                                <> - {isRTL ? 'المشرف' : 'Supervisor'}: {roundObservation.round.supervisor.full_name_ar || roundObservation.round.supervisor.full_name}</>
                            )}
                            {roundObservation.location && (
                                <> ({roundObservation.location.name_ar || roundObservation.location.name})</>
                            )}
                        </span>
                    </div>
                    <Link to="/rounds" className="text-sm text-cyan-700 font-bold hover:underline shrink-0">
                        {isRTL ? 'عرض الجولة' : 'View round'}
                    </Link>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content Column (Left in LTR, Right in RTL) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Workflow Stepper */}
                    <WorkOrderWorkflow workOrder={workOrder} isRTL={isRTL} />

                    {/* Basic Info */}
                    <WorkOrderInfo workOrder={workOrder} isRTL={isRTL} />

                    {/* PM Context — only for preventive work orders */}
                    {isPreventiveWorkOrder(workOrder) && id && (
                        <WorkOrderPMContext
                            workOrderId={id}
                            isRTL={isRTL}
                            onOpenExecution={(pmWo) => setPmExecutionWorkOrder(pmWo)}
                        />
                    )}

                    {/* Operations Log */}
                    <WorkOrderOperationsLog logs={logs as any || []} isRTL={isRTL} />
                </div>

                {/* Sidebar Column */}
                <div className="space-y-6">
                    {/* Quick Info (People) */}
                    <WorkOrderQuickInfo workOrder={workOrder} isRTL={isRTL} />

                    {/* Location & Asset */}
                    <WorkOrderAssetLocation workOrder={workOrder} isRTL={isRTL} />

                    {/* Actions (Sticky or just stacked) */}
                    <WorkOrderActions
                        workOrder={workOrder}
                        isRTL={isRTL}
                        onActionCompleted={() => {
                            refetchWO()
                            refetchLogs()
                            toast.success(isRTL ? 'تم تنفيذ الإجراء بنجاح' : 'Action completed successfully')
                        }}
                    />

                    {/* PDF Report — only for completed orders */}
                    {workOrder.status === 'completed' && (
                        <WorkOrderPdfButton workOrder={workOrder} isRTL={isRTL} />
                    )}
                </div>
            </div>

            {/* Hidden Print Component */}
            <div style={{ display: 'none' }}>
                <WorkOrderPrintView
                    ref={componentRef}
                    workOrder={workOrder}
                    logs={logs || []}
                />
            </div>

            {/* PM Execution Dialog — opened via WorkOrderPMContext "Open PM Execution" button */}
            <ExecutionDialog
                open={!!pmExecutionWorkOrder}
                onOpenChange={(open) => { if (!open) setPmExecutionWorkOrder(null) }}
                workOrder={pmExecutionWorkOrder}
                copy={pmCopy}
                isAr={isRTL}
                locale={locale}
            />
        </div>
    )
}
