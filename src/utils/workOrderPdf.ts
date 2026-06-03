import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabase'
import type { WorkOrder, WorkOrderPdfSnapshot } from '@/hooks/useWorkOrders'
import type { TenantSettings } from '@/config/tenantSettings'

const BRAND = {
    teal:  [15, 118, 110] as [number, number, number],
    dark:  [15, 23, 42]   as [number, number, number],
    muted: [100, 116, 139] as [number, number, number],
    light: [241, 245, 249] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
}

const AMIRI_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf'

function shape(doc: jsPDF, value: unknown, fallback = ''): string {
    const raw = value === null || value === undefined ? fallback : String(value)
    const processor = (doc as unknown as { processArabic?: (s: string) => string }).processArabic
    return processor ? processor(raw) : raw
}

function getLastTableY(doc: jsPDF, fallback: number): number {
    return (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback
}

function ensurePage(doc: jsPDF, y: number, required = 30): number {
    if (y + required < 280) return y
    doc.addPage()
    return 20
}

function addFooter(doc: jsPDF, reference: string, note: string | null) {
    const total = doc.getNumberOfPages()
    const footerText = note
        ? `${reference}  |  ${note}  |  `
        : `${reference}  |  `
    for (let page = 1; page <= total; page++) {
        doc.setPage(page)
        doc.setFontSize(8)
        doc.setTextColor(...BRAND.muted)
        doc.text(`${footerText}${page} / ${total}`, 105, 290, { align: 'center' })
    }
}

async function loadAmiriFont(doc: jsPDF): Promise<boolean> {
    try {
        const res = await fetch(AMIRI_URL)
        if (!res.ok) return false
        const blob = await res.blob()
        const base64: string = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve((reader.result as string).split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(blob)
        })
        doc.addFileToVFS('Amiri-Regular.ttf', base64)
        doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal')
        doc.setFont('Amiri')
        return true
    } catch {
        return false
    }
}

async function urlToDataUrl(url: string): Promise<string | null> {
    try {
        const res = await fetch(url)
        if (!res.ok) return null
        const blob = await res.blob()
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
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) return null
    return urlToDataUrl(data.signedUrl)
}

function extractImagePath(item: unknown): string | null {
    if (typeof item === 'string' && item.length > 0) return item
    if (typeof item === 'object' && item !== null) {
        const o = item as Record<string, unknown>
        for (const key of ['url', 'path', 'storage_path', 'src', 'file_url']) {
            if (typeof o[key] === 'string' && (o[key] as string).length > 0) return o[key] as string
        }
    }
    return null
}

async function resolveImageDataUrl(raw: unknown): Promise<string | null> {
    const path = extractImagePath(raw)
    if (!path) return null
    if (path.startsWith('data:image/')) return path
    if (path.startsWith('http://') || path.startsWith('https://')) return urlToDataUrl(path)
    // Treat as storage path — try pm-execution-photos then public-report-photos
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

function fmtDate(value: string | null | undefined): string {
    if (!value) return '—'
    return new Date(value).toLocaleDateString('en-GB')
}

function fmtDateTime(value: string | null | undefined): string {
    if (!value) return '—'
    const d = new Date(value)
    return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

function locName(obj: { name: string; name_ar: string | null } | null | undefined, isRTL: boolean): string {
    if (!obj) return '—'
    return (isRTL ? obj.name_ar || obj.name : obj.name) || '—'
}

export interface GenerateWorkOrderPdfParams {
    workOrder: WorkOrder
    settings: TenantSettings
    isRTL?: boolean
}

export interface WorkOrderPdfResult {
    blob: Blob
    fileName: string
}

export async function generateWorkOrderPdf({
    workOrder,
    settings,
    isRTL = false,
}: GenerateWorkOrderPdfParams): Promise<WorkOrderPdfResult> {
    const snap = workOrder.pdf_snapshot as WorkOrderPdfSnapshot | null | undefined
    const pdfSettings = settings.pdf_identity

    // Resolve all images concurrently before creating the doc
    const wantsReporterImg  = pdfSettings.show_reporter_images
    const wantsBeforeAfter  = pdfSettings.show_before_after_images
    const reporterPath      = snap?.reporter_image_url ?? workOrder.reporter_image_url ?? null
    const beforeRaw         = (snap?.before_images ?? workOrder.before_images ?? []) as unknown[]
    const afterRaw          = (snap?.after_images  ?? workOrder.after_images  ?? []) as unknown[]

    const [reporterDataUrl, ...imageDataUrls] = await Promise.all([
        wantsReporterImg && reporterPath
            ? (reporterPath.startsWith('http') ? urlToDataUrl(reporterPath) : signedDataUrl('public-report-photos', reporterPath))
            : Promise.resolve(null),
        ...(wantsBeforeAfter
            ? [...beforeRaw.slice(0, 3), ...afterRaw.slice(0, 3)].map(resolveImageDataUrl)
            : []),
    ])

    const beforeDataUrls = wantsBeforeAfter ? imageDataUrls.slice(0, Math.min(beforeRaw.length, 3)) : []
    const afterDataUrls  = wantsBeforeAfter ? imageDataUrls.slice(Math.min(beforeRaw.length, 3))   : []

    // Fetch tenant logo if configured
    let logoDataUrl: string | null = null
    if (pdfSettings.logo_path) {
        const { data } = await supabase.storage.from('tenant-assets').getPublicUrl(pdfSettings.logo_path)
        if (data?.publicUrl) logoDataUrl = await urlToDataUrl(data.publicUrl)
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const hasFont = await loadAmiriFont(doc)
    if (!hasFont) doc.setFont('helvetica')

    const code      = snap?.code      ?? workOrder.code
    const orgNameEn = pdfSettings.organization_name    || 'Mutqan'
    const orgNameAr = pdfSettings.organization_name_ar || orgNameEn
    const orgLabel  = isRTL ? orgNameAr : orgNameEn
    const fileName  = `work-order-${code}.pdf`

    // ── Header ──────────────────────────────────────────────
    doc.setFillColor(...BRAND.dark)
    doc.rect(0, 0, 210, 36, 'F')
    doc.setTextColor(...BRAND.white)
    doc.setFontSize(16)
    doc.text(shape(doc, isRTL ? 'تقرير أمر عمل' : 'Work Order Report'), 14, 14)
    doc.setFontSize(10)
    doc.text(shape(doc, orgLabel), 14, 22)
    doc.text(code, 196, 14, { align: 'right' })
    doc.text(fmtDate(snap?.closed_at ?? workOrder.completed_at), 196, 22, { align: 'right' })

    if (logoDataUrl) {
        try {
            doc.addImage(logoDataUrl, 'PNG', 170, 3, 20, 20)
        } catch { /* skip logo on error */ }
    }

    // ── Info table ───────────────────────────────────────────
    const issueType = snap?.issue_type ?? null
    const building  = snap?.building  ?? workOrder.building  ?? null
    const floor     = snap?.floor     ?? workOrder.floor     ?? null
    const room      = snap?.room      ?? workOrder.room      ?? null
    const team      = snap?.assigned_team ?? null
    const assignee  = snap?.assignee  ?? workOrder.assignee  ?? null
    const reporter  = snap?.reporter  ?? workOrder.reporter  ?? null
    const closedBy  = snap?.closed_by ?? null

    const issueLabel = issueType
        ? (isRTL ? issueType.name_ar || issueType.name : issueType.name)
        : '—'

    const locationParts = [building, floor, room].map(p => locName(p, isRTL)).filter(s => s !== '—')
    const locationLabel = locationParts.join(' › ') || '—'

    const priorityMap: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }
    const priorityMapAr: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة' }
    const priorityRaw = snap?.priority ?? workOrder.priority
    const priorityLabel = isRTL ? (priorityMapAr[priorityRaw] ?? priorityRaw) : (priorityMap[priorityRaw] ?? priorityRaw)

    autoTable(doc, {
        startY: 44,
        body: [
            [shape(doc, isRTL ? 'رقم أمر العمل' : 'Work Order No.'), shape(doc, code),
             shape(doc, isRTL ? 'نوع المشكلة'   : 'Issue Type'),     shape(doc, issueLabel)],
            [shape(doc, isRTL ? 'الأولوية'       : 'Priority'),       shape(doc, priorityLabel),
             shape(doc, isRTL ? 'الموقع'         : 'Location'),       shape(doc, locationLabel)],
            [shape(doc, isRTL ? 'الفريق المكلَّف' : 'Assigned Team'),  shape(doc, locName(team, isRTL)),
             shape(doc, isRTL ? 'الفني المكلَّف'  : 'Assigned To'),    shape(doc, assignee?.full_name ?? '—')],
            [shape(doc, isRTL ? 'المبلّغ'        : 'Reporter'),       shape(doc, reporter?.full_name ?? '—'),
             shape(doc, isRTL ? 'أُغلق بواسطة'   : 'Closed By'),      shape(doc, closedBy?.full_name ?? '—')],
            [shape(doc, isRTL ? 'تاريخ الفتح'    : 'Opened'),         shape(doc, fmtDate(snap?.created_at ?? workOrder.created_at)),
             shape(doc, isRTL ? 'تاريخ الإغلاق'  : 'Closed'),         shape(doc, fmtDateTime(snap?.closed_at ?? workOrder.completed_at))],
        ],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 42 },
            1: { cellWidth: 62 },
            2: { fontStyle: 'bold', fillColor: BRAND.light, cellWidth: 42 },
            3: { cellWidth: 54 },
        },
    })

    let y = getLastTableY(doc, 80) + 8

    // ── Description ──────────────────────────────────────────
    const desc = snap?.description ?? workOrder.description
    if (desc) {
        y = ensurePage(doc, y, 40)
        doc.setFillColor(...BRAND.light)
        doc.roundedRect(14, y, 182, 8, 2, 2, 'F')
        doc.setFontSize(10)
        doc.setTextColor(...BRAND.dark)
        doc.text(shape(doc, isRTL ? 'الوصف' : 'Description'), 18, y + 5.5)
        y += 11
        autoTable(doc, {
            startY: y,
            body: [[shape(doc, desc)]],
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
        })
        y = getLastTableY(doc, y) + 8
    }

    // ── Reporter notes ───────────────────────────────────────
    const notes = snap?.reporter_notes ?? workOrder.reporter_notes
    if (notes) {
        y = ensurePage(doc, y, 40)
        doc.setFillColor(...BRAND.light)
        doc.roundedRect(14, y, 182, 8, 2, 2, 'F')
        doc.setFontSize(10)
        doc.setTextColor(...BRAND.dark)
        doc.text(shape(doc, isRTL ? 'ملاحظات المبلّغ' : 'Reporter Notes'), 18, y + 5.5)
        y += 11
        autoTable(doc, {
            startY: y,
            body: [[shape(doc, notes)]],
            theme: 'plain',
            styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
        })
        y = getLastTableY(doc, y) + 8
    }

    // ── Images ───────────────────────────────────────────────
    const allImages: { label: string; dataUrl: string | null }[] = []

    if (wantsReporterImg && reporterDataUrl) {
        allImages.push({ label: isRTL ? 'صورة البلاغ' : 'Reporter Photo', dataUrl: reporterDataUrl })
    }

    if (wantsBeforeAfter) {
        beforeDataUrls.forEach((du, i) => {
            if (du) allImages.push({ label: isRTL ? `قبل ${i + 1}` : `Before ${i + 1}`, dataUrl: du })
        })
        afterDataUrls.forEach((du, i) => {
            if (du) allImages.push({ label: isRTL ? `بعد ${i + 1}` : `After ${i + 1}`, dataUrl: du })
        })
    }

    if (allImages.length > 0) {
        y = ensurePage(doc, y, 60)
        doc.setFillColor(...BRAND.light)
        doc.roundedRect(14, y, 182, 8, 2, 2, 'F')
        doc.setFontSize(10)
        doc.setTextColor(...BRAND.dark)
        doc.text(shape(doc, isRTL ? 'الصور' : 'Photos'), 18, y + 5.5)
        y += 12

        allImages.forEach((img, index) => {
            const col = index % 2
            if (index > 0 && col === 0) {
                y = ensurePage(doc, y + 52, 60)
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
            doc.text(shape(doc, img.label), x, y + 49)
        })
    }

    addFooter(doc, code, pdfSettings.footer_note)

    const blob = doc.output('blob')
    return { blob, fileName }
}
