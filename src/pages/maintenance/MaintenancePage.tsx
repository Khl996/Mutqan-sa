import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMaintenancePlans } from '@/hooks/useMaintenancePlans'
import { useMaintenanceTasks, MaintenanceTask } from '@/hooks/useMaintenanceTasks'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { usePermission } from '@/hooks/usePermission'
import {
    Wrench,
    FileText,
    Plus,
    Search,
    LayoutGrid,
    List,
    GitCommit,
    CheckCircle2,
    Clock,
    User,
    ExternalLink,
    AlertTriangle,
    AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'

import AddMaintenancePlanDialog from '@/components/maintenance/AddMaintenancePlanDialog'
import AddMaintenanceTaskDialog from '@/components/maintenance/AddMaintenanceTaskDialog'
import TaskExecutionModal from '@/components/maintenance/TaskExecutionModal'

export default function MaintenancePage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const navigate = useNavigate()

    // Check maintenance features
    const { can } = usePermission()
    const canManage = can('maintenance.manage')
    const isPlansEnabled = useFeatureEnabled('maintenance', 'maintenance_plans')
    const isTasksEnabled = useFeatureEnabled('maintenance', 'schedules')

    // Data Fetching
    const { tasks: tasksData, isLoading: tasksLoading, isError: isTasksError, error: tasksError } = useMaintenanceTasks()
    const { plans, isLoading: plansLoading, isError: isPlansError, error: plansError } = useMaintenancePlans()

    const tasks = tasksData || []
    const isLoading = tasksLoading || plansLoading
    const isError = isTasksError || isPlansError

    // State
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [priorityFilter, setPriorityFilter] = useState('all')
    const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
    const [activeTab, setActiveTab] = useState<'tasks' | 'plans'>('tasks')

    // Modals State
    const [isAddPlanOpen, setIsAddPlanOpen] = useState(false)
    const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)

    // Ensure active tab corresponds to enabled feature
    useEffect(() => {
        if (activeTab === 'tasks' && !isTasksEnabled && isPlansEnabled) {
            setActiveTab('plans')
        } else if (activeTab === 'plans' && !isPlansEnabled && isTasksEnabled) {
            setActiveTab('tasks')
        }
    }, [isTasksEnabled, isPlansEnabled, activeTab])

    // Task Execution State
    const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null)
    const [isTaskExecutionOpen, setIsTaskExecutionOpen] = useState(false)

    // Filtering Logic
    const filteredTasks = tasks.filter(task => {
        const matchesSearch =
            task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase()))

        const matchesStatus = statusFilter === 'all' || task.status === statusFilter
        const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter

        return matchesSearch && matchesStatus && matchesPriority
    })

    const filteredPlans = plans.filter(plan =>
        plan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        plan.code.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Stats Calculation
    const stats = {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        pending: tasks.filter(t => t.status === 'pending').length,
        highPriority: tasks.filter(t => t.priority === 'high').length
    }

    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

    const handleTaskClick = (task: MaintenanceTask) => {
        setSelectedTask(task)
        setIsTaskExecutionOpen(true)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] space-y-4 text-center">
                <div className="p-4 bg-red-100 rounded-full">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-red-600 font-cairo">
                    {isRTL ? 'حدث خطأ أثناء تحميل البيانات' : 'Error loading data'}
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                    {(tasksError as any)?.message || (plansError as any)?.message || 'Unknown error'}
                </p>
                <div className="p-4 bg-gray-50 border rounded-lg text-sm text-left font-mono max-w-lg mx-auto" dir="ltr">
                    <p className="font-bold text-red-500">Action Required:</p>
                    <p>It seems the database tables are missing. Please run the migration files <b>042_maintenance_plans.sql</b> and <b>043_maintenance_tasks.sql</b> in your Supabase SQL Editor.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <AddMaintenanceTaskDialog
                isOpen={canManage && isAddTaskOpen}
                onClose={() => setIsAddTaskOpen(false)}
            />

            <AddMaintenancePlanDialog
                isOpen={canManage && isAddPlanOpen}
                onClose={() => setIsAddPlanOpen(false)}
            />

            <TaskExecutionModal
                task={selectedTask}
                isOpen={isTaskExecutionOpen}
                onClose={() => setIsTaskExecutionOpen(false)}
            />

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold font-cairo text-primary">{t('maintenance.title')}</h1>
                    <p className="text-muted-foreground mt-1 font-cairo">
                        {isRTL ? 'إدارة خطط ومهام الصيانة الوقائية يدويًا' : 'Manage preventive maintenance plans and tasks manually'}
                    </p>
                </div>
            </div>

            {/* Stats Cards */}
            {(isPlansEnabled || isTasksEnabled) && (
                <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="font-cairo text-sm">
                        {isRTL
                            ? 'إطلاق مبكر يدوي فقط: الخطط والمهام تُدار يدويًا، مع إمكانية إنشاء أمر عمل اختياري من المهمة. التكرار، الأتمتة، التأجيل، والعدادات المرتبطة بالأصول غير مفعلة هنا حاليًا.'
                            : 'Soft launch scope: plans and tasks are managed manually, with optional work order creation from a task. Recurrence, automation, postponement, and asset-based PM counters are not active here yet.'}
                    </p>
                </div>
            )}

            {/* Feature Warning - if both disabled */}
            {!isPlansEnabled && !isTasksEnabled && (
                <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/20 rounded-xl text-warning mb-4">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="font-cairo text-sm">
                        {isRTL
                            ? 'تم تعطيل جميع ميزات الصيانة الوقائية. يرجى مراجعة مدير النظام لتفعيلها.'
                            : 'All preventive maintenance features are disabled. Please contact admin to enable them.'}
                    </p>
                </div>
            )}

            {/* Stats Cards - only if tasks enabled */}
            {isTasksEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        title={isRTL ? 'إجمالي المهام' : 'Total Tasks'}
                        value={stats.total}
                        icon={Wrench}
                        color="text-blue-500"
                        bg="bg-blue-500/10"
                    />
                    <StatCard
                        title={isRTL ? 'مكتملة' : 'Completed'}
                        value={stats.completed}
                        icon={CheckCircle2}
                        color="text-green-500"
                        bg="bg-green-500/10"
                    />
                    <StatCard
                        title={isRTL ? 'قيد التنفيذ' : 'In Progress'}
                        value={stats.inProgress}
                        icon={Clock}
                        color="text-orange-500"
                        bg="bg-orange-500/10"
                    />
                    <StatCard
                        title={isRTL ? 'معدل الإنجاز' : 'Completion Rate'}
                        value={`${completionRate}%`}
                        icon={GitCommit}
                        color="text-purple-500"
                        bg="bg-purple-500/10"
                    />
                </div>
            )}

            {/* Tabs - Only show if at least one feature is enabled */}
            {(isPlansEnabled || isTasksEnabled) && (
                <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                    <div className="border-b px-4 flex gap-6">
                        {/* Tasks Tab */}
                        {isTasksEnabled && (
                            <button
                                onClick={() => setActiveTab('tasks')}
                                className={cn(
                                    "py-4 border-b-2 font-bold font-cairo transition-colors flex items-center gap-2",
                                    activeTab === 'tasks'
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <Wrench className="w-4 h-4" />
                                {isRTL ? 'مهام الصيانة' : 'Tasks'}
                            </button>
                        )}

                        {/* Plans Tab */}
                        {isPlansEnabled && (
                            <button
                                onClick={() => setActiveTab('plans')}
                                className={cn(
                                    "py-4 border-b-2 font-bold font-cairo transition-colors flex items-center gap-2",
                                    activeTab === 'plans'
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <FileText className="w-4 h-4" />
                                {isRTL ? 'خطط الصيانة' : 'Maintenance Plans'}
                            </button>
                        )}
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Controls Row */}
                        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                            <div className="relative w-full sm:w-72">
                                <Search className={cn("absolute top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
                                <input
                                    placeholder={isRTL ? 'بحث...' : 'Search...'}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className={cn(
                                        "w-full h-10 border rounded-lg bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none",
                                        isRTL ? "pr-9 pl-3" : "pl-9 pr-3"
                                    )}
                                />
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                {activeTab === 'tasks' && (
                                    <>
                                        <div className="flex border rounded-lg overflow-hidden shrink-0">
                                            <button
                                                onClick={() => setViewMode('table')}
                                                className={cn("p-2 hover:bg-muted", viewMode === 'table' && "bg-muted")}
                                            >
                                                <List className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setViewMode('kanban')}
                                                className={cn("p-2 hover:bg-muted", viewMode === 'kanban' && "bg-muted")}
                                            >
                                                <LayoutGrid className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <select
                                            value={statusFilter}
                                            onChange={(e) => setStatusFilter(e.target.value)}
                                            className="h-10 px-3 border rounded-lg bg-background text-sm outline-none font-cairo"
                                        >
                                            <option value="all">{isRTL ? 'جميع الحالات' : 'All Status'}</option>
                                            <option value="pending">Pending</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="completed">Completed</option>
                                        </select>
                                    </>
                                )}
                                {canManage && (
                                    <button
                                        onClick={() => activeTab === 'tasks' ? setIsAddTaskOpen(true) : setIsAddPlanOpen(true)}
                                        className="h-10 px-4 bg-primary text-primary-foreground rounded-lg font-bold font-cairo flex items-center gap-2 hover:bg-primary/90 transition-colors shrink-0"
                                    >
                                        <Plus className="w-4 h-4" />
                                        {isRTL
                                            ? (activeTab === 'tasks' ? 'مهمة جديدة' : 'خطة جديدة')
                                            : (activeTab === 'tasks' ? 'Add Task' : 'Add Plan')
                                        }
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Content */}
                        {activeTab === 'tasks' ? (
                            viewMode === 'table' ? (
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50">
                                            <tr>
                                                <th className="p-3 text-start font-bold font-cairo">{isRTL ? 'العنوان' : 'Title'}</th>
                                                <th className="p-3 text-start font-bold font-cairo">{isRTL ? 'الفني المكلف' : 'Assigned To'}</th>
                                                <th className="p-3 text-start font-bold font-cairo">{isRTL ? 'الأولوية' : 'Priority'}</th>
                                                <th className="p-3 text-start font-bold font-cairo">{isRTL ? 'الحالة' : 'Status'}</th>
                                                <th className="p-3 text-start font-bold font-cairo">{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                                                <th className="p-3 text-start font-bold font-cairo">{isRTL ? 'أمر عمل' : 'Work Order'}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {filteredTasks.map(task => (
                                                <tr
                                                    key={task.id}
                                                    className="hover:bg-muted/5 transition-colors cursor-pointer"
                                                    onClick={() => handleTaskClick(task)}
                                                >
                                                    <td className="p-3 font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Clock className="w-4 h-4 text-muted-foreground" />
                                                            {task.title}
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        {task.assignee ? (
                                                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                                                <User className="w-3.5 h-3.5" />
                                                                <span>{isRTL ? task.assignee.full_name_ar : task.assignee.full_name}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs italic">{isRTL ? 'غير مكلف' : 'Unassigned'}</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className={cn(
                                                            "px-2 py-1 rounded text-xs font-bold capitalize",
                                                            task.priority === 'high' ? "bg-red-100 text-red-700" :
                                                                task.priority === 'medium' ? "bg-yellow-100 text-yellow-700" :
                                                                    "bg-blue-100 text-blue-700"
                                                        )}>
                                                            {task.priority || 'medium'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3">
                                                        <span className={cn(
                                                            "px-2 py-1 rounded text-xs font-bold capitalize",
                                                            task.status === 'completed' ? "bg-green-100 text-green-700" :
                                                                task.status === 'in_progress' ? "bg-orange-100 text-orange-700" :
                                                                    "bg-gray-100 text-gray-700"
                                                        )}>
                                                            {task.status.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-muted-foreground font-mono text-xs">
                                                        {task.due_date || '-'}
                                                    </td>
                                                    <td className="p-3">
                                                        {task.related_work_order_id ? (
                                                            <span className="text-blue-500 flex items-center gap-1 text-xs">
                                                                <ExternalLink className="w-3 h-3" />
                                                                {isRTL ? 'مربوط' : 'Linked'}
                                                            </span>
                                                        ) : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {filteredTasks.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="p-8 text-center text-muted-foreground font-cairo">
                                                        {isRTL ? 'لا توجد مهام مطابقة' : 'No tasks found'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Simple Kanban Placeholder */}
                                    {['pending', 'in_progress', 'completed'].map(status => (
                                        <div key={status} className="bg-muted/30 p-4 rounded-xl space-y-3">
                                            <h3 className="font-bold font-cairo capitalize flex justify-between">
                                                {status.replace('_', ' ')}
                                                <span className="bg-background px-2 rounded text-sm border">
                                                    {filteredTasks.filter(t => t.status === status).length}
                                                </span>
                                            </h3>
                                            <div className="space-y-2">
                                                {filteredTasks
                                                    .filter(t => t.status === status)
                                                    .map(task => (
                                                        <div
                                                            key={task.id}
                                                            onClick={() => handleTaskClick(task)}
                                                            className="p-3 bg-card border rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer space-y-2"
                                                        >
                                                            <div className="flex justify-between items-start">
                                                                <p className="font-medium text-sm line-clamp-2">{task.title}</p>
                                                                <span className={cn(
                                                                    "w-2 h-2 rounded-full flex-shrink-0 mt-1",
                                                                    task.priority === 'high' ? "bg-red-500" : "bg-blue-500"
                                                                )} />
                                                            </div>
                                                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                                {task.assignee ? (
                                                                    <span>{isRTL ? task.assignee.full_name_ar : task.assignee.full_name}</span>
                                                                ) : <span>-</span>}

                                                                {task.related_work_order_id && (
                                                                    <span className="text-blue-500 flex items-center gap-1">
                                                                        <FileText className="w-3 h-3" />
                                                                        WO
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredPlans.map(plan => (
                                    <div
                                        key={plan.id}
                                        onClick={() => navigate(`/maintenance/plans/${plan.id}`)}
                                        className="bg-card border rounded-xl p-5 shadow-sm hover:border-primary/50 transition-colors group cursor-pointer"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="font-bold text-lg font-cairo group-hover:text-primary transition-colors">
                                                    {isRTL ? (plan.name_ar || plan.name) : plan.name}
                                                </h3>
                                                <span className="text-xs text-muted-foreground font-mono">{plan.code}</span>
                                            </div>
                                            {plan.status !== 'draft' && (
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-xs border capitalize",
                                                    plan.status === 'active' ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-600 border-gray-200"
                                                )}>
                                                    {plan.status}
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground font-cairo">{isRTL ? 'السنة' : 'Year'}</span>
                                                <span className="font-bold">{plan.year}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground font-cairo">{isRTL ? 'الميزانية' : 'Budget'}</span>
                                                <span className="font-bold">{plan.budget?.toLocaleString()} SAR</span>
                                            </div>

                                            <div className="space-y-1 pt-2">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-muted-foreground">{isRTL ? 'الإنجاز' : 'Progress'}</span>
                                                    <span className="font-bold">{plan.completion_rate}%</span>
                                                </div>
                                                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-primary transition-all duration-500"
                                                        style={{ width: `${plan.completion_rate}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {filteredPlans.length === 0 && (
                                    <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="font-cairo">{isRTL ? 'لا توجد خطط صيانة' : 'No maintenance plans found'}</p>
                                        {canManage && (
                                            <button
                                                onClick={() => setIsAddPlanOpen(true)}
                                                className="mt-4 text-primary hover:underline font-cairo text-sm"
                                            >
                                                {isRTL ? 'إنشاء خطة جديدة' : 'Create new plan'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function StatCard({ title, value, icon: Icon, color, bg }: {
    title: string
    value: number | string
    icon: React.ElementType
    color: string
    bg: string
}) {
    return (
        <div className="bg-card border rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div>
                <p className="text-sm text-muted-foreground font-cairo mb-1">{title}</p>
                <p className="text-2xl font-bold font-mono">{value}</p>
            </div>
            <div className={cn("p-3 rounded-lg", bg, color)}>
                <Icon className="w-6 h-6" />
            </div>
        </div>
    )
}
