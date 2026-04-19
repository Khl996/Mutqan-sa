/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'

export type PMJobPlanStatus = 'draft' | 'active' | 'archived'
export type PMItemType = 'yes_no' | 'pass_fail' | 'numeric' | 'text' | 'photo' | 'signature' | 'select' | 'multi_select' | 'header'
export type PMGenerationMode = 'per_asset' | 'batch_route'
export type PMTriggerType = 'calendar' | 'meter' | 'condition'
export type PMFrequencyType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'custom'
export type PMScheduleStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type PMPriority = 'low' | 'medium' | 'high' | 'critical'
export type PMWorkOrderStatus =
    | 'pending'
    | 'assigned'
    | 'in_progress'
    | 'pending_supervisor_approval'
    | 'pending_engineer_review'
    | 'pending_reporter_closure'
    | 'completed'
    | 'auto_closed'
    | 'rejected_by_technician'
    | 'cancelled'
    | 'on_hold'
export type PMCheckStatus = 'pending' | 'pass' | 'fail' | 'na'

export interface PMJsonItem {
    name?: string
    label?: string
    url?: string
    qty?: number
    unit?: string
}

export interface PMAssetRef {
    id: string
    code: string
    name: string
    name_ar: string | null
    building_id?: string | null
    building?: { id: string; name: string; name_ar: string | null } | null
    floor?: { id: string; name: string; name_ar: string | null } | null
    room?: { id: string; name: string; name_ar: string | null } | null
}

export interface PMJobPlanItem {
    id: string
    job_plan_id: string
    sort_order: number
    section_name: string | null
    section_name_ar: string | null
    label: string
    label_ar: string | null
    description: string | null
    description_ar: string | null
    help_text: string | null
    help_text_ar: string | null
    item_type: PMItemType
    is_required: boolean
    is_critical: boolean
    unit: string | null
    min_value: number | null
    max_value: number | null
    warning_min: number | null
    warning_max: number | null
    options: unknown
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
}

export interface PMJobPlan {
    id: string
    tenant_id: string
    code: string | null
    name: string
    name_ar: string | null
    description: string | null
    description_ar: string | null
    category: string | null
    asset_type_hint: string | null
    status: PMJobPlanStatus
    version: number
    estimated_duration_minutes: number | null
    requires_safety_checks: boolean
    safety_notes: string | null
    safety_notes_ar: string | null
    required_parts: PMJsonItem[]
    required_tools: PMJsonItem[]
    required_materials: PMJsonItem[]
    reference_documents: PMJsonItem[]
    required_skill: string | null
    required_role: string | null
    total_items: number
    usage_count: number
    created_at: string
    updated_at: string
    items?: PMJobPlanItem[]
}

export interface PMJobPlanItemInput {
    id?: string
    sort_order: number
    label: string
    label_ar?: string | null
    item_type: PMItemType
    is_required: boolean
    is_critical?: boolean
    unit?: string | null
    min_value?: number | null
    max_value?: number | null
    warning_min?: number | null
    warning_max?: number | null
    help_text?: string | null
}

export interface PMJobPlanInput {
    code?: string | null
    name: string
    name_ar?: string | null
    description?: string | null
    category?: string | null
    asset_type_hint?: string | null
    status: PMJobPlanStatus
    estimated_duration_minutes?: number | null
    requires_safety_checks?: boolean
    safety_notes?: string | null
    required_parts?: PMJsonItem[]
    required_tools?: PMJsonItem[]
    required_materials?: PMJsonItem[]
    reference_documents?: PMJsonItem[]
    required_skill?: string | null
    required_role?: string | null
    items: PMJobPlanItemInput[]
}

export interface PMScheduleAsset {
    id: string
    schedule_id: string
    asset_id: string
    sort_order: number
    notes: string | null
    asset?: PMAssetRef | null
}

export interface PMSchedule {
    id: string
    tenant_id: string
    code: string | null
    name: string
    name_ar: string | null
    description: string | null
    job_plan_id: string
    primary_asset_id: string | null
    trigger_type: PMTriggerType
    frequency_type: PMFrequencyType | null
    frequency_interval: number | null
    start_date: string
    end_date: string | null
    next_due_date: string | null
    last_generated_date: string | null
    lead_time_days: number
    compliance_window_days: number | null
    default_assignee_id: string | null
    default_team_id: string | null
    default_priority: PMPriority
    status: PMScheduleStatus
    generation_mode: PMGenerationMode
    total_generated: number
    total_completed: number
    total_overdue: number
    compliance_rate: number | null
    notes: string | null
    created_at: string
    updated_at: string
    job_plan?: Pick<PMJobPlan, 'id' | 'code' | 'name' | 'name_ar' | 'estimated_duration_minutes' | 'total_items'> | null
    assets?: PMScheduleAsset[]
}

export interface PMScheduleInput {
    code?: string | null
    name: string
    name_ar?: string | null
    description?: string | null
    job_plan_id: string
    generation_mode: PMGenerationMode
    trigger_type: PMTriggerType
    frequency_type: PMFrequencyType
    frequency_interval: number
    start_date: string
    end_date?: string | null
    next_due_date?: string | null
    lead_time_days?: number
    compliance_window_days?: number | null
    default_priority: PMPriority
    status: PMScheduleStatus
    notes?: string | null
    asset_ids: string[]
}

export interface PMWorkOrderAsset {
    id: string
    work_order_id: string
    asset_id: string
    sort_order: number
    is_completed: boolean
    notes: string | null
    asset?: PMAssetRef | null
}

export interface PMWorkOrderCheck {
    id: string
    work_order_id: string
    asset_id: string | null
    job_plan_item_id: string | null
    item_snapshot: {
        label?: string
        label_ar?: string | null
        item_type?: PMItemType
        is_required?: boolean
        is_critical?: boolean
        unit?: string | null
        min_value?: number | null
        max_value?: number | null
        warning_min?: number | null
        warning_max?: number | null
        help_text?: string | null
        help_text_ar?: string | null
    }
    sort_order: number
    value_bool: boolean | null
    value_numeric: number | null
    value_text: string | null
    value_options: unknown
    value_photo_url: string | null
    value_signature_url: string | null
    status: PMCheckStatus
    notes: string | null
    checked_by: string | null
    checked_at: string | null
    created_at: string
    updated_at: string
}

export interface PMWorkOrder {
    id: string
    tenant_id: string
    code: string
    title: string
    description: string | null
    status: PMWorkOrderStatus
    priority: 'low' | 'medium' | 'high' | 'urgent'
    work_type: 'preventive' | 'reactive' | 'corrective' | 'inspection' | 'project'
    source_schedule_id: string | null
    source_schedule_asset_id: string | null
    job_plan_id: string | null
    job_plan_snapshot: Record<string, unknown>
    scheduled_date: string | null
    compliance_deadline: string | null
    assigned_to: string | null
    assigned_team: string | null
    asset_id: string | null
    building_id: string | null
    floor_id: string | null
    room_id: string | null
    started_at: string | null
    start_time: string | null
    completed_at: string | null
    completion_notes: string | null
    actual_duration_minutes: number | null
    created_at: string
    updated_at: string
    source_schedule?: Pick<PMSchedule, 'id' | 'code' | 'name' | 'name_ar' | 'generation_mode'> | null
    job_plan?: Pick<PMJobPlan, 'id' | 'code' | 'name' | 'name_ar'> | null
    asset?: PMAssetRef | null
    building?: { id: string; name: string; name_ar: string | null } | null
    work_order_assets?: PMWorkOrderAsset[]
    work_order_checks?: PMWorkOrderCheck[]
}

export interface PMComplianceStats {
    total: number
    completed_on_time: number
    overdue: number
    due_soon: number
    compliance_rate: number | null
}

export interface PMGenerateResult {
    success?: boolean
    generated?: number
    schedules_scanned?: number
    schedules_advanced?: number
    existing_cycles_advanced?: number
    skipped_no_assets?: number
    scope?: 'tenant' | 'all_tenants'
    run_at?: string
    triggered_by?: 'cron' | 'user'
    run_id?: string
    duration_ms?: number
    result?: unknown
}

export const pmFoundationKeys = {
    all: ['pm-foundation'] as const,
    jobPlans: (tenantId: string | null) => [...pmFoundationKeys.all, 'job-plans', tenantId] as const,
    jobPlan: (id: string | null, tenantId: string | null) => [...pmFoundationKeys.all, 'job-plan', id, tenantId] as const,
    schedules: (tenantId: string | null) => [...pmFoundationKeys.all, 'schedules', tenantId] as const,
    schedule: (id: string | null, tenantId: string | null) => [...pmFoundationKeys.all, 'schedule', id, tenantId] as const,
    workOrders: (tenantId: string | null) => [...pmFoundationKeys.all, 'work-orders', tenantId] as const,
    workOrder: (id: string | null) => [...pmFoundationKeys.all, 'work-order', id] as const,
    stats: (tenantId: string | null) => [...pmFoundationKeys.all, 'stats', tenantId] as const,
}

const sortJobPlanItems = (items?: PMJobPlanItem[]) =>
    [...(items ?? [])].sort((a, b) => a.sort_order - b.sort_order)

const sortScheduleAssets = (assets?: PMScheduleAsset[]) =>
    [...(assets ?? [])].sort((a, b) => a.sort_order - b.sort_order)

const sortChecks = (checks?: PMWorkOrderCheck[]) =>
    [...(checks ?? [])].sort((a, b) => {
        const assetCompare = String(a.asset_id ?? '').localeCompare(String(b.asset_id ?? ''))
        return assetCompare || a.sort_order - b.sort_order
    })

function planPayload(input: PMJobPlanInput, tenantId?: string) {
    return {
        ...(tenantId ? { tenant_id: tenantId } : {}),
        code: input.code?.trim() || null,
        name: input.name.trim(),
        name_ar: input.name_ar?.trim() || null,
        description: input.description?.trim() || null,
        category: input.category?.trim() || null,
        asset_type_hint: input.asset_type_hint?.trim() || null,
        status: input.status,
        estimated_duration_minutes: input.estimated_duration_minutes ?? null,
        requires_safety_checks: Boolean(input.requires_safety_checks),
        safety_notes: input.safety_notes?.trim() || null,
        required_parts: input.required_parts ?? [],
        required_tools: input.required_tools ?? [],
        required_materials: input.required_materials ?? [],
        reference_documents: input.reference_documents ?? [],
        required_skill: input.required_skill?.trim() || null,
        required_role: input.required_role?.trim() || null,
    }
}

function itemPayload(jobPlanId: string, item: PMJobPlanItemInput, index: number) {
    return {
        job_plan_id: jobPlanId,
        sort_order: item.sort_order || (index + 1) * 10,
        label: item.label.trim(),
        label_ar: item.label_ar?.trim() || null,
        item_type: item.item_type,
        is_required: Boolean(item.is_required),
        is_critical: Boolean(item.is_critical),
        unit: item.unit?.trim() || null,
        min_value: item.min_value ?? null,
        max_value: item.max_value ?? null,
        warning_min: item.warning_min ?? null,
        warning_max: item.warning_max ?? null,
        help_text: item.help_text?.trim() || null,
    }
}

const OPEN_WORK_ORDER_STATUSES: PMWorkOrderStatus[] = [
    'pending',
    'assigned',
    'in_progress',
    'pending_supervisor_approval',
    'pending_engineer_review',
    'pending_reporter_closure',
    'rejected_by_technician',
    'on_hold',
]

const normalizeJobPlanItem = (item: PMJobPlanItem | PMJobPlanItemInput, index = 0) => ({
    sort_order: item.sort_order || (index + 1) * 10,
    label: item.label.trim(),
    label_ar: item.label_ar?.trim() || null,
    item_type: item.item_type,
    is_required: Boolean(item.is_required),
    is_critical: Boolean(item.is_critical),
    unit: item.unit?.trim() || null,
    min_value: item.min_value ?? null,
    max_value: item.max_value ?? null,
    warning_min: item.warning_min ?? null,
    warning_max: item.warning_max ?? null,
    help_text: item.help_text?.trim() || null,
})

function jobPlanItemsChanged(currentItems: PMJobPlanItem[], nextItems: PMJobPlanItemInput[]) {
    const current = sortJobPlanItems(currentItems).map((item, index) => normalizeJobPlanItem(item, index))
    const next = nextItems.map((item, index) => normalizeJobPlanItem(item, index))
    return JSON.stringify(current) !== JSON.stringify(next)
}

function schedulePayload(input: PMScheduleInput, tenantId?: string) {
    return {
        ...(tenantId ? { tenant_id: tenantId } : {}),
        code: input.code?.trim() || null,
        name: input.name.trim(),
        name_ar: input.name_ar?.trim() || null,
        description: input.description?.trim() || null,
        job_plan_id: input.job_plan_id,
        primary_asset_id: input.asset_ids[0] ?? null,
        generation_mode: input.generation_mode,
        trigger_type: input.trigger_type,
        frequency_type: input.frequency_type,
        frequency_interval: input.frequency_interval || 1,
        start_date: input.start_date,
        end_date: input.end_date || null,
        next_due_date: input.next_due_date || input.start_date,
        lead_time_days: input.lead_time_days ?? 0,
        compliance_window_days: input.compliance_window_days ?? null,
        default_priority: input.default_priority,
        status: input.status,
        notes: input.notes?.trim() || null,
    }
}

async function replaceScheduleAssets(scheduleId: string, assetIds: string[]) {
    const { error: deleteError } = await (supabase.from('pm_schedule_assets') as any)
        .delete()
        .eq('schedule_id', scheduleId)
    if (deleteError) throw deleteError

    if (assetIds.length === 0) return

    const rows = assetIds.map((assetId, index) => ({
        schedule_id: scheduleId,
        asset_id: assetId,
        sort_order: index + 1,
    }))
    const { error } = await (supabase.from('pm_schedule_assets') as any).insert(rows)
    if (error) throw error
}

export function usePMJobPlans() {
    const tenantId = useCurrentTenantId()
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: pmFoundationKeys.jobPlans(tenantId),
        enabled: !!tenantId,
        queryFn: async () => {
            let request = (supabase.from('job_plans') as any)
                .select('*, items:job_plan_items(*)')
                .order('updated_at', { ascending: false })
            request = request.eq('tenant_id', tenantId)
            const { data, error } = await request
            if (error) throw error
            return (data ?? []).map((plan: PMJobPlan) => ({ ...plan, items: sortJobPlanItems(plan.items) })) as PMJobPlan[]
        },
    })

    const invalidate = async () => {
        await queryClient.invalidateQueries({ queryKey: pmFoundationKeys.all })
    }

    const createJobPlan = useMutation({
        mutationFn: async (input: PMJobPlanInput) => {
            if (!tenantId) throw new Error('Missing tenant')
            const { data, error } = await (supabase.from('job_plans') as any)
                .insert(planPayload(input, tenantId))
                .select('*')
                .single()
            if (error) throw error

            const items = input.items.filter((item) => item.label.trim())
            if (items.length > 0) {
                const { error: itemsError } = await (supabase.from('job_plan_items') as any)
                    .insert(items.map((item, index) => itemPayload(data.id, item, index)))
                if (itemsError) throw itemsError
            }
            return data as PMJobPlan
        },
        onSuccess: invalidate,
    })

    const updateJobPlan = useMutation({
        mutationFn: async ({ id, input }: { id: string; input: PMJobPlanInput }) => {
            const items = input.items.filter((item) => item.label.trim())
            const { data: currentItemsData, error: currentItemsError } = await (supabase.from('job_plan_items') as any)
                .select('*')
                .eq('job_plan_id', id)
                .order('sort_order', { ascending: true })
            if (currentItemsError) throw currentItemsError

            const currentItems = (currentItemsData ?? []) as PMJobPlanItem[]
            const { count: openWorkOrdersCount, error: openWorkOrdersError } = await (supabase.from('work_orders') as any)
                .select('id', { count: 'exact', head: true })
                .eq('job_plan_id', id)
                .in('status', OPEN_WORK_ORDER_STATUSES)
            if (openWorkOrdersError) throw openWorkOrdersError

            const hasOpenWorkOrders = (openWorkOrdersCount ?? 0) > 0
            const checklistChanged = jobPlanItemsChanged(currentItems, items)

            if (hasOpenWorkOrders && checklistChanged) {
                throw new Error('JOB_PLAN_ITEMS_LOCKED_BY_OPEN_WORK_ORDERS')
            }

            const { data, error } = await (supabase.from('job_plans') as any)
                .update(planPayload(input))
                .eq('id', id)
                .select('*')
                .single()
            if (error) throw error

            if (hasOpenWorkOrders) {
                return data as PMJobPlan
            }

            const currentIds = new Set(currentItems.map((item) => item.id))
            const nextIds = new Set(items.map((item) => item.id).filter(Boolean) as string[])

            for (const [index, item] of items.entries()) {
                const payload = itemPayload(id, item, index)

                if (item.id && currentIds.has(item.id)) {
                    const { error: updateItemError } = await (supabase.from('job_plan_items') as any)
                        .update(payload)
                        .eq('id', item.id)
                        .eq('job_plan_id', id)
                    if (updateItemError) throw updateItemError
                    continue
                }

                const { error: insertItemError } = await (supabase.from('job_plan_items') as any)
                    .insert(payload)
                if (insertItemError) throw insertItemError
            }

            const removedIds = currentItems
                .map((item) => item.id)
                .filter((itemId) => !nextIds.has(itemId))

            if (removedIds.length > 0) {
                const { data: referencedRows, error: referencedError } = await (supabase.from('work_order_checks') as any)
                    .select('job_plan_item_id')
                    .in('job_plan_item_id', removedIds)
                if (referencedError) throw referencedError

                if ((referencedRows ?? []).length > 0) {
                    throw new Error('JOB_PLAN_ITEMS_LOCKED_BY_OPEN_WORK_ORDERS')
                }

                const { error: deleteError } = await (supabase.from('job_plan_items') as any)
                    .delete()
                    .in('id', removedIds)
                    .eq('job_plan_id', id)
                if (deleteError) throw deleteError
            }
            return data as PMJobPlan
        },
        onSuccess: invalidate,
    })

    const archiveJobPlan = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase.from('job_plans') as any)
                .update({ status: 'archived' })
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: invalidate,
    })

    return {
        jobPlans: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : null,
        createJobPlan: createJobPlan.mutateAsync,
        updateJobPlan: updateJobPlan.mutateAsync,
        archiveJobPlan: archiveJobPlan.mutateAsync,
        isSaving: createJobPlan.isPending || updateJobPlan.isPending || archiveJobPlan.isPending,
    }
}

export function usePMJobPlanDetail(jobPlanId: string | null) {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: pmFoundationKeys.jobPlan(jobPlanId, tenantId),
        enabled: !!jobPlanId && !!tenantId,
        queryFn: async () => {
            const { data, error } = await (supabase.from('job_plans') as any)
                .select('*, items:job_plan_items(*)')
                .eq('id', jobPlanId)
                .eq('tenant_id', tenantId)
                .single()
            if (error) throw error
            return { ...data, items: sortJobPlanItems(data.items) } as PMJobPlan
        },
    })
}

export function usePMSchedules() {
    const tenantId = useCurrentTenantId()
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: pmFoundationKeys.schedules(tenantId),
        enabled: !!tenantId,
        queryFn: async () => {
            const { data, error } = await (supabase.from('pm_schedules') as any)
                .select(`
                    *,
                    job_plan:job_plans(id, code, name, name_ar, estimated_duration_minutes, total_items),
                    assets:pm_schedule_assets(
                        id,
                        schedule_id,
                        asset_id,
                        sort_order,
                        notes,
                        asset:assets(
                            id,
                            code,
                            name,
                            name_ar,
                            building_id,
                            building:buildings(id, name, name_ar)
                        )
                    )
                `)
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
            if (error) throw error
            return (data ?? []).map((schedule: PMSchedule) => ({
                ...schedule,
                assets: sortScheduleAssets(schedule.assets),
            })) as PMSchedule[]
        },
    })

    const invalidate = async () => {
        await queryClient.invalidateQueries({ queryKey: pmFoundationKeys.all })
    }

    const createSchedule = useMutation({
        mutationFn: async (input: PMScheduleInput) => {
            if (!tenantId) throw new Error('Missing tenant')
            const { data, error } = await (supabase.from('pm_schedules') as any)
                .insert(schedulePayload(input, tenantId))
                .select('*')
                .single()
            if (error) throw error
            await replaceScheduleAssets(data.id, input.asset_ids)
            return data as PMSchedule
        },
        onSuccess: invalidate,
    })

    const updateSchedule = useMutation({
        mutationFn: async ({ id, input }: { id: string; input: PMScheduleInput }) => {
            const { data, error } = await (supabase.from('pm_schedules') as any)
                .update(schedulePayload(input))
                .eq('id', id)
                .select('*')
                .single()
            if (error) throw error
            await replaceScheduleAssets(id, input.asset_ids)
            return data as PMSchedule
        },
        onSuccess: invalidate,
    })

    const archiveSchedule = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase.from('pm_schedules') as any)
                .update({ status: 'archived' })
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: invalidate,
    })

    return {
        schedules: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : null,
        createSchedule: createSchedule.mutateAsync,
        updateSchedule: updateSchedule.mutateAsync,
        archiveSchedule: archiveSchedule.mutateAsync,
        isSaving: createSchedule.isPending || updateSchedule.isPending || archiveSchedule.isPending,
    }
}

export function usePMScheduleDetail(scheduleId: string | null) {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: pmFoundationKeys.schedule(scheduleId, tenantId),
        enabled: !!scheduleId && !!tenantId,
        queryFn: async () => {
            const { data, error } = await (supabase.from('pm_schedules') as any)
                .select(`
                    *,
                    job_plan:job_plans(id, code, name, name_ar, estimated_duration_minutes, total_items),
                    assets:pm_schedule_assets(
                        id,
                        schedule_id,
                        asset_id,
                        sort_order,
                        notes,
                        asset:assets(
                            id,
                            code,
                            name,
                            name_ar,
                            building_id,
                            building:buildings(id, name, name_ar),
                            floor:floors(id, name, name_ar),
                            room:rooms(id, name, name_ar)
                        )
                    )
                `)
                .eq('id', scheduleId)
                .eq('tenant_id', tenantId)
                .single()
            if (error) throw error
            return {
                ...data,
                assets: sortScheduleAssets(data.assets),
            } as PMSchedule
        },
    })
}

export function usePMGenerateWorkOrders() {
    const queryClient = useQueryClient()

    const generateDueWorkOrders = useMutation({
        mutationFn: async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                throw new Error('Not authenticated')
            }

            const { data, error } = await (supabase.rpc('pm_generate_due_work_orders') as any)
            if (error) throw error
            return data as PMGenerateResult
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: pmFoundationKeys.all })
        },
    })

    return {
        generateDueWorkOrders: generateDueWorkOrders.mutateAsync,
        isGenerating: generateDueWorkOrders.isPending,
    }
}

export function usePMWorkOrders() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: pmFoundationKeys.workOrders(tenantId),
        enabled: !!tenantId,
        queryFn: async () => {
            const { data, error } = await (supabase.from('work_orders') as any)
                .select(`
                    *,
                    source_schedule:pm_schedules!source_schedule_id(id, code, name, name_ar, generation_mode),
                    job_plan:job_plans(id, code, name, name_ar),
                    asset:assets(id, code, name, name_ar, building:buildings(id, name, name_ar), floor:floors(id, name, name_ar), room:rooms(id, name, name_ar)),
                    building:buildings(id, name, name_ar),
                    work_order_assets(
                        id,
                        work_order_id,
                        asset_id,
                        sort_order,
                        is_completed,
                        notes,
                        asset:assets(id, code, name, name_ar, building:buildings(id, name, name_ar), floor:floors(id, name, name_ar), room:rooms(id, name, name_ar))
                    ),
                    work_order_checks(id, work_order_id, asset_id, status)
                `)
                .eq('tenant_id', tenantId)
                .eq('work_type', 'preventive')
                .order('scheduled_date', { ascending: false, nullsFirst: false })
            if (error) throw error
            return (data ?? []).map((wo: PMWorkOrder) => ({
                ...wo,
                work_order_assets: [...(wo.work_order_assets ?? [])].sort((a, b) => a.sort_order - b.sort_order),
            })) as PMWorkOrder[]
        },
    })
}

export function usePMWorkOrderDetail(workOrderId: string | null) {
    return useQuery({
        queryKey: pmFoundationKeys.workOrder(workOrderId),
        enabled: !!workOrderId,
        queryFn: () => fetchPMWorkOrderDetail(workOrderId),
    })
}

export async function fetchPMWorkOrderDetail(workOrderId: string | null) {
    if (!workOrderId) throw new Error('Missing work order id')

    const { data, error } = await (supabase.from('work_orders') as any)
        .select(`
            *,
            source_schedule:pm_schedules!source_schedule_id(id, code, name, name_ar, generation_mode),
            job_plan:job_plans(id, code, name, name_ar),
            assignee:profiles!assigned_to(id, full_name, full_name_ar),
            work_order_assets(
                id,
                work_order_id,
                asset_id,
                sort_order,
                is_completed,
                notes,
                asset:assets(id, code, name, name_ar, building:buildings(id, name, name_ar), floor:floors(id, name, name_ar), room:rooms(id, name, name_ar))
            ),
            work_order_checks(*)
        `)
        .eq('id', workOrderId)
        .single()
    if (error) throw error
    return {
        ...data,
        work_order_assets: [...(data.work_order_assets ?? [])].sort((a, b) => a.sort_order - b.sort_order),
        work_order_checks: sortChecks(data.work_order_checks),
    } as PMWorkOrder
}

export function usePMExecutionMutations(workOrderId: string | null) {
    const queryClient = useQueryClient()
    const tenantId = useCurrentTenantId()

    const invalidate = async () => {
        await queryClient.invalidateQueries({ queryKey: pmFoundationKeys.workOrder(workOrderId) })
        await queryClient.invalidateQueries({ queryKey: pmFoundationKeys.workOrders(tenantId) })
        await queryClient.invalidateQueries({ queryKey: pmFoundationKeys.stats(tenantId) })
    }

    const updateCheck = useMutation({
        mutationFn: async ({ id, patch }: { id: string; patch: Partial<PMWorkOrderCheck> }) => {
            const { data, error } = await (supabase.from('work_order_checks') as any)
                .update({
                    ...patch,
                    checked_at: patch.status && patch.status !== 'pending' ? new Date().toISOString() : patch.checked_at,
                })
                .eq('id', id)
                .select('*')
                .single()
            if (error) throw error
            return data as PMWorkOrderCheck
        },
        onSuccess: invalidate,
    })

    const startWorkOrder = useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await (supabase.rpc('wo_start', { p_wo_id: id }) as any)
            if (error) throw error
            return data
        },
        onSuccess: invalidate,
    })

    const completeWorkOrder = useMutation({
        mutationFn: async ({ id, notes }: { id: string; notes?: string | null }) => {
            const { data, error } = await (supabase.rpc('wo_complete', { p_wo_id: id, p_completion_notes: notes ?? null }) as any)
            if (error) throw error
            return data
        },
        onSuccess: invalidate,
    })

    return {
        updateCheck: updateCheck.mutateAsync,
        startWorkOrder: startWorkOrder.mutateAsync,
        completeWorkOrder: completeWorkOrder.mutateAsync,
        isSaving: updateCheck.isPending || startWorkOrder.isPending || completeWorkOrder.isPending,
    }
}

export function usePMComplianceStats() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: pmFoundationKeys.stats(tenantId),
        enabled: !!tenantId,
        queryFn: async () => {
            const { data, error } = await (supabase.rpc('pm_calculate_compliance_stats', { p_tenant_id: tenantId }) as any)
            if (error) throw error
            return data as PMComplianceStats
        },
    })
}
