import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChangeAssetStatus } from '@/hooks/useAssetOperations'
import Modal from '@/components/ui/Modal'
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Wrench, Power, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AssetActionModalProps {
    isOpen: boolean
    onClose: () => void
    assetId: string
    assetName: string
    currentStatus: string
    actionType: 'start' | 'stop' | 'maintenance' | 'retire'
}

export default function AssetActionModal({
    isOpen,
    onClose,
    assetId,
    assetName,
    currentStatus,
    actionType
}: AssetActionModalProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const changeStatus = useChangeAssetStatus()
    const [notes, setNotes] = useState('')

    // Configure UI based on action
    const actionConfig = {
        start: {
            title: isRTL ? 'تشغيل الأصل' : 'Start Asset',
            newStatus: 'operational' as const,
            icon: Power,
            color: 'text-success',
            bgColor: 'bg-success/10',
            btnColor: 'bg-success hover:bg-success/90',
            description: isRTL ? 'هل أنت متأكد من إعادة تشغيل هذا الأصل؟' : 'Are you sure you want to set this asset to operational?'
        },
        stop: {
            title: isRTL ? 'إيقاف / إخراج عن الخدمة' : 'Stop / Out of Service',
            newStatus: 'out_of_service' as const,
            icon: Power,
            color: 'text-destructive',
            bgColor: 'bg-destructive/10',
            btnColor: 'bg-destructive hover:bg-destructive/90',
            description: isRTL ? 'هل أنت متأكد من إيقاف هذا الأصل؟' : 'Are you sure you want to take this asset out of service?'
        },
        maintenance: {
            title: isRTL ? 'بدء صيانة' : 'Start Maintenance',
            newStatus: 'under_maintenance' as const,
            icon: Wrench,
            color: 'text-warning',
            bgColor: 'bg-warning/10',
            btnColor: 'bg-warning text-black hover:bg-warning/90',
            description: isRTL ? 'تحويل حالة الأصل إلى "تحت الصيانة".' : 'Set asset status to "Under Maintenance".'
        },
        retire: {
            title: isRTL ? 'إتلاف / تقاعد' : 'Retire Asset',
            newStatus: 'retired' as const,
            icon: Ban,
            color: 'text-muted-foreground',
            bgColor: 'bg-muted',
            btnColor: 'bg-muted-foreground text-white hover:bg-muted-foreground/90',
            description: isRTL ? 'هذا الإجراء سيقوم بأرشفة الأصل كـ "متقاعد".' : 'This will archive the asset as "Retired".'
        }
    }

    const config = actionConfig[actionType]

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await changeStatus.mutateAsync({
                assetId,
                newStatus: config.newStatus,
                currentStatus,
                notes: notes
            })
            toast.success(isRTL ? 'تم تنفيذ الإجراء بنجاح' : 'Action performed successfully')
            onClose()
            setNotes('')
        } catch (error) {
            toast.error(isRTL ? 'حدث خطأ' : 'An error occurred')
            console.error(error)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={config.title}>
            <form onSubmit={handleSubmit} className="space-y-4">

                <div className={cn("flex items-start gap-4 p-4 rounded-lg", config.bgColor)}>
                    <div className={cn("p-2 rounded-full bg-white/50", config.color)}>
                        <config.icon className="w-6 h-6" />
                    </div>
                    <div>
                        <h4 className={cn("font-bold font-cairo", config.color)}>
                            {assetName}
                        </h4>
                        <p className="text-sm opacity-90 font-cairo mt-1">
                            {config.description}
                        </p>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-primary mb-1.5 font-cairo">
                        {isRTL ? 'ملاحظات / سبب الإجراء' : 'Notes / Reason'}
                    </label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={isRTL ? 'اكتب تفاصيل إضافية هنا...' : 'Enter additional details here...'}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-lg focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-colors font-cairo resize-none"
                        rows={3}
                        required={actionType === 'retire' || actionType === 'stop'} // Mandatory for critical actions? Let's keep it flexible or strict per user request. User said "Reason if found", implying optional but good to have.
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg font-cairo transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={changeStatus.isPending}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2 rounded-lg font-bold font-cairo transition-colors text-white",
                            config.btnColor,
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                    >
                        {changeStatus.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            isRTL ? 'تأكيد' : 'Confirm'
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
