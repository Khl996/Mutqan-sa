import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { workOrdersKeys } from './useWorkOrders'

export interface WorkOrderGovernanceState {
    id: string
    work_order_id: string
    route_type: string
    governance_state: string
    approval_tier: string | null
    required_approver_role: string | null
    approval_amount: number | null
    approval_amount_source: string | null
}

interface GovernanceDecisionQueueItem {
    work_order_id: string
}

export interface GovernanceDecisionResult {
    success: boolean
    work_order_id: string
    governance_id: string
    governance_state: string
    required_approver_role: string | null
}

interface GovernanceRpcResponse {
    data: unknown
    error: unknown | null
}

export interface GovernanceRpcClient {
    rpc: (
        functionName: string,
        args?: Record<string, unknown>,
    ) => PromiseLike<GovernanceRpcResponse>
}

export type StandardGovernanceGate =
    | 'not_required'
    | 'loading'
    | 'unavailable'
    | 'evaluation_available'
    | 'waiting_for_evaluation'
    | 'approval_available'
    | 'waiting_for_approval'
    | 'approved'
    | 'rejected'
    | 'blocked'

interface ResolveGovernanceGateInput {
    requiresStandardGovernance: boolean
    routeType: string | null
    governanceState: string | null
    isLoading: boolean
    hasError: boolean
    canEvaluate: boolean
    canDecide: boolean
}

export function resolveStandardGovernanceGate({
    requiresStandardGovernance,
    routeType,
    governanceState,
    isLoading,
    hasError,
    canEvaluate,
    canDecide,
}: ResolveGovernanceGateInput): StandardGovernanceGate {
    if (!requiresStandardGovernance) return 'not_required'
    if (hasError) return 'unavailable'
    if (isLoading) return 'loading'

    if (routeType !== null && routeType !== 'standard') return 'blocked'

    if (governanceState === null || governanceState === 'standard') {
        return canEvaluate ? 'evaluation_available' : 'waiting_for_evaluation'
    }

    if (governanceState === 'pending_approval') {
        return canDecide ? 'approval_available' : 'waiting_for_approval'
    }

    if (governanceState === 'approved') return 'approved'
    if (governanceState === 'rejected') return 'rejected'

    return 'blocked'
}

export async function evaluateWorkOrderApproval(
    client: GovernanceRpcClient,
    workOrderId: string,
): Promise<GovernanceDecisionResult> {
    const { data, error } = await client.rpc('evaluate_work_order_approval', {
        p_work_order_id: workOrderId,
    })

    if (error) throw error
    return data as GovernanceDecisionResult
}

export async function approveGovernanceDecision(
    client: GovernanceRpcClient,
    workOrderId: string,
    notes: string,
): Promise<GovernanceDecisionResult> {
    const { data, error } = await client.rpc('approve_governance_decision', {
        p_work_order_id: workOrderId,
        p_notes: notes.trim() || null,
    })

    if (error) throw error
    return data as GovernanceDecisionResult
}

export async function canActorDecideGovernance(
    client: GovernanceRpcClient,
    workOrderId: string,
): Promise<boolean> {
    const { data, error } = await client.rpc('get_governance_decision_queue')

    if (error) throw error

    const rows = Array.isArray(data) ? data as GovernanceDecisionQueueItem[] : []
    return rows.some(item => item.work_order_id === workOrderId)
}

const governanceKeys = {
    all: ['work-order-governance'] as const,
    state: (workOrderId: string) => [...governanceKeys.all, workOrderId, 'state'] as const,
    decision: (workOrderId: string) => [...governanceKeys.all, workOrderId, 'decision'] as const,
}

export function useWorkOrderGovernance(workOrderId: string, enabled: boolean) {
    const queryClient = useQueryClient()

    const governanceQuery = useQuery({
        queryKey: governanceKeys.state(workOrderId),
        queryFn: async () => {
            // Generated types predate the already-deployed governance table.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('work_order_governance') as any)
                .select('id, work_order_id, route_type, governance_state, approval_tier, required_approver_role, approval_amount, approval_amount_source')
                .eq('work_order_id', workOrderId)
                .maybeSingle()

            if (error) throw error
            return (data ?? null) as WorkOrderGovernanceState | null
        },
        enabled: enabled && !!workOrderId,
    })

    const isWaitingForManualApproval = governanceQuery.data?.route_type === 'standard'
        && governanceQuery.data?.governance_state === 'pending_approval'

    const decisionQuery = useQuery({
        queryKey: governanceKeys.decision(workOrderId),
        // The secured queue returns only decisions the current actor may take.
        queryFn: () => canActorDecideGovernance(
            supabase as unknown as GovernanceRpcClient,
            workOrderId,
        ),
        enabled: enabled && !!workOrderId && isWaitingForManualApproval,
    })

    const invalidateGovernance = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: governanceKeys.all }),
            queryClient.invalidateQueries({ queryKey: workOrdersKeys.all }),
        ])
    }

    const evaluate = useMutation({
        mutationFn: () => evaluateWorkOrderApproval(
            supabase as unknown as GovernanceRpcClient,
            workOrderId,
        ),
        onSuccess: invalidateGovernance,
    })

    const approve = useMutation({
        mutationFn: (notes: string) => approveGovernanceDecision(
            supabase as unknown as GovernanceRpcClient,
            workOrderId,
            notes,
        ),
        onSuccess: invalidateGovernance,
    })

    return {
        state: governanceQuery.data ?? null,
        canCurrentActorDecide: isWaitingForManualApproval && decisionQuery.data === true,
        isLoading: governanceQuery.isPending || (isWaitingForManualApproval && decisionQuery.isPending),
        hasError: governanceQuery.isError || (isWaitingForManualApproval && decisionQuery.isError),
        evaluate,
        approve,
    }
}
