import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'
import type {
    ChecklistTemplate,
    ChecklistTemplateItem,
    ChecklistTemplateSection,
    CreateTemplateInput,
    CreateTemplateItemInput,
    CreateTemplateSectionInput,
    UpdateTemplateInput,
    UpdateTemplateItemInput,
    UpdateTemplateSectionInput,
} from '@/types/maintenance'

interface ChecklistTemplateFilters {
    category?: string
    asset_type?: string
}

const checklistTemplateKeys = {
    all: ['checklist-templates'] as const,
    list: (tenantId: string | null, filters?: ChecklistTemplateFilters) =>
        [...checklistTemplateKeys.all, tenantId, filters ?? {}] as const,
    sections: (templateId: string) => [...checklistTemplateKeys.all, 'sections', templateId] as const,
    items: (templateId: string) => [...checklistTemplateKeys.all, 'items', templateId] as const,
}

export function useChecklistTemplates(filters?: ChecklistTemplateFilters) {
    const tenantId = useCurrentTenantId()
    const queryClient = useQueryClient()

    const templatesQuery = useQuery({
        queryKey: checklistTemplateKeys.list(tenantId, filters),
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return []

            let query = (supabase.from('checklist_templates') as any)
                .select('*')
                .eq('tenant_id', tenantId)

            if (filters?.category && filters.category !== 'all') {
                query = query.eq('category', filters.category)
            }

            if (filters?.asset_type && filters.asset_type !== 'all') {
                query = query.eq('asset_type', filters.asset_type)
            }

            const { data, error } = await query
                .order('is_active', { ascending: false })
                .order('updated_at', { ascending: false })

            if (error) throw error
            return (data ?? []) as ChecklistTemplate[]
        },
    })

    const invalidateTemplates = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.all }),
            queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] }),
        ])
    }

    const createTemplateMutation = useMutation({
        mutationFn: async (input: CreateTemplateInput) => {
            if (!tenantId) throw new Error('Tenant not found')

            // is_active is now a GENERATED column (status = 'active') — do not include in payload
            const { data, error } = await (supabase.from('checklist_templates') as any)
                .insert({
                    tenant_id: tenantId,
                    code: input.code?.trim() || null,
                    name: input.name.trim(),
                    name_ar: input.name_ar?.trim() || null,
                    description: input.description?.trim() || null,
                    description_ar: input.description_ar?.trim() || null,
                    category: input.category?.trim() || null,
                    asset_type: input.asset_type?.trim() || null,
                    version: input.version ?? 1,
                    status: input.status ?? (input.is_active === false ? 'archived' : 'active'),
                    template_type: input.template_type ?? 'pm_sheet',
                    metadata: input.metadata ?? {},
                })
                .select('*')
                .single()

            if (error) throw error

            // Auto-create a default General section so the user can add items immediately
            await (supabase.from('checklist_template_sections') as any)
                .insert({
                    template_id: data.id,
                    code: 'general',
                    title: 'General',
                    title_ar: 'عام',
                    section_type: 'general',
                    sort_order: 0,
                    is_collapsible: false,
                    metadata: {},
                })

            return data as ChecklistTemplate
        },
        onSuccess: invalidateTemplates,
    })

    const updateTemplateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateTemplateInput }) => {
            const payload: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
            }

            if ('code' in data) payload.code = data.code?.trim() || null
            if ('name' in data) payload.name = data.name?.trim()
            if ('name_ar' in data) payload.name_ar = data.name_ar?.trim() || null
            if ('description' in data) payload.description = data.description?.trim() || null
            if ('description_ar' in data) payload.description_ar = data.description_ar?.trim() || null
            if ('category' in data) payload.category = data.category?.trim() || null
            if ('asset_type' in data) payload.asset_type = data.asset_type?.trim() || null
            if ('version' in data) payload.version = data.version ?? 1
            // is_active is a GENERATED column — translate it to status instead
            if ('is_active' in data && !('status' in data)) {
                payload.status = data.is_active === false ? 'archived' : 'active'
            } else if ('status' in data) {
                payload.status = data.status ?? 'active'
            }
            if ('template_type' in data) payload.template_type = data.template_type ?? 'pm_sheet'
            if ('metadata' in data) payload.metadata = data.metadata ?? {}

            const { data: updated, error } = await (supabase.from('checklist_templates') as any)
                .update(payload)
                .eq('id', id)
                .select('*')
                .single()

            if (error) throw error
            return updated as ChecklistTemplate
        },
        onSuccess: invalidateTemplates,
    })

    const deleteTemplateMutation = useMutation({
        mutationFn: async (id: string) => {
            const { count, error: activeTaskError } = await (supabase.from('maintenance_tasks') as any)
                .select('id', { count: 'exact', head: true })
                .eq('checklist_template_id', id)
                .in('status', ['pending', 'in_progress'])

            if (activeTaskError) throw activeTaskError
            if ((count ?? 0) > 0) {
                throw new Error('template_in_use')
            }

            const { error } = await (supabase.from('checklist_templates') as any)
                .delete()
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: invalidateTemplates,
    })

    const duplicateTemplateMutation = useMutation({
        mutationFn: async (id: string) => {
            const { data: template, error: templateError } = await (supabase.from('checklist_templates') as any)
                .select('*')
                .eq('id', id)
                .single()

            if (templateError) throw templateError

            const { data: items, error: itemsError } = await (supabase.from('checklist_template_items') as any)
                .select('*')
                .eq('template_id', id)
                .order('sort_order', { ascending: true })

            if (itemsError) throw itemsError

            const { data: sections, error: sectionsError } = await (supabase.from('checklist_template_sections') as any)
                .select('*')
                .eq('template_id', id)
                .order('sort_order', { ascending: true })

            if (sectionsError) throw sectionsError

            const { data: copy, error: copyError } = await (supabase.from('checklist_templates') as any)
                .insert({
                    tenant_id: template.tenant_id,
                    code: template.code ? `${template.code}-copy-${Date.now().toString().slice(-4)}` : null,
                    name: `${template.name} Copy`,
                    name_ar: template.name_ar ? `${template.name_ar} - نسخة` : null,
                    description: template.description,
                    description_ar: template.description_ar,
                    category: template.category,
                    asset_type: template.asset_type,
                    version: 1,
                    status: 'draft',
                    template_type: template.template_type ?? 'pm_sheet',
                    metadata: template.metadata ?? {},
                    is_active: false,
                })
                .select('*')
                .single()

            if (copyError) throw copyError

            const sectionIdMap = new Map<string, string>()
            if (Array.isArray(sections) && sections.length > 0) {
                const { data: copiedSections, error: insertSectionsError } = await (supabase.from('checklist_template_sections') as any)
                    .insert(
                        sections.map((section: ChecklistTemplateSection) => ({
                            template_id: copy.id,
                            code: section.code,
                            title: section.title,
                            title_ar: section.title_ar,
                            description: section.description,
                            description_ar: section.description_ar,
                            section_type: section.section_type,
                            sort_order: section.sort_order,
                            is_collapsible: section.is_collapsible,
                            metadata: section.metadata ?? {},
                        }))
                    )
                    .select('id, code, title, sort_order')

                if (insertSectionsError) throw insertSectionsError

                ;(copiedSections ?? []).forEach((copied: ChecklistTemplateSection, index: number) => {
                    const original = sections[index] as ChecklistTemplateSection | undefined
                    if (original) sectionIdMap.set(original.id, copied.id)
                })
            }

            if (Array.isArray(items) && items.length > 0) {
                const { error: insertItemsError } = await (supabase.from('checklist_template_items') as any)
                    .insert(
                        items.map((item: ChecklistTemplateItem) => ({
                            template_id: copy.id,
                            section_id: item.section_id ? sectionIdMap.get(item.section_id) ?? null : null,
                            sort_order: item.sort_order,
                            label: item.label,
                            label_ar: item.label_ar,
                            item_type: item.item_type,
                            is_required: item.is_required,
                            is_critical: item.is_critical,
                            unit: item.unit,
                            min_value: item.min_value,
                            max_value: item.max_value,
                            warning_min_value: item.warning_min_value,
                            warning_max_value: item.warning_max_value,
                            placeholder: item.placeholder,
                            placeholder_ar: item.placeholder_ar,
                            help_text: item.help_text,
                            help_text_ar: item.help_text_ar,
                            applies_to_target_type: item.applies_to_target_type ?? 'all',
                            options: item.options,
                            description: item.description,
                            description_ar: item.description_ar,
                            metadata: item.metadata ?? {},
                        }))
                    )

                if (insertItemsError) throw insertItemsError
            }

            return copy as ChecklistTemplate
        },
        onSuccess: invalidateTemplates,
    })

    const getTemplateSections = useCallback(async (templateId: string) => {
        return queryClient.fetchQuery({
            queryKey: checklistTemplateKeys.sections(templateId),
            queryFn: async () => {
                const { data, error } = await (supabase.from('checklist_template_sections') as any)
                    .select('*')
                    .eq('template_id', templateId)
                    .order('sort_order', { ascending: true })

                if (error) throw error
                return (data ?? []) as ChecklistTemplateSection[]
            },
        })
    }, [queryClient])

    const getTemplateItems = useCallback(async (templateId: string) => {
        return queryClient.fetchQuery({
            queryKey: checklistTemplateKeys.items(templateId),
            queryFn: async () => {
                const { data, error } = await (supabase.from('checklist_template_items') as any)
                    .select(`
                        *,
                        section:checklist_template_sections!section_id(*)
                    `)
                    .eq('template_id', templateId)
                    .order('sort_order', { ascending: true })

                if (error) throw error
                return (data ?? []) as ChecklistTemplateItem[]
            },
        })
    }, [queryClient])

    const addSectionMutation = useMutation({
        mutationFn: async ({
            templateId,
            data,
        }: {
            templateId: string
            data: CreateTemplateSectionInput
        }) => {
            const { data: created, error } = await (supabase.from('checklist_template_sections') as any)
                .insert({
                    template_id: templateId,
                    code: data.code?.trim() || null,
                    title: data.title.trim(),
                    title_ar: data.title_ar?.trim() || null,
                    description: data.description?.trim() || null,
                    description_ar: data.description_ar?.trim() || null,
                    section_type: data.section_type ?? 'general',
                    sort_order: data.sort_order ?? 0,
                    is_collapsible: data.is_collapsible ?? false,
                    metadata: data.metadata ?? {},
                })
                .select('*')
                .single()

            if (error) throw error
            return created as ChecklistTemplateSection
        },
        onSuccess: async (_, variables) => {
            await Promise.all([
                invalidateTemplates(),
                queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.sections(variables.templateId) }),
            ])
        },
    })

    const updateSectionMutation = useMutation({
        mutationFn: async ({ sectionId, data }: { sectionId: string; data: UpdateTemplateSectionInput }) => {
            const payload: Record<string, unknown> = {}

            if ('code' in data) payload.code = data.code?.trim() || null
            if ('title' in data) payload.title = data.title?.trim()
            if ('title_ar' in data) payload.title_ar = data.title_ar?.trim() || null
            if ('description' in data) payload.description = data.description?.trim() || null
            if ('description_ar' in data) payload.description_ar = data.description_ar?.trim() || null
            if ('section_type' in data) payload.section_type = data.section_type ?? 'general'
            if ('sort_order' in data) payload.sort_order = data.sort_order ?? 0
            if ('is_collapsible' in data) payload.is_collapsible = data.is_collapsible ?? false
            if ('metadata' in data) payload.metadata = data.metadata ?? {}

            const { data: updated, error } = await (supabase.from('checklist_template_sections') as any)
                .update(payload)
                .eq('id', sectionId)
                .select('*')
                .single()

            if (error) throw error
            return updated as ChecklistTemplateSection
        },
        onSuccess: async (section) => {
            await Promise.all([
                invalidateTemplates(),
                queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.sections(section.template_id) }),
                queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.items(section.template_id) }),
            ])
        },
    })

    const deleteSectionMutation = useMutation({
        mutationFn: async (sectionId: string) => {
            const { data, error } = await (supabase.from('checklist_template_sections') as any)
                .delete()
                .eq('id', sectionId)
                .select('template_id')
                .single()

            if (error) throw error
            return data as { template_id: string }
        },
        onSuccess: async (result) => {
            await Promise.all([
                invalidateTemplates(),
                queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.sections(result.template_id) }),
                queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.items(result.template_id) }),
            ])
        },
    })

    const addItemMutation = useMutation({
        mutationFn: async ({
            templateId,
            data,
        }: {
            templateId: string
            data: CreateTemplateItemInput
        }) => {
            const { data: created, error } = await (supabase.from('checklist_template_items') as any)
                .insert({
                    template_id: templateId,
                    section_id: data.section_id ?? null,
                    sort_order: data.sort_order ?? 0,
                    label: data.label.trim(),
                    label_ar: data.label_ar?.trim() || null,
                    item_type: data.item_type ?? 'yes_no',
                    is_required: data.is_required ?? false,
                    is_critical: data.is_critical ?? false,
                    unit: data.unit?.trim() || null,
                    min_value: data.min_value ?? null,
                    max_value: data.max_value ?? null,
                    warning_min_value: data.warning_min_value ?? null,
                    warning_max_value: data.warning_max_value ?? null,
                    placeholder: data.placeholder?.trim() || null,
                    placeholder_ar: data.placeholder_ar?.trim() || null,
                    help_text: data.help_text?.trim() || null,
                    help_text_ar: data.help_text_ar?.trim() || null,
                    applies_to_target_type: data.applies_to_target_type ?? 'all',
                    options: data.options ?? null,
                    description: data.description?.trim() || null,
                    description_ar: data.description_ar?.trim() || null,
                    metadata: data.metadata ?? {},
                })
                .select('*')
                .single()

            if (error) throw error
            return created as ChecklistTemplateItem
        },
        onSuccess: async (_, variables) => {
            await Promise.all([
                invalidateTemplates(),
                queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.items(variables.templateId) }),
            ])
        },
    })

    const updateItemMutation = useMutation({
        mutationFn: async ({ itemId, data }: { itemId: string; data: UpdateTemplateItemInput }) => {
            const payload: Record<string, unknown> = {}

            if ('section_id' in data) payload.section_id = data.section_id ?? null
            if ('sort_order' in data) payload.sort_order = data.sort_order ?? 0
            if ('label' in data) payload.label = data.label?.trim()
            if ('label_ar' in data) payload.label_ar = data.label_ar?.trim() || null
            if ('item_type' in data) payload.item_type = data.item_type ?? 'yes_no'
            if ('is_required' in data) payload.is_required = data.is_required ?? false
            if ('is_critical' in data) payload.is_critical = data.is_critical ?? false
            if ('unit' in data) payload.unit = data.unit?.trim() || null
            if ('min_value' in data) payload.min_value = data.min_value ?? null
            if ('max_value' in data) payload.max_value = data.max_value ?? null
            if ('warning_min_value' in data) payload.warning_min_value = data.warning_min_value ?? null
            if ('warning_max_value' in data) payload.warning_max_value = data.warning_max_value ?? null
            if ('placeholder' in data) payload.placeholder = data.placeholder?.trim() || null
            if ('placeholder_ar' in data) payload.placeholder_ar = data.placeholder_ar?.trim() || null
            if ('help_text' in data) payload.help_text = data.help_text?.trim() || null
            if ('help_text_ar' in data) payload.help_text_ar = data.help_text_ar?.trim() || null
            if ('applies_to_target_type' in data) payload.applies_to_target_type = data.applies_to_target_type ?? 'all'
            if ('options' in data) payload.options = data.options ?? null
            if ('description' in data) payload.description = data.description?.trim() || null
            if ('description_ar' in data) payload.description_ar = data.description_ar?.trim() || null
            if ('metadata' in data) payload.metadata = data.metadata ?? {}

            const { data: updated, error } = await (supabase.from('checklist_template_items') as any)
                .update(payload)
                .eq('id', itemId)
                .select('*')
                .single()

            if (error) throw error
            return updated as ChecklistTemplateItem
        },
        onSuccess: async (item) => {
            await Promise.all([
                invalidateTemplates(),
                queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.items(item.template_id) }),
            ])
        },
    })

    const deleteItemMutation = useMutation({
        mutationFn: async (itemId: string) => {
            const { data, error } = await (supabase.from('checklist_template_items') as any)
                .delete()
                .eq('id', itemId)
                .select('template_id')
                .single()

            if (error) throw error
            return data as { template_id: string }
        },
        onSuccess: async (result) => {
            await Promise.all([
                invalidateTemplates(),
                queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.items(result.template_id) }),
            ])
        },
    })

    const reorderItemsMutation = useMutation({
        mutationFn: async ({ templateId, itemIds }: { templateId: string; itemIds: string[] }) => {
            await Promise.all(
                itemIds.map((itemId, index) =>
                    (supabase.from('checklist_template_items') as any)
                        .update({ sort_order: index + 1 })
                        .eq('id', itemId)
                )
            )
            return templateId
        },
        onSuccess: async (templateId) => {
            await Promise.all([
                invalidateTemplates(),
                queryClient.invalidateQueries({ queryKey: checklistTemplateKeys.items(templateId) }),
            ])
        },
    })

    return {
        templates: templatesQuery.data ?? [],
        isLoading: templatesQuery.isLoading,
        error: templatesQuery.error instanceof Error ? templatesQuery.error.message : null,
        createTemplate: (data: CreateTemplateInput) => createTemplateMutation.mutateAsync(data),
        updateTemplate: (id: string, data: UpdateTemplateInput) => updateTemplateMutation.mutateAsync({ id, data }),
        deleteTemplate: (id: string) => deleteTemplateMutation.mutateAsync(id),
        duplicateTemplate: (id: string) => duplicateTemplateMutation.mutateAsync(id),
        getTemplateSections,
        getTemplateItems,
        addSection: (templateId: string, data: CreateTemplateSectionInput) => addSectionMutation.mutateAsync({ templateId, data }),
        updateSection: (sectionId: string, data: UpdateTemplateSectionInput) => updateSectionMutation.mutateAsync({ sectionId, data }),
        deleteSection: (sectionId: string) => deleteSectionMutation.mutateAsync(sectionId).then(() => undefined),
        addItem: (templateId: string, data: CreateTemplateItemInput) => addItemMutation.mutateAsync({ templateId, data }),
        updateItem: (itemId: string, data: UpdateTemplateItemInput) => updateItemMutation.mutateAsync({ itemId, data }),
        deleteItem: (itemId: string) => deleteItemMutation.mutateAsync(itemId).then(() => undefined),
        reorderItems: (templateId: string, itemIds: string[]) => reorderItemsMutation.mutateAsync({ templateId, itemIds }).then(() => undefined),
    }
}

export type {
    ChecklistTemplate,
    ChecklistTemplateItem,
    ChecklistTemplateSection,
    CreateTemplateInput,
    CreateTemplateItemInput,
    CreateTemplateSectionInput,
    UpdateTemplateInput,
    UpdateTemplateItemInput,
    UpdateTemplateSectionInput,
}
