import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMaintenanceTasks, ChecklistItem } from '@/hooks/useMaintenanceTasks'
import { X, User, FileOutput, Plus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AddMaintenanceTaskDialogProps {
    isOpen: boolean
    onClose: () => void
    planId?: string
}

type RecurrenceType = 'once' | 'daily' | 'weekly' | 'monthly' | 'custom'

interface FormData {
    title: string
    description: string
    assigned_to: string
    due_date: string
    priority: string
    shouldCreateWorkOrder: boolean
    recurrence_type: RecurrenceType
    recurrence_interval: number
    checklist: ChecklistItem[]
}

const INITIAL_FORM: FormData = {
    title: '',
    description: '',
    assigned_to: '',
    due_date: new Date().toISOString().split('T')[0],
    priority: 'medium',
    shouldCreateWorkOrder: false,
    recurrence_type: 'once',
    recurrence_interval: 1,
    checklist: []
}

export default function AddMaintenanceTaskDialog({ isOpen, onClose, planId }: AddMaintenanceTaskDialogProps) {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { createTask, technicians } = useMaintenanceTasks()

    const [formData, setFormData] = useState<FormData>(INITIAL_FORM)
    const [newItemText, setNewItemText] = useState('')
    const [newItemTextAr, setNewItemTextAr] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    if (!isOpen) return null

    const handleAddChecklistItem = () => {
        if (!newItemText && !newItemTextAr) return
        const item: ChecklistItem = {
            id: crypto.randomUUID(),
            text: newItemText || newItemTextAr,
            text_ar: newItemTextAr || newItemText,
            checked: false
        }
        setFormData(prev => ({ ...prev, checklist: [...prev.checklist, item] }))
        setNewItemText('')
        setNewItemTextAr('')
    }

    const handleRemoveChecklistItem = (id: string) => {
        setFormData(prev => ({ ...prev, checklist: prev.checklist.filter(i => i.id !== id) }))
    }

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
            setFormData(INITIAL_FORM)
            setNewItemText('')
            setNewItemTextAr('')
        } catch (error) {
            console.error(error)
            alert(isRTL ? 'حدث خطأ أثناء الحفظ' : 'Error saving task')
        } finally {
            setIsSubmitting(false)
        }
    }

    const recurrenceOptions: { value: RecurrenceType; labelAr: string; labelEn: string }[] = [
        { value: 'once',    labelAr: 'مرة واحدة', labelEn: 'Once' },
        { value: 'daily',   labelAr: 'يومياً',    labelEn: 'Daily' },
        { value: 'weekly',  labelAr: 'أسبوعياً',  labelEn: 'Weekly' },
        { value: 'monthly', labelAr: 'شهرياً',    labelEn: 'Monthly' },
        { value: 'custom',  labelAr: 'مخصص',      labelEn: 'Custom' },
    ]

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card w-full max-w-lg rounded-2xl shadow-xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-muted/30 flex-shrink-0">
                    <h2 className="font-bold text-lg font-cairo">
                        {isRTL ? 'إضافة مهمة صيانة جديدة' : 'Add New Maintenance Task'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Scrollable form body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">

                    {/* Title */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium font-cairo">
                            {isRTL ? 'عنوان المهمة' : 'Task Title'} <span className="text-red-500">*</span>
                        </label>
                        <input
                            required
                            value={formData.title}
                            onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                            placeholder={isRTL ? 'مثال: فحص التكييف الدوري' : 'e.g. Regular HVAC Check'}
                            className="w-full p-2 border rounded-lg bg-background text-sm"
                        />
                    </div>

                    {/* Assign To */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium font-cairo">
                            {isRTL ? 'تعيين إلى (فني)' : 'Assign To (Technician)'}
                        </label>
                        <div className="relative">
                            <User className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
                            <select
                                value={formData.assigned_to}
                                onChange={e => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
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

                    {/* Due Date + Priority */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium font-cairo">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
                            <input
                                type="date"
                                required
                                value={formData.due_date}
                                onChange={e => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                                className="w-full p-2 border rounded-lg bg-background text-sm"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium font-cairo">{isRTL ? 'الأولوية' : 'Priority'}</label>
                            <select
                                value={formData.priority}
                                onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                                className="w-full p-2 border rounded-lg bg-background text-sm"
                            >
                                <option value="low">{isRTL ? 'منخفضة' : 'Low'}</option>
                                <option value="medium">{isRTL ? 'متوسطة' : 'Medium'}</option>
                                <option value="high">{isRTL ? 'عالية' : 'High'}</option>
                            </select>
                        </div>
                    </div>

                    {/* Recurrence */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium font-cairo flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                            {isRTL ? 'التكرار' : 'Recurrence'}
                        </label>
                        <select
                            value={formData.recurrence_type}
                            onChange={e => setFormData(prev => ({ ...prev, recurrence_type: e.target.value as RecurrenceType }))}
                            className="w-full p-2 border rounded-lg bg-background text-sm"
                        >
                            {recurrenceOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {isRTL ? opt.labelAr : opt.labelEn}
                                </option>
                            ))}
                        </select>

                        {formData.recurrence_type === 'custom' && (
                            <div className={cn("flex items-center gap-2 mt-2", isRTL && "flex-row-reverse")}>
                                <span className="text-sm text-muted-foreground font-cairo">
                                    {isRTL ? 'كل' : 'Every'}
                                </span>
                                <input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={formData.recurrence_interval}
                                    onChange={e => setFormData(prev => ({ ...prev, recurrence_interval: Math.max(1, parseInt(e.target.value) || 1) }))}
                                    className="w-20 p-2 border rounded-lg bg-background text-sm text-center"
                                />
                                <span className="text-sm text-muted-foreground font-cairo">
                                    {isRTL ? 'يوم' : 'days'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium font-cairo">{isRTL ? 'تفاصيل المهمة' : 'Description'}</label>
                        <textarea
                            rows={2}
                            value={formData.description}
                            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            className="w-full p-2 border rounded-lg bg-background text-sm font-cairo resize-none"
                        />
                    </div>

                    {/* Checklist */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium font-cairo flex items-center justify-between">
                            <span>{isRTL ? 'قائمة الفحص' : 'Checklist'}</span>
                            {formData.checklist.length > 0 && (
                                <span className="text-xs font-normal text-muted-foreground">
                                    {formData.checklist.length} {isRTL ? 'بند' : 'items'}
                                </span>
                            )}
                        </label>

                        {/* Existing items */}
                        {formData.checklist.length > 0 && (
                            <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-lg border p-2 bg-muted/20">
                                {formData.checklist.map((item, idx) => (
                                    <div key={item.id} className="flex items-center gap-2 p-2 bg-card rounded-lg border text-sm">
                                        <span className="w-5 h-5 flex-shrink-0 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground font-mono">
                                            {idx + 1}
                                        </span>
                                        <span className="flex-1 font-cairo line-clamp-1">
                                            {isRTL ? (item.text_ar || item.text) : (item.text || item.text_ar)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveChecklistItem(item.id)}
                                            className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add new item */}
                        <div className="border border-dashed rounded-lg p-3 space-y-2 bg-muted/10">
                            <input
                                type="text"
                                dir="rtl"
                                placeholder={isRTL ? 'نص البند (عربي)' : 'Item text (Arabic / عربي)'}
                                value={newItemTextAr}
                                onChange={e => setNewItemTextAr(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddChecklistItem())}
                                className="w-full p-2 border rounded-lg bg-background text-sm font-cairo"
                            />
                            <input
                                type="text"
                                placeholder={isRTL ? 'نص البند (إنجليزي)' : 'Item text (English)'}
                                value={newItemText}
                                onChange={e => setNewItemText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddChecklistItem())}
                                className="w-full p-2 border rounded-lg bg-background text-sm"
                            />
                            <button
                                type="button"
                                onClick={handleAddChecklistItem}
                                disabled={!newItemText && !newItemTextAr}
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-muted hover:bg-muted/80 rounded-lg text-sm font-cairo transition-colors disabled:opacity-40"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                {isRTL ? 'إضافة بند' : 'Add Item'}
                            </button>
                        </div>
                    </div>

                    {/* Work Order checkbox */}
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <input
                            type="checkbox"
                            id="createWo"
                            checked={formData.shouldCreateWorkOrder}
                            onChange={e => setFormData(prev => ({ ...prev, shouldCreateWorkOrder: e.target.checked }))}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="createWo" className="text-sm font-medium font-cairo cursor-pointer flex-1">
                            {isRTL ? 'تحويل إلى أمر عمل رسمي' : 'Create official Work Order'}
                            <p className="text-xs text-muted-foreground font-normal mt-0.5">
                                {isRTL ? 'سيتم إنشاء أمر عمل وتعيينه لنفس الفني' : 'Will create a WO linked to this task'}
                            </p>
                        </label>
                        <FileOutput className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2 border-t">
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
                            {isSubmitting
                                ? (isRTL ? 'جاري الحفظ...' : 'Saving...')
                                : (isRTL ? 'حفظ المهمة' : 'Save Task')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
