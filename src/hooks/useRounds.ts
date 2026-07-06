import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'
import { workOrdersKeys } from './useWorkOrders'

export type RoundType = 'maintenance' | 'cleaning'
export type RoundStatus = 'in_progress' | 'completed'

export interface RoundSupervisor {
    id: string
    full_name: string | null
    full_name_ar: string | null
    email?: string | null
}

export interface RoundLocation {
    id: string
    code: string
    name: string
    name_ar: string | null
    building_id: string | null
    floor_id: string | null
}

export interface RoundObservation {
    id: string
    tenant_id: string
    round_id: string
    location_id: string
    observation_text: string
    action_taken: string | null
    needs_work_order: boolean
    created_work_order_id: string | null
    created_at: string
    location?: RoundLocation | null
}

export interface Round {
    id: string
    tenant_id: string
    round_type: RoundType
    supervisor_id: string | null
    started_at: string
    completed_at: string | null
    status: RoundStatus
    summary: string | null
    created_at: string
    supervisor?: RoundSupervisor | null
    observations?: RoundObservation[]
}

export interface RoundsFilters {
    type?: RoundType | 'all'
    supervisorId?: string
    dateFrom?: string
    dateTo?: string
}

export interface CreateObservationInput {
    roundId: string
    locationId: string
    observationText: string
    actionTaken?: string
    needsWorkOrder: boolean
}

export interface ConvertObservationResult {
    work_order_id: string
    code: string
    assigned_team_id?: string | null
    assigned_team_name?: string | null
    already_converted: boolean
}

export const roundsKeys = {
    all: ['rounds'] as const,
    list: (filters: RoundsFilters) => [...roundsKeys.all, 'list', filters] as const,
    byWorkOrder: (workOrderId: string | undefined) => [...roundsKeys.all, 'byWorkOrder', workOrderId] as const,
    supervisors: (tenantId: string | null) => [...roundsKeys.all, 'supervisors', tenantId] as const,
}

const ROUND_SELECT = `
    *,
    supervisor:profiles!rounds_supervisor_id_fkey(id, full_name, full_name_ar, email),
    observations:round_observations(
        *,
        location:departments!round_observations_location_id_fkey(id, code, name, name_ar, building_id, floor_id)
    )
`

const OBSERVATION_FOR_WORK_ORDER_SELECT = `
    *,
    location:departments!round_observations_location_id_fkey(id, code, name, name_ar, building_id, floor_id),
    round:rounds!round_observations_round_id_fkey(
        id,
        round_type,
        started_at,
        completed_at,
        status,
        supervisor:profiles!rounds_supervisor_id_fkey(id, full_name, full_name_ar, email)
    )
`

function nextDate(value: string) {
    const date = new Date(`${value}T00:00:00`)
    date.setDate(date.getDate() + 1)
    return date.toISOString()
}

function startDate(value: string) {
    return new Date(`${value}T00:00:00`).toISOString()
}

function useInvalidateRounds() {
    const queryClient = useQueryClient()
    return () => {
        queryClient.invalidateQueries({ queryKey: roundsKeys.all })
        queryClient.invalidateQueries({ queryKey: workOrdersKeys.all })
    }
}

export function useRounds(filters: RoundsFilters = {}) {
    const tenantId = useCurrentTenantId()
    const normalizedFilters = {
        type: filters.type ?? 'all',
        supervisorId: filters.supervisorId ?? '',
        dateFrom: filters.dateFrom ?? '',
        dateTo: filters.dateTo ?? '',
    }

    return useQuery({
        queryKey: [...roundsKeys.list(normalizedFilters), tenantId],
        queryFn: async () => {
            let query = (supabase.from('rounds') as any).select(ROUND_SELECT)

            if (tenantId) query = query.eq('tenant_id', tenantId)
            if (normalizedFilters.type !== 'all') query = query.eq('round_type', normalizedFilters.type)
            if (normalizedFilters.supervisorId) query = query.eq('supervisor_id', normalizedFilters.supervisorId)
            if (normalizedFilters.dateFrom) query = query.gte('started_at', startDate(normalizedFilters.dateFrom))
            if (normalizedFilters.dateTo) query = query.lt('started_at', nextDate(normalizedFilters.dateTo))

            const { data, error } = await query.order('started_at', { ascending: false })
            if (error) throw error
            return (data ?? []) as Round[]
        },
    })
}

export function useRoundSupervisors() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: roundsKeys.supervisors(tenantId),
        queryFn: async () => {
            if (!tenantId) return []
            const { data, error } = await (supabase.from('profiles') as any)
                .select('id, full_name, full_name_ar, email, role')
                .eq('tenant_id', tenantId)
                .eq('is_active', true)
                .in('role', ['tenant_admin', 'facility_manager', 'maintenance_manager', 'supervisor', 'engineer'])
                .order('full_name_ar', { ascending: true })
            if (error) throw error
            return (data ?? []) as Array<RoundSupervisor & { role?: string | null }>
        },
        enabled: !!tenantId,
    })
}

export function useCreateRound() {
    const invalidate = useInvalidateRounds()

    return useMutation({
        mutationFn: async (roundType: RoundType) => {
            const { data, error } = await (supabase as any).rpc('create_round', {
                p_round_type: roundType,
            })
            if (error) throw new Error(error.message)
            return data as Round
        },
        onSuccess: invalidate,
    })
}

export function useAddRoundObservation() {
    const invalidate = useInvalidateRounds()

    return useMutation({
        mutationFn: async (input: CreateObservationInput) => {
            const { data, error } = await (supabase as any).rpc('add_round_observation', {
                p_round_id: input.roundId,
                p_location_id: input.locationId,
                p_observation_text: input.observationText,
                p_action_taken: input.actionTaken ?? null,
                p_needs_work_order: input.needsWorkOrder,
            })
            if (error) throw new Error(error.message)
            return data as RoundObservation
        },
        onSuccess: invalidate,
    })
}

export function useCompleteRound() {
    const invalidate = useInvalidateRounds()

    return useMutation({
        mutationFn: async ({ roundId, summary }: { roundId: string; summary?: string }) => {
            const { data, error } = await (supabase as any).rpc('complete_round', {
                p_round_id: roundId,
                p_summary: summary ?? null,
            })
            if (error) throw new Error(error.message)
            return data as Round
        },
        onSuccess: invalidate,
    })
}

export function useConvertRoundObservation() {
    const invalidate = useInvalidateRounds()

    return useMutation({
        mutationFn: async ({ observationId, assignedTeamId }: { observationId: string; assignedTeamId: string }) => {
            const { data, error } = await (supabase as any).rpc('convert_observation_to_wo', {
                p_observation_id: observationId,
                p_assigned_team_id: assignedTeamId,
            })
            if (error) throw new Error(error.message)
            return data as ConvertObservationResult
        },
        onSuccess: invalidate,
    })
}

export function useRoundObservationForWorkOrder(workOrderId: string | undefined) {
    return useQuery({
        queryKey: roundsKeys.byWorkOrder(workOrderId),
        queryFn: async () => {
            const { data, error } = await (supabase.from('round_observations') as any)
                .select(OBSERVATION_FOR_WORK_ORDER_SELECT)
                .eq('created_work_order_id', workOrderId)
                .limit(1)
                .maybeSingle()
            if (error) throw error
            return (data as (RoundObservation & { round?: Round | null }) | null) ?? null
        },
        enabled: !!workOrderId,
    })
}
