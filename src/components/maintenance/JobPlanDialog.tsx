import { useEffect, useState } from 'react'
import type * as React from 'react'
import { Loader2, Plus, Save } from 'lucide-react'
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
import type { PMItemType, PMJobPlan, PMJobPlanInput, PMJobPlanItemInput } from '@/hooks/usePMFoundation'
import {
    blankItem,
    blankPlan,
    itemTypeLabel,
    ITEM_TYPES,
    numberOrNull,
    parseLines,
    PMCopy,
    statusLabel,
    stringifyLines,
} from './foundationPmUtils'

export default function JobPlanDialog({
    open,
    onOpenChange,
    plan,
    copy,
    isAr,
    isSaving,
    onSave,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    plan: PMJobPlan | null
    copy: PMCopy
    isAr: boolean
    isSaving: boolean
    onSave: (input: PMJobPlanInput) => Promise<void>
}) {
    const [form, setForm] = useState<PMJobPlanInput>(blankPlan)
    const [toolsText, setToolsText] = useState('')
    const [partsText, setPartsText] = useState('')
    const [materialsText, setMaterialsText] = useState('')
    const [referencesText, setReferencesText] = useState('')

    useEffect(() => {
        if (!open) return
        if (!plan) {
            setForm(blankPlan())
            setToolsText('')
            setPartsText('')
            setMaterialsText('')
            setReferencesText('')
            return
        }

        setForm({
            code: plan.code ?? '',
            name: plan.name,
            name_ar: plan.name_ar ?? '',
            description: plan.description ?? '',
            category: plan.category ?? '',
            asset_type_hint: plan.asset_type_hint ?? '',
            status: plan.status,
            estimated_duration_minutes: plan.estimated_duration_minutes,
            requires_safety_checks: plan.requires_safety_checks,
            safety_notes: plan.safety_notes ?? '',
            required_parts: plan.required_parts ?? [],
            required_tools: plan.required_tools ?? [],
            required_materials: plan.required_materials ?? [],
            reference_documents: plan.reference_documents ?? [],
            required_skill: plan.required_skill ?? '',
            required_role: plan.required_role ?? '',
            items: (plan.items?.length ? plan.items : [blankItem()]).map((item) => ({
                id: item.id,
                sort_order: item.sort_order,
                label: item.label,
                label_ar: item.label_ar ?? '',
                item_type: item.item_type,
                is_required: item.is_required,
                is_critical: item.is_critical,
                unit: item.unit ?? '',
                min_value: item.min_value,
                max_value: item.max_value,
                warning_min: item.warning_min,
                warning_max: item.warning_max,
                help_text: item.help_text ?? '',
            })),
        })
        setToolsText(stringifyLines(plan.required_tools))
        setPartsText(stringifyLines(plan.required_parts))
        setMaterialsText(stringifyLines(plan.required_materials))
        setReferencesText(stringifyLines(plan.reference_documents, true))
    }, [open, plan])

    const updateItem = (index: number, patch: Partial<PMJobPlanItemInput>) => {
        setForm((current) => ({
            ...current,
            items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
        }))
    }

    const submit = async () => {
        const items = form.items
            .filter((item) => item.label.trim())
            .map((item, index) => ({ ...item, sort_order: (index + 1) * 10 }))

        if (!form.name.trim() || items.length === 0) {
            toast.error(isAr ? 'أدخل اسم القالب وبند فحص واحد على الأقل' : 'Enter a plan name and at least one checklist item')
            return
        }

        await onSave({
            ...form,
            required_tools: parseLines(toolsText),
            required_parts: parseLines(partsText),
            required_materials: parseLines(materialsText),
            reference_documents: parseLines(referencesText, true),
            items,
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-cairo">{plan ? copy.editJobPlan : copy.createJobPlan}</DialogTitle>
                    <DialogDescription>{copy.jobPlans}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 lg:grid-cols-2">
                    <Field label={copy.name}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                    <Field label={copy.arabicName}><Input value={form.name_ar ?? ''} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></Field>
                    <Field label={copy.code}><Input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
                    <Field label={copy.category}><Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
                    <Field label={copy.status}>
                        <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as PMJobPlan['status'] })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="draft">{statusLabel('draft', copy)}</SelectItem>
                                <SelectItem value="active">{statusLabel('active', copy)}</SelectItem>
                                <SelectItem value="archived">{statusLabel('archived', copy)}</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={copy.estimatedDuration}><Input type="number" value={form.estimated_duration_minutes ?? ''} onChange={(e) => setForm({ ...form, estimated_duration_minutes: numberOrNull(e.target.value) })} /></Field>
                    <Field label={copy.requiredSkill}><Input value={form.required_skill ?? ''} onChange={(e) => setForm({ ...form, required_skill: e.target.value })} /></Field>
                    <Field label={copy.requiredRole}><Input value={form.required_role ?? ''} onChange={(e) => setForm({ ...form, required_role: e.target.value })} /></Field>
                    <Field label={copy.description}><Textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                    <Field label={copy.safetyNotes}><Textarea value={form.safety_notes ?? ''} onChange={(e) => setForm({ ...form, safety_notes: e.target.value })} /></Field>
                    <Field label={`${copy.tools} (name | qty | unit)`}><Textarea value={toolsText} onChange={(e) => setToolsText(e.target.value)} /></Field>
                    <Field label={`${copy.parts} (name | qty | unit)`}><Textarea value={partsText} onChange={(e) => setPartsText(e.target.value)} /></Field>
                    <Field label={`${copy.materials} (name | qty | unit)`}><Textarea value={materialsText} onChange={(e) => setMaterialsText(e.target.value)} /></Field>
                    <Field label={`${copy.references} (label | url)`}><Textarea value={referencesText} onChange={(e) => setReferencesText(e.target.value)} /></Field>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold font-cairo">{copy.checklist}</h3>
                        <Button variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, items: [...current.items, blankItem((current.items.length + 1) * 10)] }))}>
                            <Plus className="me-2 h-4 w-4" />{copy.addItem}
                        </Button>
                    </div>
                    <div className="space-y-3">
                        {form.items.map((item, index) => (
                            <div key={index} className="grid gap-3 rounded-md border p-3 lg:grid-cols-12">
                                <div className="lg:col-span-4"><Input placeholder={copy.itemLabel} value={item.label} onChange={(e) => updateItem(index, { label: e.target.value })} /></div>
                                <div className="lg:col-span-3"><Input placeholder={copy.arabicName} value={item.label_ar ?? ''} onChange={(e) => updateItem(index, { label_ar: e.target.value })} /></div>
                                <div className="lg:col-span-2">
                                    <Select value={item.item_type} onValueChange={(value) => updateItem(index, { item_type: value as PMItemType })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{ITEM_TYPES.map((type) => <SelectItem key={type} value={type}>{itemTypeLabel(type, copy)}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="lg:col-span-1"><Input placeholder={copy.unit} value={item.unit ?? ''} onChange={(e) => updateItem(index, { unit: e.target.value })} /></div>
                                <label className="flex items-center gap-2 text-sm lg:col-span-1"><input type="checkbox" checked={item.is_required} onChange={(e) => updateItem(index, { is_required: e.target.checked })} />{copy.required}</label>
                                <label className="flex items-center gap-2 text-sm lg:col-span-1"><input type="checkbox" checked={Boolean(item.is_critical)} onChange={(e) => updateItem(index, { is_critical: e.target.checked })} />{copy.critical}</label>
                            </div>
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
