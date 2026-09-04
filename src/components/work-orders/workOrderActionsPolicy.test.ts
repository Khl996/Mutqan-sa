import { describe, expect, it } from 'vitest'
import { canShowStartWorkOrderAction } from './workOrderActionsPolicy'

describe('work-order Start action policy', () => {
    it('does not offer an unassigned pending order to a technician', () => {
        expect(canShowStartWorkOrderAction({
            actorRole: 'technician',
            actorId: 'tech-1',
            assignedTo: null,
            status: 'pending',
            hasUpdatePermission: true,
        })).toBe(false)
    })

    it('offers Start to the directly assigned technician', () => {
        expect(canShowStartWorkOrderAction({
            actorRole: 'technician',
            actorId: 'tech-1',
            assignedTo: 'tech-1',
            status: 'assigned',
            hasUpdatePermission: true,
        })).toBe(true)
    })

    it('preserves the deployed management overrides', () => {
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

    it('requires both a supported workflow status and update permission', () => {
        expect(canShowStartWorkOrderAction({
            actorRole: 'tenant_admin',
            actorId: 'admin-1',
            assignedTo: null,
            status: 'in_progress',
            hasUpdatePermission: true,
        })).toBe(false)
        expect(canShowStartWorkOrderAction({
            actorRole: 'tenant_admin',
            actorId: 'admin-1',
            assignedTo: null,
            status: 'pending',
            hasUpdatePermission: false,
        })).toBe(false)
    })
})
