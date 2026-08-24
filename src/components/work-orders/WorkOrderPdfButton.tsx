import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ProofTenantContext } from '@/hooks/useTenantSettings'
import type { OperationLog, WorkOrder } from '@/hooks/useWorkOrders'

interface WorkOrderPdfButtonProps {
    workOrder: WorkOrder
    logs: OperationLog[]
    isRTL: boolean
    proofTenant: ProofTenantContext
}

export default function WorkOrderPdfButton({ workOrder, logs, isRTL, proofTenant }: WorkOrderPdfButtonProps) {
    const [loading, setLoading] = useState(false)
    const { t } = useTranslation()

    async function handleGenerate() {
        setLoading(true)
        try {
            const { generateWorkOrderPdf } = await import('@/utils/workOrderPdf')
            const { blob, fileName } = await generateWorkOrderPdf({
                workOrder,
                logs,
                settings: proofTenant.settings,
                tenant: proofTenant,
                isRTL,
            })

            // Trigger browser download
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = fileName
            a.click()
            URL.revokeObjectURL(url)

            toast.success(t('workOrders.proof.downloaded'))
        } catch (err) {
            console.error('PDF generation failed:', err)
            toast.error(t('workOrders.proof.generationFailed'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div
            className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
            aria-busy={loading}
        >
            <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <FileDown className="h-4 w-4 text-primary" aria-hidden="true" />
                </span>
                <h3 className="font-semibold text-sm">
                    {t('workOrders.proof.title')}
                </h3>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
                {t('workOrders.proof.subtitle')}
            </p>
            <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                aria-label={t('workOrders.proof.downloadPdf')}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            >
                {loading
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <FileDown className="h-4 w-4" aria-hidden="true" />}
                {loading
                    ? t('workOrders.proof.generating')
                    : t('workOrders.proof.downloadPdf')}
            </button>
        </div>
    )
}
