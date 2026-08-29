import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import {
    approveGovernanceDecision,
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

    it('offers a pending decision only when the secured decision queue authorizes the actor', () => {
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
    it('evaluates with the exact work-order argument expected by PostgreSQL', async () => {
        const rpc = vi.fn().mockResolvedValue({
            data: { success: true, work_order_id: 'wo-1', governance_state: 'pending_approval' },
            error: null,
        })

        await evaluateWorkOrderApproval({ rpc } as GovernanceRpcClient, 'wo-1')

        expect(rpc).toHaveBeenCalledWith('evaluate_work_order_approval', {
            p_work_order_id: 'wo-1',
        })
    })

    it('approves with the exact signature and normalizes blank notes to null', async () => {
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

    it('propagates database authority errors without a client-side fallback', async () => {
        const authorityError = { code: '42501', message: 'Unauthorized' }
        const rpc = vi.fn().mockResolvedValue({ data: null, error: authorityError })

        await expect(evaluateWorkOrderApproval({ rpc } as GovernanceRpcClient, 'wo-1'))
            .rejects.toBe(authorityError)
    })
})
