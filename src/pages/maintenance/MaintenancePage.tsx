import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    ClipboardCheck,
    FileText,
    Loader2,
    PlayCircle,
    Route,
    Search,
    ShieldCheck,
    Timer,
} from 'lucide-react'
import { toast } from 'sonner'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ExecutionDialog from '@/components/maintenance/ExecutionDialog'
import {
    DashboardPanel,
    JobPlansPanel,
    ReportsPanel,
    SchedulesPanel,
    WorkOrdersPanel,
} from '@/components/maintenance/FoundationPMPanels'
import JobPlanDialog from '@/components/maintenance/JobPlanDialog'
import ScheduleDialog from '@/components/maintenance/ScheduleDialog'
import { ar, displayName, en, fillCount, statusLabel } from '@/components/maintenance/foundationPmUtils'
import { useAssets } from '@/hooks/useAssets'
import { useModuleAccess, useTenantModules } from '@/hooks/useTenantModules'
import { usePermission } from '@/hooks/usePermission'
import type { PMGenerateResult, PMJobPlan, PMJobPlanInput, PMSchedule, PMScheduleInput, PMWorkOrder } from '@/hooks/usePMFoundation'
import {
    fetchPMWorkOrderDetail,
    usePMComplianceStats,
    usePMGenerateWorkOrders,
    usePMJobPlans,
    usePMSchedules,
    usePMWorkOrders,
} from '@/hooks/usePMFoundation'
import { cn } from '@/lib/utils'
import {
    openPMPrintWindow,
    printPMOperationalReport,
    printPMWorkOrder,
} from '@/utils/pmFoundationPrint'

type TabKey = 'dashboard' | 'job-plans' | 'schedules' | 'work-orders' | 'reports'

function dateOnlyTime(value: string | null | undefined) {
    if (!value) return null
    const date = new Date(`${value.slice(0, 10)}T00:00:00`)
    return Number.isNaN(date.getTime()) ? null : date.getTime()
}

export default function MaintenancePage() {
    const navigate = useNavigate()
    const { i18n } = useTranslation()
    const isAr = i18n.language === 'ar'
    const copy = isAr ? ar : en
    const locale = isAr ? 'ar-SA' : 'en-US'
    const { can } = usePermission()
    const canManage = can('maintenance.manage')
    const { isLoading: modulesLoading } = useTenantModules()
    const maintenanceEnabled = useModuleAccess('maintenance')

    const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
    const [search, setSearch] = useState('')
    const [planDialogOpen, setPlanDialogOpen] = useState(false)
    const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
    const [editingPlan, setEditingPlan] = useState<PMJobPlan | null>(null)
    const [editingSchedule, setEditingSchedule] = useState<PMSchedule | null>(null)
    const [executingWorkOrder, setExecutingWorkOrder] = useState<PMWorkOrder | null>(null)
    const [lastGenerateResult, setLastGenerateResult] = useState<PMGenerateResult | null>(null)
    const [workOrderStatusFilter, setWorkOrderStatusFilter] = useState('all')
    const [workOrderModeFilter, setWorkOrderModeFilter] = useState('all')
    const [workOrderAssetFilter, setWorkOrderAssetFilter] = useState('all')
    const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null)
    const [archiveTarget, setArchiveTarget] = useState<{ type: 'plan' | 'schedule'; id: string; label: string } | null>(null)

    const { data: assets = [], isLoading: assetsLoading } = useAssets()
    const {
        jobPlans,
        isLoading: plansLoading,
        error: plansError,
        createJobPlan,
        updateJobPlan,
        archiveJobPlan,
        isSaving: planSaving,
    } = usePMJobPlans()
    const {
        schedules,
        isLoading: schedulesLoading,
        error: schedulesError,
        createSchedule,
        updateSchedule,
        archiveSchedule,
        isSaving: scheduleSaving,
    } = usePMSchedules()
    const { generateDueWorkOrders, isGenerating } = usePMGenerateWorkOrders()
    const { data: workOrders = [], isLoading: workOrdersLoading, error: workOrdersError } = usePMWorkOrders()
    const { data: complianceStats, isLoading: statsLoading } = usePMComplianceStats()

    const lowerSearch = search.trim().toLowerCase()
    const filteredPlans = useMemo(() => jobPlans.filter((plan) => {
        if (!lowerSearch) return true
        return [plan.code, plan.name, plan.name_ar, plan.category, plan.required_skill, plan.required_role]
            .some((value) => value?.toLowerCase().includes(lowerSearch))
    }), [jobPlans, lowerSearch])

    const filteredSchedules = useMemo(() => schedules.filter((schedule) => {
        if (!lowerSearch) return true
        return [schedule.code, schedule.name, schedule.name_ar, schedule.job_plan?.name, schedule.job_plan?.name_ar]
            .some((value) => value?.toLowerCase().includes(lowerSearch))
    }), [lowerSearch, schedules])

    const pmAssets = useMemo(() => {
        const map = new Map<string, { id: string; label: string }>()
        workOrders.forEach((wo) => {
            wo.work_order_assets?.forEach((assetRow) => {
                if (!assetRow.asset) return
                map.set(assetRow.asset.id, {
                    id: assetRow.asset.id,
                    label: `${assetRow.asset.code} - ${displayName(assetRow.asset, isAr)}`,
                })
            })
        })
        return Array.from(map.values())
    }, [isAr, workOrders])

    const filteredWorkOrders = useMemo(() => workOrders.filter((wo) => {
        const generationMode = wo.source_schedule?.generation_mode ?? (wo.source_schedule_asset_id ? 'per_asset' : 'batch_route')
        const matchesSearch = !lowerSearch || [wo.code, wo.title, wo.source_schedule_id, wo.source_schedule?.name, wo.source_schedule?.name_ar]
            .some((value) => value?.toLowerCase().includes(lowerSearch))
        const matchesStatus = workOrderStatusFilter === 'all' || wo.status === workOrderStatusFilter
        const matchesMode = workOrderModeFilter === 'all' || generationMode === workOrderModeFilter
        const matchesAsset = workOrderAssetFilter === 'all' || wo.work_order_assets?.some((asset) => asset.asset_id === workOrderAssetFilter)
        return matchesSearch && matchesStatus && matchesMode && matchesAsset
    }), [lowerSearch, workOrderAssetFilter, workOrderModeFilter, workOrderStatusFilter, workOrders])

    const dashboard = useMemo(() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayTime = today.getTime()
        const activeSchedules = schedules.filter((schedule) => schedule.status === 'active')
        const completedLate = workOrders.filter((wo) =>
            wo.status === 'completed' &&
            wo.completed_at &&
            wo.compliance_deadline &&
            new Date(wo.completed_at).setHours(0, 0, 0, 0) > new Date(wo.compliance_deadline).setHours(0, 0, 0, 0)
        ).length
        const overdueWorkOrders = workOrders.filter((wo) => {
            if (wo.status === 'completed' || wo.status === 'cancelled' || wo.status === 'auto_closed') return false
            const deadline = dateOnlyTime(wo.compliance_deadline)
            return deadline !== null && deadline < todayTime
        }).length

        return {
            activePlans: jobPlans.filter((plan) => plan.status === 'active').length,
            activeSchedules: activeSchedules.length,
            dueToday: activeSchedules.filter((schedule) => dateOnlyTime(schedule.next_due_date) === todayTime).length,
            overdue: complianceStats?.overdue ?? overdueWorkOrders,
            dueSoon: complianceStats?.due_soon ?? 0,
            workOrdersGenerated: workOrders.length,
            completedOnTime: complianceStats?.completed_on_time ?? 0,
            completedLate,
            complianceRate: complianceStats?.compliance_rate,
        }
    }, [complianceStats, jobPlans, schedules, workOrders])

    const isLoading = modulesLoading || plansLoading || schedulesLoading || workOrdersLoading || statsLoading || assetsLoading
    const error = plansError || schedulesError || (workOrdersError instanceof Error ? workOrdersError.message : null)

    const handleSavePlan = async (input: PMJobPlanInput) => {
        try {
            if (editingPlan) {
                await updateJobPlan({ id: editingPlan.id, input })
                toast.success(isAr ? 'تم تحديث القالب' : 'Job plan updated')
            } else {
                await createJobPlan(input)
                toast.success(isAr ? 'تم إنشاء القالب' : 'Job plan created')
            }
            setPlanDialogOpen(false)
            setEditingPlan(null)
        } catch (saveError) {
            const message = saveError instanceof Error && saveError.message === 'JOB_PLAN_ITEMS_LOCKED_BY_OPEN_WORK_ORDERS'
                ? copy.checklistLockedByOpenWos
                : saveError instanceof Error ? saveError.message : copy.executionError
            toast.error(message)
        }
    }

    const handleSaveSchedule = async (input: PMScheduleInput) => {
        if (editingSchedule) {
            await updateSchedule({ id: editingSchedule.id, input })
            toast.success(isAr ? 'تم تحديث الجدول' : 'Schedule updated')
        } else {
            await createSchedule(input)
            toast.success(isAr ? 'تم إنشاء الجدول' : 'Schedule created')
        }
        setScheduleDialogOpen(false)
        setEditingSchedule(null)
    }

    const handleGenerateNow = async () => {
        try {
            const result = await generateDueWorkOrders()
            const generated = result.generated ?? 0
            setLastGenerateResult(result)

            if (generated > 0) {
                toast.success(fillCount(copy.generatedWorkOrdersMessage, generated))
                setActiveTab('work-orders')
                return
            }

            toast(copy.noWorkOrdersGeneratedMessage)
        } catch (generateError) {
            const message = generateError instanceof Error ? generateError.message : copy.generationFailed
            toast.error(`${copy.generationFailed}: ${message}`)
        }
    }

    const handlePrintWorkOrder = async (wo: PMWorkOrder, kind: 'work_order' | 'execution') => {
        const title = kind === 'execution' ? copy.executionReportPdf : copy.workOrderPdf
        const printWindow = openPMPrintWindow(title)
        if (!printWindow) {
            toast.error(isAr ? 'تعذر فتح نافذة الطباعة' : 'Could not open print window')
            return
        }

        setPdfLoadingId(wo.id)
        try {
            const detail = await fetchPMWorkOrderDetail(wo.id)
            printPMWorkOrder(printWindow, detail, kind, { copy, isAr, locale })
        } catch (printError) {
            printWindow.close()
            const message = printError instanceof Error ? printError.message : copy.executionError
            toast.error(message)
        } finally {
            setPdfLoadingId(null)
        }
    }

    const handlePrintPMReport = () => {
        const printWindow = openPMPrintWindow(copy.pmReport)
        if (!printWindow) {
            toast.error(isAr ? 'تعذر فتح نافذة الطباعة' : 'Could not open print window')
            return
        }

        printPMOperationalReport(printWindow, {
            copy,
            isAr,
            locale,
            metrics: dashboard,
            stats: complianceStats,
            workOrders,
        })
    }

    const handleArchiveConfirm = async () => {
        if (!archiveTarget) return

        try {
            if (archiveTarget.type === 'plan') {
                await archiveJobPlan(archiveTarget.id)
                toast.success(isAr ? 'تمت أرشفة القالب' : 'Job plan archived')
            } else {
                await archiveSchedule(archiveTarget.id)
                toast.success(isAr ? 'تمت أرشفة الجدول' : 'Schedule archived')
            }
        } finally {
            setArchiveTarget(null)
        }
    }

    if (isLoading) {
        return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ms-3 font-cairo">{copy.loading}</span></div>
    }

    if (!maintenanceEnabled) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-600" />
                    <p className="font-cairo text-muted-foreground">{copy.moduleDisabled}</p>
                </CardContent>
            </Card>
        )
    }

    if (error) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
                    <p className="font-cairo text-muted-foreground">{error}</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <JobPlanDialog
                open={planDialogOpen}
                onOpenChange={(open) => {
                    setPlanDialogOpen(open)
                    if (!open) setEditingPlan(null)
                }}
                plan={editingPlan}
                copy={copy}
                isAr={isAr}
                isSaving={planSaving}
                onSave={handleSavePlan}
            />
            <ScheduleDialog
                open={scheduleDialogOpen}
                onOpenChange={(open) => {
                    setScheduleDialogOpen(open)
                    if (!open) setEditingSchedule(null)
                }}
                schedule={editingSchedule}
                copy={copy}
                isAr={isAr}
                isSaving={scheduleSaving}
                jobPlans={jobPlans.filter((plan) => plan.status === 'active')}
                assets={assets.map((asset) => ({
                    id: asset.id,
                    code: asset.code,
                    name: asset.name,
                    name_ar: asset.name_ar,
                    building_id: asset.building_id,
                    building: asset.building ?? null,
                }))}
                onSave={handleSaveSchedule}
            />
            <ExecutionDialog
                open={!!executingWorkOrder}
                onOpenChange={(open) => !open && setExecutingWorkOrder(null)}
                workOrder={executingWorkOrder}
                copy={copy}
                isAr={isAr}
                locale={locale}
            />
            <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-cairo">{copy.archiveConfirmTitle}</AlertDialogTitle>
                        <AlertDialogDescription className="font-cairo">
                            {copy.archiveConfirmDescription}
                            {archiveTarget?.label ? <span className="mt-2 block font-medium text-foreground">{archiveTarget.label}</span> : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void handleArchiveConfirm()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {copy.archiveConfirmAction}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="space-y-6">
                <PageHeader
                    icon={<CalendarClock className="h-5 w-5" />}
                    title={copy.title}
                    description={copy.subtitle}
                    actions={(
                        <>
                        {canManage ? (
                            <Button onClick={handleGenerateNow} disabled={isGenerating} className="gap-2">
                                <PlayCircle className="me-2 h-4 w-4" />
                                {isGenerating ? copy.generating : copy.generateNow}
                            </Button>
                        ) : null}
                        {canManage ? (
                            <Button variant="outline" className="gap-2" onClick={() => { setEditingPlan(null); setPlanDialogOpen(true); setActiveTab('job-plans') }}>
                                <FileText className="me-2 h-4 w-4" />{copy.createJobPlan}
                            </Button>
                        ) : null}
                        {canManage ? (
                            <Button variant="outline" className="gap-2" onClick={() => { setEditingSchedule(null); setScheduleDialogOpen(true); setActiveTab('schedules') }}>
                                <CalendarClock className="me-2 h-4 w-4" />{copy.createSchedule}
                            </Button>
                        ) : null}
                        </>
                    )}
                />

                <div className="grid gap-2 rounded-lg border bg-card p-3 shadow-card md:grid-cols-4">
                    {[
                        { label: copy.workflowPlan, icon: FileText },
                        { label: copy.workflowSchedule, icon: CalendarClock },
                        { label: copy.workflowGenerate, icon: PlayCircle },
                        { label: copy.workflowExecute, icon: Route },
                    ].map((step, index) => {
                        const StepIcon = step.icon
                        return (
                            <div key={step.label} className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" dir="ltr">
                                    {index + 1}
                                </div>
                                <StepIcon className="h-4 w-4 shrink-0 text-primary" />
                                <span className="text-sm font-medium font-cairo">{step.label}</span>
                            </div>
                        )
                    })}
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <Metric title={copy.activeSchedules} value={dashboard.activeSchedules} description={copy.activeSchedulesHint} icon={CalendarClock} />
                    <Metric title={copy.dueToday} value={dashboard.dueToday} description={copy.dueTodayHint} icon={Timer} tone={dashboard.dueToday > 0 ? 'warning' : 'default'} />
                    <Metric title={copy.overdue} value={dashboard.overdue} description={copy.overdueHint} icon={AlertTriangle} tone={dashboard.overdue > 0 ? 'danger' : 'default'} />
                    <Metric title={copy.generatedWorkOrders} value={dashboard.workOrdersGenerated} description={copy.generatedWorkOrdersHint} icon={ClipboardCheck} />
                    <Metric title={copy.completedOnTime} value={dashboard.completedOnTime} description={copy.completedOnTimeHint} icon={CheckCircle2} tone="success" />
                    <Metric title={copy.completedLate} value={dashboard.completedLate} description={copy.completedLateHint} icon={ShieldCheck} tone={dashboard.completedLate > 0 ? 'warning' : 'default'} />
                </div>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)} className="space-y-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <TabsList className="grid w-full max-w-4xl grid-cols-5">
                            <TabsTrigger value="dashboard">{copy.dashboard}</TabsTrigger>
                            <TabsTrigger value="job-plans">{copy.jobPlans}</TabsTrigger>
                            <TabsTrigger value="schedules">{copy.schedules}</TabsTrigger>
                            <TabsTrigger value="work-orders">{copy.workOrders}</TabsTrigger>
                            <TabsTrigger value="reports">{copy.reports}</TabsTrigger>
                        </TabsList>
                        <div className="relative w-full xl:max-w-sm">
                            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="ps-9" />
                        </div>
                    </div>

                    <TabsContent value="dashboard">
                        <DashboardPanel copy={copy} metrics={dashboard} stats={complianceStats} />
                    </TabsContent>

                    <TabsContent value="job-plans">
                        <JobPlansPanel
                            copy={copy}
                            isAr={isAr}
                            canManage={canManage}
                            plans={filteredPlans}
                            hasAnyPlans={jobPlans.length > 0}
                            onOpen={(plan) => navigate(`/maintenance/job-plans/${plan.id}`)}
                            onEdit={(plan) => { setEditingPlan(plan); setPlanDialogOpen(true) }}
                            onArchive={(plan) => setArchiveTarget({ type: 'plan', id: plan.id, label: displayName(plan, isAr) })}
                        />
                    </TabsContent>

                    <TabsContent value="schedules">
                        <SchedulesPanel
                            copy={copy}
                            isAr={isAr}
                            locale={locale}
                            canManage={canManage}
                            schedules={filteredSchedules}
                            hasAnySchedules={schedules.length > 0}
                            lastGenerateResult={lastGenerateResult}
                            isGenerating={isGenerating}
                            onGenerate={handleGenerateNow}
                            onOpen={(schedule) => navigate(`/maintenance/schedules/${schedule.id}`)}
                            onEdit={(schedule) => { setEditingSchedule(schedule); setScheduleDialogOpen(true) }}
                            onArchive={(schedule) => setArchiveTarget({ type: 'schedule', id: schedule.id, label: displayName(schedule, isAr) })}
                        />
                    </TabsContent>

                    <TabsContent value="work-orders" className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3 xl:flex xl:flex-wrap">
                            <Select value={workOrderStatusFilter} onValueChange={setWorkOrderStatusFilter}>
                                <SelectTrigger className="xl:w-[190px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{copy.all}</SelectItem>
                                    {Array.from(new Set(workOrders.map((wo) => wo.status))).map((status) => (
                                        <SelectItem key={status} value={status}>{statusLabel(status, copy)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={workOrderModeFilter} onValueChange={setWorkOrderModeFilter}>
                                <SelectTrigger className="xl:w-[190px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{copy.all}</SelectItem>
                                    <SelectItem value="batch_route">{copy.modeBatch}</SelectItem>
                                    <SelectItem value="per_asset">{copy.modePerAsset}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={workOrderAssetFilter} onValueChange={setWorkOrderAssetFilter}>
                                <SelectTrigger className="xl:w-[240px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{copy.all}</SelectItem>
                                    {pmAssets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <WorkOrdersPanel
                            copy={copy}
                            isAr={isAr}
                            locale={locale}
                            workOrders={filteredWorkOrders}
                            hasAnyWorkOrders={workOrders.length > 0}
                            canGenerate={canManage}
                            isGenerating={isGenerating}
                            onGenerate={handleGenerateNow}
                            onExecute={setExecutingWorkOrder}
                            onPrintWorkOrder={(wo) => void handlePrintWorkOrder(wo, 'work_order')}
                            onPrintExecutionReport={(wo) => void handlePrintWorkOrder(wo, 'execution')}
                            pdfLoadingId={pdfLoadingId}
                        />
                    </TabsContent>

                    <TabsContent value="reports">
                        <ReportsPanel
                            copy={copy}
                            isAr={isAr}
                            locale={locale}
                            metrics={dashboard}
                            stats={complianceStats}
                            workOrders={workOrders}
                            onPrintReport={handlePrintPMReport}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </>
    )
}

function Metric({
    title,
    value,
    description,
    icon: Icon,
    tone = 'default',
}: {
    title: string
    value: string | number
    description?: string
    icon: React.ElementType
    tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
    const toneClass = tone === 'success' ? 'bg-emerald-500/10 text-emerald-700' : tone === 'warning' ? 'bg-amber-500/10 text-amber-700' : tone === 'danger' ? 'bg-rose-500/10 text-rose-700' : 'bg-primary/10 text-primary'
    return (
        <Card className="overflow-hidden shadow-card">
            <CardContent className="flex min-h-[132px] items-start justify-between gap-4 p-5">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground font-cairo">{title}</p>
                    <p className="mt-1 text-3xl font-bold" dir="ltr">{value}</p>
                    {description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground font-cairo">{description}</p> : null}
                </div>
                <div className={cn('shrink-0 rounded-lg p-3', toneClass)}>
                    <Icon className="h-5 w-5" />
                </div>
            </CardContent>
        </Card>
    )
}
