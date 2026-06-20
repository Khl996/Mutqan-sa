import { describe, it, expect } from 'vitest'
import { isPlatformRole, isTenantRole, normalizeRole } from './roles'

describe('isPlatformRole', () => {
    it('recognizes platform roles', () => {
        expect(isPlatformRole('platform_owner')).toBe(true)
        expect(isPlatformRole('platform_admin')).toBe(true)
    })

    it('rejects tenant roles, null, and unknown values', () => {
        expect(isPlatformRole('tenant_admin')).toBe(false)
        expect(isPlatformRole(null)).toBe(false)
        expect(isPlatformRole(undefined)).toBe(false)
        expect(isPlatformRole('')).toBe(false)
    })
})

describe('isTenantRole', () => {
    it('recognizes tenant roles', () => {
        expect(isTenantRole('technician')).toBe(true)
        expect(isTenantRole('tenant_admin')).toBe(true)
    })

    it('rejects platform roles and the legacy tenant_owner alias', () => {
        expect(isTenantRole('platform_admin')).toBe(false)
        expect(isTenantRole('tenant_owner')).toBe(false)
        expect(isTenantRole(null)).toBe(false)
    })
})

describe('normalizeRole', () => {
    it('maps tenant_owner to tenant_admin', () => {
        expect(normalizeRole('tenant_owner')).toBe('tenant_admin')
    })

    it('maps the legacy "user" role to null (no access)', () => {
        expect(normalizeRole('user')).toBeNull()
    })

    it('passes through valid active roles unchanged', () => {
        expect(normalizeRole('engineer')).toBe('engineer')
        expect(normalizeRole('platform_finance')).toBe('platform_finance')
    })

    it('returns null for unknown roles and empty input', () => {
        expect(normalizeRole('wizard')).toBeNull()
        expect(normalizeRole(null)).toBeNull()
        expect(normalizeRole(undefined)).toBeNull()
    })
})
