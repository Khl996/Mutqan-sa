import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMaintenancePlans, MaintenancePlan } from '@/hooks/useMaintenancePlans'
import { X, Calendar, DollarSign, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddMaintenancePlanDialogProps {
    isOpen: boolean
    onClose: () => void
}

export default function AddMaintenancePlanDialog({ isOpen, onClose }: AddMaintenancePlanDialogProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { createPlan } = useMaintenancePlans()

    const [formData, setFormData] = useState({
        name: '',
        name_ar: '',
        code: `MP-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
        year: new Date().getFullYear(),
        budget: 0,
        status: 'draft' as const,
        description: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]
    })

    const [isSubmitting, setIsSubmitting] = useState(false)

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.name) return

        try {
            setIsSubmitting(true)
            await createPlan.mutateAsync(formData)
            onClose()
            setFormData({
                name: '',
                name_ar: '',
                code: `MP-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
                year: new Date().getFullYear(),
                budget: 0,
                status: 'draft',
                description: '',
                start_date: new Date().toISOString().split('T')[0],
                end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]
            })
        } catch (error) {
            console.error(error)
            alert(isRTL ? 'حدث خطأ أثناء الحفظ' : 'Error saving plan')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card w-full max-w-lg rounded-2xl shadow-xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                    <h2 className="font-bold text-lg font-cairo">
                        {isRTL ? 'إضافة خطة صيانة جديدة' : 'Add New Maintenance Plan'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium font-cairo">{isRTL ? 'رمز الخطة' : 'Plan Code'}</label>
                            <input
                                required
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value })}
                                className="w-full p-2 border rounded-lg bg-background font-mono text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium font-cairo">{isRTL ? 'السنة' : 'Year'}</label>
                            <input
                                type="number"
                                required
                                value={formData.year}
                                onChange={e => setFormData({ ...formData, year: parseInt(e.target.value) })}
                                className="w-full p-2 border rounded-lg bg-background text-sm"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium font-cairo">{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                            <input
                                required
                                value={formData.name_ar}
                                onChange={e => setFormData({ ...formData, name_ar: e.target.value })}
                                placeholder="مثال: خطة الصيانة السنوية 2026"
                                className="w-full p-2 border rounded-lg bg-background font-cairo text-sm text-right"
                                dir="rtl"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium font-cairo">{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
                            <input
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. Annual Maintenance Plan 2026"
                                className="w-full p-2 border rounded-lg bg-background text-sm text-left"
                                dir="ltr"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium font-cairo">{isRTL ? 'الميزانية التقديرية (SAR)' : 'Estimated Budget (SAR)'}</label>
                        <div className="relative">
                            <DollarSign className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
                            <input
                                type="number"
                                min="0"
                                value={formData.budget}
                                onChange={e => setFormData({ ...formData, budget: parseFloat(e.target.value) })}
                                className={cn("w-full p-2 border rounded-lg bg-background text-sm", isRTL ? "pr-9" : "pl-9")}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium font-cairo">{isRTL ? 'تاريخ البداية' : 'Start Date'}</label>
                            <input
                                type="date"
                                value={formData.start_date}
                                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                className="w-full p-2 border rounded-lg bg-background text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium font-cairo">{isRTL ? 'تاريخ النهاية' : 'End Date'}</label>
                            <input
                                type="date"
                                value={formData.end_date}
                                onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                className="w-full p-2 border rounded-lg bg-background text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium font-cairo">{isRTL ? 'ملاحظات' : 'Notes'}</label>
                        <textarea
                            rows={3}
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-background text-sm font-cairo"
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg font-bold font-cairo transition-colors"
                        >
                            {isRTL ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-bold font-cairo transition-colors shadow-lg shadow-primary/20"
                        >
                            {isSubmitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ الخطة' : 'Save Plan')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
