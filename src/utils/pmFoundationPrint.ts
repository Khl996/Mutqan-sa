import type { PMComplianceStats, PMWorkOrder, PMWorkOrderCheck } from '@/hooks/usePMFoundation'
import type { PMDashboardMetrics } from '@/components/maintenance/FoundationPMPanels'
import type { PMCopy } from '@/components/maintenance/foundationPmUtils'
import { displayName, modeLabel, statusLabel } from '@/components/maintenance/foundationPmUtils'

type PrintReportKind = 'work_order' | 'execution'

interface PrintContext {
    copy: PMCopy
    isAr: boolean
    locale: string
}

interface PMReportContext extends PrintContext {
    metrics: PMDashboardMetrics
    stats?: PMComplianceStats
    workOrders: PMWorkOrder[]
}

const BRAND = {
    primary: '#2E3A45',
    secondary: '#3AAFA9',
    muted: '#6C7A86',
    border: '#D8E0E6',
    soft: '#F3F6F8',
    danger: '#B91C1C',
    success: '#047857',
}

export function openPMPrintWindow(title: string) {
    const win = window.open('', '_blank')
    if (!win) return null
    win.document.open()
    win.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title></head><body>${escapeHtml(title)}...</body></html>`)
    win.document.close()
    return win
}

export function printPMWorkOrder(win: Window, workOrder: PMWorkOrder, kind: PrintReportKind, context: PrintContext) {
    writeAndPrint(win, buildWorkOrderHtml(workOrder, kind, context))
}

export function printPMOperationalReport(win: Window, context: PMReportContext) {
    writeAndPrint(win, buildOperationalReportHtml(context))
}

function writeAndPrint(win: Window, html: string) {
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    window.setTimeout(() => {
        win.print()
    }, 450)
}

function buildWorkOrderHtml(workOrder: PMWorkOrder, kind: PrintReportKind, { copy, isAr, locale }: PrintContext) {
    const title = kind === 'execution' ? copy.executionReportPdf : copy.workOrderPdf
    const assets = workOrder.work_order_assets ?? []
    const checks = workOrder.work_order_checks ?? []
    const completedChecks = checks.filter((check) => check.status !== 'pending').length
    const generatedAt = new Date().toISOString()
    const mode = workOrder.source_schedule?.generation_mode ?? (workOrder.source_schedule_asset_id ? 'per_asset' : 'batch_route')
    const sourceSchedule = workOrder.source_schedule ? displayName(workOrder.source_schedule, isAr) : workOrder.source_schedule_id ?? '-'
    const jobPlanName = workOrder.job_plan ? displayName(workOrder.job_plan, isAr) : textFromSnapshot(workOrder.job_plan_snapshot, isAr ? 'name_ar' : 'name') || '-'

    return pageShell({
        title,
        isAr,
        body: `
            ${hero(title, workOrder.code, generatedAt, locale)}
            <section class="section">
                <h2>${esc(copy.workOrderInfo)}</h2>
                <div class="grid">
                    ${kv(copy.name, workOrder.title)}
                    ${kv(copy.status, statusLabel(workOrder.status, copy))}
                    ${kv(copy.priority, workOrder.priority)}
                    ${kv(copy.scheduled, formatDate(workOrder.scheduled_date, locale))}
                    ${kv(copy.deadline, formatDate(workOrder.compliance_deadline, locale))}
                    ${kv(copy.generationMode, modeLabel(mode, copy))}
                    ${kv(copy.sourceSchedule, sourceSchedule)}
                    ${kv(copy.sourceScheduleId, workOrder.source_schedule_id ?? '-')}
                    ${kv(copy.jobPlan, jobPlanName)}
                    ${kv(copy.checksProgress, `${completedChecks}/${checks.length}`)}
                </div>
                ${workOrder.description ? `<p class="notes">${esc(workOrder.description)}</p>` : ''}
            </section>

            <section class="section">
                <h2>${esc(copy.assets)}</h2>
                ${assets.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>${esc(copy.code)}</th>
                                <th>${esc(copy.name)}</th>
                                <th>${esc(copy.status)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${assets.map((row, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${esc(row.asset?.code ?? row.asset_id)}</td>
                                    <td>${esc(row.asset ? displayName(row.asset, isAr) : row.asset_id)}</td>
                                    <td>${row.is_completed ? esc(copy.completedStatus) : esc(copy.pendingStatus)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : empty(copy.noAssets)}
            </section>

            <section class="section">
                <h2>${esc(kind === 'execution' ? copy.executionReportPdf : copy.requiredItems)}</h2>
                ${checks.length > 0 ? checksTable(workOrder, contextWith(copy, isAr, locale), kind) : empty(copy.noChecks)}
            </section>

            ${kind === 'execution' ? `
                <section class="section">
                    <h2>${esc(copy.executionNotes)}</h2>
                    <div class="grid">
                        ${kv(copy.startDate, formatDate(workOrder.started_at ?? workOrder.start_time, locale))}
                        ${kv(copy.completedStatus, formatDate(workOrder.completed_at, locale))}
                        ${kv(copy.estimatedDuration, workOrder.actual_duration_minutes ? `${workOrder.actual_duration_minutes} min` : '-')}
                    </div>
                    <p class="notes">${esc(workOrder.completion_notes || copy.notAvailable)}</p>
                </section>
            ` : ''}
        `,
    })
}

function checksTable(workOrder: PMWorkOrder, { copy, isAr }: PrintContext, kind: PrintReportKind) {
    const assetsById = new Map((workOrder.work_order_assets ?? []).map((row) => [row.asset_id, row.asset]))
    return `
        <table>
            <thead>
                <tr>
                    <th>${esc(copy.assets)}</th>
                    <th>${esc(copy.itemLabel)}</th>
                    <th>${esc(copy.itemType)}</th>
                    <th>${esc(copy.status)}</th>
                    <th>${esc(copy.result)}</th>
                    <th>${esc(copy.notes)}</th>
                </tr>
            </thead>
            <tbody>
                ${(workOrder.work_order_checks ?? []).map((check) => {
                    const asset = check.asset_id ? assetsById.get(check.asset_id) : null
                    const snapshot = check.item_snapshot ?? {}
                    const label = isAr ? snapshot.label_ar || snapshot.label : snapshot.label || snapshot.label_ar
                    const type = snapshot.item_type ?? '-'
                    return `
                        <tr>
                            <td>${esc(asset ? displayName(asset, isAr) : check.asset_id ?? '-')}</td>
                            <td>${esc(label ?? '-')}</td>
                            <td>${esc(type)}</td>
                            <td>${esc(statusLabel(check.status, copy))}</td>
                            <td>${esc(kind === 'execution' ? checkResult(check) : plannedValue(snapshot))}</td>
                            <td>${esc(check.notes ?? '')}</td>
                        </tr>
                    `
                }).join('')}
            </tbody>
        </table>
    `
}

function buildOperationalReportHtml({ copy, isAr, locale, metrics, stats, workOrders }: PMReportContext) {
    const now = new Date().toISOString()
    const overdue = workOrders.filter((wo) => isOpenOverdue(wo))
    const dueSoon = workOrders.filter((wo) => !isClosed(wo) && !isOpenOverdue(wo) && isDateWithinDays(wo.compliance_deadline, 7))
    const completedOnTime = workOrders.filter((wo) => wo.status === 'completed' && isCompletedOnTime(wo))
    const completedLate = workOrders.filter((wo) => wo.status === 'completed' && !isCompletedOnTime(wo))

    return pageShell({
        title: copy.pmReport,
        isAr,
        body: `
            ${hero(copy.pmReport, copy.title, now, locale)}
            <section class="section">
                <h2>${esc(copy.pmCompliance)}</h2>
                <div class="cards">
                    ${metric(copy.compliance, stats?.compliance_rate === null || stats?.compliance_rate === undefined ? '-' : `${stats.compliance_rate}%`)}
                    ${metric(copy.activeSchedules, metrics.activeSchedules)}
                    ${metric(copy.dueToday, metrics.dueToday)}
                    ${metric(copy.overdue, overdue.length)}
                    ${metric(copy.dueSoon, dueSoon.length)}
                    ${metric(copy.completedOnTime, completedOnTime.length)}
                    ${metric(copy.completedLate, completedLate.length)}
                </div>
            </section>
            ${reportTable(copy.overdueWorkOrders, overdue, copy, isAr, locale)}
            ${reportTable(copy.dueSoon, dueSoon, copy, isAr, locale)}
            ${reportTable(copy.completedOnTime, completedOnTime, copy, isAr, locale)}
            ${reportTable(copy.completedLate, completedLate, copy, isAr, locale)}
        `,
    })
}

function reportTable(title: string, rows: PMWorkOrder[], copy: PMCopy, isAr: boolean, locale: string) {
    return `
        <section class="section">
            <h2>${esc(title)}</h2>
            ${rows.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th>${esc(copy.code)}</th>
                            <th>${esc(copy.name)}</th>
                            <th>${esc(copy.sourceSchedule)}</th>
                            <th>${esc(copy.status)}</th>
                            <th>${esc(copy.deadline)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.slice(0, 30).map((wo) => `
                            <tr>
                                <td>${esc(wo.code)}</td>
                                <td>${esc(wo.title)}</td>
                                <td>${esc(wo.source_schedule ? displayName(wo.source_schedule, isAr) : wo.source_schedule_id ?? '-')}</td>
                                <td>${esc(statusLabel(wo.status, copy))}</td>
                                <td>${esc(formatDate(wo.compliance_deadline, locale))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : empty(copy.noData)}
        </section>
    `
}

function pageShell({ title, isAr, body }: { title: string; isAr: boolean; body: string }) {
    const direction = isAr ? 'rtl' : 'ltr'
    return `<!doctype html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${direction}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        color: #17202A;
        background: white;
        font-family: "Cairo", "Tahoma", "Arial", sans-serif;
        direction: ${direction};
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .hero {
        border-radius: 8px;
        background: ${BRAND.primary};
        color: white;
        padding: 18px 20px;
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
    }
    .hero h1 { margin: 0 0 6px; font-size: 24px; }
    .hero p { margin: 0; color: rgba(255,255,255,.78); font-size: 12px; }
    .pill {
        border: 1px solid rgba(255,255,255,.35);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        white-space: nowrap;
    }
    .section {
        margin-top: 14px;
        border: 1px solid ${BRAND.border};
        border-radius: 8px;
        overflow: hidden;
        break-inside: avoid;
    }
    .section h2 {
        margin: 0;
        padding: 10px 12px;
        background: ${BRAND.soft};
        color: ${BRAND.primary};
        font-size: 15px;
    }
    .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0;
    }
    .kv {
        padding: 10px 12px;
        border-top: 1px solid ${BRAND.border};
    }
    .kv:nth-child(1),
    .kv:nth-child(2) { border-top: 0; }
    .label {
        color: ${BRAND.muted};
        font-size: 11px;
        margin-bottom: 4px;
    }
    .value {
        font-weight: 700;
        font-size: 13px;
        overflow-wrap: anywhere;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
    }
    th {
        text-align: ${isAr ? 'right' : 'left'};
        background: ${BRAND.primary};
        color: white;
        padding: 8px;
    }
    td {
        border-top: 1px solid ${BRAND.border};
        padding: 8px;
        vertical-align: top;
        overflow-wrap: anywhere;
    }
    tr:nth-child(even) td { background: #FAFBFC; }
    .notes {
        padding: 12px;
        border-top: 1px solid ${BRAND.border};
        color: #344054;
        line-height: 1.7;
        white-space: pre-wrap;
    }
    .empty {
        padding: 18px;
        color: ${BRAND.muted};
        text-align: center;
        font-size: 12px;
    }
    .cards {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
    }
    .metric {
        border: 1px solid ${BRAND.border};
        border-radius: 8px;
        padding: 12px;
    }
    .metric .value { font-size: 22px; color: ${BRAND.primary}; }
    footer {
        margin-top: 18px;
        color: ${BRAND.muted};
        font-size: 10px;
        text-align: center;
    }
    @media print {
        button { display: none; }
        .section { page-break-inside: avoid; }
    }
</style>
</head>
<body>
${body}
<footer>Mutqan PM | ${new Date().toLocaleString()}</footer>
</body>
</html>`
}

function hero(title: string, reference: string, generatedAt: string, locale: string) {
    return `
        <header class="hero">
            <div>
                <h1>${esc(title)}</h1>
                <p>${esc(reference)}</p>
            </div>
            <div class="pill">${esc(formatDate(generatedAt, locale))}</div>
        </header>
    `
}

function kv(label: string, value: unknown) {
    return `
        <div class="kv">
            <div class="label">${esc(label)}</div>
            <div class="value">${esc(value ?? '-')}</div>
        </div>
    `
}

function metric(label: string, value: unknown) {
    return `
        <div class="metric">
            <div class="label">${esc(label)}</div>
            <div class="value">${esc(value ?? '-')}</div>
        </div>
    `
}

function empty(label: string) {
    return `<div class="empty">${esc(label)}</div>`
}

function formatDate(value: string | null | undefined, locale: string) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

function checkResult(check: PMWorkOrderCheck) {
    const type = check.item_snapshot?.item_type
    if (type === 'yes_no' || type === 'pass_fail') {
        if (check.value_bool === null || check.value_bool === undefined) return '-'
        return check.value_bool ? 'Yes / Pass' : 'No / Fail'
    }
    if (type === 'numeric') {
        const unit = check.item_snapshot?.unit ? ` ${check.item_snapshot.unit}` : ''
        return check.value_numeric === null || check.value_numeric === undefined ? '-' : `${check.value_numeric}${unit}`
    }
    if (type === 'photo') return check.value_photo_url ? 'Photo attached' : '-'
    if (type === 'signature') return check.value_signature_url ? 'Signature attached' : '-'
    return check.value_text || '-'
}

function plannedValue(snapshot: Record<string, unknown>) {
    const pieces = [
        snapshot.is_required ? 'Required' : null,
        snapshot.unit ? `Unit: ${snapshot.unit}` : null,
        snapshot.min_value !== null && snapshot.min_value !== undefined ? `Min: ${snapshot.min_value}` : null,
        snapshot.max_value !== null && snapshot.max_value !== undefined ? `Max: ${snapshot.max_value}` : null,
    ].filter(Boolean)
    return pieces.join(' / ') || '-'
}

function textFromSnapshot(snapshot: Record<string, unknown> | null | undefined, key: string) {
    const value = snapshot?.[key]
    return typeof value === 'string' ? value : ''
}

function isClosed(wo: PMWorkOrder) {
    return ['completed', 'auto_closed', 'cancelled'].includes(wo.status)
}

function isOpenOverdue(wo: PMWorkOrder) {
    if (isClosed(wo) || !wo.compliance_deadline) return false
    const deadline = new Date(`${wo.compliance_deadline.slice(0, 10)}T00:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return !Number.isNaN(deadline.getTime()) && deadline.getTime() < today.getTime()
}

function isDateWithinDays(value: string | null | undefined, days: number) {
    if (!value) return false
    const date = new Date(`${value.slice(0, 10)}T00:00:00`)
    if (Number.isNaN(date.getTime())) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const limit = new Date(today)
    limit.setDate(limit.getDate() + days)
    return date.getTime() >= today.getTime() && date.getTime() <= limit.getTime()
}

function isCompletedOnTime(wo: PMWorkOrder) {
    if (!wo.completed_at || !wo.compliance_deadline) return true
    const completed = new Date(wo.completed_at)
    const deadline = new Date(`${wo.compliance_deadline.slice(0, 10)}T23:59:59`)
    return completed.getTime() <= deadline.getTime()
}

function contextWith(copy: PMCopy, isAr: boolean, locale: string): PrintContext {
    return { copy, isAr, locale }
}

function esc(value: unknown) {
    return escapeHtml(String(value ?? ''))
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
