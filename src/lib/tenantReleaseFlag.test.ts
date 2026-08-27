import { describe, expect, it } from 'vitest'
import {
    isTenantReleaseEnabledForRecord,
    resolveTenantReleaseFlag,
} from './tenantReleaseFlag'

const tenantA = '34000000-0000-4000-8000-000000000001'
const tenantB = '34000000-0000-4000-8000-000000000002'
const flagKey = 'operations_golden_path_v1'

function resolve(overrides: Partial<Parameters<typeof resolveTenantReleaseFlag>[0]> = {}) {
    return resolveTenantReleaseFlag({
        currentUserId: 'user-a',
        currentTenantId: tenantA,
        requestedFlagKey: flagKey,
        data: [{ tenant_id: tenantA, flag_key: flagKey, enabled: true }],
        pending: false,
        failed: false,
        ...overrides,
    })
}

describe('resolveTenantReleaseFlag', () => {
    it('enables only an exact authoritative row', () => {
        expect(resolve()).toBe('enabled')
    })

    it('waits without selecting either experience during the first request', () => {
        expect(resolve({ data: undefined, pending: true })).toBe('checking')
    })

    it('waits while auth or tenant context is unresolved even before ids exist', () => {
        expect(resolve({
            currentUserId: null,
            currentTenantId: null,
            data: undefined,
            pending: true,
        })).toBe('checking')
    })

    it.each([
        { name: 'RPC failure', overrides: { failed: true } },
        { name: 'missing user', overrides: { currentUserId: null } },
        { name: 'missing tenant', overrides: { currentTenantId: null } },
        { name: 'empty result', overrides: { data: [] } },
        { name: 'multiple rows', overrides: { data: [
            { tenant_id: tenantA, flag_key: flagKey, enabled: true },
            { tenant_id: tenantA, flag_key: flagKey, enabled: true },
        ] } },
        { name: 'null tenant', overrides: { data: [{ tenant_id: null, flag_key: flagKey, enabled: true }] } },
        { name: 'tenant mismatch', overrides: { data: [{ tenant_id: tenantB, flag_key: flagKey, enabled: true }] } },
        { name: 'flag mismatch', overrides: { data: [{ tenant_id: tenantA, flag_key: 'another_flag', enabled: true }] } },
        { name: 'disabled row', overrides: { data: [{ tenant_id: tenantA, flag_key: flagKey, enabled: false }] } },
        { name: 'string boolean', overrides: { data: [{ tenant_id: tenantA, flag_key: flagKey, enabled: 'true' }] } },
        { name: 'malformed payload', overrides: { data: { tenant_id: tenantA, flag_key: flagKey, enabled: true } } },
    ])('fails closed for $name', ({ overrides }) => {
        expect(resolve(overrides)).toBe('disabled')
    })
})

describe('isTenantReleaseEnabledForRecord', () => {
    it('requires an enabled decision and an exact current-record tenant match', () => {
        expect(isTenantReleaseEnabledForRecord('enabled', tenantA, tenantA)).toBe(true)
        expect(isTenantReleaseEnabledForRecord('enabled', tenantA, tenantB)).toBe(false)
        expect(isTenantReleaseEnabledForRecord('disabled', tenantA, tenantA)).toBe(false)
        expect(isTenantReleaseEnabledForRecord('checking', tenantA, tenantA)).toBe(false)
    })
})
