import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useWorkOrders, useWorkOrderStats, WorkOrder } from '@/hooks/useWorkOrders'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { usePermission } from '@/hooks/usePermission'
import AddWorkOrderModal from '@/components/work-orders/AddWorkOrderModal'
import {
    isOverdueWorkOrder,
    STATUS_DISPLAY,
    WORK_ORDER_FILTERS,
    type WorkOrderFilterKey,
    type WorkOrderStatus,
} from '@/config/workOrderStatus'
import {
    ClipboardList,
    Plus,
    Search,
    Filter,
    Clock,
    CheckCircle2,
    XCircle,
    User,
    Building2,
    Calendar,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Pause,
    PlayCircle,
} from 'lucide-react'

const statusIcons: Record<WorkOrderStatus, React.ElementType> = {
    pending: Clock,
    assigned: User,
    in_progress: PlayCircle,
    pending_supervisor_approval: AlertCircle,
    pending_engineer_review: AlertCircle,
    pending_reporter_closure: CheckCircle2,
    completed: CheckCircle2,
    auto_closed: CheckCircle2,
    rejected_by_technician: XCircle,
    cancelled: XCircle,
    on_hold: Pause,
    archived: ClipboardList,
}

const priorityConfig = {
    low: { color: 'text-success', bg: 'bg-success/10', label: 'low' },
    medium: { color: 'text-info', bg: 'bg-info/10', label: 'medium' },
    high: { color: 'text-warning', bg: 'bg-warning/10', label: 'high' },
    urgent: { color: 'text-destructive', bg: 'bg-destructive/10', label: 'urgent' },
}

export default function WorkOrdersPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'

    // Check create WO feature
    const { can } = usePermission()
    const isCreateWorkOrderEnabled = useFeatureEnabled('work_orders', 'create_wo')
    const canCreate = can('work_orders.create')

    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<WorkOrderFilterKey>('all')
    const [showFilters, setShowFilters] = useState(false)
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)

    // Fetch data
    const { data: workOrders, isLoading, error } = useWorkOrders()
    const { data: stats } = useWorkOrderStats()

    // Filter work orders
    const filteredWorkOrders = workOrders?.filter(wo => {
        const matchesSearch =
            wo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            wo.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
            wo.description?.toLowerCase().includes(searchQuery.toLowerCase())

        const selectedFilter = WORK_ORDER_FILTERS.find((filter) => filter.key === statusFilter)
        const matchesStatus =
            !selectedFilter ||
            selectedFilter.key === 'all' ||
            (selectedFilter.derived === 'overdue' && isOverdueWorkOrder(wo.due_date, wo.status)) ||
            Boolean(selectedFilter.statuses?.includes(wo.status))

        return matchesSearch && matchesStatus
    }) || []

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted">{t('common.loading')}</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-primary mb-2">
                        {isRTL ? 'حدث خطأ' : 'An error occurred'}
                    </h2>
                    <p className="text-muted">{error.message}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Add Work Order Modal */}
            <AddWorkOrderModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo">
                        {t('workOrders.title')}
                    </h1>
                    <p className="text-muted font-cairo">
                        {isRTL
                            ? `إدارة البلاغات وأوامر العمل - ${filteredWorkOrders.length} بلاغ`
                            : `Manage work orders and tickets - ${filteredWorkOrders.length} orders`
                        }
                    </p>
                </div>

                {/* Create Button - only if feature enabled and user has permission */}
                {isCreateWorkOrderEnabled && canCreate && (
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors font-cairo"
                    >
                        <Plus className="w-5 h-5" />
                        {t('workOrders.createWorkOrder')}
                    </button>
                )}
            </div>

            {/* Feature Disabled Warning */}
            {!isCreateWorkOrderEnabled && (
                <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/20 rounded-xl text-warning">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="font-cairo text-sm">
                        {isRTL
                            ? 'تم تعطيل ميزة إنشاء أوامر العمل. يرجى مراجعة مدير النظام لتفعيلها.'
                            : 'Create work order feature is disabled. Please contact admin to enable it.'}
                    </p>
                </div>
            )}

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard
                        title={isRTL ? 'إجمالي البلاغات' : 'Total Orders'}
                        value={stats.total}
                        icon={ClipboardList}
                        color="secondary"
                    />
                    <StatCard
                        title={isRTL ? 'قيد الانتظار' : 'Pending'}
                        value={stats.byStatus.pending}
                        icon={Clock}
                        color="warning"
                    />
                    <StatCard
                        title={isRTL ? 'قيد التنفيذ' : 'In Progress'}
                        value={stats.byStatus.in_progress}
                        icon={PlayCircle}
                        color="info"
                    />
                    <StatCard
                        title={isRTL ? 'مكتملة' : 'Completed'}
                        value={stats.byStatus.completed}
                        icon={CheckCircle2}
                        color="success"
                    />
                </div>
            )}

            {/* Search & Filters */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className={cn(
                            'absolute top-1/2 -translate-y-1/2 w-5 h-5 text-muted',
                            isRTL ? 'right-4' : 'left-4'
                        )} />
                        <input
                            type="text"
                            placeholder={isRTL ? 'البحث عن بلاغ...' : 'Search work orders...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={cn(
                                'w-full py-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none font-cairo',
                                isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'
                            )}
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-3 rounded-xl transition-colors font-cairo',
                            showFilters
                                ? 'bg-secondary text-white'
                                : 'bg-card border border-border text-primary hover:bg-muted/10'
                        )}
                    >
                        <Filter className="w-5 h-5" />
                        {isRTL ? 'تصفية' : 'Filter'}
                        {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="p-4 bg-card rounded-xl border border-border">
                        <div className="flex flex-wrap gap-2">
                            {WORK_ORDER_FILTERS.map((filter) => (
                                <button
                                    key={filter.key}
                                    onClick={() => setStatusFilter(filter.key)}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-sm font-cairo transition-colors',
                                        statusFilter === filter.key
                                            ? 'bg-secondary text-white'
                                            : 'bg-muted/10 text-primary hover:bg-muted/20'
                                    )}
                                >
                                    {isRTL ? filter.labelAr : filter.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Work Orders List */}
            {filteredWorkOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <ClipboardList className="w-16 h-16 text-muted/50 mb-4" />
                    <h3 className="text-lg font-bold text-primary font-cairo mb-2">
                        {isRTL ? 'لا توجد بلاغات' : 'No work orders found'}
                    </h3>
                    <p className="text-muted font-cairo">
                        {isRTL
                            ? 'قم بإنشاء بلاغ جديد للبدء'
                            : 'Create a new work order to get started'
                        }
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredWorkOrders.map((workOrder) => (
                        <WorkOrderCard key={workOrder.id} workOrder={workOrder} isRTL={isRTL} />
                    ))}
                </div>
            )}
        </div>
    )
}

// Stat Card Component
function StatCard({ title, value, icon: Icon, color }: {
    title: string
    value: number
    icon: React.ElementType
    color: string
}) {
    const colorClasses = {
        secondary: 'bg-secondary/10 text-secondary',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        info: 'bg-info/10 text-info',
        destructive: 'bg-destructive/10 text-destructive',
    }

    return (
        <div className="bg-card rounded-xl p-4 shadow-card">
            <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-lg', colorClasses[color as keyof typeof colorClasses])}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-primary font-inter">{value}</p>
                    <p className="text-xs text-muted font-cairo">{title}</p>
                </div>
            </div>
        </div>
    )
}

// Work Order Card Component
function WorkOrderCard({ workOrder, isRTL }: { workOrder: WorkOrder; isRTL: boolean }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const status = STATUS_DISPLAY[workOrder.status] || STATUS_DISPLAY.pending
    const priority = priorityConfig[workOrder.priority] || priorityConfig.medium
    const StatusIcon = statusIcons[workOrder.status] || Clock

    return (
        <div
            onClick={() => navigate(`/work-orders/${workOrder.id}`)}
            className="bg-card rounded-xl shadow-card overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
        >
            <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                    {/* Left side */}
                    <div className="flex items-start gap-4 flex-1">
                        <div className={cn('p-3 rounded-xl', status.bg)}>
                            <StatusIcon className={cn('w-6 h-6', status.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="font-bold text-primary font-cairo truncate">
                                    {workOrder.title}
                                </h3>
                                <span className="px-2 py-0.5 text-xs bg-muted/20 rounded-full font-inter">
                                    {workOrder.code}
                                </span>
                            </div>

                            {workOrder.description && (
                                <p className="text-sm text-muted font-cairo line-clamp-2 mb-2">
                                    {workOrder.description}
                                </p>
                            )}

                            {/* Meta info */}
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
                                {workOrder.building && (
                                    <div className="flex items-center gap-1">
                                        <Building2 className="w-4 h-4" />
                                        <span className="font-cairo">
                                            {isRTL ? workOrder.building.name_ar : workOrder.building.name}
                                        </span>
                                    </div>
                                )}
                                {workOrder.reporter && (
                                    <div className="flex items-center gap-1">
                                        <User className="w-4 h-4" />
                                        <span className="font-cairo">
                                            {isRTL ? workOrder.reporter.full_name_ar : workOrder.reporter.full_name}
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    <span className="font-inter text-xs">
                                        {formatRelativeTime(workOrder.reported_at)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right side - Status & Priority */}
                    <div className="flex flex-col items-end gap-2">
                        <span className={cn(
                            'px-3 py-1 rounded-full text-xs font-medium font-cairo',
                            status.bg, status.color
                        )}>
                            {t(`workOrders.${status.label}`)}
                        </span>
                        <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-cairo',
                            priority.bg, priority.color
                        )}>
                            {t(`workOrders.${priority.label}`)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
