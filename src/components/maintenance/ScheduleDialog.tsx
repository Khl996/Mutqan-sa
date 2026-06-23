import { useEffect, useState } from 'react'
import type * as React from 'react'
import { Anchor, Loader2, Route, Save, Waves, Wrench } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type {
    PMAnchorMode,
    PMAssetRef,
    PMFrequencyType,
    PMGenerationMode,
    PMJobPlan,
    PMPriority,
    PMSchedule,
    PMScheduleInput,
    PMScheduleStatus,
} from '@/hooks/usePMFoundation'
import {
    blankSchedule,
    displayName,
    FREQUENCIES,
    frequencyLabel,
    numberOrNull,
    PMCopy,
    PRIORITIES,
    priorityLabel,
    SCHEDULE_STATUSES,
    statusLabel,
    today,
} from './foundationPmUtils'

export default function ScheduleDialog({
    open,
    onOpenChange,
    schedule,
    copy,
    isAr,
    isSaving,
    jobPlans,
    assets,
    onSave,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    schedule: PMSchedule | null
    copy: PMCopy
    isAr: boolean
    isSaving: boolean
    jobPlans: PMJobPlan[]
    assets: PMAssetRef[]
    onSave: (input: PMScheduleInput) => Promise<void>
}) {
    const [form, setForm] = useState<PMScheduleInput>(blankSchedule)

    useEffect(() => {
        if (!open) return
        if (!schedule) {
            setForm(blankSchedule())
            return
        }

        setForm({
            code: schedule.code ?? '',
            name: schedule.name,
            name_ar: schedule.name_ar ?? '',
            description: schedule.description ?? '',
            job_plan_id: schedule.job_plan_id,
            generation_mode: schedule.generation_mode,
            anchor_mode: schedule.anchor_mode ?? 'fixed',
            trigger_type: schedule.trigger_type,
            frequency_type: schedule.frequency_type ?? 'daily',
            frequency_interval: schedule.frequency_interval ?? 1,
            start_date: schedule.start_date ?? today(),
            end_date: schedule.end_date ?? '',
            next_due_date: schedule.next_due_date ?? today(),
            lead_time_days: schedule.lead_time_days ?? 0,
            compliance_window_days: schedule.compliance_window_days,
            default_priority: schedule.default_priority,
            status: schedule.status,
            notes: schedule.notes ?? '',
            asset_ids: schedule.assets?.map((item) => item.asset_id) ?? (schedule.primary_asset_id ? [schedule.primary_asset_id] : []),
        })
    }, [open, schedule])

    const toggleAsset = (assetId: string) => {
        setForm((current) => ({
            ...current,
            asset_ids: current.asset_ids.includes(assetId)
                ? current.asset_ids.filter((id) => id !== assetId)
                : [...current.asset_ids, assetId],
        }))
    }

    const submit = async () => {
        if (!form.name.trim() || !form.job_plan_id || form.asset_ids.length === 0) {
            toast.error(isAr ? 'أدخل اسم الجدول واختر قالبًا وأصلًا واحدًا على الأقل' : 'Enter schedule name, job plan, and at least one asset')
            return
        }
        await onSave(form)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-cairo">{schedule ? copy.editSchedule : copy.createSchedule}</DialogTitle>
                    <DialogDescription>{copy.schedules}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 lg:grid-cols-2">
                    <Field label={copy.name}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                    <Field label={copy.arabicName}><Input value={form.name_ar ?? ''} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></Field>
                    <Field label={copy.code}><Input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
                    <Field label={copy.jobPlan}>
                        <Select value={form.job_plan_id || undefined} onValueChange={(value) => setForm({ ...form, job_plan_id: value })}>
                            <SelectTrigger><SelectValue placeholder={copy.jobPlan} /></SelectTrigger>
                            <SelectContent>{jobPlans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{displayName(plan, isAr)}</SelectItem>)}</SelectContent>
                        </Select>
                    </Field>
                    <Field label={copy.generationMode}>
                        <div className="grid grid-cols-2 gap-2">
                            {(['batch_route', 'per_asset'] as PMGenerationMode[]).map((mode) => (
                                <Button
                                    key={mode}
                                    type="button"
                                    variant={form.generation_mode === mode ? 'default' : 'outline'}
                                    className="h-auto justify-start py-3 text-start"
                                    onClick={() => setForm({ ...form, generation_mode: mode })}
                                >
                                    {mode === 'batch_route' ? <Route className="me-2 h-4 w-4 shrink-0" /> : <Wrench className="me-2 h-4 w-4 shrink-0" />}
                                    <span className="grid gap-1">
                                        <span>{mode === 'batch_route' ? copy.modeBatch : copy.modePerAsset}</span>
                                        <span className="text-xs font-normal opacity-80">{mode === 'batch_route' ? copy.modeBatchHint : copy.modePerAssetHint}</span>
                                    </span>
                                </Button>
                            ))}
                        </div>
                    </Field>
                    <Field label={copy.anchorMode}>
                        <div className="grid grid-cols-2 gap-2">
                            {(['fixed', 'floating'] as PMAnchorMode[]).map((mode) => (
                                <Button
                                    key={mode}
                                    type="button"
                                    variant={form.anchor_mode === mode ? 'default' : 'outline'}
                                    className="h-auto justify-start py-3 text-start"
                                    disabled={!!schedule?.master_template_id}
                                    onClick={() => setForm({ ...form, anchor_mode: mode })}
                                >
                                    {mode === 'fixed' ? <Anchor className="me-2 h-4 w-4 shrink-0" /> : <Waves className="me-2 h-4 w-4 shrink-0" />}
                                    <span className="grid gap-1">
                                        <span>{mode === 'fixed' ? copy.anchorFixed : copy.anchorFloating}</span>
                                        <span className="text-xs font-normal opacity-80">{mode === 'fixed' ? copy.anchorFixedHint : copy.anchorFloatingHint}</span>
                                    </span>
                                </Button>
                            ))}
                        </div>
                        {schedule?.master_template_id ? (
                            <p className="text-xs text-amber-700 font-cairo">{copy.masterTemplateLinkedWarning}</p>
                        ) : null}
                    </Field>
                    <Field label={copy.status}>
                        <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as PMScheduleStatus })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{SCHEDULE_STATUSES.map((status) => <SelectItem key={status} value={status}>{statusLabel(status, copy)}</SelectItem>)}</SelectContent>
                        </Select>
                    </Field>
                    <Field label={copy.frequency}>
                        <Select value={form.frequency_type} onValueChange={(value) => setForm({ ...form, frequency_type: value as PMFrequencyType })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{FREQUENCIES.map((frequency) => <SelectItem key={frequency} value={frequency}>{frequencyLabel(frequency, 1, copy)}</SelectItem>)}</SelectContent>
                        </Select>
                    </Field>
                    <Field label={copy.interval}><Input type="number" value={form.frequency_interval} onChange={(e) => setForm({ ...form, frequency_interval: Number(e.target.value) || 1 })} /></Field>
                    <Field label={copy.nextDue}><Input type="date" value={form.next_due_date ?? ''} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} /></Field>
                    <Field label={copy.complianceWindow}><Input type="number" value={form.compliance_window_days ?? ''} onChange={(e) => setForm({ ...form, compliance_window_days: numberOrNull(e.target.value) })} /></Field>
                    <Field label={copy.priority}>
                        <Select value={form.default_priority} onValueChange={(value) => setForm({ ...form, default_priority: value as PMPriority })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{PRIORITIES.map((priority) => <SelectItem key={priority} value={priority}>{priorityLabel(priority, copy)}</SelectItem>)}</SelectContent>
                        </Select>
                    </Field>
                    <Field label={copy.description}><Textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                </div>
                <div className="space-y-3">
                    <h3 className="font-semibold font-cairo">{copy.assets}</h3>
                    <div className="grid max-h-72 gap-2 overflow-y-auto rounded-md border p-3 md:grid-cols-2">
                        {assets.map((asset) => (
                            <label key={asset.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                                <input type="checkbox" checked={form.asset_ids.includes(asset.id)} onChange={() => toggleAsset(asset.id)} />
                                <span className="font-mono text-xs">{asset.code}</span>
                                <span className="truncate font-cairo">{displayName(asset, isAr)}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{copy.cancel}</Button>
                    <Button onClick={() => void submit()} disabled={isSaving}>
                        {isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}{copy.save}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <Label className="font-cairo">{label}</Label>
            {children}
        </div>
    )
}
