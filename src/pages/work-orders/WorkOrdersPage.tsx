import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn, formatDate, formatRelativeTime } from '@/lib/utils'
import { useWorkOrders, useWorkOrderStats, isPreventiveWorkOrder, WorkOrder } from '@/hooks/useWorkOrders'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { usePermission } from '@/hooks/usePermission'
import AddWorkOrderModal from '@/components/work-orders/AddWorkOrderModal'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
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

function validStatusFilter(value: string | null): WorkOrderFilterKey {
    return WORK_ORDER_FILTERS.some((filter) => filter.key === value) ? value as WorkOrderFilterKey : 'all'
}

function validTypeFilter(value: string | null): 'all' | 'preventive' | 'corrective' {
    return value === 'preventive' || value === 'corrective' ? value : 'all'
}

function startOfDate(value: string) {
    return new Date(`${value}T00:00:00`).getTime()
}

function endOfDate(value: string) {
    return new Date(`${value}T23:59:59.999`).getTime()
}

export default function WorkOrdersPage() {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const locale = isRTL ? 'ar-SA' : 'en-US'
    const [searchParams, setSearchParams] = useSearchParams()

    // Check create WO feature
    const { can } = usePermission()
    const isCreateWorkOrderEnabled = useFeatureEnabled('work_orders', 'create_wo')
    const canCreate = can('work_orders.create')

    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
    const [statusFilter, setStatusFilter] = useState<WorkOrderFilterKey>(() => validStatusFilter(searchParams.get('status')))
    const [typeFilter, setTypeFilter] = useState<'all' | 'preventive' | 'corrective'>(() => validTypeFilter(searchParams.get('type')))
    const [dateFrom, setDateFrom] = useState(() => searchParams.get('from') ?? '')
    const [dateTo, setDateTo] = useState(() => searchParams.get('to') ?? '')
    const [showFilters, setShowFilters] = useState(false)
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)

    // Fetch data
    const { data: workOrders, isLoading, error } = useWorkOrders()
    const { data: stats } = useWorkOrderStats()

    useEffect(() => {
        const next = new URLSearchParams()
        if (searchQuery.trim()) next.set('q', searchQuery.trim())
        if (statusFilter !== 'all') next.set('status', statusFilter)
        if (typeFilter !== 'all') next.set('type', typeFilter)
        if (dateFrom) next.set('from', dateFrom)
        if (dateTo) next.set('to', dateTo)
        setSearchParams(next, { replace: true })
    }, [dateFrom, dateTo, searchQuery, setSearchParams, statusFilter, typeFilter])

    // Filter work orders
    const filteredWorkOrders = useMemo(() => workOrders?.filter(wo => {
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

        const preventive = isPreventiveWorkOrder(wo)
        const matchesType =
            typeFilter === 'all' ||
            (typeFilter === 'preventive' && preventive) ||
            (typeFilter === 'corrective' && !preventive)

        const createdAt = new Date(wo.created_at).getTime()
        const matchesDateFrom = !dateFrom || createdAt >= startOfDate(dateFrom)
        const matchesDateTo = !dateTo || createdAt <= endOfDate(dateTo)

        return matchesSearch && matchesStatus && matchesType && matchesDateFrom && matchesDateTo
    }) || [], [dateFrom, dateTo, searchQuery, statusFilter, typeFilter, workOrders])

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

            <PageHeader
                icon={<ClipboardList className="h-5 w-5" />}
                title={t('workOrders.title')}
                description={isRTL
                    ? `إدارة البلاغات وأوامر العمل مع عرض سريع للحالة، الأولوية، الموقع، والمسؤول - ${filteredWorkOrders.length} بلاغ`
                    : `Manage work orders with quick visibility into status, priority, location, and owner - ${filteredWorkOrders.length} orders`}
                actions={isCreateWorkOrderEnabled && canCreate ? (
                    <Button onClick={() => setIsAddModalOpen(true)} className="gap-2 bg-secondary hover:bg-secondary/90">
                        <Plus className="h-4 w-4" />
                        {t('workOrders.createWorkOrder')}
                    </Button>
                ) : null}
            />

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
            <div className="space-y-4 rounded-lg border bg-card p-4 shadow-card">
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
                                'w-full py-3 bg-background border border-border rounded-lg focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none font-cairo',
                                isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4'
                            )}
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-3 rounded-lg transition-colors font-cairo',
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
                    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
                        {/* Status filters */}
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
                        {/* Type filter */}
                        <div className="flex items-center gap-2 pt-2 border-t border-border/50 flex-wrap">
                            <span className="text-xs text-muted-foreground font-cairo">
                                {isRTL ? 'النوع:' : 'Type:'}
                            </span>
                            {([
                                { key: 'all', en: 'All Types', ar: 'كل الأنواع' },
                                { key: 'preventive', en: 'Preventive', ar: 'وقائي' },
                                { key: 'corrective', en: 'Corrective', ar: 'تصحيحي' },
                            ] as const).map(({ key, en, ar }) => (
                                <button
                                    key={key}
                                    onClick={() => setTypeFilter(key)}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-sm font-cairo transition-colors',
                                        typeFilter === key
                                            ? 'bg-secondary text-white'
                                            : 'bg-muted/10 text-primary hover:bg-muted/20'
                                    )}
                                >
                                    {isRTL ? ar : en}
                                </button>
                            ))}
                        </div>
                        {/* Date range filter */}
                        <div className="grid gap-3 pt-2 border-t border-border/50 sm:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-xs text-muted-foreground font-cairo">
                                    {isRTL ? 'من تاريخ الإنشاء' : 'Created from'}
                                </span>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(event) => setDateFrom(event.target.value)}
                                    className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-secondary"
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-xs text-muted-foreground font-cairo">
                                    {isRTL ? 'إلى تاريخ الإنشاء' : 'Created to'}
                                </span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(event) => setDateTo(event.target.value)}
                                    className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-secondary"
                                />
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {/* Work Orders List */}
            {filteredWorkOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <ClipboardList className="mb-4 h-16 w-16 text-muted-foreground/50" />
                    <h3 className="mb-2 max-w-md font-cairo text-lg font-bold text-primary">
                        {isRTL ? 'لا توجد أوامر عمل بعد' : 'No work orders yet'}
                    </h3>
                    <p className="max-w-xl font-cairo text-sm leading-7 text-muted-foreground">
                        {isRTL
                            ? 'أوامر العمل هي بداية تحويل البلاغات اليومية إلى سجل موثق: من المشكلة، إلى الفني، إلى الإثبات، ثم القرار.'
                            : 'Work orders turn daily requests into a documented operational record: from issue, to technician, to proof of work, then decision.'}
                    </p>
                </div>
            ) : (
                <>
                    <WorkOrdersTable workOrders={filteredWorkOrders} isRTL={isRTL} locale={locale} />
                    <div className="space-y-3 md:hidden">
                        {filteredWorkOrders.map((workOrder) => (
                            <WorkOrderCard key={workOrder.id} workOrder={workOrder} isRTL={isRTL} />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

function WorkOrdersTable({
    workOrders,
    isRTL,
    locale,
}: {
    workOrders: WorkOrder[]
    isRTL: boolean
    locale: string
}) {
    const { t } = useTranslation()
    const navigate = useNavigate()

    const label = {
        order: isRTL ? 'البلاغ' : 'Work Order',
        status: isRTL ? 'الحالة' : 'Status',
        priority: isRTL ? 'الأولوية' : 'Priority',
        location: isRTL ? 'الموقع / الأصل' : 'Location / Asset',
        owner: isRTL ? 'المسؤول' : 'Owner',
        due: isRTL ? 'الاستحقاق' : 'Due',
        updated: isRTL ? 'آخر تحديث' : 'Updated',
    }

    return (
        <div className="hidden overflow-hidden rounded-lg border bg-card shadow-card md:block">
            <Table>
                <TableHeader className="bg-muted/40">
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="text-start font-cairo">{label.order}</TableHead>
                        <TableHead className="text-start font-cairo">{label.status}</TableHead>
                        <TableHead className="text-start font-cairo">{label.priority}</TableHead>
                        <TableHead className="text-start font-cairo">{label.location}</TableHead>
                        <TableHead className="text-start font-cairo">{label.owner}</TableHead>
                        <TableHead className="text-start font-cairo">{label.due}</TableHead>
                        <TableHead className="text-start font-cairo">{label.updated}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {workOrders.map((workOrder) => {
                        const status = STATUS_DISPLAY[workOrder.status] || STATUS_DISPLAY.pending
                        const priority = priorityConfig[workOrder.priority] || priorityConfig.medium
                        const overdue = isOverdueWorkOrder(workOrder.due_date, workOrder.status)
                        const preventive = isPreventiveWorkOrder(workOrder)
                        const assetName = workOrder.asset
                            ? (isRTL ? workOrder.asset.name_ar || workOrder.asset.name : workOrder.asset.name)
                            : null
                        const buildingName = workOrder.building
                            ? (isRTL ? workOrder.building.name_ar || workOrder.building.name : workOrder.building.name)
                            : workOrder.asset?.building
                                ? (isRTL ? workOrder.asset.building.name_ar || workOrder.asset.building.name : workOrder.asset.building.name)
                                : null
                        const ownerName = workOrder.assignee
                            ? (isRTL ? workOrder.assignee.full_name_ar || workOrder.assignee.full_name : workOrder.assignee.full_name)
                            : workOrder.reporter
                                ? (isRTL ? workOrder.reporter.full_name_ar || workOrder.reporter.full_name : workOrder.reporter.full_name)
                                : null
                        const teamName = workOrder.assignedTeam
                            ? (isRTL ? workOrder.assignedTeam.name_ar || workOrder.assignedTeam.name : workOrder.assignedTeam.name)
                            : null

                        return (
                            <TableRow
                                key={workOrder.id}
                                className="cursor-pointer hover:bg-secondary/5"
                                onClick={() => navigate(`/work-orders/${workOrder.id}`)}
                            >
                                <TableCell className="min-w-[260px]">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-cairo font-semibold text-primary">{workOrder.title}</span>
                                            <span className="rounded border bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
                                                {workOrder.code}
                                            </span>
                                            <span className={cn(
                                                'px-2 py-0.5 rounded-full text-[10px] font-cairo font-medium border',
                                                preventive
                                                    ? 'text-info bg-info/10 border-info/20'
                                                    : 'text-muted-foreground bg-muted/10 border-muted/20'
                                            )}>
                                                {preventive ? t('workOrders.preventive') : t('workOrders.corrective')}
                                            </span>
                                        </div>
                                        {workOrder.description ? (
                                            <p className="line-clamp-1 max-w-[360px] font-cairo text-xs text-muted-foreground">
                                                {workOrder.description}
                                            </p>
                                        ) : null}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className={cn(
                                        'inline-flex items-center rounded-full border px-2.5 py-1 font-cairo text-xs font-medium',
                                        status.bg,
                                        status.color,
                                        status.borderColor
                                    )}>
                                        {t(`workOrders.${status.label}`)}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span className={cn(
                                        'inline-flex rounded-full px-2.5 py-1 font-cairo text-xs font-medium',
                                        priority.bg,
                                        priority.color
                                    )}>
                                        {t(`workOrders.${priority.label}`)}
                                    </span>
                                </TableCell>
                                <TableCell className="min-w-[180px]">
                                    <div className="space-y-1 font-cairo text-sm">
                                        <p className="text-primary">{buildingName || '-'}</p>
                                        {assetName ? <p className="text-xs text-muted-foreground">{assetName}</p> : null}
                                    </div>
                                </TableCell>
                                <TableCell className="font-cairo text-sm text-muted-foreground">
                                    <div className="space-y-1">
                                        <p>{ownerName || '-'}</p>
                                        {teamName ? <p className="text-xs font-bold text-primary">{teamName}</p> : null}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className={cn('font-cairo text-sm', overdue ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                                        {workOrder.due_date ? formatDate(workOrder.due_date, locale) : '-'}
                                    </div>
                                </TableCell>
                                <TableCell className="font-cairo text-sm text-muted-foreground">
                                    {formatRelativeTime(workOrder.updated_at)}
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
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
        <div className="rounded-lg border bg-card p-4 shadow-card">
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
    const preventive = isPreventiveWorkOrder(workOrder)
    const teamName = workOrder.assignedTeam
        ? (isRTL ? workOrder.assignedTeam.name_ar || workOrder.assignedTeam.name : workOrder.assignedTeam.name)
        : null

    return (
        <div
            onClick={() => navigate(`/work-orders/${workOrder.id}`)}
            className="bg-card rounded-lg border shadow-card overflow-hidden hover:shadow-card-hover transition-shadow cursor-pointer"
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
                                {teamName && (
                                    <div className="flex items-center gap-1">
                                        <User className="w-4 h-4" />
                                        <span className="font-cairo">{teamName}</span>
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

                    {/* Right side - Status, Priority, Type */}
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
                        <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-cairo border',
                            preventive
                                ? 'text-info bg-info/10 border-info/20'
                                : 'text-muted-foreground bg-muted/10 border-muted/20'
                        )}>
                            {preventive ? t('workOrders.preventive') : t('workOrders.corrective')}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
