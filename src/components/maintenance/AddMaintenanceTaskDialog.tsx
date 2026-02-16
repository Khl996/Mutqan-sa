import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMaintenanceTasks } from '@/hooks/useMaintenanceTasks'
import { X, Calendar, User, FileOutput } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddMaintenanceTaskDialogProps {
    isOpen: boolean
    onClose: () => void
    planId?: string // Optional: if provided, task is linked to this plan
}

export default function AddMaintenanceTaskDialog({ isOpen, onClose, planId }: AddMaintenanceTaskDialogProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { createTask, technicians } = useMaintenanceTasks()

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        assigned_to: '',
        due_date: new Date().toISOString().split('T')[0],
        priority: 'medium',
        shouldCreateWorkOrder: false
    })

    const [isSubmitting, setIsSubmitting] = useState(false)

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.title) return

        try {
            setIsSubmitting(true)
            await createTask.mutateAsync({
                ...formData,
                maintenance_plan_id: planId
            })
            onClose()
            // Reset form
            setFormData({
                title: '',
                description: '',
                assigned_to: '',
                due_date: new Date().toISOString().split('T')[0],
                priority: 'medium',
                shouldCreateWorkOrder: false
            })
        } catch (error) {
            console.error(error)
            alert(isRTL ? 'حدث خطأ أثناء الحفظ' : 'Error saving task')
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
                        {isRTL ? 'إضافة مهمة صيانة جديدة' : 'Add New Maintenance Task'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium font-cairo">{isRTL ? 'عنوان المهمة' : 'Task Title'}</label>
                        <input
                            required
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            placeholder={isRTL ? 'مثال: فحص التكييف الدوري' : 'e.g. Regular HVAC Check'}
                            className="w-full p-2 border rounded-lg bg-background text-sm"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium font-cairo">{isRTL ? 'تعيين إلى (فني)' : 'Assign To (Technician)'}</label>
                        <div className="relative">
                            <User className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
                            <select
                                value={formData.assigned_to}
                                onChange={e => setFormData({ ...formData, assigned_to: e.target.value })}
                                className={cn("w-full p-2 border rounded-lg bg-background text-sm appearance-none", isRTL ? "pr-9" : "pl-9")}
                            >
                                <option value="">{isRTL ? '-- اختر الفني --' : '-- Select Technician --'}</option>
                                {technicians.map((tech: any) => (
                                    <option key={tech.id} value={tech.id}>
                                        {isRTL ? (tech.full_name_ar || tech.full_name) : tech.full_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium font-cairo">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
                            <input
                                type="date"
                                required
                                value={formData.due_date}
                                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                                className="w-full p-2 border rounded-lg bg-background text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium font-cairo">{isRTL ? 'الأولوية' : 'Priority'}</label>
                            <select
                                value={formData.priority}
                                onChange={e => setFormData({ ...formData, priority: e.target.value })}
                                className="w-full p-2 border rounded-lg bg-background text-sm"
                            >
                                <option value="low">{isRTL ? 'منخفضة' : 'Low'}</option>
                                <option value="medium">{isRTL ? 'متوسطة' : 'Medium'}</option>
                                <option value="high">{isRTL ? 'عالية' : 'High'}</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium font-cairo">{isRTL ? 'تفاصيل المهمة' : 'Description'}</label>
                        <textarea
                            rows={3}
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-background text-sm font-cairo"
                        />
                    </div>

                    {/* Checkbox for Work Order */}
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <input
                            type="checkbox"
                            id="createWo"
                            checked={formData.shouldCreateWorkOrder}
                            onChange={e => setFormData({ ...formData, shouldCreateWorkOrder: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="createWo" className="text-sm font-medium font-cairo cursor-pointer flex-1">
                            {isRTL ? 'تحويل إلى أمر عمل رسمي' : 'Create official Work Order'}
                            <p className="text-xs text-muted-foreground font-normal mt-0.5">
                                {isRTL ? 'سيتم إنشاء أمر عمل وتعيينه لنفس الفني' : 'Will create a WO linked to this task'}
                            </p>
                        </label>
                        <FileOutput className="w-5 h-5 text-blue-500" />
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
                            {isSubmitting ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ المهمة' : 'Save Task')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
