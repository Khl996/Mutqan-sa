/**
 * @deprecated The user-facing Proof of Work path uses WorkOrderPrintView and
 * browser-native printing. Do not reconnect this jsPDF generator: its Arabic
 * font subsets are not portable across strict PDF readers.
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import amiriRegularUrl from '@expo-google-fonts/amiri/400Regular/Amiri_400Regular.ttf?url'
import amiriBoldUrl from '@expo-google-fonts/amiri/700Bold/Amiri_700Bold.ttf?url'
import { supabase } from '@/lib/supabase'
import type { OperationLog, WorkOrder } from '@/hooks/useWorkOrders'
import type { TenantSettings } from '@/config/tenantSettings'
import { STATUS_DISPLAY } from '@/config/workOrderStatus'
import i18n from '@/i18n/config'
import {
    buildEffectiveProofIdentity,
    buildProofEvidenceInventory,
    buildProofOfWorkViewModel,
    formatProofDateTime,
} from '@/lib/proofOfWork'
import { isSafeProofStoragePath } from '@/lib/proofStorage'

const BRAND = {
    teal:  [0, 178, 169]   as [number, number, number],
    dark:  [11, 19, 32]    as [number, number, number],
    muted: [107, 119, 133] as [number, number, number],
    light: [238, 243, 245] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
}

function shape(doc: jsPDF, value: unknown, fallback = ''): string {
    const raw = value === null || value === undefined ? fallback : String(value)
    const processor = (doc as unknown as { processArabic?: (s: string) => string }).processArabic
    if (!processor || !/[\u0600-\u06ff]/.test(raw)) return raw
    // The ASCII full stop has a neutral bidi class and PDF engines can move it
    // to the start of an Arabic line. Suppress only that terminal glyph in
    // the presentation layer; the immutable source snapshot is unchanged.
    const bidiSafe = raw.endsWith('.') ? raw.slice(0, -1) : raw
    return processor(bidiSafe)
}

function getLastTableY(doc: jsPDF, fallback: number): number {
    return (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback
}

function ensurePage(doc: jsPDF, y: number, required = 30): number {
    if (y + required < 280) return y
    doc.addPage()
    return 20
}

function addFooter(doc: jsPDF, reference: string, note: string | null, isRTL: boolean) {
    const total = doc.getNumberOfPages()
    for (let page = 1; page <= total; page++) {
        doc.setPage(page)
        doc.setFontSize(8)
        doc.setTextColor(...BRAND.muted)
        doc.text(reference, 14, 290, { align: 'left' })
        doc.text(`${page} / ${total}`, 196, 290, { align: 'right' })
        if (note) {
            doc.text(isRTL ? shape(doc, note) : note, 105, 290, { align: 'center' })
        }
    }
}

function formatPdfDateTime(
    value: string | null | undefined,
    language: 'ar' | 'en',
    timeZone: string
): string | null {
    if (language === 'en') return formatProofDateTime(value, language, timeZone)
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    // Latin technical numerals avoid ambiguous bidi reordering inside a PDF
    // while the surrounding labels and narrative remain fully Arabic.
    return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(date).replace(',', '')
}

const AMIRI_REGULAR_SHA256 = 'd26cd95609ed51b6419e3c7d4a066cb9fac7b73117868622f5b7f03998c68568'
const AMIRI_BOLD_SHA256 = '0cf3c9c5b967adb281a46f17293fe03b1fc05e0538ab4db4a4c2252f45098692'

function bytesToBase64(bytes: Uint8Array): string {
    let binary = ''
    const chunkSize = 0x8000
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
    }
    return btoa(binary)
}

async function verifiedLocalFontBase64(url: string, expectedSha256: string): Promise<string> {
    const resolvedUrl = new URL(url, window.location.href)
    if (resolvedUrl.origin !== window.location.origin) {
        throw new Error('Proof font must be loaded from the Mutqan application origin.')
    }

    const response = await fetch(resolvedUrl.href, { credentials: 'same-origin' })
    if (!response.ok) throw new Error('The locally bundled Proof of Work font could not be loaded.')

    const buffer = await response.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buffer)
    const actualSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    if (actualSha256 !== expectedSha256) {
        throw new Error('The locally bundled Proof of Work font failed checksum verification.')
    }

    return bytesToBase64(new Uint8Array(buffer))
}

async function loadAmiriFont(doc: jsPDF): Promise<void> {
    const [regularBase64, boldBase64] = await Promise.all([
        verifiedLocalFontBase64(amiriRegularUrl, AMIRI_REGULAR_SHA256),
        verifiedLocalFontBase64(amiriBoldUrl, AMIRI_BOLD_SHA256),
    ])

    doc.addFileToVFS('Amiri-Regular.ttf', regularBase64)
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal')
    doc.addFileToVFS('Amiri-Bold.ttf', boldBase64)
    doc.addFont('Amiri-Bold.ttf', 'Amiri', 'bold')
    doc.setFont('Amiri', 'normal')
}

async function urlToDataUrl(url: string): Promise<string | null> {
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        const blob = await res.blob()
        if (!blob.type.startsWith('image/') || blob.size > 10 * 1024 * 1024) return null
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
        })
    } catch {
        return null
    }
}

async function signedDataUrl(bucket: string, path: string): Promise<string | null> {
    if (!isSafeProofStoragePath(path)) return null
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) return null
    return urlToDataUrl(data.signedUrl)
}

function extractImagePath(item: unknown): string | null {
    if (typeof item === 'string' && isSafeProofStoragePath(item)) return item
    if (typeof item === 'object' && item !== null) {
        const o = item as Record<string, unknown>
        for (const key of ['path', 'storage_path']) {
            if (typeof o[key] === 'string' && isSafeProofStoragePath(o[key] as string)) return o[key] as string
        }
    }
    return null
}

async function resolveImageDataUrl(raw: unknown): Promise<string | null> {
    const path = extractImagePath(raw)
    if (!path) return null
    // Only tenant-scoped Supabase Storage references are accepted. RLS remains
    // the final authority for issuing each signed URL.
    for (const bucket of ['pm-execution-photos', 'public-report-photos']) {
        const result = await signedDataUrl(bucket, path)
        if (result) return result
    }
    return null
}

function addImageCell(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
    if (!dataUrl.startsWith('data:image/')) return
    try {
        const type = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
        doc.addImage(dataUrl, type, x, y, w, h)
    } catch { /* skip on error */ }
}

export interface GenerateWorkOrderPdfParams {
    workOrder: WorkOrder
    logs?: OperationLog[]
    settings: TenantSettings
    tenant: { id: string; name: string; name_ar: string | null }
    isRTL?: boolean
}

export interface WorkOrderPdfResult {
    blob: Blob
    fileName: string
}

export async function generateWorkOrderPdf({
    workOrder,
    logs = [],
    settings,
    tenant,
    isRTL = false,
}: GenerateWorkOrderPdfParams): Promise<WorkOrderPdfResult> {
    if (tenant.id !== workOrder.tenant_id) {
        throw new Error('Proof tenant identity does not match the work order tenant.')
    }

    const language = isRTL ? 'ar' : 'en'
    const t = i18n.getFixedT(language)
    const pdfSettings = settings.pdf_identity
    const identity = buildEffectiveProofIdentity({ language, tenant, settings: pdfSettings })
    const proof = buildProofOfWorkViewModel({
        workOrder,
        logs,
        language,
        tenant: {
            name: identity.name,
            name_ar: identity.name,
        },
    })
    if (!proof.isFinal) {
        throw new Error('A verified closure snapshot is required to generate final Proof of Work.')
    }
    const displayDate = (value: string | null | undefined) => (
        formatPdfDateTime(value, language, settings.display.timezone) ?? t('workOrders.proof.notRecorded')
    )

    // Resolve all images concurrently before creating the doc
    const wantsReporterImg  = pdfSettings.show_reporter_images
    const wantsBeforeAfter  = pdfSettings.show_before_after_images
    const reporterPath      = proof.evidence.reporterImage
    const beforeRaw         = proof.evidence.beforeImages
    const afterRaw          = proof.evidence.afterImages

    const [reporterDataUrl, ...imageDataUrls] = await Promise.all([
        wantsReporterImg && reporterPath
            ? signedDataUrl('public-report-photos', reporterPath)
            : Promise.resolve(null),
        ...(wantsBeforeAfter
            ? [...beforeRaw.slice(0, 3), ...afterRaw.slice(0, 3)].map(resolveImageDataUrl)
            : []),
    ])

    const beforeDataUrls = wantsBeforeAfter ? imageDataUrls.slice(0, Math.min(beforeRaw.length, 3)) : []
    const afterDataUrls  = wantsBeforeAfter ? imageDataUrls.slice(Math.min(beforeRaw.length, 3))   : []
    const evidenceInventory = buildProofEvidenceInventory({
        evidence: proof.evidence,
        inclusion: {
            reporter: wantsReporterImg,
            beforeAfter: wantsBeforeAfter,
        },
        embedded: {
            reporter: Boolean(reporterDataUrl),
            before: beforeDataUrls.filter(Boolean).length,
            after: afterDataUrls.filter(Boolean).length,
        },
    })

    // Fetch tenant logo if configured
    let logoDataUrl: string | null = null
    if (identity.logoPath && isSafeProofStoragePath(identity.logoPath)) {
        const { data } = await supabase.storage.from('tenant-assets').getPublicUrl(identity.logoPath)
        if (data?.publicUrl) logoDataUrl = await urlToDataUrl(data.publicUrl)
    }
    if (!logoDataUrl && identity.logoUrl) {
        logoDataUrl = await urlToDataUrl(identity.logoUrl)
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    await loadAmiriFont(doc)
    const tableFont = 'Amiri'
    const tableAlign = isRTL ? 'right' : 'left'
    const generatedAt = new Date().toISOString()

    const code      = proof.workOrder.code
    const orgLabel  = identity.name
    const fileName  = `work-order-${code}.pdf`
    doc.setProperties({
        title: `Proof of Work - ${code}`,
        subject: 'Mutqan operational Proof of Work',
        author: orgLabel,
        creator: 'Mutqan',
    })

    // ── Header ──────────────────────────────────────────────
    doc.setFillColor(...BRAND.dark)
    doc.rect(0, 0, 210, 36, 'F')
    doc.setTextColor(...BRAND.white)
    doc.setFontSize(16)
    doc.text(shape(doc, t('workOrders.proof.title')), isRTL ? 196 : 14, 14, {
        align: isRTL ? 'right' : 'left',
    })
    doc.setFontSize(10)
    doc.text(shape(doc, orgLabel), isRTL ? 196 : 14, 22, {
        align: isRTL ? 'right' : 'left',
    })
    doc.text(code, isRTL ? 46 : 164, 14, { align: isRTL ? 'left' : 'right' })
    doc.text(displayDate(proof.timestamps.closedAt), isRTL ? 46 : 164, 22, {
        align: isRTL ? 'left' : 'right',
    })

    if (logoDataUrl) {
        addImageCell(doc, logoDataUrl, isRTL ? 18 : 172, 7, 20, 20)
    }

    // ── Info table ───────────────────────────────────────────
    const notRecorded = t('workOrders.proof.notRecorded')
    const issueLabel = proof.workOrder.issueType ?? notRecorded
    const locationLabel = proof.location.label ?? notRecorded
    const priorityLabel = t(`workOrders.${proof.workOrder.priority}`)
    const statusLabel = STATUS_DISPLAY[proof.workOrder.status]?.label ?? proof.workOrder.status
    const recordBasis = proof.recordBasis === 'closure_snapshot_partial'
        ? t('workOrders.proof.basisClosureSnapshotPartial')
        : t('workOrders.proof.basisLiveRecord')
    const pairRow = (
        firstLabel: string,
        firstValue: string,
        secondLabel: string,
        secondValue: string
    ) => {
        const values = isRTL
            ? [secondValue, secondLabel, firstValue, firstLabel]
            : [firstLabel, firstValue, secondLabel, secondValue]
        return values.map((value) => shape(doc, value))
    }

    autoTable(doc, {
        startY: 44,
        margin: { left: 14, right: 14 },
        body: [
            pairRow(t('workOrders.proof.fields.title'), proof.workOrder.title,
                t('workOrders.proof.fields.workOrderNumber'), code),
            pairRow(t('workOrders.proof.fields.issueType'), issueLabel,
                t('workOrders.proof.fields.priority'), priorityLabel),
            pairRow(t('workOrders.proof.fields.status'), t(`workOrders.${statusLabel}`),
                t('workOrders.proof.sections.location'), locationLabel),
            pairRow(t('workOrders.proof.fields.asset'), proof.asset?.name ?? notRecorded,
                t('workOrders.proof.fields.assetCode'), proof.asset?.code ?? notRecorded),
            pairRow(t('workOrders.proof.fields.team'), proof.parties.team.name ?? notRecorded,
                t('workOrders.proof.fields.assignee'), proof.parties.assignee.name ?? notRecorded),
            pairRow(t('workOrders.proof.fields.reporter'), proof.parties.reporter.name ?? notRecorded,
                t('workOrders.proof.fields.closedBy'), proof.parties.closedBy.name ?? notRecorded),
            pairRow(t('workOrders.proof.fields.reportedAt'), displayDate(proof.timestamps.reportedAt),
                t('workOrders.proof.fields.completedAt'), displayDate(proof.timestamps.closedAt)),
            pairRow(t('workOrders.proof.recordBasis'), recordBasis,
                t('workOrders.proof.generatedAt'), displayDate(generatedAt)),
        ],
        theme: 'grid',
        styles: { font: tableFont, halign: tableAlign, fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
        columnStyles: isRTL
            ? {
                0: { cellWidth: 55 },
                1: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 36 },
                2: { cellWidth: 55 },
                3: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 36 },
            }
            : {
                0: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 36 },
                1: { cellWidth: 55 },
                2: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 36 },
                3: { cellWidth: 55 },
            },
    })

    let y = getLastTableY(doc, 80) + 8

    // ── Description ──────────────────────────────────────────
    const desc = proof.workOrder.description
    if (desc) {
        y = ensurePage(doc, y, 40)
        doc.setFillColor(...BRAND.light)
        doc.roundedRect(14, y, 182, 8, 2, 2, 'F')
        doc.setFontSize(10)
        doc.setTextColor(...BRAND.dark)
        doc.text(shape(doc, t('workOrders.proof.fields.description')), isRTL ? 192 : 18, y + 5.5, {
            align: isRTL ? 'right' : 'left',
        })
        y += 11
        autoTable(doc, {
            startY: y,
            margin: { left: 14, right: 14 },
            body: [[shape(doc, desc)]],
            theme: 'plain',
            styles: {
                font: tableFont,
                halign: tableAlign,
                fontSize: 9,
                cellPadding: 3,
                overflow: 'linebreak',
            },
        })
        y = getLastTableY(doc, y) + 8
    }

    // ── Execution and review notes ───────────────────────────
    y = ensurePage(doc, y, 52)
    doc.setFillColor(...BRAND.light)
    doc.roundedRect(14, y, 182, 8, 2, 2, 'F')
    doc.setFontSize(10)
    doc.setTextColor(...BRAND.dark)
    doc.text(shape(doc, t('workOrders.proof.sections.execution')), isRTL ? 192 : 18, y + 5.5, {
        align: isRTL ? 'right' : 'left',
    })
    y += 11
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        body: ([
            [t('workOrders.proof.fields.technicianNotes'), proof.notes.technician ?? notRecorded],
            [t('workOrders.proof.fields.supervisorNotes'), proof.notes.supervisor ?? notRecorded],
            [t('workOrders.proof.fields.engineerNotes'), proof.notes.engineer ?? notRecorded],
            [t('workOrders.proof.fields.reporterNotes'), proof.notes.reporter ?? notRecorded],
        ] as string[][]).map(([label, value]) => (
            (isRTL ? [value, label] : [label, value]).map((cell) => shape(doc, cell))
        )),
        theme: 'grid',
        styles: {
            font: tableFont,
            halign: tableAlign,
            fontSize: 9,
            cellPadding: 3,
            overflow: 'linebreak',
        },
        columnStyles: isRTL
            ? {
                0: { cellWidth: 134 },
                1: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 48 },
            }
            : {
                0: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 48 },
                1: { cellWidth: 134 },
            },
    })
    y = getLastTableY(doc, y) + 8

    // ── Appendix: evidence, operational trail, and images ───
    const allImages: { label: string; dataUrl: string | null }[] = []

    if (wantsReporterImg && reporterDataUrl) {
        allImages.push({ label: t('workOrders.proof.fields.reporterPhoto'), dataUrl: reporterDataUrl })
    }

    if (wantsBeforeAfter) {
        beforeDataUrls.forEach((du, i) => {
            if (du) allImages.push({ label: `${t('workOrders.proof.fields.beforePhoto')} ${i + 1}`, dataUrl: du })
        })
        afterDataUrls.forEach((du, i) => {
            if (du) allImages.push({ label: `${t('workOrders.proof.fields.afterPhoto')} ${i + 1}`, dataUrl: du })
        })
    }

    const drawAppendixBand = (continued: boolean): number => {
        doc.setFillColor(...BRAND.dark)
        doc.roundedRect(14, 14, 182, 24, 2, 2, 'F')
        doc.setFillColor(...BRAND.teal)
        doc.rect(isRTL ? 192 : 14, 14, 4, 24, 'F')
        doc.setTextColor(...BRAND.white)
        doc.setFont(tableFont, 'bold')
        doc.setFontSize(13)
        doc.text(shape(doc, t('workOrders.proof.title')), isRTL ? 187 : 23, 23, {
            align: isRTL ? 'right' : 'left',
        })
        doc.setFont(tableFont, 'normal')
        doc.setFontSize(9)
        doc.text(
            shape(doc, t(continued
                ? 'workOrders.proof.sections.appendixContinuation'
                : 'workOrders.proof.sections.appendix')),
            isRTL ? 187 : 23,
            31,
            { align: isRTL ? 'right' : 'left' }
        )
        doc.setFontSize(9)
        doc.text(code, isRTL ? 18 : 192, 23, { align: isRTL ? 'left' : 'right' })
        return 44
    }

    const ensureAppendixPage = (currentY: number, required: number): number => {
        if (currentY + required < 280) return currentY
        doc.addPage()
        return drawAppendixBand(true)
    }

    doc.addPage()
    y = drawAppendixBand(false)

    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        body: [
            pairRow(t('workOrders.proof.fields.workOrderNumber'), code,
                t('workOrders.proof.fields.organization'), orgLabel),
            pairRow(t('workOrders.proof.fields.completedAt'), displayDate(proof.timestamps.closedAt),
                t('workOrders.proof.recordBasis'), recordBasis),
        ],
        theme: 'grid',
        styles: {
            font: tableFont,
            halign: tableAlign,
            fontSize: 9,
            cellPadding: 3,
            overflow: 'linebreak',
        },
        columnStyles: isRTL
            ? {
                0: { cellWidth: 55 },
                1: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 36 },
                2: { cellWidth: 55 },
                3: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 36 },
            }
            : {
                0: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 36 },
                1: { cellWidth: 55 },
                2: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 36 },
                3: { cellWidth: 55 },
            },
    })
    y = getLastTableY(doc, y) + 8

    doc.setFillColor(...BRAND.light)
    doc.roundedRect(14, y, 182, 8, 2, 2, 'F')
    doc.setFontSize(10)
    doc.setTextColor(...BRAND.dark)
    doc.text(shape(doc, t('workOrders.proof.sections.evidence')), isRTL ? 192 : 18, y + 5.5, {
        align: isRTL ? 'right' : 'left',
    })
    y += 11

    const evidenceHead = [
        t('workOrders.proof.fields.evidenceType'),
        t('workOrders.proof.fields.recordedCount'),
        t('workOrders.proof.fields.embeddedCount'),
        t('workOrders.proof.fields.evidenceStatus'),
    ]
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [(isRTL ? evidenceHead.slice().reverse() : evidenceHead).map((cell) => shape(doc, cell))],
        body: evidenceInventory.map((item) => {
            const label = item.kind === 'reporter'
                ? t('workOrders.proof.fields.reporterPhoto')
                : item.kind === 'before'
                    ? t('workOrders.proof.fields.beforePhoto')
                    : t('workOrders.proof.fields.afterPhoto')
            const row = [
                label,
                String(item.recordedCount),
                String(item.embeddedCount),
                t(`workOrders.proof.evidenceStatuses.${item.status}`),
            ].map((cell) => shape(doc, cell))
            return isRTL ? row.reverse() : row
        }),
        theme: 'grid',
        styles: {
            font: tableFont,
            halign: tableAlign,
            fontSize: 8,
            cellPadding: 2.5,
            overflow: 'linebreak',
        },
        headStyles: {
            font: tableFont,
            halign: tableAlign,
            fillColor: BRAND.dark,
            textColor: BRAND.white,
            fontStyle: 'bold',
        },
        columnStyles: isRTL
            ? {
                0: { cellWidth: 67 },
                1: { cellWidth: 38 },
                2: { cellWidth: 32 },
                3: { cellWidth: 45 },
            }
            : {
                0: { cellWidth: 45 },
                1: { cellWidth: 32 },
                2: { cellWidth: 38 },
                3: { cellWidth: 67 },
            },
    })
    y = getLastTableY(doc, y) + 8

    // ── Operational trail inside the appendix ───────────────
    y = ensureAppendixPage(y, 50)
    doc.setFillColor(...BRAND.light)
    doc.roundedRect(14, y, 182, 8, 2, 2, 'F')
    doc.setFontSize(10)
    doc.setTextColor(...BRAND.dark)
    doc.text(shape(doc, t('workOrders.proof.sections.operations')), isRTL ? 192 : 18, y + 5.5, {
        align: isRTL ? 'right' : 'left',
    })
    y += 11

    if (proof.operations.length > 0) {
        const operationHead = [
            t('workOrders.proof.fields.date'),
            t('workOrders.proof.fields.operation'),
            t('workOrders.proof.fields.performedBy'),
            t('workOrders.proof.fields.notes'),
        ]
        autoTable(doc, {
            startY: y,
            margin: { top: 44, left: 14, right: 14, bottom: 20 },
            head: [(isRTL ? operationHead.slice().reverse() : operationHead)
                .map((cell) => shape(doc, cell))],
            body: proof.operations.map((operation) => {
                const details = operation.reason
                    ? `${operation.description}\n${t('workOrders.proof.fields.reason')}: ${operation.reason}`
                    : operation.description
                const row = [
                    shape(doc, displayDate(operation.timestamp)),
                    shape(doc, t(`workOrders.proof.operationTypes.${operation.type}`, {
                        defaultValue: t('workOrders.proof.operationTypes.other'),
                    })),
                    shape(doc, operation.performedBy ?? notRecorded),
                    shape(doc, details),
                ]
                return isRTL ? row.reverse() : row
            }),
            theme: 'grid',
            styles: {
                font: tableFont,
                halign: tableAlign,
                fontSize: 8,
                cellPadding: 2.5,
                overflow: 'linebreak',
            },
            headStyles: {
                font: tableFont,
                halign: tableAlign,
                fillColor: BRAND.dark,
                textColor: BRAND.white,
                fontStyle: 'bold',
            },
            columnStyles: isRTL
                ? {
                    0: { cellWidth: 68 },
                    1: { cellWidth: 40 },
                    2: { cellWidth: 38 },
                    3: { cellWidth: 36 },
                }
                : {
                    0: { cellWidth: 36 },
                    1: { cellWidth: 38 },
                    2: { cellWidth: 40 },
                    3: { cellWidth: 68 },
                },
            willDrawPage: ({ pageNumber }) => {
                if (pageNumber > 1) drawAppendixBand(true)
            },
        })
        y = getLastTableY(doc, y) + 8
    } else {
        doc.setFont(tableFont, 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...BRAND.muted)
        doc.text(shape(doc, t('workOrders.proof.noOperations')), isRTL ? 192 : 18, y + 5, {
            align: isRTL ? 'right' : 'left',
        })
        y += 13
    }

    if (allImages.length > 0) {
        y = ensureAppendixPage(y, 60)
        allImages.forEach((img, index) => {
            const col = index % 2
            if (index > 0 && col === 0) {
                y = ensureAppendixPage(y + 52, 60)
            }
            const x = col === 0 ? 14 : 108
            if (img.dataUrl) {
                addImageCell(doc, img.dataUrl, x, y, 82, 46)
            } else {
                doc.setDrawColor(...BRAND.muted)
                doc.rect(x, y, 82, 46)
                doc.setFontSize(8)
                doc.setTextColor(...BRAND.muted)
                doc.text(shape(doc, img.label), x + 41, y + 23, { align: 'center' })
            }
            doc.setFontSize(8)
            doc.setTextColor(...BRAND.muted)
            doc.text(shape(doc, img.label), isRTL ? x + 82 : x, y + 49, {
                align: isRTL ? 'right' : 'left',
            })
        })
    }

    addFooter(doc, code, pdfSettings.footer_note || t('workOrders.proof.generatedFrom'), isRTL)

    const blob = doc.output('blob')
    return { blob, fileName }
}
