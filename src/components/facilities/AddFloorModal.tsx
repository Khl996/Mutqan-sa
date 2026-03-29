import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateFloor } from '@/hooks/useFacilities'
import { toast } from 'sonner'
import { X, Layers, Building2, MapPin, Hash, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddFloorModalProps {
    isOpen: boolean
    onClose: () => void
    buildingId: string | null
    buildingName: string
    onSuccess?: () => void
}

export default function AddFloorModal({ isOpen, onClose, buildingId, buildingName, onSuccess }: AddFloorModalProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const createFloor = useCreateFloor()

    const [floorData, setFloorData] = useState({
        code: '',
        name: '',
        name_ar: '',
        level: 0,
        is_active: true
    })

    if (!isOpen || !buildingId) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        try {
            await createFloor.mutateAsync({
                ...floorData,
                building_id: buildingId,
                // Ensure name_ar is not undefined
                name_ar: floorData.name_ar || floorData.name
            })

            toast.success(isRTL ? 'تم إضافة الطابق بنجاح' : 'Floor added successfully')
            onClose()
            onSuccess?.()
            // Reset form
            setFloorData({
                code: '',
                name: '',
                name_ar: '',
                level: 0,
                is_active: true
            })
        } catch (error) {
            console.error(error)
            toast.error(isRTL ? 'حدث خطأ أثناء إضافة الطابق' : 'Error adding floor')
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
                className="bg-card w-full max-w-lg rounded-xl shadow-2xl border border-border animate-in fade-in zoom-in duration-200"
                dir={isRTL ? 'rtl' : 'ltr'}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-secondary/10 rounded-lg">
                            <Layers className="w-6 h-6 text-secondary" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-primary font-cairo">
                                {t('facilities.addFloor')}
                            </h2>
                            <p className="text-sm text-muted font-cairo flex items-center gap-1">
                                {isRTL ? 'تابع للمبنى:' : 'For building:'} <span className="font-bold text-primary">{buildingName}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-muted hover:text-destructive transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">

                    {/* Code & Level */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium font-cairo text-primary">
                                {isRTL ? 'رقم/كود الطابق' : 'Floor Code'} <span className="text-destructive">*</span>
                            </label>
                            <div className="relative">
                                <Hash className={cn(
                                    "absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted",
                                    isRTL ? "right-3" : "left-3"
                                )} />
                                <input
                                    required
                                    type="text"
                                    value={floorData.code}
                                    onChange={(e) => setFloorData({ ...floorData, code: e.target.value })}
                                    className={cn(
                                        "w-full h-11 bg-background border border-border rounded-lg focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-inter",
                                        isRTL ? "pr-10 pl-3" : "pl-10 pr-3"
                                    )}
                                    placeholder="e.g. F1, L0"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium font-cairo text-primary">
                                {isRTL ? 'المستوى (رقمي)' : 'Level Info'} <span className="text-destructive">*</span>
                            </label>
                            <div className="relative">
                                <Layers className={cn(
                                    "absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted",
                                    isRTL ? "right-3" : "left-3"
                                )} />
                                <input
                                    required
                                    type="number"
                                    value={floorData.level}
                                    onChange={(e) => setFloorData({ ...floorData, level: parseInt(e.target.value) || 0 })}
                                    className={cn(
                                        "w-full h-11 bg-background border border-border rounded-lg focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-inter",
                                        isRTL ? "pr-10 pl-3" : "pl-10 pr-3"
                                    )}
                                    placeholder="0, 1, 2..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Name EN */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium font-cairo text-primary">
                            {isRTL ? 'اسم الطابق (إنجليزي)' : 'Floor Name (EN)'} <span className="text-destructive">*</span>
                        </label>
                        <input
                            required
                            type="text"
                            value={floorData.name}
                            onChange={(e) => setFloorData({ ...floorData, name: e.target.value })}
                            className="w-full h-11 px-4 bg-background border border-border rounded-lg focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all"
                            placeholder="e.g. First Floor"
                        />
                    </div>

                    {/* Name AR */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium font-cairo text-primary">
                            {isRTL ? 'اسم الطابق (عربي)' : 'Floor Name (AR)'}
                        </label>
                        <input
                            type="text"
                            value={floorData.name_ar}
                            onChange={(e) => setFloorData({ ...floorData, name_ar: e.target.value })}
                            className="w-full h-11 px-4 bg-background border border-border rounded-lg focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-cairo text-right"
                            placeholder="مثال: الطابق الأول"
                            dir="rtl"
                        />
                    </div>

                    {/* Submit Button */}
                    <div className="pt-4 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-lg border border-border text-muted font-medium hover:bg-muted/10 transition-colors font-cairo"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={createFloor.isPending}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-secondary text-white font-bold hover:bg-secondary/90 transition-all font-cairo disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-secondary/20"
                        >
                            {createFloor.isPending ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <CheckCircle2 className="w-5 h-5" />
                            )}
                            {t('common.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
