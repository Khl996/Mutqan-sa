import { describe, expect, it } from 'vitest'
import type { OperationLog, WorkOrder } from '@/hooks/useWorkOrders'
import { DEFAULT_TENANT_SETTINGS } from '@/config/tenantSettings'
import {
    buildEffectiveProofIdentity,
    buildProofEvidenceInventory,
    buildProofOfWorkViewModel,
    formatProofDateTime,
} from './proofOfWork'

const workOrder: WorkOrder = {
    id: 'wo-1',
    tenant_id: 'tenant-a',
    code: 'WO-1001',
    title: 'Replace damaged belt',
    description: 'Current description',
    issue_type_id: null,
    issue_type: 'Mechanical',
    status: 'completed',
    priority: 'high',
    reported_by: 'reporter-1',
    assigned_to: 'tech-1',
    assigned_team: 'team-1',
    building_id: 'building-1',
    floor_id: 'floor-1',
    department_id: null,
    room_id: 'room-1',
    asset_id: 'asset-1',
    reported_at: '2026-08-24T06:00:00.000Z',
    start_time: '2026-08-24T07:00:00.000Z',
    end_time: '2026-08-24T08:00:00.000Z',
    completed_at: '2026-08-24T09:00:00.000Z',
    due_date: null,
    estimated_cost: null,
    actual_cost: null,
    attachments: [],
    before_images: ['live-before.jpg'],
    after_images: ['live-after.jpg'],
    created_at: '2026-08-24T05:00:00.000Z',
    updated_at: '2026-08-24T09:00:00.000Z',
    technician_notes: 'Replaced and tensioned the belt',
    supervisor_notes: 'Verified alignment',
    engineer_notes: null,
    reporter_notes: 'Accepted',
    reporter_image_url: 'live-reporter.jpg',
    reporter: { id: 'reporter-1', full_name: 'Reporter', full_name_ar: 'المبلّغ' },
    assignee: { id: 'tech-1', full_name: 'Technician', full_name_ar: 'الفني' },
    assignedTeam: { id: 'team-1', code: 'MECH', name: 'Mechanical', name_ar: 'الميكانيكا' },
    building: { id: 'building-1', name: 'North Wing', name_ar: 'الجناح الشمالي' },
    floor: { id: 'floor-1', name: 'Level 2', name_ar: 'الدور الثاني' },
    room: { id: 'room-1', name: 'Plant room', name_ar: 'غرفة المعدات' },
    asset: { id: 'asset-1', code: 'AHU-03', name: 'Air handler', name_ar: 'وحدة مناولة الهواء' },
    pdf_snapshot: {
        contract_version: 2,
        code: 'WO-1001',
        title: 'Closure belt repair',
        description: 'Closure description',
        priority: 'medium',
        created_at: '2026-08-24T05:00:00.000Z',
        closed_at: '2026-08-24T09:00:00.000Z',
        reporter_notes: 'Snapshot accepted',
        reporter_image_url: null,
        before_images: ['snapshot-before.jpg'],
        after_images: ['snapshot-after.jpg'],
        issue_type: { id: 'issue-1', name: 'Mechanical', name_ar: 'ميكانيكي' },
        building: { id: 'building-1', name: 'North Wing', name_ar: 'الجناح الشمالي' },
        floor: { id: 'floor-1', name: 'Level 2', name_ar: 'الدور الثاني' },
        room: { id: 'room-1', name: 'Plant room', name_ar: 'غرفة المعدات' },
        assigned_team: { id: 'team-1', name: 'Mechanical', name_ar: 'الميكانيكا' },
        assignee: { id: 'tech-1', full_name: 'Technician' },
        reporter: { id: 'reporter-1', full_name: 'Reporter' },
        closed_by: { id: 'manager-1', full_name: 'Maintenance Manager' },
        asset: {
            id: 'asset-1',
            code: 'AHU-03-CLOSED',
            name: 'Closed air handler',
            name_ar: 'وحدة المناولة وقت الإغلاق',
        },
    },
}

const logs: OperationLog[] = [
    {
        id: 'log-3',
        tenant_id: 'tenant-a',
        code: 'L3',
        type: 'comment',
        asset_id: 'asset-1',
        work_order_id: 'wo-1',
        description: 'Added after closure',
        reason: null,
        performed_by: 'manager-1',
        technician_name: 'Manager',
        timestamp: '2026-08-24T09:01:00.000Z',
        status: 'completed',
        created_at: '2026-08-24T09:01:00.000Z',
    },
    {
        id: 'log-2',
        tenant_id: 'tenant-a',
        code: 'L2',
        type: 'status_change',
        asset_id: 'asset-1',
        work_order_id: 'wo-1',
        description: 'Completed',
        reason: null,
        performed_by: 'manager-1',
        technician_name: 'Manager',
        timestamp: '2026-08-24T09:00:00.000Z',
        status: 'completed',
        created_at: '2026-08-24T09:00:00.000Z',
    },
    {
        id: 'log-1',
        tenant_id: 'tenant-a',
        code: 'L1',
        type: 'maintenance',
        asset_id: 'asset-1',
        work_order_id: 'wo-1',
        description: 'Started',
        reason: null,
        performed_by: 'tech-1',
        technician_name: 'Technician',
        timestamp: '2026-08-24T07:00:00.000Z',
        status: 'in_progress',
        created_at: '2026-08-24T07:00:00.000Z',
    },
]

describe('buildProofOfWorkViewModel', () => {
    it('prefers closure snapshot evidence and preserves chronological operations', () => {
        const model = buildProofOfWorkViewModel({
            workOrder,
            logs,
            language: 'ar',
            tenant: { name: 'Mutqan Facility', name_ar: 'منشأة متقن' },
        })

        expect(model.recordBasis).toBe('closure_snapshot_partial')
        expect(model.isFinal).toBe(true)
        expect(model.organization).toBe('منشأة متقن')
        expect(model.workOrder.title).toBe('Closure belt repair')
        expect(model.asset).toEqual({
            id: 'asset-1',
            code: 'AHU-03-CLOSED',
            name: 'وحدة المناولة وقت الإغلاق',
        })
        expect(model.workOrder.description).toBe('Closure description')
        expect(model.workOrder.priority).toBe('medium')
        expect(model.timestamps.reportedAt).toBe('2026-08-24T05:00:00.000Z')
        expect(model.workOrder.issueType).toBe('ميكانيكي')
        expect(model.location.label).toBe('الجناح الشمالي › الدور الثاني › غرفة المعدات')
        expect(model.evidence.beforeImages).toEqual(['snapshot-before.jpg'])
        expect(model.evidence.reporterImage).toBeNull()
        expect(model.notes.reporter).toBe('Snapshot accepted')
        expect(model.operations.map((operation) => operation.id)).toEqual(['log-1', 'log-2'])
        expect(logs.map((log) => log.id)).toEqual(['log-3', 'log-2', 'log-1'])
    })

    it('falls back to the live record without presenting a partial object as a snapshot', () => {
        const model = buildProofOfWorkViewModel({
            workOrder: { ...workOrder, status: 'in_progress', pdf_snapshot: {} as WorkOrder['pdf_snapshot'] },
            language: 'en',
        })

        expect(model.recordBasis).toBe('live_record')
        expect(model.isFinal).toBe(false)
        expect(model.workOrder.description).toBe('Current description')
        expect(model.parties.assignee.name).toBe('Technician')
        expect(model.evidence.beforeImages).toEqual(['live-before.jpg'])
        expect(model.evidence.reporterImage).toBe('live-reporter.jpg')
    })

    it('does not classify a completed live record without a closure snapshot as final proof', () => {
        const model = buildProofOfWorkViewModel({
            workOrder: { ...workOrder, pdf_snapshot: null },
            language: 'en',
        })

        expect(model.recordBasis).toBe('live_record')
        expect(model.isFinal).toBe(false)
    })

    it('does not classify a legacy partial closure snapshot as final proof', () => {
        const legacySnapshot = {
            ...workOrder.pdf_snapshot,
            contract_version: undefined,
            title: undefined,
            asset: undefined,
        } as unknown as WorkOrder['pdf_snapshot']

        const model = buildProofOfWorkViewModel({
            workOrder: { ...workOrder, pdf_snapshot: legacySnapshot },
            language: 'en',
        })

        expect(model.recordBasis).toBe('live_record')
        expect(model.isFinal).toBe(false)
    })
})

describe('formatProofDateTime', () => {
    it('returns null for invalid values and formats a valid instant in the requested zone', () => {
        expect(formatProofDateTime('not-a-date', 'en')).toBeNull()
        expect(formatProofDateTime('2026-08-24T06:00:00.000Z', 'en', 'Asia/Riyadh')).toContain('09:00')
    })
})

describe('buildEffectiveProofIdentity', () => {
    it('uses one deterministic header fallback for Arabic and English artifacts', () => {
        const settings = {
            ...DEFAULT_TENANT_SETTINGS.pdf_identity,
            organization_name: 'Configured Facility',
            organization_name_ar: 'المنشأة المعدة',
            logo_path: 'tenant-a/identity/logo.png',
        }
        const tenant = { name: 'Tenant fallback', name_ar: 'اسم المستأجر' }

        expect(buildEffectiveProofIdentity({ language: 'ar', tenant, settings })).toMatchObject({
            name: 'المنشأة المعدة',
            logoPath: 'tenant-a/identity/logo.png',
        })
        expect(buildEffectiveProofIdentity({ language: 'en', tenant, settings }).name).toBe('Configured Facility')
        expect(buildEffectiveProofIdentity({
            language: 'en',
            tenant,
            settings: { ...settings, print_header_name: 'Explicit print identity' },
        }).name).toBe('Explicit print identity')
        expect(buildEffectiveProofIdentity({
            language: 'ar',
            tenant,
            settings: {
                ...settings,
                organization_name: '',
                organization_name_ar: '',
                print_header_name: null,
            },
        }).name).toBe('اسم المستأجر')
    })
})

describe('buildProofEvidenceInventory', () => {
    it('distinguishes embedded, policy-excluded, and load-failed evidence', () => {
        const inventory = buildProofEvidenceInventory({
            evidence: {
                reporterImage: 'tenant-a/work-order/reporter.jpg',
                beforeImages: ['before-1.jpg', 'before-2.jpg'],
                afterImages: ['after-1.jpg'],
            },
            inclusion: { reporter: false, beforeAfter: true },
            embedded: { reporter: false, before: 1, after: 0 },
        })

        expect(inventory).toEqual([
            { kind: 'reporter', recordedCount: 1, embeddedCount: 0, status: 'excluded' },
            { kind: 'before', recordedCount: 2, embeddedCount: 1, status: 'embedded' },
            { kind: 'after', recordedCount: 1, embeddedCount: 0, status: 'load_failed' },
        ])
    })

    it('reports empty evidence as not recorded rather than excluded or failed', () => {
        const inventory = buildProofEvidenceInventory({
            evidence: { reporterImage: null, beforeImages: [], afterImages: [] },
            inclusion: { reporter: false, beforeAfter: false },
            embedded: { reporter: false, before: 4, after: 4 },
        })

        expect(inventory.every((item) => item.status === 'not_recorded')).toBe(true)
        expect(inventory.every((item) => item.embeddedCount === 0)).toBe(true)
    })
})
