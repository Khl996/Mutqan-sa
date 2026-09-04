import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import {
    approveGovernanceDecision,
    canActorDecideGovernance,
    evaluateWorkOrderApproval,
    resolveStandardGovernanceGate,
    type GovernanceRpcClient,
} from './useWorkOrderGovernance'

function gate(overrides: Partial<Parameters<typeof resolveStandardGovernanceGate>[0]> = {}) {
    return resolveStandardGovernanceGate({
        requiresStandardGovernance: true,
        routeType: null,
        governanceState: null,
        isLoading: false,
        hasError: false,
        canEvaluate: false,
        canDecide: false,
        ...overrides,
    })
}

describe('standard work-order governance gate', () => {
    it('keeps corrective work closed until an authorized actor evaluates it', () => {
        expect(gate()).toBe('waiting_for_evaluation')
        expect(gate({ canEvaluate: true })).toBe('evaluation_available')
    })

    it('offers a pending decision only when the secured queue authorizes the actor', () => {
        const pending = { routeType: 'standard', governanceState: 'pending_approval' }
        expect(gate(pending)).toBe('waiting_for_approval')
        expect(gate({ ...pending, canDecide: true })).toBe('approval_available')
    })

    it('opens Start only for approved standard governance and bypasses preventive work', () => {
        expect(gate({ routeType: 'standard', governanceState: 'approved' })).toBe('approved')
        expect(gate({ requiresStandardGovernance: false })).toBe('not_required')
    })

    it('fails closed on read errors, rejected decisions, and non-standard routes', () => {
        expect(gate({ hasError: true })).toBe('unavailable')
        expect(gate({ routeType: 'standard', governanceState: 'rejected' })).toBe('rejected')
        expect(gate({ routeType: 'emergency_override', governanceState: 'approved' })).toBe('blocked')
    })
})

describe('governance RPC contract', () => {
    it('evaluates with the exact deployed PostgreSQL signature', async () => {
        const rpc = vi.fn().mockResolvedValue({
            data: { success: true, work_order_id: 'wo-1', governance_state: 'pending_approval' },
            error: null,
        })

        await evaluateWorkOrderApproval({ rpc } as GovernanceRpcClient, 'wo-1')

        expect(rpc).toHaveBeenCalledWith('evaluate_work_order_approval', {
            p_work_order_id: 'wo-1',
        })
    })

    it('approves with the exact deployed signature and normalizes blank notes', async () => {
        const rpc = vi.fn().mockResolvedValue({
            data: { success: true, work_order_id: 'wo-1', governance_state: 'approved' },
            error: null,
        })

        await approveGovernanceDecision({ rpc } as GovernanceRpcClient, 'wo-1', '   ')

        expect(rpc).toHaveBeenCalledWith('approve_governance_decision', {
            p_work_order_id: 'wo-1',
            p_notes: null,
        })
    })

    it('uses the secured decision queue as the approval authority source', async () => {
        const rpc = vi.fn().mockResolvedValue({
            data: [{ work_order_id: 'wo-1' }, { work_order_id: 'wo-2' }],
            error: null,
        })

        await expect(canActorDecideGovernance({ rpc } as GovernanceRpcClient, 'wo-2'))
            .resolves.toBe(true)
        expect(rpc).toHaveBeenCalledWith('get_governance_decision_queue')
    })

    it('propagates database authority errors without a client-side fallback', async () => {
        const authorityError = { code: '42501', message: 'Unauthorized' }
        const rpc = vi.fn().mockResolvedValue({ data: null, error: authorityError })

        await expect(evaluateWorkOrderApproval({ rpc } as GovernanceRpcClient, 'wo-1'))
            .rejects.toBe(authorityError)
    })
})
