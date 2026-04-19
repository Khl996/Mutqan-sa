import {
    AlertTriangle,
    Archive,
    BarChart3,
    CalendarClock,
    CheckCircle2,
    ClipboardCheck,
    Clock3,
    FileText,
    Pencil,
    PlayCircle,
    Printer,
    Wrench,
} from 'lucide-react'
import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import type {
    PMComplianceStats,
    PMGenerateResult,
    PMGenerationMode,
    PMJobPlan,
    PMSchedule,
    PMWorkOrder,
} from '@/hooks/usePMFoundation'
import { cn, formatDate } from '@/lib/utils'
import { displayName, durationLabel, frequencyLabel, modeLabel, percentLabel, PMCopy, statusClass, statusLabel } from './foundationPmUtils'

export interface PMDashboardMetrics {
    activePlans: number
    activeSchedules: number
    dueToday: number
    overdue: number
    dueSoon: number
    workOrdersGenerated: number
    completedOnTime: number
    completedLate: number
    complianceRate: number | null | undefined
}

type ScheduleDueState = 'inactive' | 'no_assets' | 'no_due_date' | 'overdue' | 'due_today' | 'ready' | 'upcoming'

function dateOnlyTime(value: string | null | undefined) {
    if (!value) return null
    const date = new Date(`${value.slice(0, 10)}T00:00:00`)
    return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function todayTime() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today.getTime()
}

function scheduleDueState(schedule: PMSchedule): ScheduleDueState {
    const assetCount = schedule.assets?.length ?? 0
    if (schedule.status !== 'active') return 'inactive'
    if (assetCount === 0) return 'no_assets'
    if (!schedule.next_due_date) return 'no_due_date'

    const dueTime = dateOnlyTime(schedule.next_due_date)
    if (dueTime === null) return 'no_due_date'
    const current = todayTime()
    if (dueTime < current) return 'overdue'
    if (dueTime === current) return 'due_today'

    const triggerDate = new Date(dueTime)
    triggerDate.setDate(triggerDate.getDate() - (schedule.lead_time_days ?? 0))
    return triggerDate.getTime() <= current ? 'ready' : 'upcoming'
}

function isScheduleEligible(schedule: PMSchedule) {
    return ['overdue', 'due_today', 'ready'].includes(scheduleDueState(schedule))
}

function dueStateLabel(state: ScheduleDueState, copy: PMCopy) {
    switch (state) {
        case 'inactive':
            return copy.inactive
        case 'no_assets':
            return copy.noAssetsLinked
        case 'no_due_date':
            return copy.noNextDueDate
        case 'overdue':
            return copy.overdue
        case 'due_today':
            return copy.dueTodayStatus
        case 'ready':
            return copy.dueSoonLead
        default:
            return copy.upcoming
    }
}

function dueStateClass(state: ScheduleDueState) {
    switch (state) {
        case 'overdue':
            return 'bg-rose-500/15 text-rose-700 border-rose-500/20'
        case 'due_today':
        case 'ready':
            return 'bg-amber-500/15 text-amber-700 border-amber-500/20'
        case 'upcoming':
            return 'bg-sky-500/15 text-sky-700 border-sky-500/20'
        default:
            return 'bg-slate-500/10 text-slate-700 border-slate-500/20'
    }
}

function workOrderDeadlineState(wo: PMWorkOrder) {
    if (wo.status === 'completed' || wo.status === 'auto_closed') return 'completed'
    if (wo.status === 'cancelled') return 'cancelled'
    const deadline = dateOnlyTime(wo.compliance_deadline)
    if (deadline !== null && deadline < todayTime()) return 'overdue'
    return 'open'
}

function isClosed(wo: PMWorkOrder) {
    return ['completed', 'auto_closed', 'cancelled'].includes(wo.status)
}

function isOpenOverdue(wo: PMWorkOrder) {
    return !isClosed(wo) && workOrderDeadlineState(wo) === 'overdue'
}

function isDateWithinDays(value: string | null | undefined, days: number) {
    const target = dateOnlyTime(value)
    if (target === null) return false
    const current = todayTime()
    const limit = new Date(current)
    limit.setDate(limit.getDate() + days)
    return target >= current && target <= limit.getTime()
}

function isCompletedOnTime(wo: PMWorkOrder) {
    if (!wo.completed_at || !wo.compliance_deadline) return true
    const completed = new Date(wo.completed_at).getTime()
    const deadline = new Date(`${wo.compliance_deadline.slice(0, 10)}T23:59:59`).getTime()
    return Number.isNaN(completed) || Number.isNaN(deadline) ? true : completed <= deadline
}

function assetCountLabel(count: number, copy: PMCopy) {
    return `${count} ${copy.assets}`
}

function assetNames(assets: PMWorkOrder['work_order_assets'] | PMSchedule['assets'], isAr: boolean) {
    return (assets ?? [])
        .map((assetRow) => assetRow.asset ? displayName(assetRow.asset, isAr) : assetRow.asset_id)
        .filter(Boolean)
}

export function DashboardPanel({
    copy,
    metrics,
    stats,
}: {
    copy: PMCopy
    metrics: PMDashboardMetrics
    stats?: PMComplianceStats
}) {
    const cards = [
        { label: copy.activeSchedules, value: metrics.activeSchedules, hint: copy.activeSchedulesHint, icon: CalendarClock, tone: 'default' as const },
        { label: copy.dueToday, value: metrics.dueToday, hint: copy.dueTodayHint, icon: Clock3, tone: metrics.dueToday > 0 ? 'warning' as const : 'default' as const },
        { label: copy.overdue, value: metrics.overdue, hint: copy.overdueHint, icon: AlertTriangle, tone: metrics.overdue > 0 ? 'danger' as const : 'default' as const },
        { label: copy.generatedWorkOrders, value: metrics.workOrdersGenerated, hint: copy.generatedWorkOrdersHint, icon: ClipboardCheck, tone: 'default' as const },
        { label: copy.completedOnTime, value: metrics.completedOnTime, hint: copy.completedOnTimeHint, icon: CheckCircle2, tone: 'success' as const },
        { label: copy.completedLate, value: metrics.completedLate, hint: copy.completedLateHint, icon: AlertTriangle, tone: metrics.completedLate > 0 ? 'warning' as const : 'default' as const },
    ]

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="font-cairo">{copy.operationalSummary}</CardTitle>
                    <CardDescription className="font-cairo">{copy.operationalSummaryHint}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {cards.map((card) => (
                        <OperationalCard key={card.label} {...card} />
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="grid gap-4 p-5 md:grid-cols-5">
                    <Info label={copy.jobPlans} value={String(metrics.activePlans)} />
                    <Info label={copy.compliance} value={percentLabel(stats?.compliance_rate)} />
                    <Info label={copy.total} value={String(stats?.total ?? 0)} />
                    <Info label={copy.dueSoon} value={String(metrics.dueSoon)} />
                    <Info label={copy.completedLate} value={String(metrics.completedLate)} />
                </CardContent>
            </Card>
        </div>
    )
}

export function JobPlansPanel({
    copy,
    isAr,
    canManage,
    plans,
    hasAnyPlans,
    onOpen,
    onEdit,
    onArchive,
}: {
    copy: PMCopy
    isAr: boolean
    canManage: boolean
    plans: PMJobPlan[]
    hasAnyPlans?: boolean
    onOpen: (plan: PMJobPlan) => void
    onEdit: (plan: PMJobPlan) => void
    onArchive: (plan: PMJobPlan) => void
}) {
    if (plans.length === 0) {
        return (
            <EmptyState
                copy={copy}
                icon={FileText}
                title={hasAnyPlans ? copy.noMatchingRecordsTitle : copy.jobPlansEmptyTitle}
                description={hasAnyPlans ? copy.noMatchingRecordsHint : copy.jobPlansEmptyHint}
            />
        )
    }
    return (
        <div className="grid gap-4 xl:grid-cols-2">
            {plans.map((plan) => (
                <Card
                    key={plan.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer transition-colors hover:bg-muted/35"
                    onClick={() => onOpen(plan)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') onOpen(plan)
                    }}
                >
                    <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={cn('border', statusClass(plan.status))}>{statusLabel(plan.status, copy)}</Badge>
                                    {plan.category ? <Badge variant="outline">{plan.category}</Badge> : null}
                                    <Badge variant="secondary" dir="ltr">{plan.total_items} {copy.checks}</Badge>
                                </div>
                                <CardTitle className="font-cairo">{displayName(plan, isAr)}</CardTitle>
                                {plan.code ? <p className="font-mono text-xs text-muted-foreground">{plan.code}</p> : null}
                            </div>
                            {canManage ? (
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onEdit(plan)
                                        }}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onArchive(plan)
                                        }}
                                    >
                                        <Archive className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                        <Info label={copy.estimatedDuration} value={durationLabel(plan.estimated_duration_minutes, copy)} />
                        <Info label={copy.requiredSkill} value={plan.required_skill || '-'} />
                        <Info label={copy.requiredRole} value={plan.required_role || '-'} />
                        <Info label={copy.safetyNotes} value={plan.safety_notes || '-'} />
                        <Info label={copy.tools} value={String(plan.required_tools?.length ?? 0)} />
                        <Info label={copy.materials} value={String(plan.required_materials?.length ?? 0)} />
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

export function SchedulesPanel({
    copy,
    isAr,
    locale,
    canManage,
    schedules,
    hasAnySchedules,
    lastGenerateResult,
    isGenerating,
    onOpen,
    onEdit,
    onArchive,
    onGenerate,
}: {
    copy: PMCopy
    isAr: boolean
    locale: string
    canManage: boolean
    schedules: PMSchedule[]
    hasAnySchedules?: boolean
    lastGenerateResult?: PMGenerateResult | null
    isGenerating?: boolean
    onOpen: (schedule: PMSchedule) => void
    onEdit: (schedule: PMSchedule) => void
    onArchive: (schedule: PMSchedule) => void
    onGenerate?: () => void
}) {
    if (schedules.length === 0) {
        return (
            <EmptyState
                copy={copy}
                icon={CalendarClock}
                title={hasAnySchedules ? copy.noMatchingRecordsTitle : copy.schedulesEmptyTitle}
                description={hasAnySchedules ? copy.noMatchingRecordsHint : copy.schedulesEmptyHint}
            />
        )
    }
    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle className="font-cairo">{copy.schedules}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground font-cairo">
                        {lastGenerateResult
                            ? `${copy.generatedWorkOrders}: ${lastGenerateResult.generated ?? 0}`
                            : copy.generationHint}
                    </p>
                </div>
                {canManage && onGenerate ? (
                    <Button onClick={onGenerate} disabled={isGenerating}>
                        <PlayCircle className="me-2 h-4 w-4" />
                        {isGenerating ? copy.generating : copy.generateNow}
                    </Button>
                ) : null}
            </CardHeader>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{copy.name}</TableHead>
                            <TableHead>{copy.jobPlan}</TableHead>
                            <TableHead>{copy.frequency}</TableHead>
                            <TableHead>{copy.generationMode}</TableHead>
                            <TableHead>{copy.nextDue}</TableHead>
                            <TableHead>{copy.assetsLinked}</TableHead>
                            <TableHead>{copy.dueStatus}</TableHead>
                            <TableHead>{copy.lastGenerated}</TableHead>
                            <TableHead>{copy.status}</TableHead>
                            {canManage ? <TableHead /> : null}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {schedules.map((schedule) => {
                            const dueState = scheduleDueState(schedule)
                            const eligible = isScheduleEligible(schedule)
                            const assetCount = schedule.assets?.length ?? 0
                            const names = assetNames(schedule.assets, isAr)
                            return (
                                <TableRow
                                    key={schedule.id}
                                    className="cursor-pointer"
                                    onClick={() => onOpen(schedule)}
                                >
                                    <TableCell>
                                        <div className="min-w-[220px] space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="font-medium font-cairo">{displayName(schedule, isAr)}</div>
                                                <Badge className={cn('border', statusClass(schedule.status))}>{statusLabel(schedule.status, copy)}</Badge>
                                            </div>
                                            <div className="font-mono text-xs text-muted-foreground">{schedule.code || schedule.id}</div>
                                            <div className="flex flex-wrap gap-1">
                                                <Badge variant="outline">{copy.eligibleForGeneration}: {eligible ? copy.eligibleYes : copy.eligibleNo}</Badge>
                                                <Badge variant="outline">{copy.totalGenerated}: {schedule.total_generated ?? 0}</Badge>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="min-w-[180px] font-cairo">{schedule.job_plan ? displayName(schedule.job_plan, isAr) : '-'}</div>
                                    </TableCell>
                                    <TableCell dir="auto">
                                        <div className="min-w-[130px]">
                                            <div>{frequencyLabel(schedule.frequency_type, schedule.frequency_interval, copy)}</div>
                                            <div className="text-xs text-muted-foreground">{schedule.trigger_type}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell><ModeBadge mode={schedule.generation_mode} copy={copy} /></TableCell>
                                    <TableCell>{schedule.next_due_date ? formatDate(schedule.next_due_date, locale) : '-'}</TableCell>
                                    <TableCell>
                                        <div className="min-w-[160px]">
                                            <Badge variant="outline">{assetCountLabel(assetCount, copy)}</Badge>
                                            {names.length > 0 ? (
                                                <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground font-cairo">
                                                    {names.slice(0, 2).join(', ')}{names.length > 2 ? ` +${names.length - 2}` : ''}
                                                </div>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={cn('border', dueStateClass(dueState))}>
                                            {dueStateLabel(dueState, copy)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{schedule.last_generated_date ? formatDate(schedule.last_generated_date, locale) : copy.neverGenerated}</TableCell>
                                    <TableCell><Badge className={cn('border', statusClass(schedule.status))}>{statusLabel(schedule.status, copy)}</Badge></TableCell>
                                    {canManage ? (
                                        <TableCell>
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        onEdit(schedule)
                                                    }}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        onArchive(schedule)
                                                    }}
                                                >
                                                    <Archive className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    ) : null}
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
        </Card>
    )
}

export function WorkOrdersPanel({
    copy,
    isAr,
    locale,
    workOrders,
    hasAnyWorkOrders,
    canGenerate,
    isGenerating,
    onGenerate,
    onExecute,
    onPrintWorkOrder,
    onPrintExecutionReport,
    pdfLoadingId,
}: {
    copy: PMCopy
    isAr: boolean
    locale: string
    workOrders: PMWorkOrder[]
    hasAnyWorkOrders?: boolean
    canGenerate?: boolean
    isGenerating?: boolean
    onGenerate?: () => void
    onExecute: (wo: PMWorkOrder) => void
    onPrintWorkOrder?: (wo: PMWorkOrder) => void
    onPrintExecutionReport?: (wo: PMWorkOrder) => void
    pdfLoadingId?: string | null
}) {
    if (workOrders.length === 0) {
        return (
            <EmptyState
                copy={copy}
                icon={Wrench}
                title={hasAnyWorkOrders ? copy.noMatchingRecordsTitle : copy.workOrdersEmptyTitle}
                description={hasAnyWorkOrders ? copy.noMatchingRecordsHint : copy.workOrdersEmptyHint}
                action={!hasAnyWorkOrders && canGenerate && onGenerate ? (
                    <Button onClick={onGenerate} disabled={isGenerating}>
                        <PlayCircle className="me-2 h-4 w-4" />
                        {isGenerating ? copy.generating : copy.generateNow}
                    </Button>
                ) : null}
            />
        )
    }
    return (
        <Card>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{copy.workOrders}</TableHead>
                            <TableHead>{copy.sourceSchedule}</TableHead>
                            <TableHead>{copy.generationMode}</TableHead>
                            <TableHead>{copy.status}</TableHead>
                            <TableHead>{copy.assets}</TableHead>
                            <TableHead>{copy.checksProgress}</TableHead>
                            <TableHead>{copy.scheduled}</TableHead>
                            <TableHead>{copy.deadline}</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {workOrders.map((wo) => {
                            const mode = wo.source_schedule?.generation_mode ?? (wo.source_schedule_asset_id ? 'per_asset' : 'batch_route')
                            const names = assetNames(wo.work_order_assets, isAr)
                            const assetCount = wo.work_order_assets?.length ?? 0
                            const checks = wo.work_order_checks ?? []
                            const doneChecks = checks.filter((check) => check.status !== 'pending').length
                            const deadlineState = workOrderDeadlineState(wo)
                            return (
                                <TableRow key={wo.id}>
                                    <TableCell>
                                        <div className="min-w-[240px] space-y-1">
                                            <div className="font-medium font-cairo">{wo.title}</div>
                                            <div className="font-mono text-xs text-muted-foreground">{wo.code}</div>
                                            {wo.job_plan ? <div className="text-xs text-muted-foreground font-cairo">{copy.jobPlan}: {displayName(wo.job_plan, isAr)}</div> : null}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="min-w-[220px] space-y-1">
                                            <div className="font-medium font-cairo">{wo.source_schedule ? displayName(wo.source_schedule, isAr) : '-'}</div>
                                            <div className="font-mono text-xs text-muted-foreground">{wo.source_schedule_id ?? '-'}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell><ModeBadge mode={mode} copy={copy} /></TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <Badge className={cn('w-fit border', statusClass(wo.status))}>{statusLabel(wo.status, copy)}</Badge>
                                            {deadlineState === 'overdue' ? (
                                                <Badge className="w-fit border border-rose-500/20 bg-rose-500/15 text-rose-700">{copy.overdue}</Badge>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="min-w-[180px]">
                                            <Badge variant="outline">{assetCountLabel(assetCount, copy)}</Badge>
                                            <div className="mt-1 max-w-[240px] truncate text-xs text-muted-foreground font-cairo">
                                                {names.length > 0 ? names.join(', ') : '-'}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell dir="ltr">{doneChecks}/{checks.length}</TableCell>
                                    <TableCell>{wo.scheduled_date ? formatDate(wo.scheduled_date, locale) : '-'}</TableCell>
                                    <TableCell>
                                        <span className={cn(deadlineState === 'overdue' && 'font-semibold text-rose-700')}>
                                            {wo.compliance_deadline ? formatDate(wo.compliance_deadline, locale) : '-'}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex min-w-[260px] flex-wrap justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => onExecute(wo)}>
                                                <ClipboardCheck className="me-2 h-4 w-4" />{copy.execute}
                                            </Button>
                                            {onPrintWorkOrder ? (
                                                <Button variant="outline" size="sm" onClick={() => onPrintWorkOrder(wo)} disabled={pdfLoadingId === wo.id}>
                                                    <Printer className="me-2 h-4 w-4" />{copy.workOrderPdf}
                                                </Button>
                                            ) : null}
                                            {onPrintExecutionReport ? (
                                                <Button variant="outline" size="sm" onClick={() => onPrintExecutionReport(wo)} disabled={pdfLoadingId === wo.id}>
                                                    <Printer className="me-2 h-4 w-4" />{copy.executionReportPdf}
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
        </Card>
    )
}

export function ReportsPanel({
    copy,
    isAr,
    locale,
    metrics,
    stats,
    workOrders,
    onPrintReport,
}: {
    copy: PMCopy
    isAr: boolean
    locale: string
    metrics: PMDashboardMetrics
    stats?: PMComplianceStats
    workOrders: PMWorkOrder[]
    onPrintReport?: () => void
}) {
    const overdue = workOrders.filter((wo) => isOpenOverdue(wo))
    const dueSoon = workOrders.filter((wo) => !isClosed(wo) && !isOpenOverdue(wo) && isDateWithinDays(wo.compliance_deadline, 7))
    const completedOnTime = workOrders.filter((wo) => wo.status === 'completed' && isCompletedOnTime(wo))
    const completedLate = workOrders.filter((wo) => wo.status === 'completed' && !isCompletedOnTime(wo))

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 font-cairo">
                            <BarChart3 className="h-5 w-5" />
                            {copy.pmReport}
                        </CardTitle>
                        <CardDescription className="font-cairo">{copy.operationalSummaryHint}</CardDescription>
                    </div>
                    {onPrintReport ? (
                        <Button onClick={onPrintReport} variant="outline">
                            <Printer className="me-2 h-4 w-4" />
                            {copy.printPdf}
                        </Button>
                    ) : null}
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <OperationalCard label={copy.pmCompliance} value={percentLabel(stats?.compliance_rate)} hint={copy.completedOnTimeHint} icon={CheckCircle2} tone="success" />
                    <OperationalCard label={copy.overdueWorkOrders} value={overdue.length} hint={copy.overdueHint} icon={AlertTriangle} tone={overdue.length > 0 ? 'danger' : 'default'} />
                    <OperationalCard label={copy.dueSoon} value={dueSoon.length} hint={copy.dueTodayHint} icon={Clock3} tone="warning" />
                    <OperationalCard label={copy.generatedWorkOrders} value={metrics.workOrdersGenerated} hint={copy.generatedWorkOrdersHint} icon={ClipboardCheck} />
                </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <ReportList title={copy.overdueWorkOrders} rows={overdue} copy={copy} isAr={isAr} locale={locale} tone="danger" />
                <ReportList title={copy.dueSoon} rows={dueSoon} copy={copy} isAr={isAr} locale={locale} tone="warning" />
                <ReportList title={copy.completedOnTime} rows={completedOnTime} copy={copy} isAr={isAr} locale={locale} tone="success" />
                <ReportList title={copy.completedLate} rows={completedLate} copy={copy} isAr={isAr} locale={locale} tone="warning" />
            </div>
        </div>
    )
}

export function ModeBadge({ mode, copy }: { mode: PMGenerationMode; copy: PMCopy }) {
    return (
        <Badge className={cn('border', mode === 'per_asset' ? 'bg-sky-500/15 text-sky-700 border-sky-500/20' : 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20')}>
            {modeLabel(mode, copy)}
        </Badge>
    )
}

function OperationalCard({
    label,
    value,
    hint,
    icon: Icon,
    tone = 'default',
}: {
    label: string
    value: number | string
    hint: string
    icon: React.ElementType
    tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
    const toneClass = tone === 'success'
        ? 'bg-emerald-500/10 text-emerald-700'
        : tone === 'warning'
            ? 'bg-amber-500/10 text-amber-700'
            : tone === 'danger'
                ? 'bg-rose-500/10 text-rose-700'
                : 'bg-primary/10 text-primary'

    return (
        <div className="flex min-h-[118px] items-start justify-between gap-3 rounded-md border bg-background p-4">
            <div className="min-w-0">
                <p className="text-sm font-semibold font-cairo">{label}</p>
                <p className="mt-1 text-3xl font-bold" dir="ltr">{value}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground font-cairo">{hint}</p>
            </div>
            <div className={cn('shrink-0 rounded-md p-2.5', toneClass)}>
                <Icon className="h-4 w-4" />
            </div>
        </div>
    )
}

function ReportList({
    title,
    rows,
    copy,
    isAr,
    locale,
    tone,
}: {
    title: string
    rows: PMWorkOrder[]
    copy: PMCopy
    isAr: boolean
    locale: string
    tone: 'success' | 'warning' | 'danger'
}) {
    const toneClass = tone === 'success'
        ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20'
        : tone === 'danger'
            ? 'bg-rose-500/15 text-rose-700 border-rose-500/20'
            : 'bg-amber-500/15 text-amber-700 border-amber-500/20'

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between gap-3">
                    <CardTitle className="font-cairo">{title}</CardTitle>
                    <Badge className={cn('border', toneClass)}>{rows.length}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {rows.length === 0 ? (
                    <p className="py-5 text-center text-sm text-muted-foreground font-cairo">{copy.noData}</p>
                ) : rows.slice(0, 6).map((wo) => (
                    <div key={wo.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <p className="font-medium font-cairo">{wo.title}</p>
                                <p className="mt-1 font-mono text-xs text-muted-foreground">{wo.code}</p>
                            </div>
                            <Badge className={cn('border', statusClass(wo.status))}>{statusLabel(wo.status, copy)}</Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                            <span className="font-cairo">{copy.sourceSchedule}: {wo.source_schedule ? displayName(wo.source_schedule, isAr) : wo.source_schedule_id ?? '-'}</span>
                            <span className="font-cairo">{copy.deadline}: {wo.compliance_deadline ? formatDate(wo.compliance_deadline, locale) : '-'}</span>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

export function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-cairo">{label}</p>
            <p className="text-sm font-medium" dir="auto">{value}</p>
        </div>
    )
}

export function EmptyState({
    copy,
    icon: Icon,
    title,
    description,
    action,
}: {
    copy: PMCopy
    icon: React.ElementType
    title?: string
    description?: string
    action?: React.ReactNode
}) {
    return (
        <Card>
            <CardContent className="py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-cairo text-base font-semibold">{title ?? copy.noData}</p>
                {description ? <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground font-cairo">{description}</p> : null}
                {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
            </CardContent>
        </Card>
    )
}
