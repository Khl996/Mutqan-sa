import { describe, it, expect } from 'vitest'
import { normalizePhone, buildWhatsAppMessage, buildWhatsAppUrl } from './whatsapp'

describe('normalizePhone', () => {
    it('converts a local 05XXXXXXXX number to +9665XXXXXXXX', () => {
        expect(normalizePhone('0512345678')).toBe('+966512345678')
    })

    it('adds the + sign to a 9665XXXXXXXX number', () => {
        expect(normalizePhone('966512345678')).toBe('+966512345678')
    })

    it('passes an already-normalized +9665XXXXXXXX number through', () => {
        expect(normalizePhone('+966512345678')).toBe('+966512345678')
    })

    it('strips spaces, dashes, and parentheses before matching', () => {
        expect(normalizePhone('05 12-34 56 78')).toBe('+966512345678')
        expect(normalizePhone('+966 (51) 234-5678')).toBe('+966512345678')
    })

    it('returns null for unrecognized formats', () => {
        expect(normalizePhone('123')).toBeNull()
        expect(normalizePhone('0412345678')).toBeNull() // landline, not 05 mobile
        expect(normalizePhone('+1 555 123 4567')).toBeNull()
        expect(normalizePhone('')).toBeNull()
    })
})

const baseWorkOrder = {
    code: 'WO-100',
    description: 'مكيف لا يعمل',
    id: 'abc-123',
    building: { name: 'Building A', name_ar: 'مبنى أ' },
    floor: { name: 'Floor 1', name_ar: 'الطابق الأول' },
    room: { name: 'Room 5', name_ar: 'غرفة 5' },
    assigned_team: 'فريق التكييف',
}

describe('buildWhatsAppMessage', () => {
    it('includes the work order code and an absolute link', () => {
        const msg = buildWhatsAppMessage({
            workOrder: baseWorkOrder,
            baseUrl: 'https://mutqan-sa.com',
        })
        expect(msg).toContain('WO-100')
        expect(msg).toContain('https://mutqan-sa.com/work-orders/abc-123')
    })

    it('includes the assignee line only when an assignee is provided', () => {
        const withAssignee = buildWhatsAppMessage({
            workOrder: baseWorkOrder,
            assigneeName: 'أحمد',
            baseUrl: 'https://x.test',
        })
        expect(withAssignee).toContain('أحمد')

        const withoutAssignee = buildWhatsAppMessage({
            workOrder: baseWorkOrder,
            baseUrl: 'https://x.test',
        })
        expect(withoutAssignee).not.toContain('المكلّف')
    })

    it('omits optional lines when their data is absent', () => {
        const msg = buildWhatsAppMessage({
            workOrder: {
                code: 'WO-1',
                description: null,
                id: 'id1',
                building: null,
                floor: null,
                room: null,
                assigned_team: null,
            },
            baseUrl: 'https://x.test',
        })
        expect(msg).not.toContain('الموقع')
        expect(msg).not.toContain('الفريق')
        expect(msg).not.toContain('الوصف')
        expect(msg).toContain('WO-1')
    })
})

describe('buildWhatsAppUrl', () => {
    it('builds a wa.me link without the + and URL-encodes the message', () => {
        const url = buildWhatsAppUrl('+966512345678', 'مرحبا world')
        expect(url).toContain('https://wa.me/966512345678?text=')
        expect(url).toContain(encodeURIComponent('مرحبا world'))
    })
})
