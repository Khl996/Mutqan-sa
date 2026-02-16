import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMaintenanceTasks, MaintenanceTask } from '@/hooks/useMaintenanceTasks'
import { X, PlayCircle, CheckCircle2, FileText, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface TaskExecutionModalProps {
    task: MaintenanceTask | null
    isOpen: boolean
    onClose: () => void
}

export default function TaskExecutionModal({ task, isOpen, onClose }: TaskExecutionModalProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const navigate = useNavigate()
    const { updateTask } = useMaintenanceTasks()
    const [isUpdating, setIsUpdating] = useState(false)

    if (!isOpen || !task) return null

    const handleStatusChange = async (newStatus: string) => {
        try {
            setIsUpdating(true)
            await updateTask.mutateAsync({ id: task.id, status: newStatus })
            onClose()
        } catch (error) {
            console.error(error)
        } finally {
            setIsUpdating(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                    <h2 className="font-bold text-lg font-cairo">
                        {isRTL ? 'تفاصيل المهمة' : 'Task Details'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className={cn(
                                "px-2 py-1 rounded text-xs font-bold capitalize",
                                task.priority === 'high' ? "bg-red-100 text-red-700" :
                                    task.priority === 'medium' ? "bg-yellow-100 text-yellow-700" :
                                        "bg-blue-100 text-blue-700"
                            )}>
                                {task.priority}
                            </span>
                            <span className={cn(
                                "px-2 py-1 rounded text-xs font-bold capitalize",
                                task.status === 'completed' ? "bg-green-100 text-green-700" :
                                    task.status === 'in_progress' ? "bg-orange-100 text-orange-700" :
                                        "bg-gray-100 text-gray-700"
                            )}>
                                {task.status.replace(/_/g, ' ')}
                            </span>
                        </div>
                        <h3 className="text-xl font-bold font-cairo mb-2">{task.title}</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                            {task.description || (isRTL ? 'لا يوجد وصف' : 'No description provided.')}
                        </p>
                    </div>

                    <div className="bg-muted/50 p-4 rounded-xl space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{isRTL ? 'تاريخ الاستحقاق:' : 'Due Date:'}</span>
                            <span className="font-mono">{task.due_date || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">{isRTL ? 'المكلف:' : 'Assigned To:'}</span>
                            <span>{isRTL ? task.assignee?.full_name_ar : task.assignee?.full_name}</span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-3 pt-2">
                        {task.related_work_order_id && (
                            <button
                                onClick={() => navigate(`/work-orders/${task.related_work_order_id}`)}
                                className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-colors"
                            >
                                <ExternalLink className="w-5 h-5" />
                                {isRTL ? 'فتح أمر العمل المرتبط' : 'Open Linked Work Order'}
                            </button>
                        )}

                        {!task.related_work_order_id && task.status !== 'completed' && (
                            <>
                                {task.status === 'pending' && (
                                    <button
                                        onClick={() => handleStatusChange('in_progress')}
                                        disabled={isUpdating}
                                        className="flex items-center justify-center gap-2 w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors"
                                    >
                                        <PlayCircle className="w-5 h-5" />
                                        {isRTL ? 'بدء التنفيذ' : 'Start Task'}
                                    </button>
                                )}

                                {task.status === 'in_progress' && (
                                    <button
                                        onClick={() => handleStatusChange('completed')}
                                        disabled={isUpdating}
                                        className="flex items-center justify-center gap-2 w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors"
                                    >
                                        <CheckCircle2 className="w-5 h-5" />
                                        {isRTL ? 'إكمال المهمة' : 'Complete Task'}
                                    </button>
                                )}
                            </>
                        )}

                        {task.status === 'completed' && (
                            <div className="text-center p-3 bg-green-50 text-green-700 rounded-xl font-bold flex items-center justify-center gap-2">
                                <CheckCircle2 className="w-5 h-5" />
                                {isRTL ? 'تم إكمال المهمة' : 'Task Completed'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
