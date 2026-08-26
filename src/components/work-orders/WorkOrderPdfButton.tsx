import { useTranslation } from 'react-i18next'
import { Printer } from 'lucide-react'

interface WorkOrderPdfButtonProps {
    onPrint: () => void
}

export default function WorkOrderPdfButton({ onPrint }: WorkOrderPdfButtonProps) {
    const { t } = useTranslation()

    return (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Printer className="h-4 w-4 text-primary" aria-hidden="true" />
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
                onClick={onPrint}
                aria-label={t('workOrders.proof.print')}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
                <Printer className="h-4 w-4" aria-hidden="true" />
                {t('workOrders.proof.print')}
            </button>
        </div>
    )
}
