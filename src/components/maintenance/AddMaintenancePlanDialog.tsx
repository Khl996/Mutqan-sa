import { useEffect, useMemo, useState } from 'react'
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
import { useBuildings } from '@/hooks/useFacilities'
import { useMaintenancePlans } from '@/hooks/useMaintenancePlans'
import { PM_PRIORITIES } from '@/lib/pm'
import type { CreatePlanInput, MaintenancePlan } from '@/types/maintenance'

// Legacy PM dialog. Active PM authoring uses JobPlanDialog.
// See docs/maintenance/pm-legacy-deprecation.md.
interface AddMaintenancePlanDialogProps {
    isOpen: boolean
    onClose: () => void
    plan?: MaintenancePlan | null
}

const DEFAULT_FORM: CreatePlanInput = {
    code: '',
    name: '',
    name_ar: '',
    year: new Date().getFullYear(),
    priority: 'medium',
    building_id: null,
    budget: 0,
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
    description: '',
    notes: '',
}

export default function AddMaintenancePlanDialog({
    isOpen,
    onClose,
    plan,
}: AddMaintenancePlanDialogProps) {
    const { t } = useTranslation()
    const { data: buildings } = useBuildings()
    const { createPlan, updatePlan } = useMaintenancePlans()
    const [form, setForm] = useState<CreatePlanInput>(DEFAULT_FORM)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [buildingSearch, setBuildingSearch] = useState('')

    useEffect(() => {
        if (!isOpen) return

        if (!plan) {
            setForm(DEFAULT_FORM)
            setBuildingSearch('')
            return
        }

        setForm({
            code: plan.code ?? '',
            name: plan.name,
            name_ar: plan.name_ar ?? '',
            year: plan.year,
            priority: plan.priority,
            building_id: plan.building_id,
            budget: plan.budget ?? 0,
            start_date: plan.start_date ?? '',
            end_date: plan.end_date ?? '',
            description: plan.description ?? '',
            notes: plan.notes ?? '',
        })
        setBuildingSearch('')
    }, [isOpen, plan])

    const filteredBuildings = useMemo(() => {
        if (!buildingSearch.trim()) return buildings ?? []
        const query = buildingSearch.toLowerCase()

        return (buildings ?? []).filter((building) =>
            building.name.toLowerCase().includes(query) ||
            building.name_ar?.toLowerCase().includes(query) ||
            building.code?.toLowerCase().includes(query)
        )
    }, [buildingSearch, buildings])

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()

        if (!form.name?.trim()) {
            toast.error(t('validation.required'))
            return
        }

        try {
            setIsSubmitting(true)

            if (plan) {
                await updatePlan(plan.id, {
                    ...form,
                    building_id: form.building_id || null,
                })
                toast.success(t('pm.success.plan_updated'))
            } else {
                await createPlan({
                    ...form,
                    building_id: form.building_id || null,
                })
                toast.success(t('pm.success.plan_created'))
            }

            onClose()
        } catch (error) {
            const fallback = t('pm.error.plan_update_failed')
            const message = error instanceof Error ? error.message : fallback
            toast.error(message || fallback)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="font-cairo">
                        {plan ? t('pm.plans.edit') : t('pm.plans.create')}
                    </DialogTitle>
                    <DialogDescription className="font-cairo">
                        {t('pm.plans.title')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t('pm.templates.code')}>
                            <Input
                                value={form.code ?? ''}
                                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                                dir="ltr"
                            />
                        </Field>
                        <Field label={t('facilities.buildings')}>
                            <div className="space-y-2">
                                {(buildings?.length ?? 0) > 10 ? (
                                    <Input
                                        value={buildingSearch}
                                        onChange={(event) => setBuildingSearch(event.target.value)}
                                        placeholder={t('common.search')}
                                    />
                                ) : null}
                                <Select
                                    value={form.building_id ?? 'none'}
                                    onValueChange={(value) => setForm((current) => ({ ...current, building_id: value === 'none' ? null : value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('pm.plans.building')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t('common.none')}</SelectItem>
                                        {filteredBuildings.map((building) => (
                                            <SelectItem key={building.id} value={building.id}>
                                                {building.name_ar || building.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t('pm.templates.name')} required>
                            <Input
                                value={form.name}
                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                            />
                        </Field>
                        <Field label={t('pm.templates.name_ar')}>
                            <Input
                                value={form.name_ar ?? ''}
                                onChange={(event) => setForm((current) => ({ ...current, name_ar: event.target.value }))}
                                dir="rtl"
                            />
                        </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <Field label={t('pm.plans.period_year')}>
                            <Input
                                type="number"
                                value={form.year}
                                onChange={(event) => setForm((current) => ({ ...current, year: Number(event.target.value) }))}
                                dir="ltr"
                            />
                        </Field>
                        <Field label={t('pm.plans.priority_label')}>
                            <Select
                                value={form.priority ?? 'medium'}
                                onValueChange={(value) => setForm((current) => ({ ...current, priority: value as CreatePlanInput['priority'] }))}
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
                        <Field label={t('pm.plans.budget')}>
                            <Input
                                type="number"
                                value={form.budget ?? 0}
                                onChange={(event) => setForm((current) => ({ ...current, budget: Number(event.target.value) }))}
                                dir="ltr"
                            />
                        </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t('pm.plans.start_date')}>
                            <Input
                                type="date"
                                value={form.start_date ?? ''}
                                onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))}
                                dir="ltr"
                            />
                        </Field>
                        <Field label={t('pm.plans.end_date')}>
                            <Input
                                type="date"
                                value={form.end_date ?? ''}
                                onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))}
                                dir="ltr"
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

                    <Field label={t('pm.plans.notes')}>
                        <Textarea
                            rows={3}
                            value={form.notes ?? ''}
                            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                        />
                    </Field>

                    <DialogFooter className="gap-2 border-t pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                            {plan ? t('common.save') : t('pm.plans.create')}
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
