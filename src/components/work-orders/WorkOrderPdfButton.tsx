import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useTenantSettings } from '@/hooks/useTenantSettings'
import { mergeWithDefaults } from '@/config/tenantSettings'
import { generateWorkOrderPdf } from '@/utils/workOrderPdf'
import type { WorkOrder } from '@/hooks/useWorkOrders'

interface WorkOrderPdfButtonProps {
    workOrder: WorkOrder
    isRTL: boolean
}

export default function WorkOrderPdfButton({ workOrder, isRTL }: WorkOrderPdfButtonProps) {
    const [loading, setLoading] = useState(false)
    const { data: rawSettings } = useTenantSettings()
    const settings = mergeWithDefaults(rawSettings ?? null)

    async function handleGenerate() {
        setLoading(true)
        try {
            const { blob, fileName } = await generateWorkOrderPdf({ workOrder, settings, isRTL })

            // Upload to work-order-pdfs/{tenant_id}/{work_order_id}.pdf
            const storagePath = `${workOrder.tenant_id}/${workOrder.id}.pdf`
            const { error: uploadError } = await supabase.storage
                .from('work-order-pdfs')
                .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true })

            if (uploadError) {
                console.error('PDF upload failed:', uploadError)
                // Still allow download even if upload fails
            } else {
                // Track generation metadata
                await (supabase.from('work_orders') as ReturnType<typeof supabase.from>).update({
                    pdf_generated_at: new Date().toISOString(),
                    pdf_version: (workOrder.pdf_version ?? 0) + 1,
                    pdf_file_url: storagePath,
                }).eq('id', workOrder.id)
            }

            // Trigger browser download
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = fileName
            a.click()
            URL.revokeObjectURL(url)

            toast.success(isRTL ? 'تم تحميل التقرير بنجاح' : 'Report downloaded successfully')
        } catch (err) {
            console.error('PDF generation failed:', err)
            toast.error(isRTL ? 'تعذّر توليد التقرير' : 'Failed to generate report')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-card border rounded-xl p-5 shadow-sm space-y-3 border-l-4 border-l-blue-600">
            <div className="flex items-center gap-2">
                <FileDown className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-sm">
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
                onClick={handleGenerate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
                {loading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <FileDown className="w-4 h-4" />}
                {loading
                    ? (isRTL ? 'جارٍ التوليد...' : 'Generating...')
                    : (isRTL ? 'تحميل PDF' : 'Download PDF')}
            </button>
        </div>
    )
}
