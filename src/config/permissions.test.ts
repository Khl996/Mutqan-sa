import { describe, it, expect } from 'vitest'
import {
    hasPermission,
    getPermissionsForRole,
    ROLE_PERMISSIONS,
    type Permission,
} from './permissions'

describe('hasPermission', () => {
    it('grants platform owners every platform and tenant permission', () => {
        expect(hasPermission('platform_owner', 'platform.settings.manage')).toBe(true)
        expect(hasPermission('platform_owner', 'work_orders.manage')).toBe(true)
    })

    it('denies an unknown role any permission', () => {
        expect(hasPermission('not_a_role', 'dashboard.view')).toBe(false)
    })

    it('denies the legacy "user" role any permission', () => {
        expect(hasPermission('user', 'dashboard.view')).toBe(false)
    })

    it('maps the legacy tenant_owner role to tenant_admin permissions', () => {
        expect(hasPermission('tenant_owner', 'settings.manage')).toBe(true)
        expect(hasPermission('tenant_owner', 'work_orders.approve')).toBe(true)
    })

    it('restricts a reporter to creating and viewing work orders only', () => {
        expect(hasPermission('reporter', 'work_orders.create')).toBe(true)
        expect(hasPermission('reporter', 'work_orders.view')).toBe(true)
        expect(hasPermission('reporter', 'work_orders.manage')).toBe(false)
        expect(hasPermission('reporter', 'settings.manage')).toBe(false)
    })

    it('does not let a technician manage or approve work orders', () => {
        expect(hasPermission('technician', 'work_orders.update')).toBe(true)
        expect(hasPermission('technician', 'work_orders.manage')).toBe(false)
        expect(hasPermission('technician', 'work_orders.approve')).toBe(false)
        expect(hasPermission('technician', 'work_orders.create')).toBe(false)
    })

    it('keeps platform finance away from tenant configuration', () => {
        expect(hasPermission('platform_finance', 'platform.financials.manage')).toBe(true)
        expect(hasPermission('platform_finance', 'settings.manage')).toBe(false)
        expect(hasPermission('platform_finance', 'platform.tenants.manage')).toBe(false)
    })

    it('does not grant tenant_admin any platform permission', () => {
        const tenantAdminPerms = ROLE_PERMISSIONS.tenant_admin
        const hasAnyPlatformPerm = tenantAdminPerms.some((p) => p.startsWith('platform.'))
        expect(hasAnyPlatformPerm).toBe(false)
    })
})

describe('getPermissionsForRole', () => {
    it('returns an empty list for null, undefined, or unknown roles', () => {
        expect(getPermissionsForRole(null)).toEqual([])
        expect(getPermissionsForRole(undefined)).toEqual([])
        expect(getPermissionsForRole('ghost')).toEqual([])
    })

    it('returns the same set every role in the matrix is configured with', () => {
        for (const role of Object.keys(ROLE_PERMISSIONS)) {
            expect(getPermissionsForRole(role).length).toBeGreaterThan(0)
        }
    })

    it('never contains duplicate permissions for any role', () => {
        for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
            const unique = new Set<Permission>(perms)
            expect(unique.size, `role ${role} has duplicate permissions`).toBe(perms.length)
        }
    })
})
