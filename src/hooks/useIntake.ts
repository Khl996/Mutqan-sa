import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'
import { workOrdersKeys } from './useWorkOrders'

// Data layer for the intake feature ("وارد واتساب" review page +
// "إعدادات الوارد" settings page). Reads go through RLS-gated SELECTs;
// every state change goes through the SECURITY DEFINER intake_* RPCs.

export interface IntakeMessage {
    id: string
    tenant_id: string
    intake_source_id: string | null
    source: 'whatsapp' | 'form' | 'email' | 'manual'
    external_message_id: string
    sender_name: string | null
    sender_phone: string | null
    group_name: string | null
    message_text: string
    media_urls: string[]
    status: 'new' | 'classified' | 'ignored' | 'converted' | 'failed'
    failure_reason: string | null
    sent_at: string | null
    created_at: string
}

export interface IntakeDraft {
    id: string
    tenant_id: string
    intake_message_id: string
    suggested_title: string
    suggested_description: string | null
    suggested_location: string | null
    suggested_priority: 'low' | 'medium' | 'high' | 'urgent'
    suggested_category: string | null
    review_status: 'pending' | 'approved' | 'rejected' | 'merged'
    reviewed_by: string | null
    reviewed_at: string | null
    created_work_order_id: string | null
    created_at: string
    // Joined
    message?: IntakeMessage
    reviewer?: { id: string; full_name: string; full_name_ar: string | null }
}

export interface IntakeSourceConfig {
    id: string
    tenant_id: string
    source_type: 'whatsapp_baileys' | 'whatsapp_cloud' | 'form' | 'email'
    display_name: string
    phone_number: string | null
    allowed_groups: Array<{ jid: string; name: string }>
    is_active: boolean
    config: Record<string, unknown>
    created_at: string
    updated_at: string
}

export const intakeKeys = {
    all: ['intake'] as const,
    drafts: (status: string) => [...intakeKeys.all, 'drafts', status] as const,
    messages: (statuses: string[]) => [...intakeKeys.all, 'messages', ...statuses] as const,
    stats: () => [...intakeKeys.all, 'stats'] as const,
    sources: () => [...intakeKeys.all, 'sources'] as const,
}

const DRAFT_SELECT = `
    *,
    message:intake_raw_messages(*),
    reviewer:reviewed_by(id, full_name, full_name_ar)
`

export function useIntakeDrafts(reviewStatus: IntakeDraft['review_status'] | 'all' = 'pending') {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...intakeKeys.drafts(reviewStatus), tenantId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase.from('intake_drafts') as any).select(DRAFT_SELECT)

            if (tenantId) query = query.eq('tenant_id', tenantId)
            if (reviewStatus !== 'all') query = query.eq('review_status', reviewStatus)

            const { data, error } = await query.order('created_at', { ascending: false })
            if (error) throw error
            return data as IntakeDraft[]
        },
    })
}

// Ignored/failed messages (recovery tab): chatter misclassifications and
// classification failures, recoverable via intake_create_manual_draft.
export function useIntakeMessages(statuses: IntakeMessage['status'][]) {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...intakeKeys.messages(statuses), tenantId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase.from('intake_raw_messages') as any).select('*').in('status', statuses)

            if (tenantId) query = query.eq('tenant_id', tenantId)

            const { data, error } = await query.order('created_at', { ascending: false }).limit(200)
            if (error) throw error
            return data as IntakeMessage[]
        },
    })
}

export interface IntakeStats {
    pending: number
    convertedThisWeek: number
    ignoredThisWeek: number
}

export function useIntakeStats() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...intakeKeys.stats(), tenantId],
        queryFn: async (): Promise<IntakeStats> => {
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const scoped = (q: any) => (tenantId ? q.eq('tenant_id', tenantId) : q)

            const [pendingRes, convertedRes, ignoredRes] = await Promise.all([
                scoped(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (supabase.from('intake_drafts') as any)
                        .select('id', { count: 'exact', head: true })
                        .eq('review_status', 'pending')
                ),
                scoped(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (supabase.from('intake_raw_messages') as any)
                        .select('id', { count: 'exact', head: true })
                        .eq('status', 'converted')
                        .gte('created_at', weekAgo)
                ),
                scoped(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (supabase.from('intake_raw_messages') as any)
                        .select('id', { count: 'exact', head: true })
                        .eq('status', 'ignored')
                        .gte('created_at', weekAgo)
                ),
            ])

            for (const res of [pendingRes, convertedRes, ignoredRes]) {
                if (res.error) throw res.error
            }

            return {
                pending: pendingRes.count ?? 0,
                convertedThisWeek: convertedRes.count ?? 0,
                ignoredThisWeek: ignoredRes.count ?? 0,
            }
        },
    })
}

function useInvalidateIntake() {
    const queryClient = useQueryClient()
    return () => {
        queryClient.invalidateQueries({ queryKey: intakeKeys.all })
        queryClient.invalidateQueries({ queryKey: workOrdersKeys.all })
    }
}

export interface ApproveDraftOverrides {
    title?: string
    description?: string
    priority?: IntakeDraft['suggested_priority']
    location?: string
}

export function useApproveIntakeDraft() {
    const invalidate = useInvalidateIntake()

    return useMutation({
        mutationFn: async ({ draftId, overrides }: { draftId: string; overrides?: ApproveDraftOverrides }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('intake_approve_draft', {
                p_draft_id: draftId,
                p_overrides: overrides ?? {},
            })
            if (error) throw new Error(error.message)
            return data as { work_order_id: string; code: string }
        },
        onSuccess: invalidate,
    })
}

export function useRejectIntakeDraft() {
    const invalidate = useInvalidateIntake()

    return useMutation({
        mutationFn: async (draftId: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('intake_reject_draft', { p_draft_id: draftId })
            if (error) throw new Error(error.message)
        },
        onSuccess: invalidate,
    })
}

export function useMergeIntakeDraft() {
    const invalidate = useInvalidateIntake()

    return useMutation({
        mutationFn: async ({ draftId, workOrderId }: { draftId: string; workOrderId: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('intake_merge_draft', {
                p_draft_id: draftId,
                p_work_order_id: workOrderId,
            })
            if (error) throw new Error(error.message)
        },
        onSuccess: invalidate,
    })
}

export function useCreateManualIntakeDraft() {
    const invalidate = useInvalidateIntake()

    return useMutation({
        mutationFn: async (messageId: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('intake_create_manual_draft', {
                p_message_id: messageId,
            })
            if (error) throw new Error(error.message)
            return data as string
        },
        onSuccess: invalidate,
    })
}

// ── Settings (إعدادات الوارد) ────────────────────────────────────────────────

export function useIntakeSources() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...intakeKeys.sources(), tenantId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('intake_list_sources')
            if (error) throw new Error(error.message)
            return (data ?? []) as IntakeSourceConfig[]
        },
    })
}

export function useCreateIntakeSource() {
    const invalidate = useInvalidateIntake()

    return useMutation({
        mutationFn: async (input: { sourceType: IntakeSourceConfig['source_type']; displayName: string; phoneNumber?: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('intake_create_source', {
                p_source_type: input.sourceType,
                p_display_name: input.displayName,
                p_phone_number: input.phoneNumber ?? null,
            })
            if (error) throw new Error(error.message)
            return data as { id: string; secret: string }
        },
        onSuccess: invalidate,
    })
}

export interface UpdateIntakeSourceInput {
    sourceId: string
    displayName?: string
    phoneNumber?: string
    allowedGroups?: Array<{ jid: string; name: string }>
    isActive?: boolean
    config?: Record<string, unknown>
}

export function useUpdateIntakeSource() {
    const invalidate = useInvalidateIntake()

    return useMutation({
        mutationFn: async (input: UpdateIntakeSourceInput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).rpc('intake_update_source', {
                p_source_id: input.sourceId,
                p_display_name: input.displayName ?? null,
                p_phone_number: input.phoneNumber ?? null,
                p_allowed_groups: input.allowedGroups ?? null,
                p_is_active: input.isActive ?? null,
                p_config: input.config ?? null,
            })
            if (error) throw new Error(error.message)
        },
        onSuccess: invalidate,
    })
}

export function useRegenerateIntakeSecret() {
    const invalidate = useInvalidateIntake()

    return useMutation({
        mutationFn: async (sourceId: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('intake_regenerate_source_secret', {
                p_source_id: sourceId,
            })
            if (error) throw new Error(error.message)
            return data as { id: string; secret: string }
        },
        onSuccess: invalidate,
    })
}

// Link a work order back to the intake message it came from (approve/merge
// both set created_work_order_id). Used by WorkOrderDetailsPage to show the
// "وارد واتساب" source chip — work_orders itself carries no intake column.
export function useIntakeDraftForWorkOrder(workOrderId: string | undefined) {
    return useQuery({
        queryKey: [...intakeKeys.all, 'byWorkOrder', workOrderId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('intake_drafts') as any)
                .select(DRAFT_SELECT)
                .eq('created_work_order_id', workOrderId)
                .limit(1)
                .maybeSingle()
            if (error) throw error
            return (data as IntakeDraft | null) ?? null
        },
        enabled: !!workOrderId,
    })
}
