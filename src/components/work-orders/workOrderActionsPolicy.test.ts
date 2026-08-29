import { describe, expect, it } from 'vitest'
import {
    canShowStartWorkOrderAction,
    isAssignableWorkOrderMember,
} from './workOrderActionsPolicy'

describe('work-order action policy', () => {
    it('hides Start from a technician when a pending order is unassigned', () => {
        expect(canShowStartWorkOrderAction({
            actorRole: 'technician',
            actorId: 'tech-1',
            assignedTo: null,
            status: 'pending',
            hasUpdatePermission: true,
        })).toBe(false)
    })

    it('shows Start to the directly assigned technician', () => {
        expect(canShowStartWorkOrderAction({
            actorRole: 'technician',
            actorId: 'tech-1',
            assignedTo: 'tech-1',
            status: 'assigned',
            hasUpdatePermission: true,
        })).toBe(true)
    })

    it('keeps SQL management overrides able to start an unassigned pending order', () => {
        for (const actorRole of ['tenant_admin', 'maintenance_manager', 'engineer']) {
            expect(canShowStartWorkOrderAction({
                actorRole,
                actorId: `${actorRole}-1`,
                assignedTo: null,
                status: 'pending',
                hasUpdatePermission: true,
            })).toBe(true)
        }
    })

    it('offers only active technicians and engineers as direct assignees', () => {
        expect(isAssignableWorkOrderMember({ role: 'technician', is_active: true })).toBe(true)
        expect(isAssignableWorkOrderMember({ role: 'engineer', is_active: true })).toBe(true)
        expect(isAssignableWorkOrderMember({ role: 'maintenance_manager', is_active: true })).toBe(false)
        expect(isAssignableWorkOrderMember({ role: 'technician', is_active: false })).toBe(false)
    })
})
