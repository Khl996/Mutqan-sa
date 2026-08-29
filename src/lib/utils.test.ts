import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatRelativeTime, getWorkOrderDateLocale } from './utils'

describe('work-order date localization', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('uses English relative time when the interface is LTR', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-29T10:00:00Z'))

        expect(formatRelativeTime(
            '2026-08-29T00:00:00Z',
            getWorkOrderDateLocale(false),
        )).toBe('10 hours ago')
    })

    it('keeps Arabic work-order dates on the Gregorian calendar', () => {
        const locale = getWorkOrderDateLocale(true)

        expect(locale).toBe('ar-SA-u-ca-gregory')
        expect(new Intl.DateTimeFormat(locale).format(new Date('2026-08-29T00:00:00Z')))
            .toContain('٢٠٢٦')
    })
})
