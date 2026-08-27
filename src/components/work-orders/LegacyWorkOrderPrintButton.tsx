import { Printer } from 'lucide-react'
import type { WorkOrder } from '@/hooks/useWorkOrders'

interface LegacyWorkOrderPrintButtonProps {
    workOrder: WorkOrder
    isRTL: boolean
    onPrint: () => void
}

/**
 * Keeps the pre-canary report affordance without restoring the retired direct
 * Storage upload or work_orders PDF metadata writes.
 */
export default function LegacyWorkOrderPrintButton({
    workOrder,
    isRTL,
    onPrint,
}: LegacyWorkOrderPrintButtonProps) {
    return (
        <div className="space-y-3 rounded-xl border border-l-4 border-l-blue-600 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
                <Printer className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <h3 className="text-sm font-semibold">
                    {isRTL ? 'تقرير أمر العمل (PDF)' : 'Work Order Report (PDF)'}
                </h3>
            </div>
            {workOrder.pdf_generated_at && (
                <p className="text-xs text-muted-foreground">
                    {isRTL ? 'آخر توليد: ' : 'Last generated: '}
                    {new Date(workOrder.pdf_generated_at).toLocaleDateString(isRTL ? 'ar-SA' : 'en-GB')}
                </p>
            )}
            <button
                type="button"
                onClick={onPrint}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
                <Printer className="h-4 w-4" aria-hidden="true" />
                {isRTL ? 'طباعة / حفظ PDF' : 'Print / Save PDF'}
            </button>
        </div>
    )
}
