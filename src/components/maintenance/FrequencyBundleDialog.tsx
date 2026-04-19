import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useChecklistTemplates } from '@/hooks/useChecklistTemplates'
import { useMaintenanceProgram } from '@/hooks/useMaintenanceProgram'
import { useWorkTeams } from '@/hooks/useWorkTeams'
import { useCurrentTenantId } from '@/hooks/useTenantQuery'
import { supabase } from '@/lib/supabase'
import { PM_FREQUENCY_TYPES } from '@/lib/pm'
import type {
    MaintenanceFrequencyBundle,
    MaintenanceFrequencyType,
    PmProfileRef,
} from '@/types/maintenance'

interface FrequencyBundleDialogProps {
    isOpen: boolean
    onClose: () => void
    planId: string
    bundle?: MaintenanceFrequencyBundle | null
}

type BundleForm = {
    code: string
    name: string
    name_ar: string
    frequency_type: MaintenanceFrequencyType
    interval_count: number
    checklist_template_id: string | null
    default_assigned_to: string | null
    default_assigned_team_id: string | null
    estimated_duration_minutes: number | null
    instructions: string
    is_active: boolean
}

const DEFAULT_FORM: BundleForm = {
    code: '',
    name: '',
    name_ar: '',
    frequency_type: 'monthly',
    interval_count: 1,
    checklist_template_id: null,
    default_assigned_to: null,
    default_assigned_team_id: null,
    estimated_duration_minutes: null,
    instructions: '',
    is_active: true,
}

export default function FrequencyBundleDialog({
    isOpen,
    onClose,
    planId,
    bundle,
}: FrequencyBundleDialogProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const tenantId = useCurrentTenantId()
    const { templates } = useChecklistTemplates()
    const { data: teams } = useWorkTeams()
    const { createBundle, updateBundle } = useMaintenanceProgram(planId)

    const techniciansQuery = useQuery({
        queryKey: ['pm-bundle-assignees', tenantId],
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

    const [form, setForm] = useState<BundleForm>(DEFAULT_FORM)
    const [templateSearch, setTemplateSearch] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        if (!isOpen) return

        if (bundle) {
            setForm({
                code: bundle.code ?? '',
                name: bundle.name,
                name_ar: bundle.name_ar ?? '',
                frequency_type: bundle.frequency_type,
                interval_count: bundle.interval_count ?? 1,
                checklist_template_id: bundle.checklist_template_id,
                default_assigned_to: bundle.default_assigned_to,
                default_assigned_team_id: bundle.default_assigned_team_id,
                estimated_duration_minutes: bundle.estimated_duration_minutes,
                instructions: bundle.instructions ?? '',
                is_active: bundle.is_active,
            })
        } else {
            setForm(DEFAULT_FORM)
        }
        setTemplateSearch('')
    }, [bundle, isOpen])

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

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()

        if (!form.name.trim()) {
            toast.error(t('validation.required'))
            return
        }

        try {
            setIsSubmitting(true)
            const payload = {
                code: form.code || null,
                name: form.name,
                name_ar: form.name_ar || null,
                frequency_type: form.frequency_type,
                interval_count: form.interval_count,
                checklist_template_id: form.checklist_template_id,
                default_assigned_to: form.default_assigned_to,
                default_assigned_team_id: form.default_assigned_team_id,
                estimated_duration_minutes: form.estimated_duration_minutes,
                instructions: form.instructions || null,
                is_active: form.is_active,
            }

            if (bundle) {
                await updateBundle(bundle.id, payload)
                toast.success(t('pm.success.bundle_updated'))
            } else {
                await createBundle({ ...payload, plan_id: planId })
                toast.success(t('pm.success.bundle_created'))
            }
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('pm.error.bundle_update_failed'))
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="font-cairo">{bundle ? t('pm.bundles.edit') : t('pm.bundles.create')}</DialogTitle>
                    <DialogDescription className="font-cairo">{t('pm.bundles.description')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Field label={t('pm.templates.code')}>
                            <Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
                        </Field>
                        <Field label={t('pm.bundles.name')} required>
                            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                        </Field>
                        <Field label={t('pm.bundles.name_ar')}>
                            <Input value={form.name_ar} onChange={(event) => setForm((current) => ({ ...current, name_ar: event.target.value }))} dir="rtl" />
                        </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <Field label={t('pm.bundles.frequency')} required>
                            <Select
                                value={form.frequency_type}
                                onValueChange={(value) => setForm((current) => ({ ...current, frequency_type: value as MaintenanceFrequencyType }))}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PM_FREQUENCY_TYPES.map((frequency) => (
                                        <SelectItem key={frequency} value={frequency}>
                                            {t(`pm.bundles.frequency_type.${frequency}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label={t('pm.bundles.interval')}>
                            <Input
                                type="number"
                                min={1}
                                dir="ltr"
                                value={form.interval_count}
                                onChange={(event) => setForm((current) => ({ ...current, interval_count: Number(event.target.value) || 1 }))}
                            />
                        </Field>
                        <Field label={t('pm.tasks.estimated_duration')}>
                            <Input
                                type="number"
                                min={0}
                                dir="ltr"
                                value={form.estimated_duration_minutes ?? ''}
                                onChange={(event) => setForm((current) => ({
                                    ...current,
                                    estimated_duration_minutes: event.target.value ? Number(event.target.value) : null,
                                }))}
                            />
                        </Field>
                    </div>

                    <Field label={t('pm.templates.title')}>
                        <div className="space-y-2">
                            {(templates?.length ?? 0) > 10 ? (
                                <Input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder={t('common.search')} />
                            ) : null}
                            <Select
                                value={form.checklist_template_id ?? 'none'}
                                onValueChange={(value) => setForm((current) => ({ ...current, checklist_template_id: value === 'none' ? null : value }))}
                            >
                                <SelectTrigger><SelectValue placeholder={t('pm.templates.title')} /></SelectTrigger>
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

                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t('pm.tasks.technician')}>
                            <Select
                                value={form.default_assigned_to ?? 'none'}
                                onValueChange={(value) => setForm((current) => ({ ...current, default_assigned_to: value === 'none' ? null : value }))}
                            >
                                <SelectTrigger><SelectValue placeholder={t('pm.tasks.technician')} /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('common.none')}</SelectItem>
                                    {(techniciansQuery.data ?? []).map((technician) => (
                                        <SelectItem key={technician.id} value={technician.id}>
                                            {isRTL ? technician.full_name_ar || technician.full_name || '' : technician.full_name || technician.full_name_ar || ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>

                        <Field label={t('pm.tasks.team')}>
                            <Select
                                value={form.default_assigned_team_id ?? 'none'}
                                onValueChange={(value) => setForm((current) => ({ ...current, default_assigned_team_id: value === 'none' ? null : value }))}
                            >
                                <SelectTrigger><SelectValue placeholder={t('pm.tasks.team')} /></SelectTrigger>
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

                    <Field label={t('pm.bundles.instructions')}>
                        <Textarea
                            rows={3}
                            value={form.instructions}
                            onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))}
                        />
                    </Field>

                    <label className="flex items-center justify-between rounded-xl border p-3">
                        <span className="font-cairo text-sm">{t('pm.bundles.active')}</span>
                        <input
                            type="checkbox"
                            checked={form.is_active}
                            onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                            className="h-4 w-4"
                        />
                    </label>

                    <DialogFooter className="gap-2 border-t pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                            {t('common.save')}
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
