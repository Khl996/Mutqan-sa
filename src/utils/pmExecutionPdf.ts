import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDurationMinutes } from '@/lib/pm'
import type {
    ChecklistTemplateItem,
    ChecklistTemplateSection,
    MaintenanceTask,
    MaintenanceTaskAttachment,
    MaintenanceTaskCheck,
} from '@/types/maintenance'

interface GeneratePmExecutionPdfInput {
    task: MaintenanceTask
    checks: MaintenanceTaskCheck[]
    sections: ChecklistTemplateSection[]
    attachments: MaintenanceTaskAttachment[]
    tenantName?: string | null
    isRTL?: boolean
    labels: {
        title: string
        reference: string
        plan: string
        bundle: string
        asset: string
        building: string
        dueDate: string
        executionDate: string
        technician: string
        reviewer: string
        reviewStatus: string
        duration: string
        section: string
        item: string
        result: string
        status: string
        notes: string
        attachments: string
        signatures: string
        workOrder: string
        notAvailable: string
    }
}

interface PdfGenerationResult {
    fileName: string
    generatedAt: string
    renderedSnapshot: Record<string, unknown>
    resultsSnapshot: Record<string, unknown>
}

const BRAND = {
    teal: [15, 118, 110] as [number, number, number],
    dark: [15, 23, 42] as [number, number, number],
    muted: [100, 116, 139] as [number, number, number],
    light: [241, 245, 249] as [number, number, number],
}

const IMAGE_TYPES = new Set(['before_photo', 'after_photo', 'check_photo', 'signature', 'review_signature'])

function text(value: unknown, fallback = '') {
    if (value === null || value === undefined || value === '') return fallback
    return String(value)
}

function localizedName(primary: string | null | undefined, secondary: string | null | undefined, isRTL?: boolean) {
    return isRTL ? secondary || primary || '' : primary || secondary || ''
}

function shape(doc: jsPDF, value: unknown, fallback = '') {
    const raw = text(value, fallback)
    const processor = (doc as unknown as { processArabic?: (input: string) => string }).processArabic
    return processor ? processor(raw) : raw
}

function dateText(value: string | null | undefined) {
    if (!value) return ''
    return new Date(value).toLocaleDateString('en-GB')
}

function checkValue(check: MaintenanceTaskCheck) {
    const item = check.template_item as ChecklistTemplateItem | undefined
    if (!item) return ''

    if (item.item_type === 'yes_no') return check.value_bool === null ? '' : check.value_bool ? 'Yes' : 'No'
    if (item.item_type === 'numeric' || item.item_type === 'reading') {
        const unit = item.unit ? ` ${item.unit}` : ''
        return check.value_numeric === null ? '' : `${check.value_numeric}${unit}`
    }
    if (item.item_type === 'photo') return check.value_photo_url ? 'Photo attached' : ''
    if (item.item_type === 'signature') return check.value_signature_url ? 'Signature attached' : ''
    return check.value_text ?? ''
}

function getLastTableY(doc: jsPDF, fallback: number) {
    return (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback
}

function addFooter(doc: jsPDF, reference: string) {
    const pageCount = doc.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page)
        doc.setFontSize(8)
        doc.setTextColor(...BRAND.muted)
        doc.text(`Mutqan PM Sheet | ${reference} | Page ${page}/${pageCount}`, 105, 288, { align: 'center' })
    }
}

function ensurePage(doc: jsPDF, y: number, requiredHeight = 35) {
    if (y + requiredHeight < 280) return y
    doc.addPage()
    return 20
}

function addImageIfPossible(doc: jsPDF, url: string, x: number, y: number, width: number, height: number) {
    if (!url.startsWith('data:image/')) return false
    try {
        const type = url.includes('image/png') ? 'PNG' : 'JPEG'
        doc.addImage(url, type, x, y, width, height)
        return true
    } catch {
        return false
    }
}

export async function generatePmExecutionPdf({
    task,
    checks,
    sections,
    attachments,
    tenantName,
    isRTL,
    labels,
}: GeneratePmExecutionPdfInput): Promise<PdfGenerationResult> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const generatedAt = new Date().toISOString()
    const reference = task.execution_reference || `PM-${task.id.replace(/-/g, '').toUpperCase()}`
    const fileName = `${reference}-execution-sheet.pdf`

    doc.setFillColor(...BRAND.dark)
    doc.rect(0, 0, 210, 34, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.text(shape(doc, labels.title), 14, 15)
    doc.setFontSize(10)
    doc.text(shape(doc, tenantName || 'Mutqan'), 14, 23)
    doc.text(reference, 196, 15, { align: 'right' })
    doc.text(dateText(generatedAt), 196, 23, { align: 'right' })

    const planName = localizedName(task.plan?.name, task.plan?.name_ar, isRTL)
    const bundleName = localizedName(task.frequencyBundle?.name, task.frequencyBundle?.name_ar, isRTL)
    const assetName = task.asset ? `${task.asset.code} - ${localizedName(task.asset.name, task.asset.name_ar, isRTL)}` : ''
    const buildingName = task.building ? localizedName(task.building.name, task.building.name_ar, isRTL) : ''
    const reviewerName = localizedName(task.reviewer?.full_name, task.reviewer?.full_name_ar, isRTL)
    const technicianName = localizedName(task.assignee?.full_name, task.assignee?.full_name_ar, isRTL)

    autoTable(doc, {
        startY: 42,
        head: [[shape(doc, labels.reference), reference, shape(doc, labels.reviewStatus), shape(doc, task.review_status || labels.notAvailable)]],
        body: [
            [shape(doc, labels.plan), shape(doc, planName, labels.notAvailable), shape(doc, labels.bundle), shape(doc, bundleName, labels.notAvailable)],
            [shape(doc, labels.asset), shape(doc, assetName, labels.notAvailable), shape(doc, labels.building), shape(doc, buildingName, labels.notAvailable)],
            [shape(doc, labels.dueDate), dateText(task.due_date) || labels.notAvailable, shape(doc, labels.executionDate), dateText(task.completed_at || task.execution_completed_at || generatedAt)],
            [shape(doc, labels.technician), shape(doc, technicianName, labels.notAvailable), shape(doc, labels.reviewer), shape(doc, reviewerName, labels.notAvailable)],
            [shape(doc, labels.duration), formatDurationMinutes(task.actual_duration_minutes || task.estimated_duration_minutes) ?? labels.notAvailable, shape(doc, labels.workOrder), task.related_work_order_id || labels.notAvailable],
        ],
        theme: 'grid',
        headStyles: { fillColor: BRAND.teal, textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
        columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } },
    })

    let y = getLastTableY(doc, 80) + 8
    const checksBySection = new Map<string, MaintenanceTaskCheck[]>()
    checks.forEach((check) => {
        const key = check.template_item?.section_id ?? 'general'
        checksBySection.set(key, [...(checksBySection.get(key) ?? []), check])
    })

    const sectionsForPdf = sections.length > 0
        ? sections
        : [{ id: 'general', title: labels.section, title_ar: labels.section, sort_order: 0 } as ChecklistTemplateSection]

    for (const section of sectionsForPdf) {
        const sectionChecks = checksBySection.get(section.id) ?? (section.id === 'general' ? checks : [])
        if (sectionChecks.length === 0) continue

        y = ensurePage(doc, y, 45)
        doc.setFillColor(...BRAND.light)
        doc.roundedRect(14, y, 182, 9, 2, 2, 'F')
        doc.setFontSize(11)
        doc.setTextColor(...BRAND.dark)
        doc.text(shape(doc, localizedName(section.title, section.title_ar, isRTL) || labels.section), 18, y + 6)
        y += 12

        autoTable(doc, {
            startY: y,
            head: [[shape(doc, labels.item), shape(doc, labels.result), shape(doc, labels.status), shape(doc, labels.notes)]],
            body: sectionChecks.map((check) => [
                shape(doc, localizedName(check.template_item?.label, check.template_item?.label_ar, isRTL), labels.notAvailable),
                shape(doc, checkValue(check), labels.notAvailable),
                shape(doc, check.status || labels.notAvailable),
                shape(doc, check.notes || ''),
            ]),
            theme: 'striped',
            headStyles: { fillColor: BRAND.dark, textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak' },
            columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 45 }, 2: { cellWidth: 25 }, 3: { cellWidth: 42 } },
        })
        y = getLastTableY(doc, y) + 8
    }

    if (task.completion_notes || task.review_notes) {
        y = ensurePage(doc, y, 40)
        autoTable(doc, {
            startY: y,
            head: [[shape(doc, labels.notes)]],
            body: [
                [shape(doc, task.completion_notes || labels.notAvailable)],
                task.review_notes ? [shape(doc, task.review_notes)] : undefined,
            ].filter(Boolean) as string[][],
            theme: 'grid',
            headStyles: { fillColor: BRAND.teal, textColor: 255 },
            styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
        })
        y = getLastTableY(doc, y) + 8
    }

    const evidence = attachments.filter((attachment) => IMAGE_TYPES.has(attachment.attachment_type) && attachment.file_url.startsWith('data:image/'))
    const signatureUrls = [
        task.executor_signature_url,
        task.reviewer_signature_url,
        ...checks.map((check) => check.value_signature_url),
    ].filter(Boolean) as string[]

    if (evidence.length > 0 || signatureUrls.length > 0) {
        y = ensurePage(doc, y, 60)
        doc.setFontSize(12)
        doc.setTextColor(...BRAND.dark)
        doc.text(shape(doc, labels.attachments), 14, y)
        y += 6

        const images = [
            ...evidence.map((attachment) => ({ label: attachment.file_name, url: attachment.file_url })),
            ...signatureUrls.map((url, index) => ({ label: `${labels.signatures} ${index + 1}`, url })),
        ].slice(0, 6)

        images.forEach((image, index) => {
            const column = index % 2
            if (index > 0 && column === 0) y = ensurePage(doc, y + 42, 50)
            const x = column === 0 ? 14 : 108
            const added = addImageIfPossible(doc, image.url, x, y, 82, 34)
            doc.setFontSize(8)
            doc.setTextColor(...BRAND.muted)
            doc.text(shape(doc, added ? image.label : `${image.label} (${labels.notAvailable})`), x, y + 39, { maxWidth: 82 })
        })
    }

    addFooter(doc, reference)
    doc.save(fileName)

    return {
        fileName,
        generatedAt,
        renderedSnapshot: {
            task_id: task.id,
            execution_reference: reference,
            execution_snapshot: task.execution_snapshot,
            generated_at: generatedAt,
        },
        resultsSnapshot: {
            checks: checks.map((check) => ({
                id: check.id,
                template_item_id: check.template_item_id,
                status: check.status,
                value_bool: check.value_bool,
                value_numeric: check.value_numeric,
                value_text: check.value_text,
                value_photo_url: Boolean(check.value_photo_url),
                value_signature_url: Boolean(check.value_signature_url),
                notes: check.notes,
                checked_by: check.checked_by,
                checked_at: check.checked_at,
            })),
            attachments: attachments.map((attachment) => ({
                id: attachment.id,
                type: attachment.attachment_type,
                file_name: attachment.file_name,
                mime_type: attachment.mime_type,
                file_size: attachment.file_size,
                uploaded_at: attachment.uploaded_at,
            })),
            review: {
                review_status: task.review_status,
                reviewed_by: task.reviewed_by,
                reviewed_at: task.reviewed_at,
                review_notes: task.review_notes,
            },
        },
    }
}
