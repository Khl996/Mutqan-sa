import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useAssets } from '@/hooks/useAssets'
import { useBuildings } from '@/hooks/useFacilities'
import { useChecklistTemplates } from '@/hooks/useChecklistTemplates'
import { useMaintenanceProgram } from '@/hooks/useMaintenanceProgram'
import { useMaintenancePlans } from '@/hooks/useMaintenancePlans'
import { useMaintenanceTasks } from '@/hooks/useMaintenanceTasks'
import { useCurrentTenantId } from '@/hooks/useTenantQuery'
import { useWorkTeams } from '@/hooks/useWorkTeams'
import { supabase } from '@/lib/supabase'
import { PM_PRIORITIES } from '@/lib/pm'
import type {
    ChecklistItemLegacy,
    ChecklistTemplateItem,
    CreateTaskInput,
    PmProfileRef,
} from '@/types/maintenance'

// Legacy PM dialog. Active PM scheduling uses ScheduleDialog and generated
// work_orders. See docs/maintenance/pm-legacy-deprecation.md.
interface AddMaintenanceTaskDialogProps {
    isOpen: boolean
    onClose: () => void
    planId?: string
    bundleId?: string | null
}

type ChecklistMode = 'template' | 'legacy'

const DEFAULT_FORM: CreateTaskInput = {
    maintenance_plan_id: null,
    frequency_bundle_id: null,
    title: '',
    description: '',
    assigned_to: null,
    assigned_team_id: null,
    due_date: new Date().toISOString().split('T')[0],
    priority: 'medium',
    asset_id: null,
    building_id: null,
    checklist_template_id: null,
    checklist: [],
    estimated_duration_minutes: null,
    requires_photo: false,
    requires_signature: false,
    recurrence_type: 'once',
    recurrence_interval: 1,
    shouldCreateWorkOrder: false,
}

export default function AddMaintenanceTaskDialog({
    isOpen,
    onClose,
    planId,
    bundleId,
}: AddMaintenanceTaskDialogProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const tenantId = useCurrentTenantId()
    const { data: assets } = useAssets()
    const { data: buildings } = useBuildings()
    const { plans } = useMaintenancePlans()
    const { templates, getTemplateItems } = useChecklistTemplates()
    const { createTask } = useMaintenanceTasks()
    const { data: teams } = useWorkTeams()

    const techniciansQuery = useQuery({
        queryKey: ['pm-assignees', tenantId],
        enabled: isOpen && !!tenantId,
        queryFn: async () => {
            const { data, error } = await (supabase.from('profiles') as any)
                .select('id, full_name, full_name_ar, role')
                .eq('tenant_id', tenantId)
                .in('role', ['technician', 'supervisor', 'engineer', 'maintenance_manager'])
                .order('full_name', { ascending: true })

            if (error) throw error
            return (data ?? []) as PmProfileRef[]
        },
    })

    const [form, setForm] = useState<CreateTaskInput>(DEFAULT_FORM)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [checklistMode, setChecklistMode] = useState<ChecklistMode>('template')
    const [templatePreview, setTemplatePreview] = useState<ChecklistTemplateItem[]>([])
    const [assetSearch, setAssetSearch] = useState('')
    const [buildingSearch, setBuildingSearch] = useState('')
    const [templateSearch, setTemplateSearch] = useState('')
    const [technicianSearch, setTechnicianSearch] = useState('')
    const [planSearch, setPlanSearch] = useState('')
    const [legacyLabel, setLegacyLabel] = useState('')
    const [legacyLabelAr, setLegacyLabelAr] = useState('')
    const selectedPlanId = form.maintenance_plan_id ?? planId ?? null
    const { bundles, targets } = useMaintenanceProgram(selectedPlanId)

    useEffect(() => {
        if (!isOpen) return

        setForm({
            ...DEFAULT_FORM,
            maintenance_plan_id: planId ?? null,
            frequency_bundle_id: bundleId ?? null,
        })
        setChecklistMode('template')
        setTemplatePreview([])
        setAssetSearch('')
        setBuildingSearch('')
        setTemplateSearch('')
        setTechnicianSearch('')
        setPlanSearch('')
        setLegacyLabel('')
        setLegacyLabelAr('')
    }, [bundleId, isOpen, planId])

    useEffect(() => {
        if (!form.frequency_bundle_id) return

        const selectedBundle = bundles.find((bundle) => bundle.id === form.frequency_bundle_id)
        if (!selectedBundle) return

        setForm((current) => ({
            ...current,
            maintenance_plan_id: selectedBundle.plan_id,
            title: current.title || (isRTL ? selectedBundle.name_ar || selectedBundle.name : selectedBundle.name),
            description: current.description || selectedBundle.instructions || '',
            checklist_template_id: selectedBundle.checklist_template_id,
            assigned_to: selectedBundle.default_assigned_to,
            assigned_team_id: selectedBundle.default_assigned_team_id,
            estimated_duration_minutes: selectedBundle.estimated_duration_minutes,
            recurrence_type: ['daily', 'weekly', 'monthly'].includes(selectedBundle.frequency_type)
                ? selectedBundle.frequency_type as CreateTaskInput['recurrence_type']
                : 'custom',
            recurrence_interval: selectedBundle.interval_count ?? 1,
        }))

        if (selectedBundle.checklist_template_id) {
            setChecklistMode('template')
        }
    }, [bundles, form.frequency_bundle_id, isRTL])

    useEffect(() => {
        if (!form.asset_id) return
        const selectedAsset = assets?.find((asset) => asset.id === form.asset_id)
        if (selectedAsset?.building_id) {
            setForm((current) => ({ ...current, building_id: selectedAsset.building_id }))
        }
    }, [assets, form.asset_id])

    useEffect(() => {
        if (!form.checklist_template_id || checklistMode !== 'template') {
            setTemplatePreview([])
            return
        }

        void getTemplateItems(form.checklist_template_id).then(setTemplatePreview)
    }, [checklistMode, form.checklist_template_id, getTemplateItems])

    const planAssetIds = useMemo(() => {
        if (!selectedPlanId || targets.length === 0) return null
        const ids = targets.filter((t) => t.target_type === 'asset' && t.asset_id).map((t) => t.asset_id as string)
        return ids.length > 0 ? new Set(ids) : null
    }, [selectedPlanId, targets])

    const filteredAssets = useMemo(() => {
        const source = planAssetIds
            ? (assets ?? []).filter((asset) => planAssetIds.has(asset.id))
            : (assets ?? [])
        if (!assetSearch.trim()) return source
        const query = assetSearch.toLowerCase()
        return source.filter((asset) =>
            asset.name.toLowerCase().includes(query) ||
            asset.name_ar?.toLowerCase().includes(query) ||
            asset.code.toLowerCase().includes(query)
        )
    }, [assetSearch, assets, planAssetIds])

    const filteredBuildings = useMemo(() => {
        const source = buildings ?? []
        if (!buildingSearch.trim()) return source
        const query = buildingSearch.toLowerCase()
        return source.filter((building) =>
            building.name.toLowerCase().includes(query) ||
            building.name_ar?.toLowerCase().includes(query) ||
            building.code.toLowerCase().includes(query)
        )
    }, [buildingSearch, buildings])

    const filteredTemplates = useMemo(() => {
        const source = templates ?? []
        if (!templateSearch.trim()) return source
        const query = templateSearch.toLowerCase()
        return source.filter((template) =>
            template.name.toLowerCase().includes(query) ||
            template.name_ar?.toLowerCase().includes(query) ||
            template.category?.toLowerCase().includes(query) ||
            template.asset_type?.toLowerCase().includes(query)
        )
    }, [templateSearch, templates])

    const filteredTechnicians = useMemo(() => {
        const source = techniciansQuery.data ?? []
        if (!technicianSearch.trim()) return source
        const query = technicianSearch.toLowerCase()
        return source.filter((profile) =>
            profile.full_name?.toLowerCase().includes(query) ||
            profile.full_name_ar?.toLowerCase().includes(query)
        )
    }, [technicianSearch, techniciansQuery.data])

    const filteredPlans = useMemo(() => {
        const source = plans ?? []
        if (!planSearch.trim()) return source
        const query = planSearch.toLowerCase()
        return source.filter((plan) =>
            plan.name.toLowerCase().includes(query) ||
            plan.name_ar?.toLowerCase().includes(query) ||
            plan.code?.toLowerCase().includes(query)
        )
    }, [planSearch, plans])

    const addLegacyChecklistItem = () => {
        if (!legacyLabel.trim() && !legacyLabelAr.trim()) return

        const item: ChecklistItemLegacy = {
            id: crypto.randomUUID(),
            text: legacyLabel.trim() || legacyLabelAr.trim(),
            text_ar: legacyLabelAr.trim() || legacyLabel.trim(),
            checked: false,
        }

        setForm((current) => ({
            ...current,
            checklist: [...(current.checklist ?? []), item],
        }))
        setLegacyLabel('')
        setLegacyLabelAr('')
    }

    const removeLegacyChecklistItem = (id: string) => {
        setForm((current) => ({
            ...current,
            checklist: (current.checklist ?? []).filter((item) => item.id !== id),
        }))
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()

        if (!form.title?.trim()) {
            toast.error(t('validation.required'))
            return
        }

        try {
            setIsSubmitting(true)

            await createTask({
                ...form,
                maintenance_plan_id: form.maintenance_plan_id ?? null,
                assigned_to: form.assigned_to ?? null,
                asset_id: form.asset_id ?? null,
                building_id: form.building_id ?? null,
                checklist_template_id: checklistMode === 'template' ? form.checklist_template_id ?? null : null,
                checklist: checklistMode === 'legacy' ? form.checklist ?? [] : [],
            })

            toast.success(t('pm.success.task_created'))
            onClose()
        } catch (error) {
            const fallback = t('pm.error.task_update_failed')
            const message = error instanceof Error ? error.message : fallback
            toast.error(message || fallback)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="font-cairo">{t('pm.tasks.create')}</DialogTitle>
                    <DialogDescription className="font-cairo">{t('pm.tasks.title')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!planId ? (
                        <Field label={t('pm.plans.title')}>
                            <div className="space-y-2">
                                {(plans?.length ?? 0) > 10 ? (
                                    <Input value={planSearch} onChange={(event) => setPlanSearch(event.target.value)} placeholder={t('common.search')} />
                                ) : null}
                                <Select
                                    value={form.maintenance_plan_id ?? 'none'}
                                    onValueChange={(value) => setForm((current) => ({ ...current, maintenance_plan_id: value === 'none' ? null : value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('pm.plans.title')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t('common.none')}</SelectItem>
                                        {filteredPlans.map((plan) => (
                                            <SelectItem key={plan.id} value={plan.id}>
                                                {isRTL ? plan.name_ar || plan.name : plan.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </Field>
                    ) : null}

                    {selectedPlanId ? (
                        <Field label={t('pm.bundles.title')}>
                            <Select
                                value={form.frequency_bundle_id ?? 'none'}
                                onValueChange={(value) => setForm((current) => ({
                                    ...current,
                                    frequency_bundle_id: value === 'none' ? null : value,
                                }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={t('pm.bundles.title')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('common.none')}</SelectItem>
                                    {bundles.filter((bundle) => bundle.is_active).map((bundle) => (
                                        <SelectItem key={bundle.id} value={bundle.id}>
                                            {isRTL ? bundle.name_ar || bundle.name : bundle.name} · {t(`pm.bundles.frequency_type.${bundle.frequency_type}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t('pm.tasks.title')} required>
                            <Input
                                value={form.title}
                                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                            />
                        </Field>
                        <Field label={t('pm.tasks.technician')}>
                            <div className="space-y-2">
                                {(techniciansQuery.data?.length ?? 0) > 10 ? (
                                    <Input value={technicianSearch} onChange={(event) => setTechnicianSearch(event.target.value)} placeholder={t('common.search')} />
                                ) : null}
                                <Select
                                    value={form.assigned_to ?? 'none'}
                                    onValueChange={(value) => setForm((current) => ({ ...current, assigned_to: value === 'none' ? null : value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('pm.tasks.technician')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t('common.none')}</SelectItem>
                                        {filteredTechnicians.map((technician) => (
                                            <SelectItem key={technician.id} value={technician.id}>
                                                {isRTL ? technician.full_name_ar || technician.full_name || '' : technician.full_name || technician.full_name_ar || ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </Field>
                        <Field label={t('pm.tasks.team')}>
                            <Select
                                value={form.assigned_team_id ?? 'none'}
                                onValueChange={(value) => setForm((current) => ({ ...current, assigned_team_id: value === 'none' ? null : value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={t('pm.tasks.team')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('common.none')}</SelectItem>
                                    {(teams ?? []).map((team) => (
                                        <SelectItem key={team.id} value={team.id}>
                                            {team.code ? `${team.code} - ` : ''}{isRTL ? team.name_ar || team.name : team.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t('pm.tasks.asset')}>
                            <div className="space-y-2">
                                {(assets?.length ?? 0) > 10 ? (
                                    <Input value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder={t('common.search')} />
                                ) : null}
                                <Select
                                    value={form.asset_id ?? 'none'}
                                    onValueChange={(value) => setForm((current) => ({ ...current, asset_id: value === 'none' ? null : value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('pm.tasks.asset')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t('common.none')}</SelectItem>
                                        {filteredAssets.map((asset) => (
                                            <SelectItem key={asset.id} value={asset.id}>
                                                {`${asset.code} - ${isRTL ? asset.name_ar || asset.name : asset.name}`}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </Field>

                        <Field label={t('pm.tasks.building')}>
                            <div className="space-y-2">
                                {(buildings?.length ?? 0) > 10 ? (
                                    <Input value={buildingSearch} onChange={(event) => setBuildingSearch(event.target.value)} placeholder={t('common.search')} />
                                ) : null}
                                <Select
                                    value={form.building_id ?? 'none'}
                                    onValueChange={(value) => setForm((current) => ({ ...current, building_id: value === 'none' ? null : value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('pm.tasks.building')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t('common.none')}</SelectItem>
                                        {filteredBuildings.map((building) => (
                                            <SelectItem key={building.id} value={building.id}>
                                                {isRTL ? building.name_ar || building.name : building.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <Field label={t('pm.tasks.due_date')}>
                            <Input
                                type="date"
                                dir="ltr"
                                value={form.due_date ?? ''}
                                onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))}
                            />
                        </Field>
                        <Field label={t('workOrders.priority')}>
                            <Select
                                value={form.priority ?? 'medium'}
                                onValueChange={(value) => setForm((current) => ({ ...current, priority: value as CreateTaskInput['priority'] }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PM_PRIORITIES.map((priority) => (
                                        <SelectItem key={priority} value={priority}>
                                            {t(`pm.plans.priority.${priority}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label={t('pm.tasks.estimated_duration')}>
                            <Input
                                type="number"
                                dir="ltr"
                                value={form.estimated_duration_minutes ?? ''}
                                onChange={(event) => setForm((current) => ({
                                    ...current,
                                    estimated_duration_minutes: event.target.value ? Number(event.target.value) : null,
                                }))}
                            />
                        </Field>
                    </div>

                    <Field label={t('common.description')}>
                        <Textarea
                            rows={3}
                            value={form.description ?? ''}
                            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                        />
                    </Field>

                    <div className="rounded-xl border p-4">
                        <div className="mb-4 flex flex-wrap items-center gap-3">
                            <Button
                                type="button"
                                variant={checklistMode === 'template' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setChecklistMode('template')}
                            >
                                {t('pm.tasks.use_template')}
                            </Button>
                            <Button
                                type="button"
                                variant={checklistMode === 'legacy' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setChecklistMode('legacy')}
                            >
                                {t('pm.tasks.use_manual_checklist')}
                            </Button>
                        </div>

                        {checklistMode === 'template' ? (
                            <div className="space-y-4">
                                <Field label={t('pm.templates.title')}>
                                    <div className="space-y-2">
                                        {(templates?.length ?? 0) > 10 ? (
                                            <Input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder={t('common.search')} />
                                        ) : null}
                                        <Select
                                            value={form.checklist_template_id ?? 'none'}
                                            onValueChange={(value) => setForm((current) => ({ ...current, checklist_template_id: value === 'none' ? null : value }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('pm.templates.title')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">{t('common.none')}</SelectItem>
                                                {filteredTemplates.map((template) => (
                                                    <SelectItem key={template.id} value={template.id}>
                                                        {isRTL ? template.name_ar || template.name : template.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </Field>

                                {templatePreview.length > 0 ? (
                                    <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                                        <div className="flex items-center justify-between">
                                            <p className="font-medium font-cairo">{t('pm.templates.preview')}</p>
                                            <Badge variant="secondary">{templatePreview.length}</Badge>
                                        </div>
                                        <div className="space-y-2">
                                            {templatePreview.slice(0, 6).map((item) => (
                                                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 shadow-sm">
                                                    <div className="space-y-1">
                                                        <span className="font-cairo text-sm">
                                                            {isRTL ? item.label_ar || item.label : item.label}
                                                        </span>
                                                        {item.section ? (
                                                            <p className="text-xs text-muted-foreground font-cairo">
                                                                {isRTL ? item.section.title_ar || item.section.title : item.section.title}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {item.is_required ? <Badge variant="outline">{t('pm.templates.required')}</Badge> : null}
                                                        {item.unit ? <Badge variant="outline">{item.unit}</Badge> : null}
                                                        <Badge variant="secondary">
                                                            {t(`pm.templates.item_type.${item.item_type}`)}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <Input
                                        value={legacyLabel}
                                        onChange={(event) => setLegacyLabel(event.target.value)}
                                        placeholder={t('pm.tasks.check_item')}
                                    />
                                    <Input
                                        value={legacyLabelAr}
                                        onChange={(event) => setLegacyLabelAr(event.target.value)}
                                        placeholder={t('pm.tasks.check_item_ar')}
                                        dir="rtl"
                                    />
                                </div>
                                <Button type="button" variant="outline" onClick={addLegacyChecklistItem}>
                                    <Plus className="me-2 h-4 w-4" />
                                    {t('pm.templates.add_item')}
                                </Button>

                                <div className="space-y-2">
                                    {(form.checklist ?? []).map((item) => (
                                        <div key={item.id} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                                            <span className="font-cairo text-sm">
                                                {isRTL ? item.text_ar || item.text : item.text}
                                            </span>
                                            <Button type="button" size="icon" variant="ghost" onClick={() => removeLegacyChecklistItem(item.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <label className="flex items-center justify-between rounded-xl border p-3">
                            <span className="font-cairo text-sm">{t('pm.tasks.requires_photo')}</span>
                            <input
                                type="checkbox"
                                checked={form.requires_photo ?? false}
                                onChange={(event) => setForm((current) => ({ ...current, requires_photo: event.target.checked }))}
                                className="h-4 w-4"
                            />
                        </label>
                        <label className="flex items-center justify-between rounded-xl border p-3">
                            <span className="font-cairo text-sm">{t('pm.tasks.requires_signature')}</span>
                            <input
                                type="checkbox"
                                checked={form.requires_signature ?? false}
                                onChange={(event) => setForm((current) => ({ ...current, requires_signature: event.target.checked }))}
                                className="h-4 w-4"
                            />
                        </label>
                        <label className="flex items-center justify-between rounded-xl border p-3">
                            <span className="font-cairo text-sm">{t('workOrders.createWorkOrder')}</span>
                            <input
                                type="checkbox"
                                checked={form.shouldCreateWorkOrder ?? false}
                                onChange={(event) => setForm((current) => ({ ...current, shouldCreateWorkOrder: event.target.checked }))}
                                className="h-4 w-4"
                            />
                        </label>
                    </div>

                    <DialogFooter className="gap-2 border-t pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                            {t('pm.tasks.create')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <label className="space-y-2">
            <span className="text-sm font-medium font-cairo">
                {label}
                {required ? <span className="ms-0.5 text-destructive">*</span> : null}
            </span>
            {children}
        </label>
    )
}
