import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Clock3,
    FileDown,
    Loader2,
    PauseCircle,
    PlayCircle,
    Plus,
    Repeat,
    Trash2,
    Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import AddMaintenanceTaskDialog from '@/components/maintenance/AddMaintenanceTaskDialog'
import FrequencyBundleDialog from '@/components/maintenance/FrequencyBundleDialog'
import PlanTargetDialog from '@/components/maintenance/PlanTargetDialog'
import TaskExecutionModal from '@/components/maintenance/TaskExecutionModal'
import { useMaintenancePlans } from '@/hooks/useMaintenancePlans'
import { useMaintenanceProgram } from '@/hooks/useMaintenanceProgram'
import { useMaintenanceTasks } from '@/hooks/useMaintenanceTasks'
import { usePermission } from '@/hooks/usePermission'
import { useModuleAccess, useTenantModules } from '@/hooks/useTenantModules'
import {
    getNextPlanStatuses,
    getPlanStatusClass,
    getPriorityClass,
    getTaskStatusClass,
    isTaskOverdue,
} from '@/lib/pm'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type {
    MaintenanceFrequencyBundle,
    MaintenancePlanTarget,
    MaintenanceTask,
} from '@/types/maintenance'

// Legacy PM detail page. Public routing is intentionally disabled; the active
// source of truth is job_plans / pm_schedules. See docs/maintenance/pm-legacy-deprecation.md.
// 'delete' is handled from the main list page only; this page shows lifecycle transitions.
type PlanAction = Exclude<ReturnType<typeof getNextPlanStatuses>[number], 'delete'>

type ConfirmState = {
    open: boolean
    title: string
    description: string
    action: (() => Promise<void>) | null
}

export default function MaintenancePlanDetailsPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { t, i18n } = useTranslation()
    const locale = i18n.language === 'ar' ? 'ar-SA' : 'en-US'
    const isRTL = i18n.language === 'ar'
    const { can } = usePermission()
    const canManage = can('maintenance.manage')
    const { isLoading: modulesLoading } = useTenantModules()
    const maintenanceEnabled = useModuleAccess('maintenance')
    const [isAddTaskOpen, setIsAddTaskOpen] = useState(false)
    const [taskBundleId, setTaskBundleId] = useState<string | null>(null)
    const [isTargetDialogOpen, setIsTargetDialogOpen] = useState(false)
    const [isBundleDialogOpen, setIsBundleDialogOpen] = useState(false)
    const [editingBundle, setEditingBundle] = useState<MaintenanceFrequencyBundle | null>(null)
    const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null)
    const [isTaskExecutionOpen, setIsTaskExecutionOpen] = useState(false)
    const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false, title: '', description: '', action: null })
    const [confirmLoading, setConfirmLoading] = useState(false)

    const {
        plans,
        isLoading: plansLoading,
        error: plansError,
        activatePlan,
        pausePlan,
        resumePlan,
        completePlan,
        archivePlan,
    } = useMaintenancePlans()
    const { tasks, isLoading: tasksLoading, error: tasksError } = useMaintenanceTasks(id ? { plan_id: id } : undefined)
    const {
        targets,
        bundles,
        isLoading: programLoading,
        error: programError,
        deleteTarget,
        deleteBundle,
    } = useMaintenanceProgram(id)

    const plan = useMemo(() => plans.find((item) => item.id === id) ?? null, [id, plans])

    const stats = useMemo(() => {
        const totalTasks = tasks.length
        const completedTasks = tasks.filter((task) => task.status === 'completed').length
        const inProgressTasks = tasks.filter((task) => task.status === 'in_progress').length
        const overdueTasks = tasks.filter(isTaskOverdue).length

        return {
            totalTasks,
            completedTasks,
            inProgressTasks,
            overdueTasks,
            completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : Number(plan?.completion_rate ?? 0),
        }
    }, [plan?.completion_rate, tasks])

    const assetSummary = useMemo(() => {
        const map = new Map<string, { id: string; label: string; total: number; completed: number }>()
        tasks.forEach((task) => {
            if (!task.asset) return
            const current = map.get(task.asset.id)
            const label = `${task.asset.code} - ${isRTL ? task.asset.name_ar || task.asset.name : task.asset.name}`
            if (!current) {
                map.set(task.asset.id, {
                    id: task.asset.id,
                    label,
                    total: 1,
                    completed: task.status === 'completed' ? 1 : 0,
                })
                return
            }
            current.total += 1
            if (task.status === 'completed') current.completed += 1
        })
        return Array.from(map.values())
    }, [isRTL, tasks])

    const targetLabel = (target: MaintenancePlanTarget) => {
        if (target.target_type === 'asset' && target.asset) {
            return `${target.asset.code} - ${isRTL ? target.asset.name_ar || target.asset.name : target.asset.name}`
        }
        if (target.target_type === 'building' && target.building) {
            return isRTL ? target.building.name_ar || target.building.name : target.building.name
        }
        if (target.target_type === 'asset_group' && target.assetGroup) {
            return `${target.assetGroup.code ? `${target.assetGroup.code} - ` : ''}${isRTL ? target.assetGroup.name_ar || target.assetGroup.name : target.assetGroup.name}`
        }
        return t('common.noData')
    }

    const bundleLabel = (bundle: MaintenanceFrequencyBundle) =>
        isRTL ? bundle.name_ar || bundle.name : bundle.name

    const isLoading = modulesLoading || plansLoading || tasksLoading || programLoading
    const error = plansError || tasksError || programError

    const openConfirm = (title: string, description: string, action: () => Promise<void>) => {
        setConfirmState({ open: true, title, description, action })
    }

    const closeConfirm = () => {
        setConfirmState({ open: false, title: '', description: '', action: null })
        setConfirmLoading(false)
    }

    const runConfirmedAction = async () => {
        if (!confirmState.action) return
        try {
            setConfirmLoading(true)
            await confirmState.action()
            closeConfirm()
        } catch (actionError) {
            toast.error(actionError instanceof Error ? actionError.message : t('pm.error.plan_update_failed'))
            setConfirmLoading(false)
        }
    }

    const handlePlanAction = (action: PlanAction) => {
        if (!plan) return

        const runners: Record<PlanAction, () => Promise<void>> = {
            activate: async () => { await activatePlan(plan.id); toast.success(t('pm.success.plan_activated')) },
            pause: async () => { await pausePlan(plan.id); toast.success(t('pm.success.plan_paused')) },
            resume: async () => { await resumePlan(plan.id); toast.success(t('pm.success.plan_resumed')) },
            complete: async () => { await completePlan(plan.id); toast.success(t('pm.success.plan_completed')) },
            archive: async () => { await archivePlan(plan.id); toast.success(t('pm.success.plan_archived')) },
        }

        const confirmations: Record<PlanAction, string> = {
            activate: t('pm.confirm.activate_plan'),
            pause: t('pm.confirm.pause_plan'),
            resume: t('pm.confirm.resume_plan'),
            complete: t('pm.confirm.complete_plan'),
            archive: t('pm.confirm.archive_plan'),
        }

        openConfirm(t(`pm.plans.${action === 'complete' ? 'complete' : action}`), confirmations[action], runners[action])
    }

    const handleDeleteTarget = (target: MaintenancePlanTarget) => {
        openConfirm(t('pm.targets.delete'), t('pm.confirm.delete_target'), async () => {
            await deleteTarget(target.id)
            toast.success(t('pm.success.target_removed'))
        })
    }

    const handleDeleteBundle = (bundle: MaintenanceFrequencyBundle) => {
        openConfirm(t('pm.bundles.delete'), t('pm.confirm.delete_bundle'), async () => {
            await deleteBundle(bundle.id)
            toast.success(t('pm.success.bundle_deleted'))
        })
    }

    const openTaskFromBundle = (bundle: MaintenanceFrequencyBundle) => {
        setTaskBundleId(bundle.id)
        setIsAddTaskOpen(true)
    }

    if (isLoading) {
        return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
    }

    if (!maintenanceEnabled) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-warning" />
                    <p className="font-cairo text-muted-foreground">{t('pm.module_disabled')}</p>
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

    if (!plan) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
                    <p className="font-cairo text-muted-foreground">{t('common.noData')}</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <AddMaintenanceTaskDialog
                isOpen={canManage && isAddTaskOpen}
                onClose={() => {
                    setIsAddTaskOpen(false)
                    setTaskBundleId(null)
                }}
                planId={id}
                bundleId={taskBundleId}
            />
            {id ? <PlanTargetDialog isOpen={canManage && isTargetDialogOpen} onClose={() => setIsTargetDialogOpen(false)} planId={id} /> : null}
            {id ? (
                <FrequencyBundleDialog
                    isOpen={canManage && isBundleDialogOpen}
                    onClose={() => {
                        setIsBundleDialogOpen(false)
                        setEditingBundle(null)
                    }}
                    planId={id}
                    bundle={editingBundle}
                />
            ) : null}
            <TaskExecutionModal task={selectedTask} isOpen={isTaskExecutionOpen} onClose={() => { setIsTaskExecutionOpen(false); setSelectedTask(null) }} />

            <AlertDialog open={confirmState.open} onOpenChange={(open) => !open && closeConfirm()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-cairo">{confirmState.title}</AlertDialogTitle>
                        <AlertDialogDescription className="font-cairo">{confirmState.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel disabled={confirmLoading}>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void runConfirmedAction()} disabled={confirmLoading}>
                            {confirmLoading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                            {t('common.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="space-y-6">
                <div className="flex items-start gap-4">
                    <Button variant="outline" size="icon" onClick={() => navigate('/maintenance')}>
                        {isRTL ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
                    </Button>
                    <div className="flex-1 space-y-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={cn('border', getPlanStatusClass(plan.status))}>{t(`pm.plans.status.${plan.status}`)}</Badge>
                                    <Badge className={cn('border', getPriorityClass(plan.priority))}>{t(`pm.plans.priority.${plan.priority}`)}</Badge>
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold font-cairo text-primary">{isRTL ? plan.name_ar || plan.name : plan.name}</h1>
                                    {plan.code ? <p className="mt-1 font-mono text-sm text-muted-foreground">{plan.code}</p> : null}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {canManage ? <Button variant="outline" disabled title={t('pm.plans.export_pdf_coming_soon')}><FileDown className="me-2 h-4 w-4" />{t('pm.plans.export_pdf')}</Button> : null}
                                {canManage ? <Button onClick={() => setIsAddTaskOpen(true)}><Plus className="me-2 h-4 w-4" />{t('pm.tasks.create')}</Button> : null}
                            </div>
                        </div>
                        {canManage ? (
                            <div className="flex flex-wrap gap-2">
                                {(getNextPlanStatuses(plan.status).filter((a) => a !== 'delete') as PlanAction[]).map((action) => (
                                    <Button
                                        key={action}
                                        variant={action === 'complete' ? 'default' : 'outline'}
                                        onClick={() => handlePlanAction(action)}
                                    >
                                        {action === 'activate' || action === 'resume' ? <PlayCircle className="me-2 h-4 w-4" /> : null}
                                        {action === 'pause' ? <PauseCircle className="me-2 h-4 w-4" /> : null}
                                        {action === 'complete' ? <CheckCircle2 className="me-2 h-4 w-4" /> : null}
                                        {action === 'archive' ? <Clock3 className="me-2 h-4 w-4" /> : null}
                                        {t(`pm.plans.${action === 'complete' ? 'complete' : action}`)}
                                    </Button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard title={t('pm.plans.total_tasks')} value={stats.totalTasks} icon={Wrench} />
                    <StatCard title={t('pm.plans.completed_tasks')} value={stats.completedTasks} icon={CheckCircle2} />
                    <StatCard title={t('pm.tasks.status.in_progress')} value={stats.inProgressTasks} icon={PlayCircle} />
                    <StatCard title={t('pm.plans.overdue_tasks')} value={stats.overdueTasks} icon={AlertTriangle} />
                </div>

                {canManage && targets.length === 0 && bundles.length === 0 && !programLoading ? (
                    <Card className="border-dashed bg-muted/30">
                        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
                            <div className="rounded-full bg-primary/10 p-4">
                                <Wrench className="h-8 w-8 text-primary" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="font-semibold font-cairo">{t('pm.plans.empty_setup_title')}</h3>
                                <p className="max-w-sm text-sm text-muted-foreground font-cairo">{t('pm.plans.empty_setup_description')}</p>
                            </div>
                            <div className="flex flex-wrap justify-center gap-3">
                                <Button onClick={() => setIsTargetDialogOpen(true)}>
                                    <Plus className="me-2 h-4 w-4" />
                                    {t('pm.plans.add_targets')}
                                </Button>
                                <Button variant="outline" onClick={() => { setEditingBundle(null); setIsBundleDialogOpen(true) }}>
                                    <Plus className="me-2 h-4 w-4" />
                                    {t('pm.plans.add_bundle')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                        <CardHeader className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <CardTitle className="font-cairo">{t('pm.targets.title')}</CardTitle>
                                <p className="mt-1 text-sm text-muted-foreground font-cairo">{t('pm.targets.description')}</p>
                            </div>
                            {canManage ? (
                                <Button variant="outline" onClick={() => setIsTargetDialogOpen(true)}>
                                    <Plus className="me-2 h-4 w-4" />
                                    {t('pm.targets.add')}
                                </Button>
                            ) : null}
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {targets.length === 0 ? (
                                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground font-cairo">
                                    {t('pm.targets.empty')}
                                </p>
                            ) : (
                                targets.map((target) => (
                                    <div key={target.id} className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3">
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge variant="secondary">{t(`pm.targets.type_${target.target_type}`)}</Badge>
                                                {target.is_primary ? <Badge variant="outline">{t('pm.targets.primary')}</Badge> : null}
                                            </div>
                                            <p className="font-medium">{targetLabel(target)}</p>
                                            {target.role ? <p className="text-sm text-muted-foreground">{target.role}</p> : null}
                                        </div>
                                        {canManage ? (
                                            <Button size="icon" variant="ghost" onClick={() => handleDeleteTarget(target)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        ) : null}
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <CardTitle className="font-cairo">{t('pm.bundles.title')}</CardTitle>
                                <p className="mt-1 text-sm text-muted-foreground font-cairo">{t('pm.bundles.description')}</p>
                            </div>
                            {canManage ? (
                                <Button variant="outline" onClick={() => { setEditingBundle(null); setIsBundleDialogOpen(true) }}>
                                    <Plus className="me-2 h-4 w-4" />
                                    {t('pm.bundles.create')}
                                </Button>
                            ) : null}
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {bundles.length === 0 ? (
                                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground font-cairo">
                                    {t('pm.bundles.empty')}
                                </p>
                            ) : (
                                bundles.map((bundle) => (
                                    <div key={bundle.id} className="rounded-xl border px-4 py-3">
                                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant="secondary">
                                                        <Repeat className="me-1 h-3 w-3" />
                                                        {t(`pm.bundles.frequency_type.${bundle.frequency_type}`)}
                                                    </Badge>
                                                    <Badge variant={bundle.is_active ? 'outline' : 'secondary'}>
                                                        {bundle.is_active ? t('pm.bundles.active') : t('pm.bundles.inactive')}
                                                    </Badge>
                                                </div>
                                                <p className="font-medium">{bundleLabel(bundle)}</p>
                                                <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                                                    <span>{t('pm.templates.title')}: {bundle.checklistTemplate ? (isRTL ? bundle.checklistTemplate.name_ar || bundle.checklistTemplate.name : bundle.checklistTemplate.name) : t('common.none')}</span>
                                                    <span>{t('pm.tasks.team')}: {bundle.defaultTeam ? (isRTL ? bundle.defaultTeam.name_ar || bundle.defaultTeam.name : bundle.defaultTeam.name) : t('common.none')}</span>
                                                </div>
                                            </div>
                                            {canManage ? (
                                                <div className="flex flex-wrap gap-2">
                                                    <Button size="sm" onClick={() => openTaskFromBundle(bundle)}>
                                                        <Wrench className="me-2 h-4 w-4" />
                                                        {t('pm.tasks.create_from_bundle')}
                                                    </Button>
                                                    <Button size="sm" variant="outline" onClick={() => { setEditingBundle(bundle); setIsBundleDialogOpen(true) }}>
                                                        {t('common.edit')}
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => handleDeleteBundle(bundle)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="font-cairo">{t('pm.plans.completion_rate')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground font-cairo">{t('pm.plans.completion_rate')}</span>
                            <span dir="ltr">{stats.completionRate}%</span>
                        </div>
                        <div className="h-3 rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, stats.completionRate))}%` }} />
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                    <Card>
                        <CardHeader>
                            <CardTitle className="font-cairo">{t('common.details')}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <InfoLine
                                label={t('pm.plans.period')}
                                value={plan.start_date && plan.end_date ? `${formatDate(plan.start_date, locale)} - ${formatDate(plan.end_date, locale)}` : t('common.none')}
                            />
                            <InfoLine label={t('pm.plans.budget')} value={formatCurrency(plan.budget ?? 0, 'SAR', locale)} dir="ltr" />
                            <InfoLine label={t('pm.plans.priority_label')} value={t(`pm.plans.priority.${plan.priority}`)} />
                            <InfoLine label={t('pm.plans.building')} value={plan.building ? (isRTL ? plan.building.name_ar || plan.building.name : plan.building.name) : t('common.none')} />
                            <InfoLine label={t('common.description')} value={plan.description || t('common.none')} />
                            <InfoLine label={t('pm.plans.notes')} value={plan.notes || t('common.none')} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="font-cairo">{t('pm.asset.total_pm_tasks')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {assetSummary.length === 0 ? (
                                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground font-cairo">
                                    {t('common.noData')}
                                </p>
                            ) : (
                                assetSummary.map((asset) => (
                                    <button
                                        key={asset.id}
                                        type="button"
                                        className="w-full rounded-xl border px-4 py-3 text-start transition hover:border-primary/40 hover:bg-muted/20"
                                        onClick={() => navigate(`/assets/${asset.id}`)}
                                    >
                                        <p className="font-medium">{asset.label}</p>
                                        <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
                                            {asset.completed} / {asset.total}
                                        </p>
                                    </button>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <CardTitle className="font-cairo">{t('pm.tasks.title')}</CardTitle>
                        {canManage ? (
                            <Button onClick={() => setIsAddTaskOpen(true)}>
                                <Plus className="me-2 h-4 w-4" />
                                {t('pm.tasks.create')}
                            </Button>
                        ) : null}
                    </CardHeader>
                    <CardContent>
                        {tasks.length === 0 ? (
                            <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground font-cairo">
                                {t('pm.tasks.empty')}
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-muted/40">
                                        <tr>
                                            <HeaderCell>{t('pm.tasks.title')}</HeaderCell>
                                            <HeaderCell>{t('pm.tasks.asset')}</HeaderCell>
                                            <HeaderCell>{t('pm.tasks.building')}</HeaderCell>
                                            <HeaderCell>{t('pm.bundles.title')}</HeaderCell>
                                            <HeaderCell>{t('pm.templates.title')}</HeaderCell>
                                            <HeaderCell>{t('pm.tasks.due_date')}</HeaderCell>
                                            <HeaderCell>{t('common.status')}</HeaderCell>
                                            <HeaderCell>{t('common.actions')}</HeaderCell>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {tasks.map((task) => (
                                            <tr key={task.id} className="hover:bg-muted/20">
                                                <BodyCell>
                                                    <button
                                                        type="button"
                                                        className="text-start font-medium text-primary"
                                                        onClick={() => {
                                                            setSelectedTask(task)
                                                            setIsTaskExecutionOpen(true)
                                                        }}
                                                    >
                                                        {task.title}
                                                    </button>
                                                </BodyCell>
                                                <BodyCell>{task.asset ? `${task.asset.code} - ${isRTL ? task.asset.name_ar || task.asset.name : task.asset.name}` : t('common.none')}</BodyCell>
                                                <BodyCell>{task.building ? (isRTL ? task.building.name_ar || task.building.name : task.building.name) : t('common.none')}</BodyCell>
                                                <BodyCell>{task.frequencyBundle ? (isRTL ? task.frequencyBundle.name_ar || task.frequencyBundle.name : task.frequencyBundle.name) : t('common.none')}</BodyCell>
                                                <BodyCell>{task.checklistTemplate ? (isRTL ? task.checklistTemplate.name_ar || task.checklistTemplate.name : task.checklistTemplate.name) : t('common.none')}</BodyCell>
                                                <BodyCell>
                                                    <div className="space-y-1">
                                                        <span dir="ltr">{task.due_date ? formatDate(task.due_date, locale) : t('common.none')}</span>
                                                        {isTaskOverdue(task) ? <p className="text-xs text-destructive">{t('pm.tasks.overdue')}</p> : null}
                                                    </div>
                                                </BodyCell>
                                                <BodyCell>
                                                    <Badge className={cn('border', getTaskStatusClass(task.status))}>
                                                        {t(`pm.tasks.status.${task.status}`)}
                                                    </Badge>
                                                </BodyCell>
                                                <BodyCell>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            setSelectedTask(task)
                                                            setIsTaskExecutionOpen(true)
                                                        }}
                                                    >
                                                        {t('common.view')}
                                                    </Button>
                                                </BodyCell>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    )
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number; icon: React.ElementType }) {
    return (
        <Card>
            <CardContent className="flex items-center justify-between gap-4 p-5">
                <div className="space-y-1">
                    <p className="text-sm text-muted-foreground font-cairo">{title}</p>
                    <p className="text-3xl font-bold" dir="ltr">{value}</p>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <Icon className="h-6 w-6" />
                </div>
            </CardContent>
        </Card>
    )
}

function HeaderCell({ children }: { children: React.ReactNode }) {
    return <th className="px-4 py-3 text-start font-semibold font-cairo">{children}</th>
}

function BodyCell({ children }: { children: React.ReactNode }) {
    return <td className="px-4 py-3 align-top">{children}</td>
}

function InfoLine({
    label,
    value,
    dir,
}: {
    label: string
    value: string
    dir?: 'ltr' | 'rtl'
}) {
    return (
        <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-cairo">{label}</p>
            <p className="text-sm font-medium" dir={dir}>{value}</p>
        </div>
    )
}
