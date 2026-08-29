import { describe, expect, it } from 'vitest'
import ar from '@/i18n/locales/ar.json'
import en from '@/i18n/locales/en.json'
import { STATUS_DISPLAY, WORK_ORDER_STATUSES } from './workOrderStatus'

describe('work-order status translations', () => {
    it('maps every persisted status to an Arabic and English translation key', () => {
        for (const status of WORK_ORDER_STATUSES) {
            const translationKey = STATUS_DISPLAY[status].label

            expect(ar.workOrders).toHaveProperty(translationKey)
            expect(en.workOrders).toHaveProperty(translationKey)
        }
    })

    it('maps the in-progress database value to the camel-case i18n key', () => {
        expect(STATUS_DISPLAY.in_progress.label).toBe('inProgress')
    })
})
