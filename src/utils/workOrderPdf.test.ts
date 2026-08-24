import { describe, expect, it } from 'vitest'
import { isSafeProofStoragePath } from '@/lib/proofStorage'

describe('Proof of Work storage references', () => {
    it('accepts normalized relative object paths', () => {
        expect(isSafeProofStoragePath('tenant-id/work-order-id/before/photo-1.jpg')).toBe(true)
        expect(isSafeProofStoragePath('tracking-token/reporter/reporter.webp')).toBe(true)
    })

    it('rejects external, data, absolute, traversal, and Windows paths', () => {
        for (const value of [
            'https://attacker.invalid/track.png',
            'data:image/png;base64,AAAA',
            '/absolute/photo.jpg',
            '../other-tenant/photo.jpg',
            'tenant/../other-tenant/photo.jpg',
            'tenant\\photo.jpg',
            'tenant//photo.jpg',
        ]) {
            expect(isSafeProofStoragePath(value)).toBe(false)
        }
    })
})
