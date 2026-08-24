import { forwardRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { WorkOrder, OperationLog } from '@/hooks/useWorkOrders'
import { useTenant } from '@/contexts/TenantContext'
import { STATUS_DISPLAY } from '@/config/workOrderStatus'

interface WorkOrderPrintViewProps {
    workOrder: WorkOrder
    logs: OperationLog[]
}

interface PrintIdentity {
    print_letterhead_url?: string | null
    print_logo_url?: string | null
    print_header_name?: string | null
    print_header_secondary?: string | null
}

const FOOTER_NOTE = 'تم انشاء هذا التقرير آلياً بواسطة نظام متقن لإدارة الأصول والمرافق'

function readPrintIdentity(settings: Record<string, unknown> | null | undefined): PrintIdentity {
    const pdfIdentity = settings?.pdf_identity
    return typeof pdfIdentity === 'object' && pdfIdentity !== null ? pdfIdentity as PrintIdentity : {}
}

function displayDate(date: string | null | undefined) {
    if (!date) return '-'
    return format(new Date(date), 'yyyy-MM-dd HH:mm')
}

function displayTeam(workOrder: WorkOrder) {
    return workOrder.assignedTeam?.name_ar || workOrder.assignedTeam?.name || null
}

function PrintHeader({ identity }: { identity: PrintIdentity }) {
    if (identity.print_letterhead_url) {
        return (
            <div className="mb-7 border-b border-slate-300 pb-5">
                <img
                    src={identity.print_letterhead_url}
                    alt=""
                    className="block w-full object-contain"
                    style={{ maxHeight: '32mm' }}
                />
            </div>
        )
    }

    if (identity.print_logo_url || identity.print_header_name) {
        return (
            <div className="mb-7 border-b-2 border-slate-700 pb-5">
                <div className="flex items-center justify-start gap-5">
                    {identity.print_logo_url && (
                        <img
                            src={identity.print_logo_url}
                            alt=""
                            className="shrink-0 object-contain"
                            style={{ maxHeight: '25mm', maxWidth: '84mm' }}
                        />
                    )}
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold leading-tight text-slate-950">
                            {identity.print_header_name || ''}
                        </h1>
                        <div className="mt-2 min-h-5 text-sm text-slate-500">
                            {identity.print_header_secondary || ''}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="mb-7 border-b-2 border-slate-700 pb-5">
            <h1 className="text-2xl font-bold text-slate-950">أمر عمل</h1>
        </div>
    )
}

function InfoRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
    return (
        <tr className="border-b border-slate-100">
            <td className="w-36 py-2 text-slate-500">{label}</td>
            <td className={strong ? 'py-2 font-bold text-slate-950' : 'py-2 text-slate-900'}>{value || '-'}</td>
        </tr>
    )
}

const WorkOrderPrintView = forwardRef<HTMLDivElement, WorkOrderPrintViewProps>(({ workOrder, logs }, ref) => {
    const { currentTenant } = useTenant()
    const { t } = useTranslation()
    const identity = readPrintIdentity(currentTenant?.settings)
    const status = STATUS_DISPLAY[workOrder.status] || STATUS_DISPLAY.pending
    const teamName = displayTeam(workOrder)

    return (
        <div
            ref={ref}
            className="min-h-screen bg-white p-8 font-cairo text-black"
            style={{ direction: 'rtl' }}
        >
            <style>{`
                @page { size: A4; margin: 14mm; }
                @media print {
                    .print-avoid-break { break-inside: avoid; page-break-inside: avoid; }
                    .print-table-row { break-inside: avoid; page-break-inside: avoid; }
                }
            `}</style>

            <PrintHeader identity={identity} />

            <section className="print-avoid-break mb-7">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-950">أمر عمل رقم {workOrder.code}</h2>
                        <p className="mt-2 text-sm text-slate-500">تاريخ الطباعة: {displayDate(new Date().toISOString())}</p>
                    </div>
                    <div className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800">
                        {t(`workOrders.${status.label}`)}
                    </div>
                </div>
            </section>

            <section className="mb-7 grid grid-cols-2 gap-8">
                <div className="print-avoid-break">
                    <h3 className="mb-4 border-b border-slate-300 pb-2 text-lg font-bold">بيانات البلاغ</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <InfoRow label="العنوان" value={workOrder.title} strong />
                            <InfoRow label="الحالة" value={t(`workOrders.${status.label}`)} strong />
                            <InfoRow label="التصنيف" value={workOrder.issue_type || '-'} />
                            <InfoRow label="الأولوية" value={t(`workOrders.${workOrder.priority}`)} />
                            <InfoRow label="تاريخ البلاغ" value={displayDate(workOrder.reported_at)} />
                            <InfoRow label="الاستحقاق" value={displayDate(workOrder.due_date)} />
                            <InfoRow label="الإنجاز" value={displayDate(workOrder.completed_at)} />
                        </tbody>
                    </table>
                </div>

                <div className="print-avoid-break">
                    <h3 className="mb-4 border-b border-slate-300 pb-2 text-lg font-bold">الموقع وفريق العمل</h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <InfoRow label="المبنى" value={workOrder.building?.name_ar || workOrder.building?.name || '-'} strong />
                            <InfoRow label="الدور" value={workOrder.floor?.name_ar || workOrder.floor?.name || '-'} />
                            <InfoRow label="الأصل" value={workOrder.asset?.name_ar || workOrder.asset?.name || '-'} strong />
                            <InfoRow label="كود الأصل" value={workOrder.asset?.code || '-'} />
                            <InfoRow label="المبلغ" value={workOrder.reporter?.full_name_ar || workOrder.reporter?.full_name || workOrder.reporter_name || '-'} />
                            <InfoRow label="الفني المسؤول" value={workOrder.assignee?.full_name_ar || workOrder.assignee?.full_name || 'غير معين'} strong />
                            <InfoRow label="الفريق / التخصص" value={teamName || '-'} strong={Boolean(teamName)} />
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="print-avoid-break mb-7 rounded-md border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-2 font-bold text-slate-700">وصف المشكلة</h3>
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-950">
                    {workOrder.description || 'لا يوجد وصف'}
                </p>
            </section>

            <section className="mb-7">
                <h3 className="mb-4 border-b-2 border-slate-800 pb-2 text-lg font-bold">سجل العمليات والنشاطات</h3>
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-slate-300 bg-slate-100 text-right">
                            <th className="border border-slate-200 p-2 text-right">التاريخ</th>
                            <th className="border border-slate-200 p-2 text-right">العملية</th>
                            <th className="border border-slate-200 p-2 text-right">المسؤول</th>
                            <th className="border border-slate-200 p-2 text-right">الملاحظات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs?.map((log, idx) => (
                            <tr key={log.id || idx} className={`print-table-row ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                                <td className="whitespace-nowrap border border-slate-200 p-2">{displayDate(log.timestamp)}</td>
                                <td className="border border-slate-200 p-2 font-bold">{log.type}</td>
                                <td className="border border-slate-200 p-2">{log.performer?.full_name_ar || log.performer?.full_name || log.technician_name || '-'}</td>
                                <td className="border border-slate-200 p-2">{log.description}</td>
                            </tr>
                        ))}
                        {(!logs || logs.length === 0) && (
                            <tr>
                                <td colSpan={4} className="border border-slate-200 p-4 text-center text-slate-500">لا توجد سجلات</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>

            <section className="print-avoid-break mt-14 grid grid-cols-2 gap-x-10 gap-y-12 text-center text-sm">
                {[
                    'توقيع الفني',
                    'توقيع المشرف',
                    'توقيع مدير الموقع / المهندس',
                    'توقيع مدير الصيانة',
                ].map((label) => (
                    <div key={label}>
                        <p className="mb-12 font-bold">{label}</p>
                        <div className="mx-auto w-3/4 border-t border-slate-300" />
                    </div>
                ))}
            </section>

            <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
                {FOOTER_NOTE}
            </footer>
        </div>
    )
})

WorkOrderPrintView.displayName = 'WorkOrderPrintView'
export default WorkOrderPrintView
