import { useState } from 'react'
import type * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    ClipboardList,
    ExternalLink,
    FileText,
    Loader2,
    Pencil,
    ShieldCheck,
    Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import JobPlanDialog from '@/components/maintenance/JobPlanDialog'
import { Info } from '@/components/maintenance/FoundationPMPanels'
import { ar, displayName, durationLabel, en, itemTypeLabel, PMCopy, statusClass, statusLabel } from '@/components/maintenance/foundationPmUtils'
import { useModuleAccess, useTenantModules } from '@/hooks/useTenantModules'
import { usePermission } from '@/hooks/usePermission'
import type { PMJobPlanInput, PMJsonItem } from '@/hooks/usePMFoundation'
import { usePMJobPlanDetail, usePMJobPlans } from '@/hooks/usePMFoundation'
import { cn, formatDateTime } from '@/lib/utils'

export default function PMJobPlanDetailsPage() {
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

    const { data: plan, isLoading, error } = usePMJobPlanDetail(id ?? null)
    const { updateJobPlan, isSaving } = usePMJobPlans()

    const handleSave = async (input: PMJobPlanInput) => {
        if (!plan) return
        try {
            await updateJobPlan({ id: plan.id, input })
            toast.success(isAr ? 'تم تحديث قالب العمل' : 'Job plan updated')
            setEditOpen(false)
        } catch (saveError) {
            const message = saveError instanceof Error && saveError.message === 'JOB_PLAN_ITEMS_LOCKED_BY_OPEN_WORK_ORDERS'
                ? copy.checklistLockedByOpenWos
                : saveError instanceof Error ? saveError.message : copy.executionError
            toast.error(message)
        }
    }

    if (modulesLoading || isLoading) {
        return <LoadingState copy={copy} />
    }

    if (!maintenanceEnabled || error || !plan) {
        return <ErrorState copy={copy} onBack={() => navigate('/maintenance')} />
    }

    return (
        <>
            <JobPlanDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                plan={plan}
                copy={copy}
                isAr={isAr}
                isSaving={isSaving}
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
                                <Badge className={cn('border', statusClass(plan.status))}>{statusLabel(plan.status, copy)}</Badge>
                                {plan.category ? <Badge variant="outline">{plan.category}</Badge> : null}
                                <Badge variant="secondary" dir="ltr">v{plan.version}</Badge>
                            </div>
                            <h1 className="text-3xl font-bold text-primary font-cairo">{displayName(plan, isAr)}</h1>
                            {plan.code ? <p className="mt-1 font-mono text-sm text-muted-foreground">{plan.code}</p> : null}
                        </div>
                    </div>
                    {canManage ? (
                        <Button onClick={() => setEditOpen(true)}>
                            <Pencil className="me-2 h-4 w-4" />
                            {copy.editJobPlan}
                        </Button>
                    ) : null}
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <main className="space-y-6">
                        <Section title={copy.basicInfo} icon={FileText}>
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <Info label={copy.name} value={plan.name} />
                                <Info label={copy.arabicName} value={plan.name_ar || '-'} />
                                <Info label={copy.status} value={statusLabel(plan.status, copy)} />
                                <Info label={copy.estimatedDuration} value={durationLabel(plan.estimated_duration_minutes, copy)} />
                                <Info label={copy.requiredSkill} value={plan.required_skill || '-'} />
                                <Info label={copy.requiredRole} value={plan.required_role || '-'} />
                                <Info label={copy.version} value={String(plan.version)} />
                                <Info label={copy.usageCount} value={String(plan.usage_count ?? 0)} />
                                <Info label={copy.updatedAt} value={formatDateTime(plan.updated_at, locale)} />
                            </div>
                            {plan.description ? <p className="mt-5 text-sm text-muted-foreground font-cairo">{plan.description}</p> : null}
                        </Section>

                        <Section title={copy.checklist} icon={ClipboardList}>
                            {plan.items?.length ? (
                                <div className="space-y-3">
                                    {plan.items.map((item) => (
                                        <div key={item.id} className="rounded-md border bg-background p-4">
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div>
                                                    <p className="font-semibold font-cairo">{isAr ? item.label_ar || item.label : item.label}</p>
                                                    {item.help_text ? <p className="mt-1 text-xs text-muted-foreground">{item.help_text}</p> : null}
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge variant="outline">{itemTypeLabel(item.item_type, copy)}</Badge>
                                                    {item.is_required ? <Badge className="bg-amber-500/15 text-amber-700">{copy.required}</Badge> : null}
                                                    {item.is_critical ? <Badge className="bg-rose-500/15 text-rose-700">{copy.critical}</Badge> : null}
                                                </div>
                                            </div>
                                            <div className="mt-4 grid gap-3 md:grid-cols-4">
                                                <Info label={copy.sortOrder} value={String(item.sort_order)} />
                                                <Info label={copy.unit} value={item.unit || '-'} />
                                                <Info label="Min / Max" value={`${item.min_value ?? '-'} / ${item.max_value ?? '-'}`} />
                                                <Info label="Warning" value={`${item.warning_min ?? '-'} / ${item.warning_max ?? '-'}`} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="py-8 text-center text-sm text-muted-foreground font-cairo">{copy.noItems}</p>
                            )}
                        </Section>
                    </main>

                    <aside className="space-y-6">
                        <Section title={copy.safetyNotes} icon={ShieldCheck}>
                            <p className="whitespace-pre-wrap text-sm text-muted-foreground font-cairo">
                                {plan.safety_notes || '-'}
                            </p>
                        </Section>

                        <Section title={copy.tools} icon={Wrench}>
                            <JsonList items={plan.required_tools} empty="-" />
                        </Section>

                        <Section title={copy.materials} icon={ClipboardList}>
                            <JsonList items={plan.required_materials} empty="-" />
                        </Section>

                        <Section title={copy.parts} icon={ClipboardList}>
                            <JsonList items={plan.required_parts} empty="-" />
                        </Section>

                        <Section title={copy.references} icon={ExternalLink}>
                            <JsonList items={plan.reference_documents} empty="-" isReference />
                        </Section>
                    </aside>
                </div>
            </div>
        </>
    )
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

function JsonList({ items, empty, isReference = false }: { items?: PMJsonItem[]; empty: string; isReference?: boolean }) {
    if (!items?.length) return <p className="text-sm text-muted-foreground">{empty}</p>
    return (
        <div className="space-y-2">
            {items.map((item, index) => {
                const label = item.label || item.name || item.url || `#${index + 1}`
                return (
                    <div key={`${label}-${index}`} className="rounded-md border bg-background px-3 py-2">
                        {isReference && item.url ? (
                            <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                                {label}
                                <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        ) : (
                            <p className="text-sm font-medium" dir="auto">{label}</p>
                        )}
                        {item.qty !== undefined || item.unit ? (
                            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                                {item.qty ?? '-'} {item.unit ?? ''}
                            </p>
                        ) : null}
                    </div>
                )
            })}
        </div>
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
