import type { OperationLog, WorkOrder, WorkOrderPdfSnapshot } from '@/hooks/useWorkOrders'
import type { TenantSettings } from '@/config/tenantSettings'

export type ProofLanguage = 'ar' | 'en'
export type ProofRecordBasis = 'closure_snapshot_partial' | 'live_record'

export interface ProofParty {
    id: string | null
    name: string | null
}

export interface ProofLocation {
    building: string | null
    floor: string | null
    room: string | null
    label: string | null
}

export interface ProofOperation {
    id: string
    type: OperationLog['type']
    description: string
    reason: string | null
    performedBy: string | null
    timestamp: string
    status: string
}

export interface ProofOfWorkViewModel {
    contractVersion: 1
    recordBasis: ProofRecordBasis
    isFinal: boolean
    organization: string | null
    workOrder: {
        id: string
        code: string
        title: string
        description: string | null
        status: WorkOrder['status']
        priority: WorkOrder['priority']
        issueType: string | null
    }
    location: ProofLocation
    asset: {
        id: string
        code: string
        name: string
    } | null
    parties: {
        reporter: ProofParty
        assignee: ProofParty
        team: ProofParty
        closedBy: ProofParty
    }
    timestamps: {
        reportedAt: string | null
        startedAt: string | null
        endedAt: string | null
        completedAt: string | null
        closedAt: string | null
    }
    notes: {
        technician: string | null
        supervisor: string | null
        engineer: string | null
        reporter: string | null
    }
    evidence: {
        reporterImage: string | null
        beforeImages: unknown[]
        afterImages: unknown[]
    }
    operations: ProofOperation[]
}

export interface ProofTenantIdentity {
    name: string
    name_ar?: string | null
}

export interface EffectiveProofIdentity {
    name: string
    secondary: string | null
    logoPath: string | null
    logoUrl: string | null
    letterheadUrl: string | null
}

export type ProofEvidenceKind = 'reporter' | 'before' | 'after'
export type ProofEvidenceStatus = 'embedded' | 'excluded' | 'load_failed' | 'not_recorded'

export interface ProofEvidenceInventoryItem {
    kind: ProofEvidenceKind
    recordedCount: number
    embeddedCount: number
    status: ProofEvidenceStatus
}

export interface BuildProofOfWorkParams {
    workOrder: WorkOrder
    logs?: OperationLog[]
    language: ProofLanguage
    tenant?: ProofTenantIdentity | null
}

function textOrNull(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const valueTrimmed = value.trim()
    return valueTrimmed.length > 0 ? valueTrimmed : null
}

function localizedName(
    value: { name: string; name_ar?: string | null } | null | undefined,
    language: ProofLanguage
): string | null {
    if (!value) return null
    return language === 'ar'
        ? textOrNull(value.name_ar) ?? textOrNull(value.name)
        : textOrNull(value.name) ?? textOrNull(value.name_ar)
}

export function buildEffectiveProofIdentity({
    language,
    tenant,
    settings,
}: {
    language: ProofLanguage
    tenant: ProofTenantIdentity
    settings: TenantSettings['pdf_identity']
}): EffectiveProofIdentity {
    const configuredOrganization = localizedName({
        name: settings.organization_name,
        name_ar: settings.organization_name_ar,
    }, language)
    const fallbackBrand = language === 'ar' ? 'متقن' : 'Mutqan'

    return {
        name: textOrNull(settings.print_header_name)
            ?? configuredOrganization
            ?? localizedName(tenant, language)
            ?? fallbackBrand,
        secondary: textOrNull(settings.print_header_secondary),
        logoPath: textOrNull(settings.logo_path),
        logoUrl: textOrNull(settings.print_logo_url),
        letterheadUrl: textOrNull(settings.print_letterhead_url),
    }
}

function evidenceStatus(
    recordedCount: number,
    embeddedCount: number,
    includedByPolicy: boolean
): ProofEvidenceStatus {
    if (recordedCount === 0) return 'not_recorded'
    if (!includedByPolicy) return 'excluded'
    return embeddedCount > 0 ? 'embedded' : 'load_failed'
}

export function buildProofEvidenceInventory({
    evidence,
    inclusion,
    embedded,
}: {
    evidence: ProofOfWorkViewModel['evidence']
    inclusion: { reporter: boolean; beforeAfter: boolean }
    embedded: { reporter: boolean; before: number; after: number }
}): ProofEvidenceInventoryItem[] {
    const reporterRecorded = evidence.reporterImage ? 1 : 0
    const beforeRecorded = evidence.beforeImages.length
    const afterRecorded = evidence.afterImages.length
    const reporterEmbedded = reporterRecorded > 0 && embedded.reporter ? 1 : 0
    const beforeEmbedded = Math.min(beforeRecorded, Math.max(0, Math.trunc(embedded.before)))
    const afterEmbedded = Math.min(afterRecorded, Math.max(0, Math.trunc(embedded.after)))

    return [
        {
            kind: 'reporter',
            recordedCount: reporterRecorded,
            embeddedCount: reporterEmbedded,
            status: evidenceStatus(reporterRecorded, reporterEmbedded, inclusion.reporter),
        },
        {
            kind: 'before',
            recordedCount: beforeRecorded,
            embeddedCount: beforeEmbedded,
            status: evidenceStatus(beforeRecorded, beforeEmbedded, inclusion.beforeAfter),
        },
        {
            kind: 'after',
            recordedCount: afterRecorded,
            embeddedCount: afterEmbedded,
            status: evidenceStatus(afterRecorded, afterEmbedded, inclusion.beforeAfter),
        },
    ]
}

function localizedPerson(
    value: { id: string; full_name: string; full_name_ar?: string | null } | null | undefined,
    language: ProofLanguage
): ProofParty {
    if (!value) return { id: null, name: null }
    const name = language === 'ar'
        ? textOrNull(value.full_name_ar) ?? textOrNull(value.full_name)
        : textOrNull(value.full_name) ?? textOrNull(value.full_name_ar)
    return { id: value.id, name }
}

function isUsableSnapshot(
    value: WorkOrder['pdf_snapshot'],
    expectedCode: string
): value is WorkOrderPdfSnapshot {
    const candidate = value as Partial<WorkOrderPdfSnapshot> | null | undefined
    const closedAt = textOrNull(candidate?.closed_at)
    const closedBy = candidate?.closed_by
    const assetKeyExists = Boolean(
        candidate && Object.prototype.hasOwnProperty.call(candidate, 'asset')
    )
    const asset = candidate?.asset
    const assetIsUsable = asset === null || Boolean(
        asset
        && textOrNull(asset.id)
        && textOrNull(asset.code)
        && textOrNull(asset.name)
    )

    return Boolean(
        value
        && typeof value === 'object'
        && candidate?.contract_version === 2
        && textOrNull(candidate?.code) === textOrNull(expectedCode)
        && textOrNull(candidate?.title)
        && closedAt
        && !Number.isNaN(new Date(closedAt).getTime())
        && snapshotPriority(candidate?.priority) !== null
        && closedBy
        && textOrNull(closedBy.id)
        && textOrNull(closedBy.full_name)
        && assetKeyExists
        && assetIsUsable
    )
}

export function hasClosureProofSnapshot(
    workOrder: Pick<WorkOrder, 'pdf_snapshot' | 'code'>
): boolean {
    return isUsableSnapshot(workOrder.pdf_snapshot, workOrder.code)
}

function snapshotPerson(
    value: WorkOrderPdfSnapshot['assignee'] | WorkOrderPdfSnapshot['reporter'] | WorkOrderPdfSnapshot['closed_by'] | null | undefined
): ProofParty {
    if (!value) return { id: null, name: null }
    return { id: value.id, name: textOrNull(value.full_name) }
}

function snapshotNamed(
    value: WorkOrderPdfSnapshot['building'] | WorkOrderPdfSnapshot['floor'] | WorkOrderPdfSnapshot['room'] | WorkOrderPdfSnapshot['assigned_team'] | null | undefined,
    language: ProofLanguage
): ProofParty {
    if (!value) return { id: null, name: null }
    return { id: value.id, name: localizedName(value, language) }
}

function normalizeEvidenceList(value: unknown): unknown[] {
    return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : []
}

function snapshotPriority(value: string | null | undefined): WorkOrder['priority'] | null {
    return value === 'low' || value === 'medium' || value === 'high' || value === 'urgent'
        ? value
        : null
}

export function buildProofOfWorkViewModel({
    workOrder,
    logs = [],
    language,
    tenant,
}: BuildProofOfWorkParams): ProofOfWorkViewModel {
    const snapshot = isUsableSnapshot(workOrder.pdf_snapshot, workOrder.code)
        ? workOrder.pdf_snapshot
        : null
    const snapshotIssueType = snapshot?.issue_type
    const building = snapshot
        ? localizedName(snapshot.building, language)
        : localizedName(workOrder.building, language)
    const floor = snapshot
        ? localizedName(snapshot.floor, language)
        : localizedName(workOrder.floor, language)
    const room = snapshot
        ? localizedName(snapshot.room, language)
        : localizedName(workOrder.room, language)
    const locationParts = [building, floor, room].filter((value): value is string => Boolean(value))

    const reporter = snapshot
        ? snapshotPerson(snapshot.reporter)
        : localizedPerson(workOrder.reporter, language)
    const assignee = snapshot
        ? snapshotPerson(snapshot.assignee)
        : localizedPerson(workOrder.assignee, language)
    const team = snapshot
        ? snapshotNamed(snapshot.assigned_team, language)
        : workOrder.assignedTeam
            ? { id: workOrder.assignedTeam.id, name: localizedName(workOrder.assignedTeam, language) }
            : { id: null, name: null }

    const closedAtMs = snapshot ? new Date(snapshot.closed_at).getTime() : null
    const chronologicalOperations = logs
        .filter((log) => {
            if (closedAtMs === null) return true
            const eventMs = new Date(log.timestamp).getTime()
            const recordedMs = new Date(log.created_at).getTime()
            return !Number.isNaN(eventMs)
                && !Number.isNaN(recordedMs)
                && eventMs <= closedAtMs
                && recordedMs <= closedAtMs
        })
        .slice()
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
        .map((log): ProofOperation => ({
            id: log.id,
            type: log.type,
            description: log.description,
            reason: textOrNull(log.reason),
            performedBy: localizedPerson(log.performer, language).name ?? textOrNull(log.technician_name),
            timestamp: log.timestamp,
            status: log.status,
        }))

    return {
        contractVersion: 1,
        recordBasis: snapshot ? 'closure_snapshot_partial' : 'live_record',
        isFinal: workOrder.status === 'completed' && Boolean(snapshot),
        organization: tenant ? localizedName(tenant, language) : null,
        workOrder: {
            id: workOrder.id,
            code: textOrNull(snapshot?.code) ?? workOrder.code,
            title: snapshot ? snapshot.title : workOrder.title,
            description: snapshot
                ? textOrNull(snapshot.description)
                : textOrNull(workOrder.description),
            status: workOrder.status,
            priority: snapshotPriority(snapshot?.priority) ?? workOrder.priority,
            issueType: snapshot
                ? localizedName(snapshotIssueType, language)
                : textOrNull(workOrder.issue_type),
        },
        location: {
            building,
            floor,
            room,
            label: locationParts.length > 0 ? locationParts.join(' › ') : null,
        },
        asset: snapshot
            ? snapshot.asset
                ? {
                    id: snapshot.asset.id,
                    code: snapshot.asset.code,
                    name: localizedName(snapshot.asset, language) ?? snapshot.asset.code,
                }
                : null
            : workOrder.asset
                ? {
                    id: workOrder.asset.id,
                    code: workOrder.asset.code,
                    name: localizedName(workOrder.asset, language) ?? workOrder.asset.code,
                }
                : null,
        parties: {
            reporter,
            assignee,
            team,
            closedBy: snapshot?.closed_by ? snapshotPerson(snapshot.closed_by) : { id: null, name: null },
        },
        timestamps: {
            reportedAt: textOrNull(snapshot?.created_at)
                ?? textOrNull(workOrder.reported_at)
                ?? textOrNull(workOrder.created_at),
            startedAt: textOrNull(workOrder.start_time),
            endedAt: textOrNull(workOrder.end_time),
            completedAt: textOrNull(workOrder.completed_at),
            closedAt: textOrNull(snapshot?.closed_at) ?? textOrNull(workOrder.completed_at),
        },
        notes: {
            technician: textOrNull(workOrder.technician_notes),
            supervisor: textOrNull(workOrder.supervisor_notes),
            engineer: textOrNull(workOrder.engineer_notes),
            reporter: snapshot
                ? textOrNull(snapshot.reporter_notes)
                : textOrNull(workOrder.reporter_notes),
        },
        evidence: {
            reporterImage: snapshot
                ? textOrNull(snapshot.reporter_image_url)
                : textOrNull(workOrder.reporter_image_url),
            beforeImages: normalizeEvidenceList(
                snapshot ? snapshot.before_images : workOrder.before_images
            ),
            afterImages: normalizeEvidenceList(
                snapshot ? snapshot.after_images : workOrder.after_images
            ),
        },
        operations: chronologicalOperations,
    }
}

export function formatProofDateTime(
    value: string | null | undefined,
    language: ProofLanguage,
    timeZone = 'Asia/Riyadh'
): string | null {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null

    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone,
    }).format(date)
}
