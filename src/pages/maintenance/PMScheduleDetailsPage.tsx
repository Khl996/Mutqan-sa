import { useMemo, useState } from 'react'
import type * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    CalendarClock,
    CalendarRange,
    ClipboardList,
    FileText,
    Loader2,
    MapPin,
    Pencil,
    Settings2,
    Timer,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import ScheduleDialog from '@/components/maintenance/ScheduleDialog'
import { Info, ModeBadge } from '@/components/maintenance/FoundationPMPanels'
import { ar, daysLabel, displayName, durationLabel, en, frequencyLabel, percentLabel, PMCopy, priorityLabel, statusClass, statusLabel } from '@/components/maintenance/foundationPmUtils'
import { useAssets } from '@/hooks/useAssets'
import { useModuleAccess, useTenantModules } from '@/hooks/useTenantModules'
import { usePermission } from '@/hooks/usePermission'
import type { PMSchedule, PMScheduleInput } from '@/hooks/usePMFoundation'
import { usePMJobPlans, usePMScheduleDetail, usePMScheduleForecast, usePMSchedules } from '@/hooks/usePMFoundation'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

export default function PMScheduleDetailsPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { i18n } = useTranslation()
    const isAr = i18n.language === 'ar'
    const locale = isAr ? 'ar-SA' : 'en-US'
    const copy = isAr ? ar : en
    const { can } = usePermission()
    const canManage = can('maintenance.manage')
    const { isLoading: modulesLoading } = useTenantModules()
    const maintenanceEnabled = useModuleAccess('maintenance')
    const [editOpen, setEditOpen] = useState(false)

    const { data: schedule, isLoading, error } = usePMScheduleDetail(id ?? null)
    const { jobPlans } = usePMJobPlans()
    const { updateSchedule, isSaving } = usePMSchedules()
    const { data: assets = [] } = useAssets()
    const { getForecast, forecastRows, isForecasting, forecastError } = usePMScheduleForecast()
    const [forecastRequested, setForecastRequested] = useState(false)

    const handleViewForecast = async () => {
        if (!schedule) return
        setForecastRequested(true)
        try {
            await getForecast({ scheduleId: schedule.id, occurrences: 6 })
        } catch {
            toast.error(copy.forecastFailed)
        }
    }

    const scheduleJobPlans = useMemo(() => {
        if (!schedule) return jobPlans.filter((plan) => plan.status === 'active')
        return jobPlans.filter((plan) => plan.status === 'active' || plan.id === schedule.job_plan_id)
    }, [jobPlans, schedule])

    const handleSave = async (input: PMScheduleInput) => {
        if (!schedule) return
        await updateSchedule({ id: schedule.id, input })
        toast.success(isAr ? 'تم تحديث جدول PM' : 'PM schedule updated')
        setEditOpen(false)
    }

    if (modulesLoading || isLoading) {
        return <LoadingState copy={copy} />
    }

    if (!maintenanceEnabled || error || !schedule) {
        return <ErrorState copy={copy} onBack={() => navigate('/maintenance')} />
    }

    const eligible = scheduleGenerationStatus(schedule)
    const assetCount = schedule.assets?.length ?? 0

    return (
        <>
            <ScheduleDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                schedule={schedule}
                copy={copy}
                isAr={isAr}
                isSaving={isSaving}
                jobPlans={scheduleJobPlans}
                assets={assets.map((asset) => ({
                    id: asset.id,
                    code: asset.code,
                    name: asset.name,
                    name_ar: asset.name_ar,
                    building_id: asset.building_id,
                    building: asset.building ?? null,
                }))}
                onSave={handleSave}
            />

            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <Button variant="ghost" className="px-0" onClick={() => navigate('/maintenance')}>
                            {isAr ? <ArrowRight className="me-2 h-4 w-4" /> : <ArrowLeft className="me-2 h-4 w-4" />}
                            {copy.backToMaintenance}
                        </Button>
                        <div>
                            <div className="mb-2 flex flex-wrap gap-2">
                                <Badge className={cn('border', statusClass(schedule.status))}>{statusLabel(schedule.status, copy)}</Badge>
                                <ModeBadge mode={schedule.generation_mode} copy={copy} />
                                <Badge className={cn('border', eligible ? 'bg-success/15 text-success border-success/20' : 'bg-muted/10 text-muted-foreground border-muted/20')}>
                                    {eligible ? copy.dueNow : copy.notDueYet}
                                </Badge>
                            </div>
                            <h1 className="text-3xl font-bold text-primary font-cairo">{displayName(schedule, isAr)}</h1>
                            {schedule.code ? <p className="mt-1 font-mono text-sm text-muted-foreground">{schedule.code}</p> : null}
                        </div>
                    </div>
                    {canManage ? (
                        <Button onClick={() => setEditOpen(true)}>
                            <Pencil className="me-2 h-4 w-4" />
                            {copy.editSchedule}
                        </Button>
                    ) : null}
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <main className="space-y-6">
                        <Section title={copy.basicInfo} icon={CalendarClock}>
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <Info label={copy.name} value={schedule.name} />
                                <Info label={copy.arabicName} value={schedule.name_ar || '-'} />
                                <Info label={copy.status} value={statusLabel(schedule.status, copy)} />
                                <Info label={copy.generationMode} value={schedule.generation_mode === 'per_asset' ? copy.modePerAsset : copy.modeBatch} />
                                <Info label={copy.defaultPriority} value={priorityLabel(schedule.default_priority, copy)} />
                                <Info label={copy.assetsLinked} value={String(assetCount)} />
                            </div>
                            {schedule.description ? <p className="mt-5 text-sm text-muted-foreground font-cairo">{schedule.description}</p> : null}
                        </Section>

                        <Section title={copy.jobPlan} icon={FileText}>
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="font-semibold font-cairo">{schedule.job_plan ? displayName(schedule.job_plan, isAr) : '-'}</p>
                                    <p className="mt-1 font-mono text-xs text-muted-foreground">{schedule.job_plan?.code ?? schedule.job_plan_id}</p>
                                </div>
                                {schedule.job_plan_id ? (
                                    <Button variant="outline" onClick={() => navigate(`/maintenance/job-plans/${schedule.job_plan_id}`)}>
                                        {copy.openDetails}
                                    </Button>
                                ) : null}
                            </div>
                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <Info label={copy.estimatedDuration} value={durationLabel(schedule.job_plan?.estimated_duration_minutes, copy)} />
                                <Info label={copy.checks} value={String(schedule.job_plan?.total_items ?? 0)} />
                            </div>
                        </Section>

                        <Section title={copy.linkedAssets} icon={MapPin}>
                            {schedule.assets?.length ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                    {schedule.assets.map((row) => (
                                        <div key={row.id} className="rounded-md border bg-background p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-semibold font-cairo">{row.asset ? displayName(row.asset, isAr) : row.asset_id}</p>
                                                    <p className="mt-1 font-mono text-xs text-muted-foreground">{row.asset?.code ?? row.asset_id}</p>
                                                </div>
                                                <Badge variant="outline" dir="ltr">#{row.sort_order}</Badge>
                                            </div>
                                            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                                                <span>{row.asset?.building ? displayName(row.asset.building, isAr) : '-'}</span>
                                                {row.notes ? <span>{row.notes}</span> : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="py-8 text-center text-sm text-muted-foreground font-cairo">{copy.noAssets}</p>
                            )}
                        </Section>

                        <Section title={copy.forecastTitle} icon={CalendarRange}>
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-sm text-muted-foreground font-cairo">{copy.forecastDisclaimer}</p>
                                    <Button variant="outline" onClick={handleViewForecast} disabled={isForecasting}>
                                        {isForecasting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <CalendarRange className="me-2 h-4 w-4" />}
                                        {copy.viewForecast}
                                    </Button>
                                </div>

                                {forecastRequested ? (
                                    forecastError ? (
                                        <p className="py-4 text-center text-sm text-destructive font-cairo">{copy.forecastFailed}</p>
                                    ) : isForecasting ? (
                                        <p className="py-4 text-center text-sm text-muted-foreground font-cairo">{copy.forecastLoading}</p>
                                    ) : forecastRows.length === 0 ? (
                                        <p className="py-4 text-center text-sm text-muted-foreground font-cairo">{copy.forecastEmpty}</p>
                                    ) : (
                                        <div className="overflow-x-auto rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>{copy.forecastOccurrence}</TableHead>
                                                        <TableHead>{copy.dueDate}</TableHead>
                                                        <TableHead>{copy.forecastDeferred}</TableHead>
                                                        <TableHead>{copy.forecastBlackoutLabel}</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {forecastRows.map((row) => (
                                                        <TableRow key={row.occurrence_number}>
                                                            <TableCell dir="ltr">{row.occurrence_number}</TableCell>
                                                            <TableCell>{formatDate(row.due_date, locale)}</TableCell>
                                                            <TableCell>
                                                                {row.deferred_by_blackout ? (
                                                                    <Badge className="border border-amber-500/20 bg-amber-500/15 text-amber-700">
                                                                        {copy.deferredBadge}
                                                                    </Badge>
                                                                ) : (
                                                                    '-'
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="font-cairo">{row.blackout_label ?? '-'}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )
                                ) : null}
                            </div>
                        </Section>
                    </main>

                    <aside className="space-y-6">
                        <Section title={copy.generationEngineSettings} icon={Settings2}>
                            <div className="space-y-4">
                                <Badge variant="outline" className="font-cairo">{copy.engineEnabledBadge}</Badge>
                                {schedule.master_template_id ? (
                                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 font-cairo">
                                        {copy.masterTemplateLinkedWarning}
                                    </div>
                                ) : null}
                                <div className="grid gap-4">
                                    <div className="space-y-1" title={(schedule.anchor_mode ?? 'fixed') === 'fixed' ? copy.anchorFixedHint : copy.anchorFloatingHint}>
                                        <p className="text-xs text-muted-foreground font-cairo">{copy.anchorMode}</p>
                                        <p className="text-sm font-medium font-cairo">
                                            {(schedule.anchor_mode ?? 'fixed') === 'fixed' ? copy.anchorFixed : copy.anchorFloating}
                                        </p>
                                    </div>
                                    <Info label={copy.generationMode} value={schedule.generation_mode === 'per_asset' ? copy.modePerAsset : copy.modeBatch} />
                                    <Info label={copy.trigger} value={schedule.trigger_type} />
                                    <Info label={copy.nextDue} value={schedule.next_due_date ? formatDate(schedule.next_due_date, locale) : '-'} />
                                    {schedule.master_template ? (
                                        <Info label={copy.masterTemplate} value={displayName(schedule.master_template, isAr)} />
                                    ) : null}
                                </div>
                            </div>
                        </Section>

                        <Section title={copy.frequency} icon={Timer}>
                            <div className="grid gap-4">
                                <Info label={copy.trigger} value={schedule.trigger_type} />
                                <Info label={copy.frequency} value={frequencyLabel(schedule.frequency_type, schedule.frequency_interval, copy)} />
                                <Info label={copy.startDate} value={schedule.start_date ? formatDate(schedule.start_date, locale) : '-'} />
                                <Info label={copy.endDate} value={schedule.end_date ? formatDate(schedule.end_date, locale) : '-'} />
                                <Info label={copy.nextDue} value={schedule.next_due_date ? formatDate(schedule.next_due_date, locale) : '-'} />
                                <Info label={copy.leadTime} value={daysLabel(schedule.lead_time_days, copy)} />
                                <Info label={copy.complianceWindow} value={schedule.compliance_window_days ? daysLabel(schedule.compliance_window_days, copy) : '-'} />
                            </div>
                        </Section>

                        <Section title={copy.lastGenerationInfo} icon={ClipboardList}>
                            <div className="grid gap-4">
                                <Info label={copy.lastGenerated} value={schedule.last_generated_date ? formatDate(schedule.last_generated_date, locale) : copy.neverGenerated} />
                                <Info label={copy.totalGenerated} value={String(schedule.total_generated ?? 0)} />
                                <Info label={copy.completedOnTime} value={String(schedule.total_completed ?? 0)} />
                                <Info label={copy.overdue} value={String(schedule.total_overdue ?? 0)} />
                                <Info label={copy.compliance} value={percentLabel(schedule.compliance_rate)} />
                                <Info label={copy.updatedAt} value={formatDateTime(schedule.updated_at, locale)} />
                            </div>
                        </Section>
                    </aside>
                </div>
            </div>
        </>
    )
}

function scheduleGenerationStatus(schedule: PMSchedule) {
    const assetCount = schedule.assets?.length ?? 0
    if (schedule.status !== 'active' || !schedule.next_due_date || assetCount === 0) {
        return false
    }

    const triggerDate = new Date(`${schedule.next_due_date}T00:00:00`)
    triggerDate.setDate(triggerDate.getDate() - (schedule.lead_time_days ?? 0))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return triggerDate.getTime() <= today.getTime()
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 font-cairo">
                    <Icon className="h-5 w-5 text-primary" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    )
}

function LoadingState({ copy }: { copy: PMCopy }) {
    return (
        <div className="flex min-h-[45vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ms-3 font-cairo">{copy.loading}</span>
        </div>
    )
}

function ErrorState({ copy, onBack }: { copy: PMCopy; onBack: () => void }) {
    return (
        <Card>
            <CardContent className="py-14 text-center">
                <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
                <p className="font-cairo text-muted-foreground">{copy.noData}</p>
                <Button className="mt-5" variant="outline" onClick={onBack}>{copy.backToMaintenance}</Button>
            </CardContent>
        </Card>
    )
}
