import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'
import { workOrdersKeys } from './useWorkOrders'
import type {
    CreateTaskAttachmentInput,
    CreateTaskInput,
    MaintenanceTask,
    MaintenanceTaskAttachment,
    MaintenanceTaskCheck,
    MaintenanceTaskStatus,
    PmPdfExport,
    RecordPdfExportInput,
    ReviewMaintenanceTaskInput,
    UpdateCheckInput,
    UpdateTaskInput,
} from '@/types/maintenance'

// Legacy PM hook. New execution should go through work_orders plus
// work_order_checks / work_order_attachments. See docs/maintenance/pm-legacy-deprecation.md.
interface MaintenanceTaskFilters {
    plan_id?: string
    status?: string
    asset_id?: string
    assigned_to?: string
    frequency_bundle_id?: string
}

export const maintenanceTaskKeys = {
    all: ['maintenance-tasks'] as const,
    list: (tenantId: string | null, filters?: MaintenanceTaskFilters) =>
        [...maintenanceTaskKeys.all, tenantId, filters ?? {}] as const,
    checks: (taskId: string) => [...maintenanceTaskKeys.all, 'checks', taskId] as const,
    attachments: (taskId: string) => [...maintenanceTaskKeys.all, 'attachments', taskId] as const,
    pdfExports: (taskId: string) => [...maintenanceTaskKeys.all, 'pdf-exports', taskId] as const,
}

function normalizeOptionalUuid(value: string | null | undefined) {
    const normalized = value?.trim()
    return normalized ? normalized : null
}

function createWorkOrderCode() {
    return `WO-${Date.now().toString().slice(-8)}`
}

export function useMaintenanceTasks(filters?: MaintenanceTaskFilters) {
    const tenantId = useCurrentTenantId()
    const { user } = useAuth()
    const queryClient = useQueryClient()

    const tasksQuery = useQuery({
        queryKey: maintenanceTaskKeys.list(tenantId, filters),
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) return []

            let query = (supabase.from('maintenance_tasks') as any)
                .select(`
                    *,
                    assignee:profiles!assigned_to(id, full_name, full_name_ar, role),
                    assignedTeam:teams!assigned_team_id(id, code, name, name_ar, type),
                    asset:assets!asset_id(id, code, name, name_ar, building_id),
                    building:buildings!building_id(id, name, name_ar),
                    plan:maintenance_plans!maintenance_plan_id(id, name, name_ar, status),
                    checklistTemplate:checklist_templates!checklist_template_id(id, name, name_ar, category, asset_type),
                    frequencyBundle:maintenance_frequency_bundles!frequency_bundle_id(id, name, name_ar, frequency_type, interval_count),
                    reviewer:profiles!reviewed_by(id, full_name, full_name_ar, role),
                    executor:profiles!execution_completed_by(id, full_name, full_name_ar, role)
                `)
                .eq('tenant_id', tenantId)

            if (filters?.plan_id && filters.plan_id !== 'all') {
                query = query.eq('maintenance_plan_id', filters.plan_id)
            }

            if (filters?.status && filters.status !== 'all') {
                query = query.eq('status', filters.status)
            }

            if (filters?.asset_id && filters.asset_id !== 'all') {
                query = query.eq('asset_id', filters.asset_id)
            }

            if (filters?.assigned_to && filters.assigned_to !== 'all') {
                query = query.eq('assigned_to', filters.assigned_to)
            }

            if (filters?.frequency_bundle_id && filters.frequency_bundle_id !== 'all') {
                query = query.eq('frequency_bundle_id', filters.frequency_bundle_id)
            }

            const { data, error } = await query.order('due_date', { ascending: true, nullsFirst: false })

            if (error) throw error
            return (data ?? []) as MaintenanceTask[]
        },
    })

    const invalidateTasks = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: maintenanceTaskKeys.all }),
            queryClient.invalidateQueries({ queryKey: ['maintenance-plans'] }),
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.all }),
            queryClient.invalidateQueries({ queryKey: ['asset-maintenance'] }),
        ])
    }

    const createTaskMutation = useMutation({
        mutationFn: async (input: CreateTaskInput) => {
            if (!tenantId) throw new Error('Tenant not found')
            if (!user?.id) throw new Error('User not found')

            const assignedTo = normalizeOptionalUuid(input.assigned_to)
            let relatedWorkOrderId: string | null = null

            if (input.shouldCreateWorkOrder) {
                const { data: workOrder, error: workOrderError } = await (supabase as any)
                    .rpc('create_work_order', {
                        p_work_order: {
                            code: createWorkOrderCode(),
                            title: input.title,
                            description: input.description?.trim() || null,
                            priority: input.priority ?? 'medium',
                            assigned_team: normalizeOptionalUuid(input.assigned_team_id),
                            reported_by: user.id,
                            building_id: input.building_id ?? null,
                            asset_id: input.asset_id ?? null,
                            due_date: input.due_date ?? null,
                        },
                    })

                if (workOrderError) throw workOrderError
                relatedWorkOrderId = workOrder.id
            }

            const payload = {
                tenant_id: tenantId,
                maintenance_plan_id: input.maintenance_plan_id ?? null,
                frequency_bundle_id: input.frequency_bundle_id ?? null,
                title: input.title.trim(),
                description: input.description?.trim() || null,
                assigned_to: assignedTo,
                assigned_team_id: normalizeOptionalUuid(input.assigned_team_id),
                status: 'pending' as MaintenanceTaskStatus,
                priority: input.priority ?? 'medium',
                due_date: input.due_date ?? null,
                related_work_order_id: relatedWorkOrderId,
                created_by: user.id,
                asset_id: input.asset_id ?? null,
                building_id: input.building_id ?? null,
                checklist_template_id: input.checklist_template_id ?? null,
                checklist: input.checklist_template_id ? [] : input.checklist ?? [],
                completion_notes: null,
                estimated_duration_minutes: input.estimated_duration_minutes ?? null,
                requires_photo: input.requires_photo ?? false,
                requires_signature: input.requires_signature ?? false,
                recurrence_type: input.recurrence_type ?? 'once',
                recurrence_interval: input.recurrence_interval ?? 1,
                execution_snapshot: input.execution_snapshot ?? null,
            }

            const { data, error } = await (supabase.from('maintenance_tasks') as any)
                .insert(payload)
                .select(`
                    *,
                    assignee:profiles!assigned_to(id, full_name, full_name_ar, role),
                    assignedTeam:teams!assigned_team_id(id, code, name, name_ar, type),
                    asset:assets!asset_id(id, code, name, name_ar, building_id),
                    building:buildings!building_id(id, name, name_ar),
                    plan:maintenance_plans!maintenance_plan_id(id, name, name_ar, status),
                    checklistTemplate:checklist_templates!checklist_template_id(id, name, name_ar, category, asset_type),
                    frequencyBundle:maintenance_frequency_bundles!frequency_bundle_id(id, name, name_ar, frequency_type, interval_count),
                    reviewer:profiles!reviewed_by(id, full_name, full_name_ar, role),
                    executor:profiles!execution_completed_by(id, full_name, full_name_ar, role)
                `)
                .single()

            if (error) throw error

            if (!data.execution_snapshot && (input.frequency_bundle_id || input.checklist_template_id)) {
                const { data: snapshot } = await (supabase as any).rpc('pm_build_task_execution_snapshot', {
                    p_task_id: data.id,
                })

                if (snapshot) {
                    await (supabase.from('maintenance_tasks') as any)
                        .update({ execution_snapshot: snapshot })
                        .eq('id', data.id)
                    data.execution_snapshot = snapshot
                }
            }

            return data as MaintenanceTask
        },
        onSuccess: invalidateTasks,
    })

    const updateTaskMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: UpdateTaskInput }) => {
            const payload: Record<string, unknown> = {}

            if ('maintenance_plan_id' in data) payload.maintenance_plan_id = data.maintenance_plan_id ?? null
            if ('frequency_bundle_id' in data) payload.frequency_bundle_id = data.frequency_bundle_id ?? null
            if ('title' in data) payload.title = data.title?.trim()
            if ('description' in data) payload.description = data.description?.trim() || null
            if ('assigned_to' in data) payload.assigned_to = normalizeOptionalUuid(data.assigned_to)
            if ('assigned_team_id' in data) payload.assigned_team_id = normalizeOptionalUuid(data.assigned_team_id)
            if ('status' in data) payload.status = data.status
            if ('priority' in data) payload.priority = data.priority
            if ('due_date' in data) payload.due_date = data.due_date ?? null
            if ('related_work_order_id' in data) payload.related_work_order_id = data.related_work_order_id ?? null
            if ('asset_id' in data) payload.asset_id = data.asset_id ?? null
            if ('building_id' in data) payload.building_id = data.building_id ?? null
            if ('checklist_template_id' in data) payload.checklist_template_id = data.checklist_template_id ?? null
            if ('checklist' in data) payload.checklist = data.checklist ?? []
            if ('completion_notes' in data) payload.completion_notes = data.completion_notes ?? null
            if ('estimated_duration_minutes' in data) payload.estimated_duration_minutes = data.estimated_duration_minutes ?? null
            if ('actual_duration_minutes' in data) payload.actual_duration_minutes = data.actual_duration_minutes ?? null
            if ('requires_photo' in data) payload.requires_photo = data.requires_photo ?? false
            if ('requires_signature' in data) payload.requires_signature = data.requires_signature ?? false
            if ('started_at' in data) payload.started_at = data.started_at ?? null
            if ('completed_at' in data) payload.completed_at = data.completed_at ?? null
            if ('attachments' in data) payload.attachments = data.attachments ?? []
            if ('executor_signature_url' in data) payload.executor_signature_url = data.executor_signature_url ?? null
            if ('reviewer_signature_url' in data) payload.reviewer_signature_url = data.reviewer_signature_url ?? null
            if ('review_notes' in data) payload.review_notes = data.review_notes ?? null
            if ('review_status' in data) payload.review_status = data.review_status ?? 'not_required'
            if ('recurrence_type' in data) payload.recurrence_type = data.recurrence_type ?? 'once'
            if ('recurrence_interval' in data) payload.recurrence_interval = data.recurrence_interval ?? 1
            if ('execution_snapshot' in data) payload.execution_snapshot = data.execution_snapshot ?? null

            const { data: updated, error } = await (supabase.from('maintenance_tasks') as any)
                .update(payload)
                .eq('id', id)
                .select(`
                    *,
                    assignee:profiles!assigned_to(id, full_name, full_name_ar, role),
                    assignedTeam:teams!assigned_team_id(id, code, name, name_ar, type),
                    asset:assets!asset_id(id, code, name, name_ar, building_id),
                    building:buildings!building_id(id, name, name_ar),
                    plan:maintenance_plans!maintenance_plan_id(id, name, name_ar, status),
                    checklistTemplate:checklist_templates!checklist_template_id(id, name, name_ar, category, asset_type),
                    frequencyBundle:maintenance_frequency_bundles!frequency_bundle_id(id, name, name_ar, frequency_type, interval_count),
                    reviewer:profiles!reviewed_by(id, full_name, full_name_ar, role),
                    executor:profiles!execution_completed_by(id, full_name, full_name_ar, role)
                `)
                .single()

            if (error) throw error
            return updated as MaintenanceTask
        },
        onSuccess: invalidateTasks,
    })

    const lifecycleMutation = useMutation({
        mutationFn: async ({
            id,
            action,
            notes,
        }: {
            id: string
            action: 'start' | 'complete' | 'cancel'
            notes?: string
        }) => {
            if (action === 'start') {
                const { error } = await (supabase as any).rpc('pm_start_task', {
                    p_task_id: id,
                })
                if (error) throw error
                return
            }

            if (action === 'complete') {
                const { error } = await (supabase as any).rpc('pm_complete_task', {
                    p_task_id: id,
                    p_completion_notes: notes ?? null,
                })
                if (error) throw error
                return
            }

            const { error } = await (supabase as any).rpc('pm_cancel_task', {
                p_task_id: id,
                p_reason: notes ?? '',
            })
            if (error) throw error
        },
        onSuccess: invalidateTasks,
    })

    const getTaskChecks = useCallback(async (taskId: string) => {
        const queryKey = maintenanceTaskKeys.checks(taskId)

        return queryClient.fetchQuery({
            queryKey,
            queryFn: async () => {
                try {
                    await (supabase as any).rpc('pm_populate_task_checks', {
                        p_task_id: taskId,
                    })
                } catch {
                    // Ignore; completed tasks may already have rows and read-only users may not have execute rights.
                }

                const { data, error } = await (supabase.from('maintenance_task_checks') as any)
                    .select(`
                        *,
                        template_item:checklist_template_items!template_item_id(*)
                    `)
                    .eq('task_id', taskId)
                    .order('sort_order', { ascending: true })

                if (error) throw error
                return (data ?? []) as MaintenanceTaskCheck[]
            },
        })
    }, [queryClient])

    const getTaskAttachments = useCallback(async (taskId: string) => {
        return queryClient.fetchQuery({
            queryKey: maintenanceTaskKeys.attachments(taskId),
            queryFn: async () => {
                const { data, error } = await (supabase.from('maintenance_task_attachments') as any)
                    .select('*')
                    .eq('task_id', taskId)
                    .order('uploaded_at', { ascending: false })

                if (error) throw error
                return (data ?? []) as MaintenanceTaskAttachment[]
            },
        })
    }, [queryClient])

    const getPdfExports = useCallback(async (taskId: string) => {
        return queryClient.fetchQuery({
            queryKey: maintenanceTaskKeys.pdfExports(taskId),
            queryFn: async () => {
                const { data, error } = await (supabase.from('pm_pdf_exports') as any)
                    .select('*')
                    .eq('task_id', taskId)
                    .order('generated_at', { ascending: false })

                if (error) throw error
                return (data ?? []) as PmPdfExport[]
            },
        })
    }, [queryClient])

    const updateTaskCheckMutation = useMutation({
        mutationFn: async ({ checkId, data }: { checkId: string; data: UpdateCheckInput }) => {
            const payload: Record<string, unknown> = {}

            if ('value_bool' in data) payload.value_bool = data.value_bool ?? null
            if ('value_numeric' in data) payload.value_numeric = data.value_numeric ?? null
            if ('value_text' in data) payload.value_text = data.value_text ?? null
            if ('value_photo_url' in data) payload.value_photo_url = data.value_photo_url ?? null
            if ('value_signature_url' in data) payload.value_signature_url = data.value_signature_url ?? null
            if ('status' in data) payload.status = data.status ?? 'pending'
            if ('notes' in data) payload.notes = data.notes ?? null
            payload.checked_at = new Date().toISOString()
            payload.checked_by = user?.id ?? null

            const { data: updated, error } = await (supabase.from('maintenance_task_checks') as any)
                .update(payload)
                .eq('id', checkId)
                .select('id, task_id')
                .single()

            if (error) throw error
            return updated as { id: string; task_id: string }
        },
        onSuccess: async (result) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: maintenanceTaskKeys.checks(result.task_id) }),
                queryClient.invalidateQueries({ queryKey: maintenanceTaskKeys.all }),
            ])
        },
    })

    const createAttachmentMutation = useMutation({
        mutationFn: async (input: CreateTaskAttachmentInput) => {
            if (!tenantId) throw new Error('Tenant not found')

            const { data, error } = await (supabase.from('maintenance_task_attachments') as any)
                .insert({
                    tenant_id: tenantId,
                    task_id: input.task_id,
                    check_id: input.check_id ?? null,
                    attachment_type: input.attachment_type ?? 'general',
                    file_name: input.file_name,
                    file_url: input.file_url,
                    storage_bucket: input.storage_bucket ?? null,
                    storage_path: input.storage_path ?? null,
                    mime_type: input.mime_type ?? null,
                    file_size: input.file_size ?? null,
                    notes: input.notes ?? null,
                    metadata: input.metadata ?? {},
                    uploaded_by: user?.id ?? null,
                })
                .select('*')
                .single()

            if (error) throw error
            return data as MaintenanceTaskAttachment
        },
        onSuccess: async (attachment) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: maintenanceTaskKeys.attachments(attachment.task_id) }),
                queryClient.invalidateQueries({ queryKey: maintenanceTaskKeys.all }),
            ])
        },
    })

    const reviewTaskMutation = useMutation({
        mutationFn: async ({ taskId, data }: { taskId: string; data: ReviewMaintenanceTaskInput }) => {
            const { error } = await (supabase as any).rpc('pm_review_task', {
                p_task_id: taskId,
                p_review_status: data.review_status,
                p_review_notes: data.review_notes ?? null,
                p_reviewer_signature_url: data.reviewer_signature_url ?? null,
            })

            if (error) throw error
        },
        onSuccess: invalidateTasks,
    })

    const recordPdfExportMutation = useMutation({
        mutationFn: async (input: RecordPdfExportInput) => {
            const { data, error } = await (supabase as any).rpc('pm_record_pdf_export', {
                p_task_id: input.task_id,
                p_file_name: input.file_name,
                p_file_url: input.file_url ?? null,
                p_rendered_snapshot: input.rendered_snapshot ?? {},
                p_results_snapshot: input.results_snapshot ?? {},
                p_metadata: input.metadata ?? {},
            })

            if (error) throw error
            return data as Record<string, unknown>
        },
        onSuccess: async (_result, input) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: maintenanceTaskKeys.pdfExports(input.task_id) }),
                queryClient.invalidateQueries({ queryKey: maintenanceTaskKeys.all }),
                queryClient.invalidateQueries({ queryKey: ['asset-maintenance'] }),
            ])
        },
    })

    return {
        tasks: tasksQuery.data ?? [],
        isLoading: tasksQuery.isLoading,
        error: tasksQuery.error instanceof Error ? tasksQuery.error.message : null,
        createTask: (data: CreateTaskInput) => createTaskMutation.mutateAsync(data),
        updateTask: (id: string, data: UpdateTaskInput) => updateTaskMutation.mutateAsync({ id, data }),
        startTask: (id: string) => lifecycleMutation.mutateAsync({ id, action: 'start' }),
        completeTask: (id: string, notes?: string) => lifecycleMutation.mutateAsync({ id, action: 'complete', notes }),
        cancelTask: (id: string, reason: string) => lifecycleMutation.mutateAsync({ id, action: 'cancel', notes: reason }),
        getTaskChecks,
        getTaskAttachments,
        getPdfExports,
        addTaskAttachment: (data: CreateTaskAttachmentInput) => createAttachmentMutation.mutateAsync(data),
        reviewTask: (id: string, data: ReviewMaintenanceTaskInput) => reviewTaskMutation.mutateAsync({ taskId: id, data }),
        recordPdfExport: (data: RecordPdfExportInput) => recordPdfExportMutation.mutateAsync(data),
        updateTaskCheck: (checkId: string, data: UpdateCheckInput) =>
            updateTaskCheckMutation.mutateAsync({ checkId, data }).then(() => undefined),
    }
}

export type {
    CreateTaskInput,
    MaintenanceTask,
    MaintenanceTaskAttachment,
    MaintenanceTaskCheck,
    PmPdfExport,
    ReviewMaintenanceTaskInput,
    UpdateCheckInput,
    UpdateTaskInput,
}
