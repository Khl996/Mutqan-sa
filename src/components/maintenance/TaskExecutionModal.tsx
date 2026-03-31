import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useMaintenanceTasks, MaintenanceTask, ChecklistItem } from '@/hooks/useMaintenanceTasks'
import { X, PlayCircle, CheckCircle2, ExternalLink, Square, CheckSquare } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface TaskExecutionModalProps {
    task: MaintenanceTask | null
    isOpen: boolean
    onClose: () => void
}

export default function TaskExecutionModal({ task, isOpen, onClose }: TaskExecutionModalProps) {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const navigate = useNavigate()
    const { updateTask, updateChecklist } = useMaintenanceTasks()

    const [isUpdating, setIsUpdating] = useState(false)
    const [localChecklist, setLocalChecklist] = useState<ChecklistItem[]>([])
    const [completionNotes, setCompletionNotes] = useState('')

    // Sync checklist from task whenever modal opens or task changes
    useEffect(() => {
        if (task && isOpen) {
            setLocalChecklist((task.checklist as ChecklistItem[] | null) || [])
            setCompletionNotes('')
        }
    }, [task, isOpen])

    // All hooks must be above this early return
    if (!isOpen || !task) return null

    const allChecked = localChecklist.length === 0 || localChecklist.every(item => item.checked)
    const checkedCount = localChecklist.filter(i => i.checked).length
    const isTerminal = task.status === 'completed' || task.status === 'cancelled'

    const handleToggleItem = async (itemId: string) => {
        if (isTerminal) return
        const updated = localChecklist.map(item =>
            item.id === itemId ? { ...item, checked: !item.checked } : item
        )
        setLocalChecklist(updated)  // optimistic update
        try {
            await updateChecklist.mutateAsync({ id: task.id, checklist: updated })
        } catch {
            setLocalChecklist(localChecklist)  // revert on error
        }
    }

    const handleStatusChange = async (newStatus: string) => {
        try {
            setIsUpdating(true)
            await updateTask.mutateAsync({
                id: task.id,
                status: newStatus,
                notes: newStatus === 'completed' ? completionNotes : undefined
            })
            onClose()
        } catch (error) {
            console.error(error)
        } finally {
            setIsUpdating(false)
        }
    }


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-muted/30 flex-shrink-0">
                    <h2 className="font-bold text-lg font-cairo">
                        {isRTL ? 'تفاصيل المهمة' : 'Task Details'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1">

                    {/* Priority + Status + Recurrence badges */}
                    <div>
                        <div className="flex items-center flex-wrap gap-2 mb-3">
                            <span className={cn(
                                "px-2 py-1 rounded text-xs font-bold capitalize",
                                task.priority === 'high'   ? "bg-red-100 text-red-700" :
                                task.priority === 'medium' ? "bg-yellow-100 text-yellow-700" :
                                                             "bg-blue-100 text-blue-700"
                            )}>
                                {task.priority}
                            </span>
                            <span className={cn(
                                "px-2 py-1 rounded text-xs font-bold capitalize",
                                task.status === 'completed'  ? "bg-green-100 text-green-700" :
                                task.status === 'in_progress'? "bg-orange-100 text-orange-700" :
                                task.status === 'cancelled'  ? "bg-red-100 text-red-700" :
                                                               "bg-gray-100 text-gray-700"
                            )}>
                                {task.status.replace(/_/g, ' ')}
                            </span>
                        </div>
                        <h3 className="text-xl font-bold font-cairo mb-1">{task.title}</h3>
                        {task.description && (
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                {task.description}
                            </p>
                        )}
                    </div>

                    {/* Info row */}
                    <div className="bg-muted/50 p-4 rounded-xl space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground font-cairo">
                                {isRTL ? 'تاريخ الاستحقاق:' : 'Due Date:'}
                            </span>
                            <span className="font-mono">{task.due_date || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground font-cairo">
                                {isRTL ? 'المكلف:' : 'Assigned To:'}
                            </span>
                            <span className="font-cairo">
                                {task.assignee
                                    ? (isRTL ? task.assignee.full_name_ar : task.assignee.full_name)
                                    : <span className="italic text-muted-foreground text-xs">{isRTL ? 'غير مكلف' : 'Unassigned'}</span>
                                }
                            </span>
                        </div>
                        {task.completion_notes && (
                            <div className="pt-2 border-t">
                                <p className="text-muted-foreground font-cairo text-xs mb-1">
                                    {isRTL ? 'ملاحظات الإنجاز:' : 'Completion Notes:'}
                                </p>
                                <p className="text-sm font-cairo">{task.completion_notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Checklist */}
                    {localChecklist.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium font-cairo">
                                    {isRTL ? 'قائمة الفحص' : 'Checklist'}
                                </p>
                                <span className={cn(
                                    "text-xs font-bold px-2 py-0.5 rounded-full",
                                    allChecked
                                        ? "bg-green-100 text-green-700"
                                        : "bg-muted text-muted-foreground"
                                )}>
                                    {checkedCount} / {localChecklist.length}
                                </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all duration-300"
                                    style={{ width: `${localChecklist.length > 0 ? (checkedCount / localChecklist.length) * 100 : 0}%` }}
                                />
                            </div>

                            <div className="space-y-1.5 max-h-52 overflow-y-auto">
                                {localChecklist.map(item => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => handleToggleItem(item.id)}
                                        disabled={isTerminal || updateChecklist.isPending}
                                        className={cn(
                                            "w-full flex items-center gap-3 p-2.5 rounded-lg border text-start transition-colors",
                                            item.checked
                                                ? "bg-green-50 border-green-200 text-green-800"
                                                : "bg-muted/30 border-border hover:bg-muted/50",
                                            (isTerminal || updateChecklist.isPending) && "cursor-not-allowed opacity-70"
                                        )}
                                    >
                                        {item.checked
                                            ? <CheckSquare className="w-4 h-4 flex-shrink-0 text-green-600" />
                                            : <Square className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                                        }
                                        <span className="text-sm font-cairo line-clamp-2">
                                            {isRTL
                                                ? (item.text_ar || item.text)
                                                : (item.text || item.text_ar)
                                            }
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {/* Checklist warning when not all checked */}
                            {!allChecked && task.status === 'in_progress' && !task.related_work_order_id && (
                                <p className="text-xs text-amber-600 font-cairo bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    {isRTL
                                        ? `تبقى ${localChecklist.length - checkedCount} بند(اً) — يجب إكمالها قبل إغلاق المهمة`
                                        : `${localChecklist.length - checkedCount} item(s) remaining — complete all before closing`
                                    }
                                </p>
                            )}
                        </div>
                    )}

                    {/* Completion notes textarea (shown when about to complete) */}
                    {task.status === 'in_progress' && !task.related_work_order_id && allChecked && (
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium font-cairo text-muted-foreground">
                                {isRTL ? 'ملاحظات الإنجاز (اختياري)' : 'Completion Notes (optional)'}
                            </label>
                            <textarea
                                rows={2}
                                value={completionNotes}
                                onChange={e => setCompletionNotes(e.target.value)}
                                placeholder={isRTL ? 'أضف ملاحظاتك هنا...' : 'Add your notes here...'}
                                className="w-full p-2 border rounded-lg bg-background text-sm font-cairo resize-none"
                            />
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col gap-3 pt-2">

                        {/* Open linked WO */}
                        {task.related_work_order_id && (
                            <button
                                onClick={() => navigate(`/work-orders/${task.related_work_order_id}`)}
                                className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-colors font-cairo"
                            >
                                <ExternalLink className="w-5 h-5" />
                                {isRTL ? 'فتح أمر العمل المرتبط' : 'Open Linked Work Order'}
                            </button>
                        )}

                        {/* Status actions (only when no linked WO and not terminal) */}
                        {!task.related_work_order_id && !isTerminal && (
                            <>
                                {task.status === 'pending' && (
                                    <button
                                        onClick={() => handleStatusChange('in_progress')}
                                        disabled={isUpdating}
                                        className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors font-cairo"
                                    >
                                        <PlayCircle className="w-5 h-5" />
                                        {isRTL ? 'بدء التنفيذ' : 'Start Task'}
                                    </button>
                                )}

                                {task.status === 'in_progress' && (
                                    <button
                                        onClick={() => handleStatusChange('completed')}
                                        disabled={isUpdating || !allChecked}
                                        title={!allChecked
                                            ? (isRTL ? 'أكمل جميع بنود قائمة الفحص أولاً' : 'Complete all checklist items first')
                                            : undefined
                                        }
                                        className={cn(
                                            "flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold transition-colors font-cairo",
                                            allChecked && !isUpdating
                                                ? "bg-green-600 text-white hover:bg-green-700"
                                                : "bg-green-200 text-green-800 cursor-not-allowed opacity-60"
                                        )}
                                    >
                                        <CheckCircle2 className="w-5 h-5" />
                                        {isRTL ? 'إكمال المهمة' : 'Complete Task'}
                                        {!allChecked && localChecklist.length > 0 && (
                                            <span className="text-xs opacity-80">
                                                ({checkedCount}/{localChecklist.length})
                                            </span>
                                        )}
                                    </button>
                                )}
                            </>
                        )}

                        {/* Completed state */}
                        {task.status === 'completed' && (
                            <div className="text-center p-3 bg-green-50 text-green-700 rounded-xl font-bold flex items-center justify-center gap-2 font-cairo">
                                <CheckCircle2 className="w-5 h-5" />
                                {isRTL ? 'تم إكمال المهمة' : 'Task Completed'}
                            </div>
                        )}

                        {/* Cancelled state */}
                        {task.status === 'cancelled' && (
                            <div className="text-center p-3 bg-red-50 text-red-600 rounded-xl font-bold flex items-center justify-center gap-2 font-cairo">
                                <X className="w-5 h-5" />
                                {isRTL ? 'تم إلغاء المهمة' : 'Task Cancelled'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
