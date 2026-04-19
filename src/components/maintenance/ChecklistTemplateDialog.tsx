import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers3, Loader2, MoveDown, MoveUp, Plus, Trash2 } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { useChecklistTemplates } from '@/hooks/useChecklistTemplates'
import type {
    ChecklistTemplate,
    ChecklistTemplateItem,
    ChecklistTemplateItemType,
    ChecklistTemplateSection,
    ChecklistTemplateSectionType,
    ChecklistTemplateStatus,
    ChecklistTemplateType,
    CreateTemplateInput,
    CreateTemplateItemInput,
    CreateTemplateSectionInput,
} from '@/types/maintenance'

interface ChecklistTemplateDialogProps {
    isOpen: boolean
    onClose: () => void
    template?: ChecklistTemplate | null
}

interface EditableTemplateSection extends CreateTemplateSectionInput {
    id?: string
    clientId: string
}

interface EditableTemplateItem extends CreateTemplateItemInput {
    id?: string
    clientId: string
    sectionClientId: string
    optionsText: string
}

const ITEM_TYPES: ChecklistTemplateItemType[] = ['yes_no', 'numeric', 'text', 'photo', 'signature', 'select', 'reading']
const SECTION_TYPES: ChecklistTemplateSectionType[] = ['readings', 'visual', 'safety', 'notes', 'photos', 'approval', 'general', 'custom']
const TEMPLATE_TYPES: ChecklistTemplateType[] = ['pm_sheet', 'inspection_sheet', 'safety_sheet', 'general']
const TEMPLATE_STATUSES: ChecklistTemplateStatus[] = ['draft', 'active', 'archived']
const TARGET_SCOPE_OPTIONS = ['all', 'asset', 'building', 'asset_group'] as const

function createDefaultSection(): EditableTemplateSection {
    return {
        clientId: crypto.randomUUID(),
        code: 'general',
        title: 'General checks',
        title_ar: 'فحوصات عامة',
        section_type: 'general',
        sort_order: 1,
        is_collapsible: false,
        description: '',
        description_ar: '',
        metadata: {},
    }
}

function createEmptyItem(index: number, sectionClientId: string): EditableTemplateItem {
    return {
        clientId: crypto.randomUUID(),
        sectionClientId,
        section_id: null,
        sort_order: index + 1,
        label: '',
        label_ar: '',
        item_type: 'yes_no',
        is_required: false,
        is_critical: false,
        unit: '',
        min_value: null,
        max_value: null,
        warning_min_value: null,
        warning_max_value: null,
        placeholder: '',
        placeholder_ar: '',
        help_text: '',
        help_text_ar: '',
        applies_to_target_type: 'all',
        options: null,
        optionsText: '',
        description: '',
        description_ar: '',
        metadata: {},
    }
}

function numberOrNull(value: string) {
    return value.trim() ? Number(value) : null
}

export default function ChecklistTemplateDialog({
    isOpen,
    onClose,
    template,
}: ChecklistTemplateDialogProps) {
    const { t, i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const {
        createTemplate,
        updateTemplate,
        getTemplateSections,
        getTemplateItems,
        addSection,
        updateSection,
        deleteSection,
        addItem,
        updateItem,
        deleteItem,
        reorderItems,
    } = useChecklistTemplates()

    const [isSaving, setIsSaving] = useState(false)
    const [form, setForm] = useState<CreateTemplateInput>({
        code: '',
        name: '',
        name_ar: '',
        description: '',
        description_ar: '',
        category: '',
        asset_type: '',
        is_active: true,
        version: 1,
        status: 'active',
        template_type: 'pm_sheet',
        metadata: {},
    })
    const [sections, setSections] = useState<EditableTemplateSection[]>([])
    const [items, setItems] = useState<EditableTemplateItem[]>([])

    useEffect(() => {
        if (!isOpen) return

        if (!template) {
            const defaultSection = createDefaultSection()
            setForm({
                code: '',
                name: '',
                name_ar: '',
                description: '',
                description_ar: '',
                category: '',
                asset_type: '',
                is_active: true,
                version: 1,
                status: 'active',
                template_type: 'pm_sheet',
                metadata: {},
            })
            setSections([defaultSection])
            setItems([createEmptyItem(0, defaultSection.clientId)])
            return
        }

        setForm({
            code: template.code ?? '',
            name: template.name,
            name_ar: template.name_ar ?? '',
            description: template.description ?? '',
            description_ar: template.description_ar ?? '',
            category: template.category ?? '',
            asset_type: template.asset_type ?? '',
            is_active: template.is_active,
            version: template.version ?? 1,
            status: template.status ?? (template.is_active ? 'active' : 'archived'),
            template_type: template.template_type ?? 'pm_sheet',
            metadata: template.metadata ?? {},
        })

        void Promise.all([
            getTemplateSections(template.id),
            getTemplateItems(template.id),
        ]).then(([templateSections, templateItems]) => {
            const fallbackSection = createDefaultSection()
            const mappedSections = (templateSections.length > 0 ? templateSections : [fallbackSection as ChecklistTemplateSection]).map((section, index) => ({
                id: 'id' in section ? section.id : undefined,
                clientId: 'id' in section ? section.id : fallbackSection.clientId,
                code: section.code ?? '',
                title: section.title,
                title_ar: section.title_ar ?? '',
                description: section.description ?? '',
                description_ar: section.description_ar ?? '',
                section_type: section.section_type ?? 'general',
                sort_order: section.sort_order ?? index + 1,
                is_collapsible: section.is_collapsible ?? false,
                metadata: section.metadata ?? {},
            }))
            const firstSectionClientId = mappedSections[0]?.clientId ?? fallbackSection.clientId
            const sectionIdToClientId = new Map(mappedSections.filter((section) => section.id).map((section) => [section.id as string, section.clientId]))
            const mappedItems = templateItems.map((item, index) => ({
                id: item.id,
                clientId: item.id,
                sectionClientId: item.section_id ? sectionIdToClientId.get(item.section_id) ?? firstSectionClientId : firstSectionClientId,
                section_id: item.section_id,
                sort_order: item.sort_order ?? index + 1,
                label: item.label,
                label_ar: item.label_ar ?? '',
                item_type: item.item_type,
                is_required: item.is_required,
                is_critical: item.is_critical,
                unit: item.unit ?? '',
                min_value: item.min_value,
                max_value: item.max_value,
                warning_min_value: item.warning_min_value,
                warning_max_value: item.warning_max_value,
                placeholder: item.placeholder ?? '',
                placeholder_ar: item.placeholder_ar ?? '',
                help_text: item.help_text ?? '',
                help_text_ar: item.help_text_ar ?? '',
                applies_to_target_type: item.applies_to_target_type ?? 'all',
                options: item.options ?? null,
                optionsText: item.options ? JSON.stringify(item.options) : '',
                description: item.description ?? '',
                description_ar: item.description_ar ?? '',
                metadata: item.metadata ?? {},
            }))

            setSections(mappedSections.length > 0 ? mappedSections : [fallbackSection])
            setItems(mappedItems.length > 0 ? mappedItems : [createEmptyItem(0, firstSectionClientId)])
        })
    }, [getTemplateItems, getTemplateSections, isOpen, template])

    const itemCount = useMemo(() => items.filter((item) => item.label?.trim()).length, [items])
    const sectionCount = useMemo(() => sections.filter((section) => section.title?.trim()).length, [sections])
    const itemsBySection = useMemo(() => {
        const map = new Map<string, EditableTemplateItem[]>()
        sections.forEach((section) => map.set(section.clientId, []))
        items.forEach((item) => map.get(item.sectionClientId)?.push(item))
        return map
    }, [items, sections])

    const handleSectionChange = (clientId: string, key: keyof EditableTemplateSection, value: unknown) => {
        setSections((current) => current.map((section) => (
            section.clientId === clientId ? { ...section, [key]: value } : section
        )))
    }

    const handleAddSection = () => {
        setSections((current) => [...current, {
            clientId: crypto.randomUUID(),
            code: '',
            title: '',
            title_ar: '',
            description: '',
            description_ar: '',
            section_type: 'general',
            sort_order: current.length + 1,
            is_collapsible: false,
            metadata: {},
        }])
    }

    const handleRemoveSection = (clientId: string) => {
        if (sections.length === 1) {
            toast.error(t('pm.templates.section_required'))
            return
        }
        setSections((current) => current.filter((section) => section.clientId !== clientId).map((section, index) => ({ ...section, sort_order: index + 1 })))
        setItems((current) => current.filter((item) => item.sectionClientId !== clientId))
    }

    const handleMoveSection = (clientId: string, direction: 'up' | 'down') => {
        setSections((current) => {
            const index = current.findIndex((section) => section.clientId === clientId)
            const targetIndex = direction === 'up' ? index - 1 : index + 1
            if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current
            const next = [...current]
            const [moved] = next.splice(index, 1)
            next.splice(targetIndex, 0, moved)
            return next.map((section, orderIndex) => ({ ...section, sort_order: orderIndex + 1 }))
        })
    }

    const handleItemChange = (clientId: string, key: keyof EditableTemplateItem, value: unknown) => {
        setItems((current) => current.map((item) => (item.clientId === clientId ? { ...item, [key]: value } : item)))
    }

    const handleAddItem = (sectionClientId: string) => {
        const sectionItems = items.filter((item) => item.sectionClientId === sectionClientId)
        setItems((current) => [...current, createEmptyItem(sectionItems.length, sectionClientId)])
    }

    const handleMoveItem = (clientId: string, direction: 'up' | 'down') => {
        setItems((current) => {
            const sourceItem = current.find((item) => item.clientId === clientId)
            if (!sourceItem) return current
            const sameSectionItems = current
                .filter((item) => item.sectionClientId === sourceItem.sectionClientId)
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            const index = sameSectionItems.findIndex((item) => item.clientId === clientId)
            const targetIndex = direction === 'up' ? index - 1 : index + 1
            if (targetIndex < 0 || targetIndex >= sameSectionItems.length) return current
            const targetItem = sameSectionItems[targetIndex]
            return current.map((item) => {
                if (item.clientId === sourceItem.clientId) return { ...item, sort_order: targetItem.sort_order }
                if (item.clientId === targetItem.clientId) return { ...item, sort_order: sourceItem.sort_order }
                return item
            })
        })
    }

    const handleRemoveItem = (clientId: string) => {
        setItems((current) => {
            const next = current.filter((item) => item.clientId !== clientId)
            return next.length > 0 ? next : [createEmptyItem(0, sections[0]?.clientId ?? crypto.randomUUID())]
        })
    }

    const parseOptions = (item: EditableTemplateItem) => {
        if (!item.optionsText.trim()) return null
        try {
            return JSON.parse(item.optionsText)
        } catch {
            if (item.item_type === 'select') {
                return item.optionsText.split(',').map((option) => option.trim()).filter(Boolean)
            }
            throw new Error(t('pm.error.invalid_options'))
        }
    }

    const saveSections = async (templateId: string, originalSections: ChecklistTemplateSection[]) => {
        const submittedIds = new Set<string>()
        const sectionMap = new Map<string, string>()

        for (let index = 0; index < sections.length; index += 1) {
            const section = sections[index]
            if (!section.title?.trim()) continue

            const payload: CreateTemplateSectionInput = {
                code: section.code?.trim() || null,
                title: section.title.trim(),
                title_ar: section.title_ar?.trim() || null,
                description: section.description?.trim() || null,
                description_ar: section.description_ar?.trim() || null,
                section_type: section.section_type ?? 'general',
                sort_order: index + 1,
                is_collapsible: section.is_collapsible ?? false,
                metadata: section.metadata ?? {},
            }

            if (section.id) {
                submittedIds.add(section.id)
                await updateSection(section.id, payload)
                sectionMap.set(section.clientId, section.id)
            } else {
                const created = await addSection(templateId, payload)
                submittedIds.add(created.id)
                sectionMap.set(section.clientId, created.id)
            }
        }

        for (const original of originalSections) {
            if (!submittedIds.has(original.id)) await deleteSection(original.id)
        }

        return sectionMap
    }

    const saveItems = async (templateId: string, originalItems: ChecklistTemplateItem[], sectionMap: Map<string, string>) => {
        const submittedIds = new Set<string>()
        const orderedIds: string[] = []
        const orderedItems = [...items].sort((a, b) => {
            const sectionCompare = sections.findIndex((section) => section.clientId === a.sectionClientId) - sections.findIndex((section) => section.clientId === b.sectionClientId)
            return sectionCompare || (a.sort_order ?? 0) - (b.sort_order ?? 0)
        })

        for (let index = 0; index < orderedItems.length; index += 1) {
            const item = orderedItems[index]
            if (!item.label?.trim()) continue

            const payload: CreateTemplateItemInput = {
                section_id: sectionMap.get(item.sectionClientId) ?? null,
                sort_order: index + 1,
                label: item.label.trim(),
                label_ar: item.label_ar?.trim() || null,
                item_type: item.item_type ?? 'yes_no',
                is_required: item.is_required ?? false,
                is_critical: item.is_critical ?? false,
                unit: item.unit?.trim() || null,
                min_value: item.min_value ?? null,
                max_value: item.max_value ?? null,
                warning_min_value: item.warning_min_value ?? null,
                warning_max_value: item.warning_max_value ?? null,
                placeholder: item.placeholder?.trim() || null,
                placeholder_ar: item.placeholder_ar?.trim() || null,
                help_text: item.help_text?.trim() || null,
                help_text_ar: item.help_text_ar?.trim() || null,
                applies_to_target_type: item.applies_to_target_type ?? 'all',
                options: parseOptions(item),
                description: item.description?.trim() || null,
                description_ar: item.description_ar?.trim() || null,
                metadata: item.metadata ?? {},
            }

            if (item.id) {
                submittedIds.add(item.id)
                await updateItem(item.id, payload)
                orderedIds.push(item.id)
            } else {
                const created = await addItem(templateId, payload)
                submittedIds.add(created.id)
                orderedIds.push(created.id)
            }
        }

        for (const original of originalItems) {
            if (!submittedIds.has(original.id)) await deleteItem(original.id)
        }

        if (orderedIds.length > 0) await reorderItems(templateId, orderedIds)
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!form.name?.trim()) {
            toast.error(t('pm.error.template_name_required'))
            return
        }
        if (sectionCount === 0) {
            toast.error(t('pm.templates.section_required'))
            return
        }
        if (itemCount === 0) {
            toast.error(t('pm.error.template_item_required'))
            return
        }

        try {
            setIsSaving(true)
            const templatePayload: CreateTemplateInput = {
                ...form,
                code: form.code?.trim() || null,
                name: form.name.trim(),
                name_ar: form.name_ar?.trim() || null,
                description: form.description?.trim() || null,
                description_ar: form.description_ar?.trim() || null,
                category: form.category?.trim() || null,
                asset_type: form.asset_type?.trim() || null,
                is_active: form.status !== 'archived',
                status: form.status ?? 'active',
                template_type: form.template_type ?? 'pm_sheet',
                version: form.version ?? 1,
                metadata: form.metadata ?? {},
            }

            if (template) {
                const [existingSections, existingItems] = await Promise.all([getTemplateSections(template.id), getTemplateItems(template.id)])
                await updateTemplate(template.id, templatePayload)
                const sectionMap = await saveSections(template.id, existingSections)
                await saveItems(template.id, existingItems, sectionMap)
                toast.success(t('pm.success.template_updated'))
            } else {
                const created = await createTemplate(templatePayload)
                const sectionMap = await saveSections(created.id, [])
                await saveItems(created.id, [], sectionMap)
                toast.success(t('pm.success.template_created'))
            }
            onClose()
        } catch (error) {
            const fallback = t('pm.error.template_update_failed')
            toast.error(error instanceof Error ? error.message : fallback)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden border-primary/10 bg-gradient-to-br from-background via-background to-primary/5 shadow-2xl sm:max-w-6xl">
                <DialogHeader className={isRTL ? 'sm:text-right' : undefined}>
                    <DialogTitle className="font-cairo">{template ? t('pm.templates.edit') : t('pm.templates.create')}</DialogTitle>
                    <DialogDescription className="font-cairo">{t('pm.templates.sheet_builder_hint')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
                    <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.6fr)]">
                        <TemplateSettings form={form} setForm={setForm} />
                        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-primary/10 bg-background/95 shadow-xl">
                            <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h3 className="font-semibold font-cairo">{t('pm.templates.sections')}</h3>
                                    <p className="text-sm text-muted-foreground font-cairo">{sectionCount} {t('pm.templates.sections')} · {itemCount} {t('pm.templates.items')}</p>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddSection}>
                                    <Plus className="me-2 h-4 w-4" />{t('pm.templates.add_section')}
                                </Button>
                            </div>

                            <div className="flex-1 space-y-4 overflow-y-auto p-4">
                                {sections.map((section, sectionIndex) => (
                                    <SectionEditor
                                        key={section.clientId}
                                        section={section}
                                        sectionIndex={sectionIndex}
                                        sectionItems={itemsBySection.get(section.clientId) ?? []}
                                        onSectionChange={handleSectionChange}
                                        onMoveSection={handleMoveSection}
                                        onRemoveSection={handleRemoveSection}
                                        onAddItem={handleAddItem}
                                        onItemChange={handleItemChange}
                                        onMoveItem={handleMoveItem}
                                        onRemoveItem={handleRemoveItem}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 border-t pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                            {template ? t('common.save') : t('pm.templates.create')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function TemplateSettings({
    form,
    setForm,
}: {
    form: CreateTemplateInput
    setForm: React.Dispatch<React.SetStateAction<CreateTemplateInput>>
}) {
    const { t } = useTranslation()

    return (
        <div className="space-y-4 overflow-y-auto rounded-2xl border border-primary/10 bg-background/90 p-4 shadow-sm">
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                    <Layers3 className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold font-cairo">{t('pm.templates.sheet_settings')}</h3>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t('pm.templates.code')}>
                        <Input value={form.code ?? ''} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} dir="ltr" />
                    </Field>
                    <Field label={t('pm.templates.version')}>
                        <Input type="number" min={1} value={form.version ?? 1} onChange={(event) => setForm((current) => ({ ...current, version: Number(event.target.value) || 1 }))} dir="ltr" />
                    </Field>
                    <Field label={t('pm.templates.template_type')}>
                        <Select value={form.template_type ?? 'pm_sheet'} onValueChange={(value) => setForm((current) => ({ ...current, template_type: value as ChecklistTemplateType }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {TEMPLATE_TYPES.map((type) => <SelectItem key={type} value={type}>{t(`pm.templates.template_type_options.${type}`)}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t('common.status')}>
                        <Select value={form.status ?? 'active'} onValueChange={(value) => setForm((current) => ({ ...current, status: value as ChecklistTemplateStatus }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {TEMPLATE_STATUSES.map((status) => <SelectItem key={status} value={status}>{t(`pm.templates.status.${status}`)}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
            </div>

            <Field label={t('pm.templates.name')}>
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </Field>
            <Field label={t('pm.templates.name_ar')}>
                <Input value={form.name_ar ?? ''} onChange={(event) => setForm((current) => ({ ...current, name_ar: event.target.value }))} dir="rtl" />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
                <Field label={t('pm.templates.category')}>
                    <Input value={form.category ?? ''} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} />
                </Field>
                <Field label={t('pm.templates.asset_type')}>
                    <Input value={form.asset_type ?? ''} onChange={(event) => setForm((current) => ({ ...current, asset_type: event.target.value }))} />
                </Field>
            </div>
            <Field label={t('common.description')}>
                <Textarea rows={3} value={form.description ?? ''} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <Field label={t('pm.templates.description_ar')}>
                <Textarea rows={3} value={form.description_ar ?? ''} onChange={(event) => setForm((current) => ({ ...current, description_ar: event.target.value }))} dir="rtl" />
            </Field>
        </div>
    )
}

function SectionEditor({
    section,
    sectionIndex,
    sectionItems,
    onSectionChange,
    onMoveSection,
    onRemoveSection,
    onAddItem,
    onItemChange,
    onMoveItem,
    onRemoveItem,
}: {
    section: EditableTemplateSection
    sectionIndex: number
    sectionItems: EditableTemplateItem[]
    onSectionChange: (clientId: string, key: keyof EditableTemplateSection, value: unknown) => void
    onMoveSection: (clientId: string, direction: 'up' | 'down') => void
    onRemoveSection: (clientId: string) => void
    onAddItem: (sectionClientId: string) => void
    onItemChange: (clientId: string, key: keyof EditableTemplateItem, value: unknown) => void
    onMoveItem: (clientId: string, direction: 'up' | 'down') => void
    onRemoveItem: (clientId: string) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm">
            <div className="border-b bg-slate-900 px-4 py-3 text-white">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="grid flex-1 gap-3 md:grid-cols-2">
                        <Field label={t('pm.templates.section_title')} inverse>
                            <Input value={section.title} onChange={(event) => onSectionChange(section.clientId, 'title', event.target.value)} className="bg-white text-slate-900" />
                        </Field>
                        <Field label={t('pm.templates.section_title_ar')} inverse>
                            <Input value={section.title_ar ?? ''} onChange={(event) => onSectionChange(section.clientId, 'title_ar', event.target.value)} className="bg-white text-slate-900" dir="rtl" />
                        </Field>
                        <Field label={t('pm.templates.section_type')} inverse>
                            <Select value={section.section_type ?? 'general'} onValueChange={(value) => onSectionChange(section.clientId, 'section_type', value as ChecklistTemplateSectionType)}>
                                <SelectTrigger className="bg-white text-slate-900"><SelectValue /></SelectTrigger>
                                <SelectContent>{SECTION_TYPES.map((type) => <SelectItem key={type} value={type}>{t(`pm.templates.section_type_options.${type}`)}</SelectItem>)}</SelectContent>
                            </Select>
                        </Field>
                        <Field label={t('pm.templates.code')} inverse>
                            <Input value={section.code ?? ''} onChange={(event) => onSectionChange(section.clientId, 'code', event.target.value)} className="bg-white text-slate-900" dir="ltr" />
                        </Field>
                    </div>
                    <div className="flex items-center gap-1">
                        <Badge className="border-white/30 bg-white/10 text-white">{sectionIndex + 1}</Badge>
                        <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => onMoveSection(section.clientId, 'up')}><MoveUp className="h-4 w-4" /></Button>
                        <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => onMoveSection(section.clientId, 'down')}><MoveDown className="h-4 w-4" /></Button>
                        <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => onRemoveSection(section.clientId)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                </div>
            </div>

            <div className="space-y-3 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                    <Textarea rows={2} value={section.description ?? ''} placeholder={t('pm.templates.section_description')} onChange={(event) => onSectionChange(section.clientId, 'description', event.target.value)} />
                    <Textarea rows={2} value={section.description_ar ?? ''} placeholder={t('pm.templates.section_description_ar')} onChange={(event) => onSectionChange(section.clientId, 'description_ar', event.target.value)} dir="rtl" />
                </div>
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium font-cairo">{t('pm.templates.items')}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => onAddItem(section.clientId)}>
                        <Plus className="me-2 h-4 w-4" />{t('pm.templates.add_item')}
                    </Button>
                </div>
                {sectionItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-background px-4 py-6 text-center text-sm text-muted-foreground font-cairo">{t('pm.templates.no_section_items')}</div>
                ) : (
                    sectionItems
                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                        .map((item, index) => (
                            <ItemEditor key={item.clientId} item={item} index={index} onChange={onItemChange} onMove={onMoveItem} onRemove={onRemoveItem} />
                        ))
                )}
            </div>
        </div>
    )
}

function ItemEditor({
    item,
    index,
    onChange,
    onMove,
    onRemove,
}: {
    item: EditableTemplateItem
    index: number
    onChange: (clientId: string, key: keyof EditableTemplateItem, value: unknown) => void
    onMove: (clientId: string, direction: 'up' | 'down') => void
    onRemove: (clientId: string) => void
}) {
    const { t } = useTranslation()
    const showsNumericConfig = item.item_type === 'numeric' || item.item_type === 'reading'

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{index + 1}</Badge>
                    <Badge variant="secondary">{t(`pm.templates.item_type.${item.item_type ?? 'yes_no'}`)}</Badge>
                    {item.is_required ? <Badge variant="outline">{t('pm.templates.required')}</Badge> : null}
                    {item.is_critical ? <Badge variant="destructive">{t('pm.templates.critical')}</Badge> : null}
                </div>
                <div className="flex items-center gap-1">
                    <Button type="button" size="icon" variant="ghost" onClick={() => onMove(item.clientId, 'up')}><MoveUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => onMove(item.clientId, 'down')}><MoveDown className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => onRemove(item.clientId)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Field label={t('pm.templates.item_label')}><Input value={item.label} onChange={(event) => onChange(item.clientId, 'label', event.target.value)} /></Field>
                <Field label={t('pm.templates.item_label_ar')}><Input value={item.label_ar ?? ''} onChange={(event) => onChange(item.clientId, 'label_ar', event.target.value)} dir="rtl" /></Field>
                <Field label={t('pm.templates.type')}>
                    <Select value={item.item_type ?? 'yes_no'} onValueChange={(value) => onChange(item.clientId, 'item_type', value as ChecklistTemplateItemType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ITEM_TYPES.map((itemType) => <SelectItem key={itemType} value={itemType}>{t(`pm.templates.item_type.${itemType}`)}</SelectItem>)}</SelectContent>
                    </Select>
                </Field>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label={t('pm.templates.applies_to')}>
                    <Select value={item.applies_to_target_type ?? 'all'} onValueChange={(value) => onChange(item.clientId, 'applies_to_target_type', value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{TARGET_SCOPE_OPTIONS.map((scope) => <SelectItem key={scope} value={scope}>{t(`pm.templates.applies_to_options.${scope}`)}</SelectItem>)}</SelectContent>
                    </Select>
                </Field>
                <Field label={t('pm.templates.unit')}><Input value={item.unit ?? ''} onChange={(event) => onChange(item.clientId, 'unit', event.target.value)} dir="ltr" /></Field>
                <Field label={t('pm.templates.placeholder')}><Input value={item.placeholder ?? ''} onChange={(event) => onChange(item.clientId, 'placeholder', event.target.value)} /></Field>
                <Field label={t('pm.templates.placeholder_ar')}><Input value={item.placeholder_ar ?? ''} onChange={(event) => onChange(item.clientId, 'placeholder_ar', event.target.value)} dir="rtl" /></Field>
            </div>

            {showsNumericConfig ? (
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <Field label={t('pm.templates.min_value')}><Input type="number" value={item.min_value ?? ''} onChange={(event) => onChange(item.clientId, 'min_value', numberOrNull(event.target.value))} dir="ltr" /></Field>
                    <Field label={t('pm.templates.max_value')}><Input type="number" value={item.max_value ?? ''} onChange={(event) => onChange(item.clientId, 'max_value', numberOrNull(event.target.value))} dir="ltr" /></Field>
                    <Field label={t('pm.templates.warning_min_value')}><Input type="number" value={item.warning_min_value ?? ''} onChange={(event) => onChange(item.clientId, 'warning_min_value', numberOrNull(event.target.value))} dir="ltr" /></Field>
                    <Field label={t('pm.templates.warning_max_value')}><Input type="number" value={item.warning_max_value ?? ''} onChange={(event) => onChange(item.clientId, 'warning_max_value', numberOrNull(event.target.value))} dir="ltr" /></Field>
                </div>
            ) : null}

            {(item.item_type === 'select' || showsNumericConfig) ? (
                <div className="mt-3">
                    <Field label={t('pm.templates.options')}>
                        <Textarea rows={2} value={item.optionsText} onChange={(event) => onChange(item.clientId, 'optionsText', event.target.value)} placeholder={item.item_type === 'select' ? 'good, fair, poor' : '{"unit":"°C"}'} dir="ltr" />
                    </Field>
                </div>
            ) : null}

            <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label={t('pm.templates.help_text')}><Textarea rows={2} value={item.help_text ?? ''} onChange={(event) => onChange(item.clientId, 'help_text', event.target.value)} /></Field>
                <Field label={t('pm.templates.help_text_ar')}><Textarea rows={2} value={item.help_text_ar ?? ''} onChange={(event) => onChange(item.clientId, 'help_text_ar', event.target.value)} dir="rtl" /></Field>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-cairo"><input type="checkbox" checked={item.is_required ?? false} onChange={(event) => onChange(item.clientId, 'is_required', event.target.checked)} className="h-4 w-4" />{t('pm.templates.required')}</label>
                <label className="flex items-center gap-2 text-sm font-cairo"><input type="checkbox" checked={item.is_critical ?? false} onChange={(event) => onChange(item.clientId, 'is_critical', event.target.checked)} className="h-4 w-4" />{t('pm.templates.critical')}</label>
            </div>
        </div>
    )
}

function Field({
    label,
    inverse,
    children,
}: {
    label: string
    inverse?: boolean
    children: React.ReactNode
}) {
    return (
        <label className="space-y-2">
            <span className={cn('text-sm font-medium font-cairo', inverse ? 'text-white/80' : undefined)}>
                {label}
            </span>
            {children}
        </label>
    )
}
