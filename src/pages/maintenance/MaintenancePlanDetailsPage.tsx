import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { usePermission } from '@/hooks/usePermission'
import {
    ArrowRight,
    Calendar,
    PieChart,
    DollarSign,
    CheckCircle2,
    Clock,
    Plus,
    Wrench,
    ArrowLeft
} from 'lucide-react'
import { cn } from '@/lib/utils'
import AddMaintenanceTaskDialog from '@/components/maintenance/AddMaintenanceTaskDialog'
import TaskExecutionModal from '@/components/maintenance/TaskExecutionModal'
import { MaintenanceTask } from '@/hooks/useMaintenanceTasks'

export default function MaintenancePlanDetailsPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { can } = usePermission()
    const canManage = can('maintenance.manage')

    const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)
    const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null)
    const [isTaskExecutionOpen, setIsTaskExecutionOpen] = useState(false)

    const { data: plan, isLoading: planLoading } = useQuery({
        queryKey: ['maintenance-plan', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('maintenance_plans')
                .select('*')
                .eq('id', id)
                .single()

            if (error) throw error
            return data
        }
    })

    const { data: tasks, isLoading: tasksLoading, refetch: refetchTasks } = useQuery({
        queryKey: ['plan-tasks', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('maintenance_tasks')
                .select(`
                    *,
                    assignee:profiles!assigned_to(full_name, full_name_ar)
                `)
                .eq('maintenance_plan_id', id)
                .order('created_at', { ascending: false })

            if (error) throw error
            return data as MaintenanceTask[]
        },
        enabled: !!id
    })

    const isLoading = planLoading || tasksLoading

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (!plan) return <div>Plan not found</div>

    const totalTasks = tasks?.length || 0
    const completedTasks = tasks?.filter(t => t.status === 'completed').length || 0
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    const handleTaskClick = (task: MaintenanceTask) => {
        setSelectedTask(task)
        setIsTaskExecutionOpen(true)
    }

    return (
        <div className="space-y-6">
            <AddMaintenanceTaskDialog
                isOpen={canManage && isAddTaskOpen}
                onClose={() => {
                    setIsAddTaskOpen(false)
                    refetchTasks()
                }}
                planId={id}
            />

            <TaskExecutionModal
                task={selectedTask}
                isOpen={isTaskExecutionOpen}
                onClose={() => {
                    setIsTaskExecutionOpen(false)
                    refetchTasks()
                }}
            />

            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/maintenance')}
                    className="p-2 hover:bg-muted rounded-full transition-colors"
                >
                    {isRTL ? <ArrowRight className="w-6 h-6" /> : <ArrowLeft className="w-6 h-6" />}
                </button>
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold font-cairo text-primary">
                            {isRTL ? (plan.name_ar || plan.name) : plan.name}
                        </h1>
                        <span className="px-2 py-0.5 bg-muted rounded text-xs font-mono text-muted-foreground">{plan.code}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card border rounded-xl p-4 shadow-sm space-y-2">
                    <p className="text-sm text-muted-foreground font-cairo flex items-center gap-2">
                        <PieChart className="w-4 h-4" />
                        {isRTL ? 'نسبة الإنجاز' : 'Completion Rate'}
                    </p>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold">{completionRate}%</span>
                        <span className="text-sm text-muted-foreground mb-1">
                            ({completedTasks} / {totalTasks})
                        </span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-green-500 transition-all duration-500"
                            style={{ width: `${completionRate}%` }}
                        />
                    </div>
                </div>

                <div className="bg-card border rounded-xl p-4 shadow-sm space-y-2">
                    <p className="text-sm text-muted-foreground font-cairo flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {isRTL ? 'الفترة الزمنية' : 'Duration'}
                    </p>
                    <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{isRTL ? 'من:' : 'From:'}</span>
                            <span className="font-mono">{plan.start_date || '-'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{isRTL ? 'إلى:' : 'To:'}</span>
                            <span className="font-mono">{plan.end_date || '-'}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-card border rounded-xl p-4 shadow-sm space-y-2">
                    <p className="text-sm text-muted-foreground font-cairo flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        {isRTL ? 'الميزانية' : 'Budget'}
                    </p>
                    <p className="text-3xl font-bold">
                        {plan.budget?.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">SAR</span>
                    </p>
                </div>
            </div>

            <div>
                <p className="text-muted-foreground font-cairo mb-4 leading-relaxed bg-muted/30 p-4 rounded-xl">
                    {plan.description || (isRTL ? 'لا يوجد وصف للخطة' : 'No description available')}
                </p>
            </div>

            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold font-cairo flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-primary" />
                        {isRTL ? 'مهام الخطة' : 'Plan Tasks'}
                    </h2>
                    {canManage && (
                        <button
                            onClick={() => setIsAddTaskOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-cairo"
                        >
                            <Plus className="w-5 h-5" />
                            {isRTL ? 'إضافة مهمة للخطة' : 'Add Task to Plan'}
                        </button>
                    )}
                </div>

                {tasks && tasks.length > 0 ? (
                    <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="p-3 text-start font-bold font-cairo">{isRTL ? 'المهمة' : 'Task'}</th>
                                    <th className="p-3 text-start font-bold font-cairo">{isRTL ? 'الحالة' : 'Status'}</th>
                                    <th className="p-3 text-start font-bold font-cairo">{isRTL ? 'الفني' : 'Technician'}</th>
                                    <th className="p-3 text-start font-bold font-cairo">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {tasks.map(task => (
                                    <tr
                                        key={task.id}
                                        className="hover:bg-muted/5 transition-colors cursor-pointer"
                                        onClick={() => handleTaskClick(task)}
                                    >
                                        <td className="p-3 font-medium">
                                            <div className="flex items-center gap-2">
                                                {task.status === 'completed'
                                                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                                                    : <Clock className="w-4 h-4 text-muted-foreground" />}
                                                {task.title}
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <span className={cn(
                                                'px-2 py-1 rounded text-xs font-bold capitalize',
                                                task.status === 'completed'
                                                    ? 'bg-green-100 text-green-700'
                                                    : task.status === 'in_progress'
                                                        ? 'bg-orange-100 text-orange-700'
                                                        : 'bg-gray-100 text-gray-700'
                                            )}>
                                                {task.status.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {isRTL ? task.assignee?.full_name_ar : task.assignee?.full_name}
                                        </td>
                                        <td className="p-3 text-muted-foreground font-mono">
                                            {task.due_date}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/10">
                        <Wrench className="w-12 h-12 mx-auto text-muted mb-3 opacity-20" />
                        <p className="font-cairo text-muted-foreground">
                            {isRTL ? 'لا توجد مهام في هذه الخطة بعد' : 'No tasks in this plan yet'}
                        </p>
                        {canManage && (
                            <button
                                onClick={() => setIsAddTaskOpen(true)}
                                className="mt-2 text-primary hover:underline font-cairo"
                            >
                                {isRTL ? 'إضافة أول مهمة' : 'Add first task'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
