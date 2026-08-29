import { describe, expect, it } from 'vitest'
import {
    InactiveAccountError,
    isExplicitlyActiveProfile,
    isInactiveAccountError,
} from './authAccess'

describe('inactive account errors', () => {
    it('distinguishes a centrally suspended profile from invalid credentials', () => {
        expect(isInactiveAccountError(new InactiveAccountError())).toBe(true)
        expect(isInactiveAccountError(new Error('Invalid credentials'))).toBe(false)
    })

    it('fails closed when the active profile row is absent or not explicitly active', () => {
        expect(isExplicitlyActiveProfile(null)).toBe(false)
        expect(isExplicitlyActiveProfile(undefined)).toBe(false)
        expect(isExplicitlyActiveProfile({ is_active: false })).toBe(false)
        expect(isExplicitlyActiveProfile({ is_active: null })).toBe(false)
        expect(isExplicitlyActiveProfile({ is_active: true })).toBe(true)
    })
})
